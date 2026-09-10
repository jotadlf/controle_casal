import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X, Plus } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { toDateKey, parseTime } from '../lib/date'
import { refreshAppBadge } from '../lib/badge'
import EventModal from './EventModal'
import FabButton from './FabButton'

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

export default function WeekAgenda({ user, initialDate, onClose }) {
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

  const eventsByDate = useMemo(() => {
    const map = {}
    for (const ev of events) {
      if (!map[ev.event_date]) map[ev.event_date] = []
      map[ev.event_date].push(ev)
    }
    return map
  }, [events])

  function changeWeek(delta) {
    setWeekStart((d) => {
      const next = new Date(d)
      next.setDate(next.getDate() + delta * 7)
      return next
    })
  }

  // --- arraste livre: o compromisso acompanha o dedo/mouse em qualquer
  // direção; soltar decide o dia (coluna) e o horário (posição vertical,
  // arredondado pros 15min mais próximos) de destino.
  const dayColumnRefs = useRef({})
  const dragStart = useRef({ x: 0, y: 0 })
  const [drag, setDrag] = useState({ id: null, dx: 0, dy: 0, dragging: false, moved: false })

  function handleDragStart(e, id) {
    dragStart.current = { x: e.clientX, y: e.clientY }
    setDrag({ id, dx: 0, dy: 0, dragging: true, moved: false })
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handleDragMove(e, id) {
    const { clientX, clientY } = e
    setDrag((d) => {
      if (!d.dragging || d.id !== id) return d
      const dx = clientX - dragStart.current.x
      const dy = clientY - dragStart.current.y
      return { ...d, dx, dy, moved: d.moved || Math.hypot(dx, dy) > CLICK_THRESHOLD }
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
    const { moved, dx, dy } = drag
    const clientX = e.clientX
    const clientY = e.clientY
    setDrag({ id: null, dx: 0, dy: 0, dragging: false, moved: false })

    if (!moved) {
      openEditEvent(ev)
      return
    }

    const targetDateKey = targetDayKeyAt(clientX)
    const columnEl = targetDateKey ? dayColumnRefs.current[targetDateKey] : null
    if (!targetDateKey || !columnEl) return

    const rect = columnEl.getBoundingClientRect()
    const relativeY = clientY - rect.top
    let minutes = Math.round((relativeY / HOUR_HEIGHT) * 60 / SNAP_MINUTES) * SNAP_MINUTES
    minutes = Math.max(0, Math.min(minutes, 24 * 60 - SNAP_MINUTES))
    rescheduleEvent(ev, targetDateKey, minutes)
  }

  function handleDragCancel() {
    setDrag({ id: null, dx: 0, dy: 0, dragging: false, moved: false })
  }

  // --- criar / editar ---
  function openNewEvent(dateKey) {
    setEventModal({ id: null, form: { title: '', description: '', date: dateKey, time: '', endTime: '' } })
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

      {loading && <p className="text-xs text-ink/40 px-4 py-1">Carregando...</p>}

      <div className="flex-1 overflow-auto">
        <div className="flex" style={{ minWidth: HOUR_COL_WIDTH + 7 * DAY_COL_WIDTH }}>
          <div className="sticky left-0 z-20 bg-base shrink-0" style={{ width: HOUR_COL_WIDTH }}>
            <div className="sticky top-0 z-30 bg-base h-12 border-b border-line" />
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
            const dayEvents = eventsByDate[dateKey] || []
            return (
              <div key={dateKey} className="shrink-0 border-l border-line" style={{ width: DAY_COL_WIDTH }}>
                <div className="sticky top-0 z-10 bg-base h-12 border-b border-line flex flex-col items-center justify-center gap-0.5">
                  <span className="text-[10px] text-ink/40">{WEEKDAY_LABELS[date.getDay()]}</span>
                  <span className={`text-xs w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-ink text-base font-medium' : 'text-ink/80'}`}>
                    {date.getDate()}
                  </span>
                </div>
                <div
                  ref={(el) => { dayColumnRefs.current[dateKey] = el }}
                  className="relative"
                  style={{ height: HOUR_HEIGHT * 24 }}
                >
                  {Array.from({ length: 24 }).map((_, h) => (
                    <div key={h} className="absolute left-0 right-0 border-t border-line/50" style={{ top: h * HOUR_HEIGHT }} />
                  ))}

                  {isToday && (
                    <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top: nowTop }}>
                      <div className="h-px bg-red-500" />
                    </div>
                  )}

                  {dayEvents.map((ev) => {
                    const start = parseTime(ev.event_time)
                    if (!start) return null
                    const startMinutes = start.hours * 60 + start.minutes
                    const top = (startMinutes / (24 * 60)) * (HOUR_HEIGHT * 24)
                    const end = parseTime(ev.event_end_time)
                    const endMinutes = end ? end.hours * 60 + end.minutes : null
                    const hasRange = endMinutes !== null && endMinutes > startMinutes
                    const height = hasRange
                      ? Math.max(((endMinutes - startMinutes) / (24 * 60)) * (HOUR_HEIGHT * 24), 24)
                      : 24
                    const isActiveDrag = drag.id === ev.id && drag.dragging
                    const dx = isActiveDrag ? drag.dx : 0
                    const dy = isActiveDrag ? drag.dy : 0

                    return (
                      <div
                        key={ev.id}
                        className={`absolute left-1 right-1 rounded-md bg-sky-200 dark:bg-sky-900/60 border border-sky-400 dark:border-sky-600 text-sky-900 dark:text-sky-200 px-1.5 py-1 overflow-hidden cursor-grab ${isActiveDrag ? 'z-30 shadow-xl' : 'z-[5]'}`}
                        style={{
                          top,
                          height,
                          transform: `translate(${dx}px, ${dy}px) ${isActiveDrag ? 'scale(1.03)' : ''}`,
                          transition: isActiveDrag ? 'none' : 'transform 0.2s ease',
                          touchAction: 'none',
                        }}
                        onPointerDown={(e) => handleDragStart(e, ev.id)}
                        onPointerMove={(e) => handleDragMove(e, ev.id)}
                        onPointerUp={(e) => handleDragEnd(e, ev.id, ev)}
                        onPointerCancel={handleDragCancel}
                      >
                        <p className="text-[10px] font-medium truncate leading-tight">{ev.title}</p>
                        <p className="text-[9px] opacity-80 leading-tight">
                          {ev.event_time.slice(0, 5)}{hasRange ? `–${ev.event_end_time.slice(0, 5)}` : ''}
                        </p>
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
          onClose={() => setEventModal(null)}
        />
      )}
    </div>
  )
}
