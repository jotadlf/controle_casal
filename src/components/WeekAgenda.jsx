import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X, Plus } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { toDateKey, parseTime } from '../lib/date'
import { refreshAppBadge } from '../lib/badge'
import EventModal from './EventModal'
import FabButton from './FabButton'
import { getEventColor, DEFAULT_EVENT_COLOR } from '../lib/eventColors'
import { layoutOverlappingEvents } from '../lib/eventLayout'

const HOUR_HEIGHT = 48
const DAY_COL_WIDTH = 132
const HOUR_COL_WIDTH = 44
const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const SNAP_MINUTES = 15
const CLICK_THRESHOLD = 6

function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay())
  d.setHours(0, 0, 0, 0)
  return d
}

function weekRangeLabel(weekStart) {
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth() && weekStart.getFullYear() === weekEnd.getFullYear()
  const label = sameMonth
    ? `${weekStart.getDate()}–${weekEnd.getDate()} de ${weekEnd.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`
    : `${weekStart.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`
  return label.charAt(0).toUpperCase() + label.slice(1)
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

export default function WeekAgenda({ user, initialDate, clipboard, onCopyEvent, onClearClipboard, onClose }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(initialDate || new Date()))
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => new Date())
  const [eventModal, setEventModal] = useState(null) // null | { id, form }

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      return d
    }),
    [weekStart],
  )

  async function loadEvents() {
    setLoading(true)
    const start = toDateKey(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate())
    const last = days[6]
    const end = toDateKey(last.getFullYear(), last.getMonth(), last.getDate())
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('created_by', user)
      .gte('event_date', start)
      .lte('event_date', end)
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
  }, [weekStart, user])

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

  const ALL_DAY_ROW = 20
  const headerHeight = 48 + (maxAllDay ? maxAllDay * ALL_DAY_ROW + 6 : 0)

  function changeWeek(delta) {
    setWeekStart((d) => {
      const next = new Date(d)
      next.setDate(next.getDate() + delta * 7)
      return next
    })
  }

  // --- arraste livre: o compromisso acompanha o dedo/mouse em qualquer
  // direção; soltar decide o dia (coluna) e o horário (posição do topo do
  // card, arredondado pros 15min mais próximos) de destino. Durante o
  // arraste o card já mostra o horário que vai ficar.
  const dayColumnRefs = useRef({})
  const dragStart = useRef({ x: 0, y: 0, grab: 0 })
  const [drag, setDrag] = useState({ id: null, dx: 0, dy: 0, dragging: false, moved: false, previewStart: null })

  // --- arrastar num horário vazio cria um compromisso com aquela duração.
  // `creating` é a seleção em andamento; `draft` mantém o fantasma na grade
  // enquanto o formulário do novo compromisso está aberto.
  const [creating, setCreating] = useState(null) // null | { dateKey, anchor, current }
  const [draft, setDraft] = useState(null) // null | { dateKey, start, end }

  // --- redimensionar: arrastar a borda de cima ou de baixo do card muda o
  // horário de início ou término, mantendo a outra ponta fixa.
  const [resize, setResize] = useState({ id: null, edge: null, dy: 0, active: false })

  // ao trocar de semana (inclusive na primeira renderização), rola a grade
  // pra deixar o dia e o horário atuais em evidência, em vez de abrir
  // sempre no topo (00h) lá na esquerda.
  const scrollRef = useRef(null)
  useEffect(() => {
    if (!scrollRef.current) return
    const startKey = toDateKey(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate())
    const last = days[6]
    const endKey = toDateKey(last.getFullYear(), last.getMonth(), last.getDate())
    const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate())
    const todayInWeek = todayKey >= startKey && todayKey <= endKey

    const targetHour = todayInWeek ? now.getHours() : 7
    scrollRef.current.scrollTop = Math.max(targetHour - 2, 0) * HOUR_HEIGHT

    const col = todayInWeek ? dayColumnRefs.current[todayKey] : null
    if (col) {
      const containerRect = scrollRef.current.getBoundingClientRect()
      const colRect = col.getBoundingClientRect()
      const targetLeft = scrollRef.current.scrollLeft + (colRect.left - containerRect.left) - HOUR_COL_WIDTH
      scrollRef.current.scrollLeft = Math.max(targetLeft, 0)
    } else {
      scrollRef.current.scrollLeft = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart])

  function handleDragStart(e, id) {
    const cardRect = e.currentTarget.getBoundingClientRect()
    dragStart.current = { x: e.clientX, y: e.clientY, grab: e.clientY - cardRect.top }
    setDrag({ id, dx: 0, dy: 0, dragging: true, moved: false, previewStart: null })
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
    const { clientX, clientY } = e
    const previewStart = startMinutesAtPointer(clientY, ev.event_date)
    setDrag((d) => {
      if (!d.dragging || d.id !== id) return d
      const dx = clientX - dragStart.current.x
      const dy = clientY - dragStart.current.y
      return { ...d, dx, dy, previewStart, moved: d.moved || Math.hypot(dx, dy) > CLICK_THRESHOLD }
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

  async function rescheduleEvent(ev, newDateKey, newStartMinutes) {
    const newTime = minutesToTime(newStartMinutes)
    const sameDate = ev.event_date === newDateKey
    const sameTime = ev.event_time?.slice(0, 5) === newTime.slice(0, 5)
    if (sameDate && sameTime) return

    const originalStart = parseTime(ev.event_time)
    const originalEnd = parseTime(ev.event_end_time)
    let newEndTime = ev.event_end_time
    if (originalStart && originalEnd) {
      const duration = (originalEnd.hours * 60 + originalEnd.minutes) - (originalStart.hours * 60 + originalStart.minutes)
      if (duration > 0) {
        newEndTime = minutesToTime(Math.min(newStartMinutes + duration, 24 * 60 - 1))
      }
    }

    const payload = { event_date: newDateKey, event_time: newTime, event_end_time: newEndTime }
    setEvents((prev) => {
      const stillInRange = newDateKey >= toDateKey(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate())
        && newDateKey <= toDateKey(days[6].getFullYear(), days[6].getMonth(), days[6].getDate())
      if (!stillInRange) return prev.filter((e) => e.id !== ev.id)
      return prev.map((e) => (e.id === ev.id ? { ...e, ...payload } : e))
    })

    const { error } = await supabase.from('calendar_events').update(payload).eq('id', ev.id)
    if (error) {
      console.error('Falha ao reagendar compromisso:', error)
      loadEvents()
      return
    }
    const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate())
    if (newDateKey === todayKey || ev.event_date === todayKey) refreshAppBadge(user)
  }

  function handleDragEnd(e, id, ev) {
    if (drag.id !== id || !drag.dragging) return
    const { moved } = drag
    const clientX = e.clientX
    const clientY = e.clientY
    setDrag({ id: null, dx: 0, dy: 0, dragging: false, moved: false, previewStart: null })

    if (!moved) {
      openEditEvent(ev)
      return
    }

    const targetDateKey = targetDayKeyAt(clientX)
    if (!targetDateKey) return
    const minutes = startMinutesAtPointer(clientY, targetDateKey)
    if (minutes === null) return
    rescheduleEvent(ev, targetDateKey, minutes)
  }

  function handleDragCancel() {
    setDrag({ id: null, dx: 0, dy: 0, dragging: false, moved: false, previewStart: null })
  }

  // --- criar arrastando (mouse/caneta; no toque o arraste rola a grade, e
  // o dois toques continua valendo pra criar).
  function handleCreateStart(e, dateKey) {
    if (e.pointerType === 'touch' || e.button !== 0) return
    if (e.target.closest('[data-event-card]')) return
    const rect = e.currentTarget.getBoundingClientRect()
    const anchor = pxToMinutes(e.clientY - rect.top, 24 * 60 - SNAP_MINUTES, Math.floor)
    setCreating({ dateKey, anchor, current: anchor })
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handleCreateMove(e, dateKey) {
    if (!creating || creating.dateKey !== dateKey) return
    const rect = e.currentTarget.getBoundingClientRect()
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

  async function handleResizeEnd(e, id, ev) {
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

    const payload = { event_time: minutesToTime(newStartMinutes), event_end_time: minutesToTime(newEndMinutes) }
    setEvents((prev) => prev.map((e) => (e.id === ev.id ? { ...e, ...payload } : e)))
    const { error } = await supabase.from('calendar_events').update(payload).eq('id', ev.id)
    if (error) {
      console.error('Falha ao redimensionar compromisso:', error)
      loadEvents()
      return
    }
    const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate())
    if (ev.event_date === todayKey) refreshAppBadge(user)
  }

  function handleResizeCancel() {
    setResize({ id: null, edge: null, dy: 0, active: false })
  }

  // --- criar / editar ---
  function openNewEvent(dateKey, time = '', endTime = '') {
    setEventModal({ id: null, form: { title: '', description: '', date: dateKey, time, endTime, color: DEFAULT_EVENT_COLOR } })
  }

  async function pasteEventAt(dateKey, timeStr) {
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
    }
    await handleSaveEvent(payload, null)
  }

  // dois cliques num horário vazio da grade abre o formulário com aquele
  // dia e horário preenchidos (arredondado pros 15min mais próximos), ou
  // cola o compromisso copiado ali, se houver um na área de transferência.
  function handleDayDoubleClick(e, dateKey) {
    const rect = e.currentTarget.getBoundingClientRect()
    const relativeY = e.clientY - rect.top
    let minutes = Math.round((relativeY / HOUR_HEIGHT) * 60 / SNAP_MINUTES) * SNAP_MINUTES
    minutes = Math.max(0, Math.min(minutes, 24 * 60 - SNAP_MINUTES))
    const timeStr = minutesToTime(minutes).slice(0, 5)
    if (clipboard) {
      pasteEventAt(dateKey, timeStr)
      return
    }
    openNewEvent(dateKey, timeStr)
  }

  function openEditEvent(ev) {
    setEventModal({
      id: ev.id,
      form: {
        title: ev.title,
        description: ev.description || '',
        date: ev.event_date,
        time: ev.event_time ? ev.event_time.slice(0, 5) : '',
        endTime: ev.event_end_time ? ev.event_end_time.slice(0, 5) : '',
        color: ev.color || DEFAULT_EVENT_COLOR,
      },
    })
  }

  async function handleSaveEvent(payload, id) {
    if (id) {
      const { data, error } = await supabase.from('calendar_events').update(payload).eq('id', id).select().single()
      if (error) return error
      setEvents((prev) => prev.map((e) => (e.id === data.id ? data : e)))
    } else {
      const { data, error } = await supabase.from('calendar_events').insert({ ...payload, created_by: user }).select().single()
      if (error) return error
      setEvents((prev) => [...prev, data])
    }
    refreshAppBadge(user)
    return null
  }

  async function handleDeleteEvent(id) {
    await supabase.from('calendar_events').delete().eq('id', id)
    setEvents((prev) => prev.filter((e) => e.id !== id))
    refreshAppBadge(user)
  }

  const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate())
  const nowTop = ((now.getHours() * 60 + now.getMinutes()) / (24 * 60)) * (HOUR_HEIGHT * 24)

  return (
    <div className="fixed inset-0 z-40 bg-base flex flex-col">
      <div className="flex items-center justify-between px-3 py-3 border-b border-line bg-card shrink-0">
        <button onClick={onClose} aria-label="Fechar" className="p-2 rounded-full text-ink/50 hover:bg-ink/5">
          <X size={18} />
        </button>
        <div className="flex items-center gap-1">
          <button onClick={() => changeWeek(-1)} aria-label="Semana anterior" className="p-1.5 rounded-full text-ink/50 hover:bg-ink/5">
            <ChevronLeft size={16} />
          </button>
          <span className="font-display font-semibold text-sm text-ink text-center px-1">{weekRangeLabel(weekStart)}</span>
          <button onClick={() => changeWeek(1)} aria-label="Próxima semana" className="p-1.5 rounded-full text-ink/50 hover:bg-ink/5">
            <ChevronRight size={16} />
          </button>
        </div>
        <button
          onClick={() => setWeekStart(startOfWeek(new Date()))}
          className="text-xs px-2 py-1 rounded-full border border-line text-ink/60 hover:bg-ink/5"
        >
          Hoje
        </button>
      </div>

      <p className="text-xs text-ink/40 px-4 py-1">
        {loading
          ? 'Carregando...'
          : 'Arraste ou dê dois cliques num horário vazio pra criar um compromisso. Arraste um compromisso pra mudar de dia/horário, ou pela borda de cima/baixo pra redimensionar.'}
      </p>

      {clipboard && (
        <div className="flex items-center justify-between gap-2 px-4 pb-1">
          <p className="text-xs text-teal-dark bg-teal-light rounded-full px-2.5 py-1 truncate">
            Copiado: {clipboard.title} — dois cliques num horário pra colar
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
        <div className="flex w-full" style={{ minWidth: HOUR_COL_WIDTH + 7 * DAY_COL_WIDTH }}>
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
            const dateKey = toDateKey(date.getFullYear(), date.getMonth(), date.getDate())
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
              <div key={dateKey} className="flex-1 border-l border-line" style={{ minWidth: DAY_COL_WIDTH }}>
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
                            onClick={() => openEditEvent(ev)}
                            title={ev.title}
                            className={`rounded border px-1.5 text-left text-[10px] font-medium truncate leading-none ${color.card} ${color.text}`}
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
                  onPointerMove={(e) => handleCreateMove(e, dateKey)}
                  onPointerUp={() => handleCreateEnd(dateKey)}
                  onPointerCancel={() => setCreating(null)}
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
                    const dx = isActiveDrag ? drag.dx : 0
                    const dy = isActiveDrag ? drag.dy : 0
                    const color = getEventColor(ev.color)
                    const { col = 0, cols = 1 } = layout[ev.id] || {}

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

                    return (
                      <div
                        key={ev.id}
                        data-event-card
                        className={`absolute rounded-md border px-1.5 py-1 overflow-hidden cursor-grab ${color.card} ${color.text} ${isActiveDrag || isResizingThis ? 'z-30 shadow-xl' : 'z-[5]'}`}
                        style={{
                          top: displayTop,
                          height: displayHeight,
                          left: `calc(4px + (100% - 8px) * ${col / cols})`,
                          width: `calc((100% - 8px) / ${cols} - ${cols > 1 ? 2 : 0}px)`,
                          transform: isResizingThis ? undefined : `translate(${dx}px, ${dy}px) ${isActiveDrag ? 'scale(1.03)' : ''}`,
                          transition: isActiveDrag || isResizingThis ? 'none' : 'transform 0.2s ease',
                          touchAction: 'none',
                        }}
                        onPointerDown={(e) => handleDragStart(e, ev.id)}
                        onPointerMove={(e) => handleDragMove(e, ev.id, ev)}
                        onPointerUp={(e) => handleDragEnd(e, ev.id, ev)}
                        onPointerCancel={handleDragCancel}
                      >
                        <p className="text-[10px] font-medium truncate leading-tight">{ev.title}</p>
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
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <FabButton onClick={() => openNewEvent(todayKey)} label="Novo compromisso">
        <Plus size={16} />
      </FabButton>

      {eventModal && (
        <EventModal
          initialForm={eventModal.form}
          editingEventId={eventModal.id}
          onSave={handleSaveEvent}
          onDelete={eventModal.id ? () => handleDeleteEvent(eventModal.id) : null}
          onCopy={onCopyEvent}
          onClose={() => { setEventModal(null); setDraft(null) }}
        />
      )}
    </div>
  )
}
