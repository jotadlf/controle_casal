import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X, Plus } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { parseTime } from '../lib/date'
import { refreshAppBadge } from '../lib/badge'
import EventModal from './EventModal'
import FabButton from './FabButton'
import UndoToast from './UndoToast'
import { getEventColor, DEFAULT_EVENT_COLOR } from '../lib/eventColors'
import { layoutOverlappingEvents } from '../lib/eventLayout'
import { pickEventFields, clipboardFromEvent, reminderToForm, reminderFromForm, DEFAULT_REMINDER, dateKeyOf, addDays } from '../lib/calendarEvents'
import { useUndo, isTypingTarget } from '../lib/useUndo'

const HOUR_HEIGHT = 48
const DAY_COL_WIDTH = 132
const HOUR_COL_WIDTH = 44
const ALL_DAY_ROW = 20
const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const SNAP_MINUTES = 15
const CLICK_THRESHOLD = 6
const DOUBLE_CLICK_MS = 400
const VIEW_OPTIONS = [1, 3, 7]
const VIEW_STORAGE_KEY = 'casa-app:agenda-dias'

function startOfWeek(date) {
  return addDays(date, -date.getDay())
}

// início do intervalo exibido: a semana (domingo) na visão de 7 dias, ou o
// próprio dia nas visões de 1 e 3 dias.
function alignStart(date, numDays) {
  return numDays === 7 ? startOfWeek(date) : addDays(date, 0)
}

