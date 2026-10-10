import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Trash2, Pencil, Maximize2, Copy, ClipboardPaste } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { refreshAppBadge } from '../lib/badge'
import { toDateKey, parseTime } from '../lib/date'
import EventModal from './EventModal'
import FabButton from './FabButton'
import Kanban from './Kanban'
import WeekAgenda from './WeekAgenda'
import { getEventColor, DEFAULT_EVENT_COLOR } from '../lib/eventColors'
import { layoutOverlappingEvents } from '../lib/eventLayout'
import { pickEventFields, clipboardFromEvent, reminderToForm, reminderFromForm, DEFAULT_REMINDER } from '../lib/calendarEvents'
import { useUndo } from '../lib/useUndo'
import UndoToast from './UndoToast'

const VIEWS = [
  { key: 'calendario', label: 'Calendário' },
  { key: 'kanban', label: 'Kanban' },
]

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const HOUR_HEIGHT = 48 // px
const MONTH_CHIPS = 2 // compromissos visíveis por dia no mês; o resto vira "+N"
const LONG_PRESS_MS = 350
const DRAG_THRESHOLD = 5

function monthLabel(date) {
  const label = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function monthRange(date) {
  const year = date.getFullYear()
  const month = date.getMonth()
  const start = toDateKey(year, month, 1)
  const lastDay = new Date(year, month + 1, 0).getDate()
  const end = toDateKey(year, month, lastDay)
  return { start, end, year, month, lastDay }
}

export default function CalendarView({ user }) {
  const [view, setView] = useState('calendario')
  const [showWeekAgenda, setShowWeekAgenda] = useState(false)
  const [monthDate, setMonthDate] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(null)
  const [eventModal, setEventModal] = useState(null) // null | { id, form }
  const [activeEventId, setActiveEventId] = useState(null)
  const [now, setNow] = useState(() => new Date())
  const timelineRef = useRef(null)
  const [highPriorityTasks, setHighPriorityTasks] = useState([])
  const [clipboard, setClipboard] = useState(null)
  const undo = useUndo({ enabled: !showWeekAgenda && !eventModal })

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  async function loadDaySummary() {
    const { data: tasksData } = await supabase
      .from('repair_requests')
      .select('*')
      .eq('status', 'pendente')
      .eq('priority', 'alta')

    setHighPriorityTasks(tasksData || [])
  }

  useEffect(() => {
    loadDaySummary()
  }, [])

  async function loadEvents() {
    setLoading(true)
    const { start, end } = monthRange(monthDate)
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('created_by', user)
      .gte('event_date', start)
      .lte('event_date', end)
      .order('event_time', { ascending: true })
    if (error) {
      console.error('Falha ao carregar eventos:', error)
      setEvents([])
      setLoading(false)
      return
    }
    setEvents(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadEvents()
  }, [monthDate, user])

  const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate())
  const isViewingToday = selectedDate === todayKey
  const nowTop = ((now.getHours() * 60 + now.getMinutes()) / (24 * 60)) * (HOUR_HEIGHT * 24)

  const eventsByDate = useMemo(() => {
    const map = {}
    for (const ev of events) {
      if (!map[ev.event_date]) map[ev.event_date] = []
      map[ev.event_date].push(ev)
    }
    return map
  }, [events])

  const cells = useMemo(() => {
    const { year, month, lastDay } = monthRange(monthDate)
    const startWeekday = new Date(year, month, 1).getDay()
    const arr = []
    for (let i = 0; i < startWeekday; i++) arr.push(null)
    for (let day = 1; day <= lastDay; day++) arr.push(toDateKey(year, month, day))
    return arr
  }, [monthDate])

  const dayEvents = selectedDate
    ? [...(eventsByDate[selectedDate] || [])].sort((a, b) => (a.event_time || '').localeCompare(b.event_time || ''))
    : []
  const allDayEvents = dayEvents.filter((ev) => !parseTime(ev.event_time))
  const dayLayout = useMemo(() => layoutOverlappingEvents(dayEvents), [selectedDate, events])

  function openDate(dateKey) {
    setSelectedDate(dateKey)
    setActiveEventId(null)
  }

  useEffect(() => {
    if (!selectedDate || !timelineRef.current) return
    const first = dayEvents.find((e) => e.event_time)
    const t = first ? parseTime(first.event_time) : null
    const fallbackHour = isViewingToday ? now.getHours() : 7
    const targetHour = t ? Math.max(t.hours - 2, 0) : Math.max(fallbackHour - 2, 0)
    timelineRef.current.scrollTop = targetHour * HOUR_HEIGHT
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  function openNewEventForm() {
    setEventModal({ id: null, form: { title: '', description: '', date: selectedDate || todayKey, time: '', endTime: '', color: DEFAULT_EVENT_COLOR } })
  }

  function openEditEventForm(ev) {
    setActiveEventId(null)
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

  async function handleSaveEvent(payload, id) {
    if (id) {
      const { data, error } = await supabase.from('calendar_events').update(payload).eq('id', id).select().single()
      if (error) return error
      setEvents((prev) => prev.map((e) => (e.id === data.id ? data : e)))
      setSelectedDate(data.event_date)
      if (data.event_date === todayKey) refreshAppBadge(user)
    } else {
      const { data, error } = await supabase
        .from('calendar_events')
        .insert({ ...payload, created_by: user })
        .select()
        .single()
      if (error) return error
      setEvents((prev) => [...prev, data])
      setSelectedDate(data.event_date)
      if (data.event_date === todayKey) refreshAppBadge(user)
    }
    return null
  }

  async function pasteEvent() {
    if (!clipboard || !selectedDate) return
    const payload = {
      title: clipboard.title,
      description: clipboard.description || null,
      event_date: selectedDate,
      event_time: clipboard.time || null,
      event_end_time: clipboard.time ? clipboard.endTime || null : null,
      color: clipboard.color || DEFAULT_EVENT_COLOR,
      reminder_minutes: reminderFromForm(clipboard.reminder ?? DEFAULT_REMINDER, Boolean(clipboard.time)),
    }
    await handleSaveEvent(payload, null)
  }

  async function removeEvent(id) {
    const removed = events.find((e) => e.id === id)
    await supabase.from('calendar_events').delete().eq('id', id)
    setEvents((prev) => prev.filter((e) => e.id !== id))
    setActiveEventId(null)
    if (removed?.event_date === todayKey) refreshAppBadge(user)
    if (!removed) return
    undo.push(`"${removed.title}" excluído`, async () => {
      const { data, error } = await supabase
        .from('calendar_events')
        .insert({ ...pickEventFields(removed), created_by: removed.created_by || user })
        .select()
        .single()
      if (error) {
        console.error('Falha ao desfazer exclusão:', error)
        return
      }
      setEvents((prev) => [...prev, data])
      refreshAppBadge(user)
    })
  }

  // muda o dia de um compromisso (arrastado no mês), com "desfazer"
  async function moveEventToDate(ev, dateKey) {
    const previousDate = ev.event_date
    setEvents((prev) => prev.map((e) => (e.id === ev.id ? { ...e, event_date: dateKey } : e)))
    const { error } = await supabase.from('calendar_events').update({ event_date: dateKey }).eq('id', ev.id)
    if (error) {
      console.error('Falha ao mover compromisso:', error)
      loadEvents()
      return
    }
    refreshAppBadge(user)
    undo.push(`"${ev.title}" movido`, async () => {
      setEvents((prev) => prev.map((e) => (e.id === ev.id ? { ...e, event_date: previousDate } : e)))
      const { error: undoError } = await supabase.from('calendar_events').update({ event_date: previousDate }).eq('id', ev.id)
      if (undoError) loadEvents()
      refreshAppBadge(user)
    })
  }

  // cria uma cópia do compromisso em outro dia (Alt + arrastar no mês)
  async function duplicateEventToDate(ev, dateKey) {
    const { data, error } = await supabase
      .from('calendar_events')
      .insert({ ...pickEventFields(ev), event_date: dateKey, created_by: user })
      .select()
      .single()
    if (error) {
      console.error('Falha ao duplicar compromisso:', error)
      return
    }
    setEvents((prev) => [...prev, data])
    refreshAppBadge(user)
    undo.push(`"${ev.title}" duplicado`, async () => {
      await supabase.from('calendar_events').delete().eq('id', data.id)
      setEvents((prev) => prev.filter((e) => e.id !== data.id))
      refreshAppBadge(user)
    })
  }

  // --- arrastar compromissos entre dias no mês. Mouse/caneta: arrasta
  // direto. Toque: segura um instante (long press) e arrasta, pra não
  // atrapalhar a rolagem da página. Com Alt, solta uma cópia.
  const press = useRef(null) // null | { ev, x, y, pointerType, timer }
  const suppressClickUntil = useRef(0)
  const [monthDrag, setMonthDrag] = useState(null) // null | { ev, x, y, targetKey, duplicate }

  function dateKeyAtPoint(x, y) {
    const el = document.elementFromPoint(x, y)
    return el?.closest('[data-date-key]')?.getAttribute('data-date-key') || null
  }

  function activateMonthDrag(p, x, y, altKey) {
    if (p.pointerType === 'touch') navigator.vibrate?.(10)
    setMonthDrag({ ev: p.ev, x, y, targetKey: dateKeyAtPoint(x, y), duplicate: altKey })
  }

  function handleChipPointerDown(e, ev) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const p = { ev, x: e.clientX, y: e.clientY, pointerType: e.pointerType, timer: null }
    if (e.pointerType === 'touch') {
      const { clientX, clientY } = e
      p.timer = setTimeout(() => activateMonthDrag(p, clientX, clientY, false), LONG_PRESS_MS)
    } else {
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    press.current = p
  }

  function handleChipPointerMove(e) {
    const p = press.current
    if (!p) return
    if (!monthDrag) {
      const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y)
      if (dist <= DRAG_THRESHOLD) return
      if (p.pointerType === 'touch') {
        // mexeu antes do long press: é rolagem, não arraste
        clearTimeout(p.timer)
        press.current = null
        return
      }
      activateMonthDrag(p, e.clientX, e.clientY, e.altKey)
      return
    }
    setMonthDrag((d) => d && { ...d, x: e.clientX, y: e.clientY, targetKey: dateKeyAtPoint(e.clientX, e.clientY), duplicate: e.altKey })
  }

  function endMonthDrag(e, cancelled = false) {
    const p = press.current
    if (p) clearTimeout(p.timer)
    press.current = null
    const d = monthDrag
    setMonthDrag(null)
    if (!d) return
    suppressClickUntil.current = Date.now() + 400
    if (cancelled) return
    const targetKey = dateKeyAtPoint(e.clientX, e.clientY) || d.targetKey
    if (!targetKey) return
    if (e.altKey || d.duplicate) duplicateEventToDate(d.ev, targetKey)
    else if (targetKey !== d.ev.event_date) moveEventToDate(d.ev, targetKey)
  }

  // durante o arraste no toque, impede a página de rolar
  useEffect(() => {
    if (!monthDrag) return
    const prevent = (e) => e.preventDefault()
    document.addEventListener('touchmove', prevent, { passive: false })
    return () => document.removeEventListener('touchmove', prevent)
  }, [Boolean(monthDrag)])

  function clicksSuppressed() {
    return Date.now() < suppressClickUntil.current
  }

  function changeMonth(delta) {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1))
  }

  const selectedDateAsDate = selectedDate
    ? (() => {
        const [y, m, d] = selectedDate.split('-').map(Number)
        return new Date(y, m - 1, d)
      })()
    : null

  const selectedLabel = selectedDateAsDate
    ? selectedDateAsDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    : ''

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <div className="inline-flex rounded-full bg-ink/5 p-1">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`px-4 py-1.5 text-sm rounded-full font-medium transition-colors ${
                view === v.key ? 'bg-ink text-base' : 'text-ink/60 hover:bg-card/50'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'kanban' ? (
        <Kanban user={user} />
      ) : (
        <>
          <FabButton onClick={openNewEventForm} label="Novo compromisso">
            <Plus size={16} />
          </FabButton>

          <div className="bg-card border border-line rounded-card p-3">
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => changeMonth(-1)}
                aria-label="Mês anterior"
                className="p-1.5 rounded-full text-ink/50 hover:bg-ink/5"
              >
                <ChevronLeft size={16} />
              </button>
              <h3 className="font-display font-semibold text-base text-ink">{monthLabel(monthDate)}</h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => changeMonth(1)}
                  aria-label="Próximo mês"
                  className="p-1.5 rounded-full text-ink/50 hover:bg-ink/5"
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  onClick={() => { undo.dismiss(); setShowWeekAgenda(true) }}
                  aria-label="Expandir pra visão de semana"
                  title="Expandir pra visão de semana"
                  className="p-1.5 rounded-full text-ink/50 hover:bg-ink/5"
                >
                  <Maximize2 size={15} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 text-center">
              {WEEKDAYS.map((w, i) => (
                <span key={i} className="text-[10px] text-ink/40 pb-1">
                  {w}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 border-l border-line/60">
              {cells.map((dateKey, i) => {
                if (!dateKey) return <span key={i} className="border-t border-r border-line/60 bg-ink/[0.02]" />
                const day = Number(dateKey.slice(-2))
                const isToday = dateKey === todayKey
                // dia todo primeiro, depois por horário
                const dayEventsList = [...(eventsByDate[dateKey] || [])].sort((a, b) =>
                  (a.event_time || '').localeCompare(b.event_time || ''),
                )
                const visible = dayEventsList.slice(0, MONTH_CHIPS)
                const hidden = dayEventsList.length - visible.length
                const isSelected = dateKey === selectedDate
                const isDropTarget = monthDrag?.targetKey === dateKey
                return (
                  <div
                    key={i}
                    data-date-key={dateKey}
                    role="button"
                    tabIndex={0}
                    onClick={() => { if (!clicksSuppressed()) openDate(dateKey) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') openDate(dateKey) }}
                    className={`min-h-[68px] border-t border-r border-line/60 px-0.5 pt-0.5 pb-1 flex flex-col items-stretch gap-0.5 cursor-pointer transition-colors ${
                      isDropTarget ? 'bg-teal-light/60' : 'hover:bg-ink/[0.03]'
                    }`}
                  >
                    <span
                      className={`self-center w-6 h-6 flex items-center justify-center rounded-full text-xs transition-all duration-300 ${
                        isToday
                          ? 'bg-ink text-base font-medium'
                          : isSelected
                          ? 'bg-teal-light text-teal-dark font-medium'
                          : 'text-ink/80'
                      }`}
                    >
                      {day}
                    </span>
                    {visible.map((ev) => {
                      const color = getEventColor(ev.color)
                      const isDragged = monthDrag?.ev.id === ev.id && !monthDrag.duplicate
                      return (
                        <button
                          key={ev.id}
                          type="button"
                          title={ev.event_time ? `${ev.event_time.slice(0, 5)} · ${ev.title}` : ev.title}
                          onPointerDown={(e) => handleChipPointerDown(e, ev)}
                          onPointerMove={handleChipPointerMove}
                          onPointerUp={(e) => endMonthDrag(e)}
                          onPointerCancel={(e) => endMonthDrag(e, true)}
                          onContextMenu={(e) => e.preventDefault()}
                          onClick={(e) => {
                            // no mouse, clicar no compromisso abre a edição; no
                            // toque, o clique segue pro dia (abre a agenda do dia)
                            if (clicksSuppressed()) { e.stopPropagation(); return }
                            if (e.nativeEvent.pointerType && e.nativeEvent.pointerType !== 'mouse') return
                            e.stopPropagation()
                            openEditEventForm(ev)
                          }}
                          className={`w-full truncate rounded-sm border px-1 text-left text-[9px] leading-[13px] font-medium select-none cursor-grab ${color.card} ${color.text} ${
                            isDragged ? 'opacity-40' : ''
                          }`}
                          style={{ WebkitTouchCallout: 'none' }}
                        >
                          {ev.event_time && <span className="hidden sm:inline opacity-70">{ev.event_time.slice(0, 5)} </span>}
                          {ev.title}
                        </button>
                      )
                    })}
                    {hidden > 0 && <span className="text-[9px] text-ink/40 leading-tight">+{hidden}</span>}
                  </div>
                )
              })}
            </div>

            {monthDrag && (
              <div
                className={`fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-1/2 rounded border px-2 py-0.5 text-[10px] font-medium shadow-lg max-w-[40vw] truncate ${getEventColor(monthDrag.ev.color).card} ${getEventColor(monthDrag.ev.color).text}`}
                style={{ left: monthDrag.x, top: monthDrag.y }}
              >
                {monthDrag.duplicate && <span className="font-bold">+ </span>}
                {monthDrag.ev.title}
              </div>
            )}

            <p className="text-[10px] text-ink/30 mt-2">
              Arraste um compromisso pra outro dia (no celular, segure antes de arrastar). Com Alt, duplica.
            </p>

            {loading && <p className="text-xs text-ink/40 mt-2">Carregando...</p>}
          </div>

          <div className="bg-card border border-line rounded-card p-4 space-y-4">
            <h3 className="font-display font-semibold text-sm text-ink">Resumo do dia</h3>

            <div>
              <p className="text-xs text-ink/40 mb-1.5">Tarefas de prioridade alta</p>
              {highPriorityTasks.length === 0 ? (
                <p className="text-xs text-ink/30">Nenhuma.</p>
              ) : (
                <ul className="space-y-1.5">
                  {highPriorityTasks.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-coral shrink-0" />
                        <span className="text-sm text-ink truncate">{t.title}</span>
                      </span>
                      <span className="text-xs text-coral shrink-0">Alta</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

          </div>

          {selectedDate && (
            <div className="fixed inset-0 z-40 flex items-end sm:items-center sm:justify-center">
              <div className="absolute inset-0 bg-ink/40 animate-fade-in" onClick={() => setSelectedDate(null)} />
              <div className="relative bg-card rounded-t-card sm:rounded-card border border-line max-h-[70vh] w-full flex flex-col mx-auto sm:max-w-lg animate-pop-in">
                <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
                  <div>
                    <p className="font-display font-semibold text-ink capitalize">{selectedLabel}</p>
                    <p className="text-xs text-ink/40">
                      {dayEvents.length === 0 ? 'Nenhum compromisso' : `${dayEvents.length} compromisso(s)`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {clipboard && (
                      <button
                        onClick={pasteEvent}
                        aria-label="Colar compromisso"
                        title={`Colar "${clipboard.title}"`}
                        className="p-2 rounded-full text-ink/50 hover:bg-ink/5"
                      >
                        <ClipboardPaste size={18} />
                      </button>
                    )}
                    <button
                      onClick={openNewEventForm}
                      aria-label="Adicionar compromisso"
                      className="p-2 rounded-full text-ink/50 hover:bg-ink/5"
                    >
                      <Plus size={18} />
                    </button>
                    <button
                      onClick={() => setSelectedDate(null)}
                      aria-label="Fechar"
                      className="p-2 rounded-full text-ink/50 hover:bg-ink/5"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                {allDayEvents.length > 0 && (
                  <div className="px-5 py-2 border-b border-line shrink-0 flex items-start gap-3">
                    <span className="text-[10px] text-ink/30 w-11 shrink-0 pt-1">dia todo</span>
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      {allDayEvents.map((ev) => {
                        const color = getEventColor(ev.color)
                        return (
                          <button
                            key={ev.id}
                            onClick={() => openEditEventForm(ev)}
                            className={`rounded-md border px-2 py-1 text-left text-xs font-medium truncate ${color.card} ${color.text}`}
                          >
                            {ev.title}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div ref={timelineRef} className="overflow-y-auto px-5 py-3">
                  <div className="relative" style={{ height: HOUR_HEIGHT * 24 }}>
                    {Array.from({ length: 24 }).map((_, hour) => (
                      <div
                        key={hour}
                        className="absolute left-0 right-0 text-xs text-ink/30"
                        style={{ top: hour * HOUR_HEIGHT }}
                      >
                        {String(hour).padStart(2, '0')}:00
                      </div>
                    ))}

                    {dayEvents.map((ev) => {
                      const start = parseTime(ev.event_time)
                      if (!start) return null
                      const startMinutes = start.hours * 60 + start.minutes
                      const top = (startMinutes / (24 * 60)) * (HOUR_HEIGHT * 24)

                      const end = parseTime(ev.event_end_time)
                      const endMinutes = end ? end.hours * 60 + end.minutes : null
                      const hasRange = endMinutes !== null && endMinutes > startMinutes
                      const bottom = hasRange ? (endMinutes / (24 * 60)) * (HOUR_HEIGHT * 24) : null
                      const height = hasRange ? Math.max(bottom - top, 26) : null

                      const isActive = activeEventId === ev.id
                      const isPast = isViewingToday && (hasRange ? bottom : top) < nowTop
                      const timeLabel = hasRange
                        ? `${ev.event_time.slice(0, 5)}–${ev.event_end_time.slice(0, 5)}`
                        : ev.event_time.slice(0, 5)
                      const color = getEventColor(ev.color)
                      const { col = 0, cols = 1 } = dayLayout[ev.id] || {}

                      return (
                        <div
                          key={ev.id}
                          className={`absolute transition-opacity duration-300 ${isPast ? 'opacity-40' : ''} ${isActive ? 'z-20' : ''}`}
                          style={{
                            top,
                            height: hasRange ? height : undefined,
                            left: `calc(56px + (100% - 64px) * ${col / cols})`,
                            width: `calc((100% - 64px) / ${cols} - ${cols > 1 ? 2 : 0}px)`,
                          }}
                        >
                          <div className="relative h-full">
                            {hasRange ? (
                              <button
                                onClick={() => setActiveEventId(isActive ? null : ev.id)}
                                className={`absolute inset-0 rounded-md border px-2 py-1 text-left overflow-hidden ${color.card}`}
                              >
                                <p className={`text-xs font-medium truncate ${color.text}`}>{ev.title}</p>
                                <p className={`text-[10px] ${color.subtext}`}>{timeLabel}</p>
                              </button>
                            ) : (
                              <>
                                <div className="absolute left-0 right-0 h-px bg-ink/25" style={{ top: 0 }} />
                                <button
                                  onClick={() => setActiveEventId(isActive ? null : ev.id)}
                                  className="absolute left-2 -top-2.5 max-w-[85%] text-left flex items-center gap-1"
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color.dot}`} />
                                  <span className="inline-block bg-card px-1.5 py-0.5 rounded text-xs font-medium text-ink border border-line truncate">
                                    {timeLabel} · {ev.title}
                                  </span>
                                </button>
                              </>
                            )}
                            {isActive && (
                              <div
                                className={`absolute left-2 z-10 bg-card border border-line rounded-card shadow-lg p-3 w-64 max-w-[80vw] animate-pop-in ${
                                  hasRange ? 'top-full mt-1' : 'top-4'
                                }`}
                              >
                                <p className="font-medium text-ink text-sm">{ev.title}</p>
                                {ev.description && <p className="text-xs text-ink/50 mt-1">{ev.description}</p>}
                                <div className="flex items-center justify-between mt-2">
                                  <span className="text-xs text-ink/40">
                                    {timeLabel}
                                    {ev.created_by ? ` · por ${ev.created_by}` : ''}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => {
                                        setClipboard(clipboardFromEvent(ev))
                                        setActiveEventId(null)
                                      }}
                                      aria-label="Copiar compromisso"
                                      className="p-1 text-ink/40 hover:bg-ink/5 rounded-full"
                                    >
                                      <Copy size={14} />
                                    </button>
                                    <button
                                      onClick={() => openEditEventForm(ev)}
                                      aria-label="Editar compromisso"
                                      className="p-1 text-ink/40 hover:bg-ink/5 rounded-full"
                                    >
                                      <Pencil size={14} />
                                    </button>
                                    <button
                                      onClick={() => removeEvent(ev.id)}
                                      aria-label="Excluir compromisso"
                                      className="p-1 text-coral hover:bg-coral-light rounded-full"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}

                    {isViewingToday && (
                      <div className="absolute left-14 right-0 z-10 pointer-events-none" style={{ top: nowTop }}>
                        <span className="absolute left-0 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-red-500" />
                        <div className="h-px bg-red-500" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {eventModal && (
            <EventModal
              initialForm={eventModal.form}
              editingEventId={eventModal.id}
              onSave={handleSaveEvent}
              onDelete={eventModal.id ? () => removeEvent(eventModal.id) : null}
              onCopy={setClipboard}
              onClose={() => setEventModal(null)}
            />
          )}
        </>
      )}

      <UndoToast undo={undo} />

      {showWeekAgenda && (
        <WeekAgenda
          user={user}
          initialDate={selectedDateAsDate || new Date()}
          clipboard={clipboard}
          onCopyEvent={setClipboard}
          onClearClipboard={() => setClipboard(null)}
          onClose={() => { setShowWeekAgenda(false); loadEvents() }}
        />
      )}
    </div>
  )
}