function rangeLabel(start, numDays) {
  const end = addDays(start, numDays - 1)
  let label
  if (numDays === 1) {
    label = start.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
  } else if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    label = `${start.getDate()}–${end.getDate()} de ${end.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`
  } else {
    label = `${start.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`
  }
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function initialViewDays() {
  try {
    const stored = Number(localStorage.getItem(VIEW_STORAGE_KEY))
    if (VIEW_OPTIONS.includes(stored)) return stored
  } catch (e) {
    // sem localStorage: segue com o padrão
  }
  return window.innerWidth < 640 ? 3 : 7
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

function formatMinutes(mins) {
  return minutesToTime(mins).slice(0, 5)
}

// converte uma posição vertical (px a partir do topo da coluna) em minutos
// do dia, arredondado pro passo de 15min e limitado ao intervalo [0, max].
function pxToMinutes(px, max = 24 * 60 - SNAP_MINUTES, round = Math.round) {
  const minutes = round((px / HOUR_HEIGHT) * 60 / SNAP_MINUTES) * SNAP_MINUTES
  return Math.max(0, Math.min(minutes, max))
}

function eventMinutes(ev) {
  const start = parseTime(ev.event_time)
  if (!start) return null
  const startMinutes = start.hours * 60 + start.minutes
  const end = parseTime(ev.event_end_time)
  const endMinutes = end ? end.hours * 60 + end.minutes : null
  return { start: startMinutes, end: endMinutes !== null && endMinutes > startMinutes ? endMinutes : null }
}

// data/horário de um compromisso movido pra `dateKey` às `startMinutes`,
// preservando a duração original.
function movedFields(ev, dateKey, startMinutes) {
  const span = eventMinutes(ev)
  const endTime = span?.end !== null && span?.end !== undefined
    ? minutesToTime(Math.min(startMinutes + (span.end - span.start), 24 * 60 - 1))
    : ev.event_end_time
  return { event_date: dateKey, event_time: minutesToTime(startMinutes), event_end_time: endTime }
}

export default function WeekAgenda({ user, initialDate, clipboard, onCopyEvent, onClearClipboard, onClose }) {
  const [viewDays, setViewDaysState] = useState(initialViewDays)
  const [rangeStart, setRangeStart] = useState(() => alignStart(initialDate || new Date(), viewDays))
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => new Date())
  const [eventModal, setEventModal] = useState(null) // null | { id, form }
  const [selectedId, setSelectedId] = useState(null)
  const undo = useUndo({ enabled: !eventModal })

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  const days = useMemo(
    () => Array.from({ length: viewDays }, (_, i) => addDays(rangeStart, i)),
    [rangeStart, viewDays],
  )
  const startKey = dateKeyOf(days[0])
  const endKey = dateKeyOf(days[days.length - 1])
  const todayKey = dateKeyOf(now)

  // intervalo visível sempre atualizado, pra quem roda depois (ex.: um
  // "desfazer" disparado já com outra semana na tela).
  const rangeRef = useRef({ startKey, endKey })
  rangeRef.current = { startKey, endKey }

  async function loadEvents() {
    setLoading(true)
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('created_by', user)
      .gte('event_date', startKey)
      .lte('event_date', endKey)
    if (error) {
      console.error('Falha ao carregar semana:', error)
      setEvents([])
      setLoading(false)
      return
    }
    setEvents(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadEvents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startKey, endKey, user])

  // compromissos com horário vão pra grade; os sem horário ficam na faixa
  // "dia todo" no topo de cada coluna.
  const { timedByDate, allDayByDate, maxAllDay } = useMemo(() => {
    const timed = {}
    const allDay = {}
    for (const ev of events) {
      const target = parseTime(ev.event_time) ? timed : allDay
      if (!target[ev.event_date]) target[ev.event_date] = []
      target[ev.event_date].push(ev)
    }
    for (const list of Object.values(allDay)) list.sort((a, b) => a.title.localeCompare(b.title))
    const max = Math.max(0, ...Object.values(allDay).map((list) => list.length))
    return { timedByDate: timed, allDayByDate: allDay, maxAllDay: max }
  }, [events])

  const layoutByDate = useMemo(() => {
    const map = {}
    for (const [dateKey, list] of Object.entries(timedByDate)) map[dateKey] = layoutOverlappingEvents(list)
    return map
  }, [timedByDate])

  const headerHeight = 48 + (maxAllDay ? maxAllDay * ALL_DAY_ROW + 6 : 0)

  function changeRange(delta) {
    setRangeStart((d) => addDays(d, delta * viewDays))
  }

  function goToToday() {
    setRangeStart(alignStart(new Date(), viewDays))
  }

  // troca entre 1, 3 e 7 dias mantendo o foco: hoje, se estiver na tela,
  // senão o começo do intervalo atual.
  function setViewDays(n) {
    if (n === viewDays) return
    const todayVisible = todayKey >= startKey && todayKey <= endKey
    setRangeStart(alignStart(todayVisible ? new Date() : rangeStart, n))
    setViewDaysState(n)
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, String(n))
    } catch (e) {
      // ignora: só não lembra a escolha
    }
  }

  // --- alterações com "desfazer" ---

  // coloca/atualiza um compromisso na lista local, ou tira se ele saiu do
  // intervalo visível.
  function upsertLocal(row) {
    const { startKey: s, endKey: e } = rangeRef.current
    setEvents((prev) => {
      const others = prev.filter((x) => x.id !== row.id)
      return row.event_date >= s && row.event_date <= e ? [...others, row] : others
    })
  }

  function removeLocal(id) {
    setEvents((prev) => prev.filter((x) => x.id !== id))
  }

  async function updateEvent(ev, payload, undoLabel) {
    const previous = Object.fromEntries(Object.keys(payload).map((k) => [k, ev[k] ?? null]))
    upsertLocal({ ...ev, ...payload })
    const { data, error } = await supabase.from('calendar_events').update(payload).eq('id', ev.id).select().single()
    if (error) {
      console.error('Falha ao atualizar compromisso:', error)
      loadEvents()
      return error
    }
    upsertLocal(data)
    refreshAppBadge(user)
    if (undoLabel) {
      undo.push(undoLabel, async () => {
        const { data: reverted, error: undoError } = await supabase
          .from('calendar_events').update(previous).eq('id', ev.id).select().single()
        if (undoError) {
          console.error('Falha ao desfazer:', undoError)
          loadEvents()
          return
        }
        upsertLocal(reverted)
        refreshAppBadge(user)
      })
    }
    return null
  }

  async function insertEvent(payload, undoLabel) {
    const { data, error } = await supabase
      .from('calendar_events')
      .insert({ ...payload, created_by: user })
      .select()
      .single()
    if (error) {
      console.error('Falha ao criar compromisso:', error)
      return error
    }
    upsertLocal(data)
    setSelectedId(data.id)
    refreshAppBadge(user)
    if (undoLabel) {
      undo.push(undoLabel, async () => {
        await supabase.from('calendar_events').delete().eq('id', data.id)
        removeLocal(data.id)
        refreshAppBadge(user)
      })
    }
    return null
  }

  async function deleteEvent(ev) {
    removeLocal(ev.id)
    if (selectedId === ev.id) setSelectedId(null)
    const { error } = await supabase.from('calendar_events').delete().eq('id', ev.id)
    if (error) {
      console.error('Falha ao excluir compromisso:', error)
      loadEvents()
      return
    }
    refreshAppBadge(user)
    undo.push(`"${ev.title}" excluído`, async () => {
      const { data, error: undoError } = await supabase
        .from('calendar_events')
        .insert({ ...pickEventFields(ev), created_by: ev.created_by || user })
        .select()
        .single()
      if (undoError) {
        console.error('Falha ao desfazer exclusão:', undoError)
        return
      }
      upsertLocal(data)
      refreshAppBadge(user)
    })
  }

  // --- arraste livre: o compromisso acompanha o dedo/mouse em qualquer
  // direção; soltar decide o dia (coluna) e o horário (posição do topo do
  // card, arredondado pros 15min mais próximos) de destino. Durante o
  // arraste o card já mostra o horário que vai ficar. Com Alt pressionado,
  // solta uma cópia e o original fica onde estava.
  const dayColumnRefs = useRef({})
  const dragStart = useRef({ x: 0, y: 0, grab: 0 })
  const IDLE_DRAG = { id: null, dx: 0, dy: 0, dragging: false, moved: false, previewStart: null, duplicate: false }
  const [drag, setDrag] = useState(IDLE_DRAG)

  // --- arrastar num horário vazio cria um compromisso com aquela duração.
  // `creating` é a seleção em andamento; `draft` mantém o fantasma na grade
  // enquanto o formulário do novo compromisso está aberto.
  const [creating, setCreating] = useState(null) // null | { dateKey, anchor, current }
  const [draft, setDraft] = useState(null) // null | { dateKey, start, end }

  // último horário sob o mouse, usado pra colar (Ctrl+V) e criar (C) ali
  const hoverSlot = useRef(null) // null | { dateKey, minutes }

  // --- redimensionar: arrastar a borda de cima ou de baixo do card muda o
  // horário de início ou término, mantendo a outra ponta fixa.
  const [resize, setResize] = useState({ id: null, edge: null, dy: 0, active: false })

  // ao trocar de intervalo (inclusive na primeira renderização), rola a
  // grade pra deixar o dia e o horário atuais em evidência, em vez de abrir
  // sempre no topo (00h) lá na esquerda.
  const scrollRef = useRef(null)
  useEffect(() => {
    if (!scrollRef.current) return
    const todayInRange = todayKey >= startKey && todayKey <= endKey

    const targetHour = todayInRange ? now.getHours() : 7
    scrollRef.current.scrollTop = Math.max(targetHour - 2, 0) * HOUR_HEIGHT

    const col = todayInRange ? dayColumnRefs.current[todayKey] : null
    if (col) {
      const containerRect = scrollRef.current.getBoundingClientRect()
      const colRect = col.getBoundingClientRect()
      const targetLeft = scrollRef.current.scrollLeft + (colRect.left - containerRect.left) - HOUR_COL_WIDTH
      scrollRef.current.scrollLeft = Math.max(targetLeft, 0)
    } else {
      scrollRef.current.scrollLeft = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startKey, viewDays])

  // clique com mouse seleciona (pra usar Delete, Ctrl+C, Enter…); dois
  // cliques abrem a edição. No toque, um toque já abre a edição.
  const lastTap = useRef({ id: null, at: 0 })
  function handleCardTap(ev, pointerType) {
    if (pointerType === 'touch') {
      openEditEvent(ev)
      return
    }
    const nowMs = Date.now()
    if (lastTap.current.id === ev.id && nowMs - lastTap.current.at < DOUBLE_CLICK_MS) {
      lastTap.current = { id: null, at: 0 }
      openEditEvent(ev)
      return
    }
    lastTap.current = { id: ev.id, at: nowMs }
    setSelectedId(ev.id)
  }

  function handleDragStart(e, id) {
    const cardRect = e.currentTarget.getBoundingClientRect()
    dragStart.current = { x: e.clientX, y: e.clientY, grab: e.clientY - cardRect.top }
    setDrag({ ...IDLE_DRAG, id, dragging: true, duplicate: e.altKey })
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  // horário de início correspondente à posição atual do topo do card
  // (todas as colunas têm o mesmo topo, então qualquer uma serve de régua).
  function startMinutesAtPointer(clientY, dateKey) {
    const col = dayColumnRefs.current[dateKey]
    if (!col) return null
    const rect = col.getBoundingClientRect()
    return pxToMinutes(clientY - dragStart.current.grab - rect.top)
  }

  function handleDragMove(e, id, ev) {
    const { clientX, clientY, altKey } = e
    const previewStart = startMinutesAtPointer(clientY, ev.event_date)
    setDrag((d) => {
      if (!d.dragging || d.id !== id) return d
      const dx = clientX - dragStart.current.x
      const dy = clientY - dragStart.current.y
      return { ...d, dx, dy, previewStart, duplicate: altKey, moved: d.moved || Math.hypot(dx, dy) > CLICK_THRESHOLD }
    })
  }

  function targetDayKeyAt(clientX) {
    let best = null
    let bestDist = Infinity
    for (const dateKey of Object.keys(dayColumnRefs.current)) {
      const el = dayColumnRefs.current[dateKey]
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (clientX >= rect.left && clientX <= rect.right) return dateKey
      const dist = clientX < rect.left ? rect.left - clientX : clientX - rect.right
      if (dist < bestDist) {
        bestDist = dist
        best = dateKey
      }
    }
    return best
  }

  function handleDragEnd(e, id, ev) {
    if (drag.id !== id || !drag.dragging) return
    const { moved } = drag
    const duplicate = e.altKey
    const clientX = e.clientX
    const clientY = e.clientY
    setDrag(IDLE_DRAG)

    if (!moved) {
      handleCardTap(ev, e.pointerType)
      return
    }

    const targetDateKey = targetDayKeyAt(clientX)
    if (!targetDateKey) return
    const minutes = startMinutesAtPointer(clientY, targetDateKey)
    if (minutes === null) return
    const fields = movedFields(ev, targetDateKey, minutes)

    if (duplicate) {
      insertEvent({ ...pickEventFields(ev), ...fields }, `"${ev.title}" duplicado`)
      return
    }
    if (fields.event_date === ev.event_date && fields.event_time.slice(0, 5) === ev.event_time?.slice(0, 5)) return
    updateEvent(ev, fields, `"${ev.title}" movido`)
  }

  function handleDragCancel() {
    setDrag(IDLE_DRAG)
  }

  // --- criar arrastando (mouse/caneta; no toque o arraste rola a grade, e
  // o dois toques continua valendo pra criar).
  function handleCreateStart(e, dateKey) {
    if (e.target.closest('[data-event-card]')) return
    setSelectedId(null)
    if (e.pointerType === 'touch' || e.button !== 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const anchor = pxToMinutes(e.clientY - rect.top, 24 * 60 - SNAP_MINUTES, Math.floor)
    setCreating({ dateKey, anchor, current: anchor })
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handleColumnPointerMove(e, dateKey) {
    const rect = e.currentTarget.getBoundingClientRect()
    if (e.pointerType !== 'touch') {
      hoverSlot.current = { dateKey, minutes: pxToMinutes(e.clientY - rect.top) }
    }
    if (!creating || creating.dateKey !== dateKey) return
    const current = pxToMinutes(e.clientY - rect.top, 24 * 60)
    if (current !== creating.current) setCreating({ ...creating, current })
  }

  // intervalo coberto pela seleção: sempre inclui o bloco de 15min onde o
  // arraste começou, pra cima ou pra baixo.
  function creatingRange(c) {
    if (c.current > c.anchor) return { start: c.anchor, end: c.current }
    return { start: c.current, end: c.anchor + SNAP_MINUTES }
  }

  function handleCreateEnd(dateKey) {
    if (!creating || creating.dateKey !== dateKey) return
    const c = creating
    setCreating(null)
    // sem movimento é só um clique: não cria nada (o dois cliques cuida disso)
    if (c.current === c.anchor) return
    const { start, end } = creatingRange(c)
    const safeEnd = Math.min(end, 24 * 60 - 1)
    setDraft({ dateKey, start, end })
    openNewEvent(dateKey, formatMinutes(start), formatMinutes(safeEnd))
  }

  function handleResizeStart(e, id, edge) {
    e.stopPropagation()
    dragStart.current = { x: e.clientX, y: e.clientY }
    setResize({ id, edge, dy: 0, active: true })
    setSelectedId(id)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handleResizeMove(e, id) {
    e.stopPropagation()
    const { clientY } = e
    setResize((r) => {
      if (!r.active || r.id !== id) return r
      return { ...r, dy: clientY - dragStart.current.y }
    })
  }

  function handleResizeEnd(e, id, ev) {
    e.stopPropagation()
    if (resize.id !== id || !resize.active) return
    const { edge, dy } = resize
    setResize({ id: null, edge: null, dy: 0, active: false })

    const start = parseTime(ev.event_time)
    if (!start) return
    const totalPx = HOUR_HEIGHT * 24
    const minPx = (SNAP_MINUTES / (24 * 60)) * totalPx
    const startMinutes = start.hours * 60 + start.minutes
    const end = parseTime(ev.event_end_time)
    const endMinutes = end && end.hours * 60 + end.minutes > startMinutes ? end.hours * 60 + end.minutes : startMinutes + 30
    const top = (startMinutes / (24 * 60)) * totalPx
    const height = Math.max(((endMinutes - startMinutes) / (24 * 60)) * totalPx, 24)

    let newTop = top
    let newHeight = height
    if (edge === 'top') {
      newTop = Math.min(Math.max(top + dy, 0), top + height - minPx)
      newHeight = top + height - newTop
    } else {
      newHeight = Math.min(Math.max(height + dy, minPx), totalPx - top)
    }

    let newStartMinutes = Math.round((newTop / totalPx) * 24 * 60 / SNAP_MINUTES) * SNAP_MINUTES
    let newEndMinutes = Math.round(((newTop + newHeight) / totalPx) * 24 * 60 / SNAP_MINUTES) * SNAP_MINUTES
    newStartMinutes = Math.max(0, Math.min(newStartMinutes, 24 * 60 - SNAP_MINUTES))
    newEndMinutes = Math.max(newStartMinutes + SNAP_MINUTES, Math.min(newEndMinutes, 24 * 60))

    if (newStartMinutes === startMinutes && newEndMinutes === endMinutes) return

    const payload = { event_time: minutesToTime(newStartMinutes), event_end_time: minutesToTime(Math.min(newEndMinutes, 24 * 60 - 1)) }
    updateEvent(ev, payload, `Horário de "${ev.title}" alterado`)
  }

  function handleResizeCancel() {
    setResize({ id: null, edge: null, dy: 0, active: false })
  }

  // --- criar / editar ---
  function openNewEvent(dateKey, time = '', endTime = '') {
    setEventModal({ id: null, form: { title: '', description: '', date: dateKey, time, endTime, color: DEFAULT_EVENT_COLOR } })
  }

  function pasteEventAt(dateKey, timeStr) {
    let endTimeStr = null
    const cStart = parseTime(clipboard.time)
    const cEnd = parseTime(clipboard.endTime)
    const start = parseTime(timeStr)
    if (cStart && cEnd && start) {
      const duration = (cEnd.hours * 60 + cEnd.minutes) - (cStart.hours * 60 + cStart.minutes)
      if (duration > 0) {
        const newEndMinutes = Math.min(start.hours * 60 + start.minutes + duration, 24 * 60 - 1)
        endTimeStr = minutesToTime(newEndMinutes).slice(0, 5)
      }
    }
    const payload = {
      title: clipboard.title,
      description: clipboard.description || null,
      event_date: dateKey,
      event_time: timeStr || null,
      event_end_time: timeStr ? endTimeStr : null,
      color: clipboard.color || DEFAULT_EVENT_COLOR,
      reminder_minutes: reminderFromForm(clipboard.reminder ?? DEFAULT_REMINDER, Boolean(timeStr)),
    }
    return insertEvent(payload, `"${clipboard.title}" colado`)
  }

  // dois cliques num horário vazio da grade abre o formulário com aquele
  // dia e horário preenchidos (arredondado pros 15min mais próximos), ou
  // cola o compromisso copiado ali, se houver um na área de transferência.
  function handleDayDoubleClick(e, dateKey) {
    if (e.target.closest('[data-event-card]')) return
    const rect = e.currentTarget.getBoundingClientRect()
    const timeStr = formatMinutes(pxToMinutes(e.clientY - rect.top))
    if (clipboard) {
      pasteEventAt(dateKey, timeStr)
      return
    }
    openNewEvent(dateKey, timeStr)
  }

  function openEditEvent(ev) {
    setSelectedId(ev.id)
    setEventModal({
      id: ev.id,
      form: {
        title: ev.title,
        description: ev.description || '',
        date: ev.event_date,
        time: ev.event_time ? ev.event_time.slice(0, 5) : '',
        endTime: ev.event_end_time ? ev.event_end_time.slice(0, 5) : '',
        color: ev.color || DEFAULT_EVENT_COLOR,
        reminder: reminderToForm(ev.reminder_minutes),
      },
    })
  }

  function handleSaveEvent(payload, id) {
    if (id) {
      const ev = events.find((e) => e.id === id)
      return updateEvent(ev || { id }, payload, ev ? `"${payload.title}" alterado` : null)
    }
    return insertEvent(payload, `"${payload.title}" criado`)
  }

  // --- atalhos de teclado (estilo Notion Calendar) ---
  // o handler muda a cada renderização; o listener chama sempre a versão
  // mais recente via ref.
  const keyHandlerRef = useRef(null)
  keyHandlerRef.current = (e) => {
    if (eventModal || isTypingTarget(e.target)) return
    const key = e.key.toLowerCase()
    const mod = e.ctrlKey || e.metaKey
    const selected = selectedId ? events.find((ev) => ev.id === selectedId) : null
    // dia/horário de referência pra criar ou colar: onde está o mouse, ou o
    // horário do selecionado, ou hoje (se visível), ou o começo da tela.
    const fallbackDay = todayKey >= startKey && todayKey <= endKey ? todayKey : startKey
    const slot = hoverSlot.current
      || (selected ? { dateKey: selected.event_date, minutes: eventMinutes(selected)?.start ?? null } : null)
      || { dateKey: fallbackDay, minutes: null }

    if (mod) {
      if (key === 'c' && selected) {
        e.preventDefault()
        onCopyEvent(clipboardFromEvent(selected))
      } else if (key === 'v' && clipboard) {
        e.preventDefault()
        const time = slot.minutes !== null ? formatMinutes(slot.minutes) : clipboard.time
        pasteEventAt(slot.dateKey, time)
      }
      return
    }
    if (e.altKey) return
    // Enter/espaço num botão focado é o próprio botão sendo acionado
    if (key === 'enter' && e.target.tagName === 'BUTTON') return

    if (key === 'escape') {
      if (selected) setSelectedId(null)
      else if (clipboard) onClearClipboard()
      else onClose()
    } else if (key === 't') {
      goToToday()
    } else if (key === 'arrowleft') {
      e.preventDefault()
      changeRange(-1)
    } else if (key === 'arrowright') {
      e.preventDefault()
      changeRange(1)
    } else if (key === 'c') {
      e.preventDefault()
      openNewEvent(slot.dateKey, slot.minutes !== null ? formatMinutes(slot.minutes) : '')
    } else if (key === '1' || key === '3' || key === '7') {
      setViewDays(Number(key))
    } else if ((key === 'delete' || key === 'backspace') && selected) {
      e.preventDefault()
      deleteEvent(selected)
    } else if (key === 'enter' && selected) {
      e.preventDefault()
      openEditEvent(selected)
    }
  }

  useEffect(() => {
    const onKeyDown = (e) => keyHandlerRef.current?.(e)
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const nowTop = ((now.getHours() * 60 + now.getMinutes()) / (24 * 60)) * (HOUR_HEIGHT * 24)
  const wide = viewDays === 7
  const navLabel = viewDays === 7 ? 'semana' : viewDays === 1 ? 'dia' : `${viewDays} dias`

  return (
    <div className="fixed inset-0 z-40 bg-base flex flex-col">
      <div className="flex items-center justify-between px-3 py-3 border-b border-line bg-card shrink-0">
        <button onClick={onClose} aria-label="Fechar" title="Fechar (Esc)" className="p-2 rounded-full text-ink/50 hover:bg-ink/5">
          <X size={18} />
        </button>
        <div className="flex items-center gap-1">
          <button onClick={() => changeRange(-1)} aria-label={`Voltar ${navLabel}`} title="Anterior (←)" className="p-1.5 rounded-full text-ink/50 hover:bg-ink/5">
            <ChevronLeft size={16} />
          </button>
          <span className="font-display font-semibold text-sm text-ink text-center px-1">{rangeLabel(rangeStart, viewDays)}</span>
          <button onClick={() => changeRange(1)} aria-label={`Avançar ${navLabel}`} title="Próximo (→)" className="p-1.5 rounded-full text-ink/50 hover:bg-ink/5">
            <ChevronRight size={16} />
          </button>
        </div>
        <button
          onClick={goToToday}
          title="Hoje (T)"
          className="text-xs px-2 py-1 rounded-full border border-line text-ink/60 hover:bg-ink/5"
        >
          Hoje
        </button>
      </div>

      <div className="flex items-center gap-3 px-4 py-1.5">
        <div className="inline-flex rounded-full bg-ink/5 p-0.5 shrink-0">
          {VIEW_OPTIONS.map((n) => (
            <button
              key={n}
              onClick={() => setViewDays(n)}
              title={`${n === 1 ? '1 dia' : `${n} dias`} (${n})`}
              className={`px-2.5 py-0.5 text-xs rounded-full font-medium transition-colors ${
                viewDays === n ? 'bg-ink text-base' : 'text-ink/60 hover:bg-card/50'
              }`}
            >
              {n === 1 ? '1 dia' : `${n} dias`}
            </button>
          ))}
        </div>
        <p className="text-xs text-ink/40 min-w-0">
          {loading ? (
            'Carregando...'
          ) : (
            <>
              Arraste num horário vazio pra criar; arraste um compromisso pra mover (com Alt, duplica) ou pela borda pra redimensionar.
              <span className="hidden sm:inline"> Atalhos: T hoje · ←/→ navegar · 1/3/7 dias · C novo · Enter editar · Del excluir · Ctrl+C/V copiar/colar · Ctrl+Z desfazer.</span>
            </>
          )}
        </p>
      </div>

      {clipboard && (
        <div className="flex items-center justify-between gap-2 px-4 pb-1">
          <p className="text-xs text-teal-dark bg-teal-light rounded-full px-2.5 py-1 truncate">
            Copiado: {clipboard.title} — dois cliques num horário (ou Ctrl+V) pra colar
          </p>
          <button
            onClick={onClearClipboard}
            aria-label="Cancelar cópia"
            className="p-1 text-ink/40 hover:bg-ink/5 rounded-full shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div className="flex w-full" style={{ minWidth: wide ? HOUR_COL_WIDTH + 7 * DAY_COL_WIDTH : undefined }}>
          <div className="sticky left-0 z-20 bg-base shrink-0" style={{ width: HOUR_COL_WIDTH }}>
            <div className="sticky top-0 z-30 bg-base border-b border-line flex items-end justify-end pr-1 pb-1.5" style={{ height: headerHeight }}>
              {maxAllDay > 0 && <span className="text-[9px] text-ink/30 leading-tight text-right">dia todo</span>}
            </div>
            <div className="relative" style={{ height: HOUR_HEIGHT * 24 }}>
              {Array.from({ length: 24 }).map((_, h) => (
                <div key={h} className="absolute left-0 right-1 text-right text-[10px] text-ink/30" style={{ top: h * HOUR_HEIGHT - 6 }}>
                  {String(h).padStart(2, '0')}h
                </div>
              ))}
            </div>
          </div>

          {days.map((date) => {
            const dateKey = dateKeyOf(date)
            const isToday = dateKey === todayKey
            const dayEvents = timedByDate[dateKey] || []
            const allDayEvents = allDayByDate[dateKey] || []
            const layout = layoutByDate[dateKey] || {}
            const selection = creating?.dateKey === dateKey
              ? creatingRange(creating)
              : draft?.dateKey === dateKey && eventModal && !eventModal.id
              ? draft
              : null
            return (
              <div key={dateKey} className="flex-1 min-w-0 border-l border-line" style={{ minWidth: wide ? DAY_COL_WIDTH : undefined }}>
                <div className="sticky top-0 z-10 bg-base border-b border-line flex flex-col" style={{ height: headerHeight }}>
                  <div className="h-12 shrink-0 flex flex-col items-center justify-center gap-0.5">
                    <span className="text-[10px] text-ink/40">{WEEKDAY_LABELS[date.getDay()]}</span>
                    <span className={`text-xs w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-ink text-base font-medium' : 'text-ink/80'}`}>
                      {date.getDate()}
                    </span>
                  </div>
                  {allDayEvents.length > 0 && (
                    <div className="px-1 flex flex-col" style={{ gap: 2 }}>
                      {allDayEvents.map((ev) => {
                        const color = getEventColor(ev.color)
                        return (
                          <button
                            key={ev.id}
                            onClick={(e) => handleCardTap(ev, e.nativeEvent.pointerType || 'mouse')}
                            title={ev.title}
                            className={`rounded border px-1.5 text-left text-[10px] font-medium truncate leading-none ${color.card} ${color.text} ${
                              selectedId === ev.id ? 'ring-2 ring-ink' : ''
                            }`}
                            style={{ height: ALL_DAY_ROW - 2 }}
                          >
                            {ev.title}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div
                  ref={(el) => { dayColumnRefs.current[dateKey] = el }}
                  className="relative cursor-pointer select-none"
                  style={{ height: HOUR_HEIGHT * 24 }}
                  onDoubleClick={(e) => handleDayDoubleClick(e, dateKey)}
                  onPointerDown={(e) => handleCreateStart(e, dateKey)}
                  onPointerMove={(e) => handleColumnPointerMove(e, dateKey)}
                  onPointerUp={() => handleCreateEnd(dateKey)}
                  onPointerCancel={() => setCreating(null)}
                  onPointerLeave={() => { hoverSlot.current = null }}
                >
                  {Array.from({ length: 24 }).map((_, h) => (
                    <div key={h} className="absolute left-0 right-0 border-t border-line/50" style={{ top: h * HOUR_HEIGHT }} />
                  ))}

                  {isToday && (
                    <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top: nowTop }}>
                      <div className="h-px bg-red-500" />
                    </div>
                  )}

                  {selection && (
                    <div
                      className="absolute left-1 right-1 z-20 rounded-md border-2 border-dashed border-ink/40 bg-ink/10 px-1.5 py-1 pointer-events-none"
                      style={{
                        top: (selection.start / 60) * HOUR_HEIGHT,
                        height: ((selection.end - selection.start) / 60) * HOUR_HEIGHT,
                      }}
                    >
                      <p className="text-[10px] font-medium text-ink/70 leading-tight">
                        {formatMinutes(selection.start)}–{formatMinutes(Math.min(selection.end, 24 * 60 - 1))}
                      </p>
                    </div>
                  )}

                  {dayEvents.map((ev) => {
                    const { start: startMinutes, end: endMinutes } = eventMinutes(ev)
                    const top = (startMinutes / (24 * 60)) * (HOUR_HEIGHT * 24)
                    const hasRange = endMinutes !== null
                    const height = hasRange
                      ? Math.max(((endMinutes - startMinutes) / (24 * 60)) * (HOUR_HEIGHT * 24), 24)
                      : 24
                    const isActiveDrag = drag.id === ev.id && drag.dragging
                    const isDuplicating = isActiveDrag && drag.moved && drag.duplicate
                    const dx = isActiveDrag ? drag.dx : 0
                    const dy = isActiveDrag ? drag.dy : 0
                    const color = getEventColor(ev.color)
                    const { col = 0, cols = 1 } = layout[ev.id] || {}
                    const left = `calc(4px + (100% - 8px) * ${col / cols})`
                    const width = `calc((100% - 8px) / ${cols} - ${cols > 1 ? 2 : 0}px)`

                    const isResizingThis = resize.id === ev.id && resize.active
                    const minPx = (SNAP_MINUTES / (24 * 60)) * (HOUR_HEIGHT * 24)
                    let displayTop = top
                    let displayHeight = height
                    if (isResizingThis && resize.edge === 'top') {
                      displayTop = Math.min(Math.max(top + resize.dy, 0), top + height - minPx)
                      displayHeight = top + height - displayTop
                    } else if (isResizingThis) {
                      displayHeight = Math.min(Math.max(height + resize.dy, minPx), HOUR_HEIGHT * 24 - top)
                    }

                    // horário exibido: durante arraste/redimensionamento mostra
                    // o horário que vai ficar ao soltar.
                    let labelStart = startMinutes
                    let labelEnd = endMinutes
                    if (isActiveDrag && drag.moved && drag.previewStart !== null) {
                      labelStart = drag.previewStart
                      labelEnd = hasRange ? Math.min(drag.previewStart + (endMinutes - startMinutes), 24 * 60 - 1) : null
                    } else if (isResizingThis) {
                      labelStart = pxToMinutes(displayTop)
                      labelEnd = Math.max(labelStart + SNAP_MINUTES, pxToMinutes(displayTop + displayHeight, 24 * 60))
                    }
                    const timeLabel = `${formatMinutes(labelStart)}${labelEnd !== null ? `–${formatMinutes(Math.min(labelEnd, 24 * 60 - 1))}` : ''}`
                    const originalLabel = `${formatMinutes(startMinutes)}${hasRange ? `–${formatMinutes(endMinutes)}` : ''}`

                    return [
                      // com Alt, o original fica no lugar enquanto a cópia é arrastada
                      isDuplicating && (
                        <div
                          key={`${ev.id}-original`}
                          className={`absolute rounded-md border px-1.5 py-1 overflow-hidden pointer-events-none opacity-60 z-[5] ${color.card} ${color.text}`}
                          style={{ top, height, left, width }}
                        >
                          <p className="text-[10px] font-medium truncate leading-tight">{ev.title}</p>
                          <p className="text-[9px] opacity-80 leading-tight">{originalLabel}</p>
                        </div>
                      ),
                      <div
                        key={ev.id}
                        data-event-card
                        className={`absolute rounded-md border px-1.5 py-1 overflow-hidden ${isDuplicating ? 'cursor-copy' : 'cursor-grab'} ${color.card} ${color.text} ${
                          isActiveDrag || isResizingThis ? 'z-30 shadow-xl' : 'z-[5]'
                        } ${selectedId === ev.id ? 'ring-2 ring-ink ring-offset-1 ring-offset-base' : ''}`}
                        style={{
                          top: displayTop,
                          height: displayHeight,
                          left,
                          width,
                          transform: isResizingThis ? undefined : `translate(${dx}px, ${dy}px) ${isActiveDrag ? 'scale(1.03)' : ''}`,
                          transition: isActiveDrag || isResizingThis ? 'none' : 'transform 0.2s ease',
                          touchAction: 'none',
                        }}
                        onPointerDown={(e) => handleDragStart(e, ev.id)}
                        onPointerMove={(e) => handleDragMove(e, ev.id, ev)}
                        onPointerUp={(e) => handleDragEnd(e, ev.id, ev)}
                        onPointerCancel={handleDragCancel}
                      >
                        <p className="text-[10px] font-medium truncate leading-tight">
                          {isDuplicating && <span className="font-bold">+ </span>}
                          {ev.title}
                        </p>
                        <p className={`text-[9px] leading-tight ${isActiveDrag || isResizingThis ? 'font-semibold' : 'opacity-80'}`}>
                          {timeLabel}
                        </p>
                        <div
                          onPointerDown={(e) => handleResizeStart(e, ev.id, 'top')}
                          onPointerMove={(e) => handleResizeMove(e, ev.id)}
                          onPointerUp={(e) => handleResizeEnd(e, ev.id, ev)}
                          onPointerCancel={handleResizeCancel}
                          className="absolute left-0 right-0 top-0 h-2 cursor-row-resize flex items-start justify-center"
                          style={{ touchAction: 'none' }}
                        >
                          <span className="w-4 h-0.5 rounded-full bg-current opacity-40 mt-0.5" />
                        </div>
                        <div
                          onPointerDown={(e) => handleResizeStart(e, ev.id, 'bottom')}
                          onPointerMove={(e) => handleResizeMove(e, ev.id)}
                          onPointerUp={(e) => handleResizeEnd(e, ev.id, ev)}
                          onPointerCancel={handleResizeCancel}
                          className="absolute left-0 right-0 bottom-0 h-2 cursor-row-resize flex items-end justify-center"
                          style={{ touchAction: 'none' }}
                        >
                          <span className="w-4 h-0.5 rounded-full bg-current opacity-40 mb-0.5" />
                        </div>
                      </div>,
                    ]
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <FabButton onClick={() => openNewEvent(todayKey)} label="Novo compromisso (C)">
        <Plus size={16} />
      </FabButton>

      <UndoToast undo={undo} />

      {eventModal && (
        <EventModal
          initialForm={eventModal.form}
          editingEventId={eventModal.id}
          onSave={handleSaveEvent}
          onDelete={eventModal.id ? () => {
            const ev = events.find((e) => e.id === eventModal.id)
            if (ev) deleteEvent(ev)
          } : null}
          onCopy={onCopyEvent}
          onClose={() => { setEventModal(null); setDraft(null) }}
        />
      )}
    </div>
  )
}
