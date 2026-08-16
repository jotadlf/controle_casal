import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import Modal from './Modal'
import FabButton from './FabButton'

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const HOUR_HEIGHT = 48 // px

function toDateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

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

function parseTime(t) {
  if (!t) return null
  const [h, m] = String(t).split(':').map(Number)
  if (Number.isNaN(h)) return null
  return { hours: h, minutes: m || 0 }
}

export default function CalendarView({ user }) {
  const [monthDate, setMonthDate] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState({ title: '', description: '', date: '', time: '' })
  const [activeEventId, setActiveEventId] = useState(null)
  const timelineRef = useRef(null)

  async function loadEvents() {
    setLoading(true)
    const { start, end } = monthRange(monthDate)
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
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
  }, [monthDate])

  const today = new Date()
  const todayKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate())

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

  function openDate(dateKey) {
    setSelectedDate(dateKey)
    setActiveEventId(null)
  }

  useEffect(() => {
    if (!selectedDate || !timelineRef.current) return
    const first = dayEvents.find((e) => e.event_time)
    const t = first ? parseTime(first.event_time) : null
    const targetHour = t ? Math.max(t.hours - 2, 0) : 7
    timelineRef.current.scrollTop = targetHour * HOUR_HEIGHT
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  function openNewEventForm() {
    setFormError('')
    setForm({ title: '', description: '', date: selectedDate || todayKey, time: '' })
    setShowForm(true)
  }

  async function addEvent() {
    if (!form.title.trim()) {
      setFormError('Informe o título do compromisso.')
      return
    }
    if (!form.date) {
      setFormError('Informe a data.')
      return
    }
    const { data, error } = await supabase
      .from('calendar_events')
      .insert({
        title: form.title.trim(),
        description: form.description.trim() || null,
        event_date: form.date,
        event_time: form.time || null,
        created_by: user,
      })
      .select()
      .single()
    if (error) {
      setFormError(`Falha ao salvar: ${error.message}`)
      return
    }
    if (data) {
      setEvents((prev) => [...prev, data])
      setShowForm(false)
      setFormError('')
      setSelectedDate(data.event_date)
    }
  }

  async function removeEvent(id) {
    await supabase.from('calendar_events').delete().eq('id', id)
    setEvents((prev) => prev.filter((e) => e.id !== id))
    setActiveEventId(null)
  }

  function changeMonth(delta) {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1))
  }

  const selectedLabel = selectedDate
    ? (() => {
        const [y, m, d] = selectedDate.split('-').map(Number)
        return new Date(y, m - 1, d).toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })
      })()
    : ''

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-semibold text-xl text-ink">Calendário</h2>
        <p className="text-sm text-ink/60">Toque em um dia para ver os compromissos.</p>
      </div>

      <FabButton onClick={openNewEventForm} label="Novo compromisso">
        <Plus size={16} />
      </FabButton>

      <div className="bg-white border border-line rounded-card p-3">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => changeMonth(-1)}
            aria-label="Mês anterior"
            className="p-1.5 rounded-full text-ink/50 hover:bg-ink/5"
          >
            <ChevronLeft size={16} />
          </button>
          <h3 className="font-display font-semibold text-base text-ink">{monthLabel(monthDate)}</h3>
          <button
            onClick={() => changeMonth(1)}
            aria-label="Próximo mês"
            className="p-1.5 rounded-full text-ink/50 hover:bg-ink/5"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-y-0.5 text-center">
          {WEEKDAYS.map((w, i) => (
            <span key={i} className="text-[10px] text-ink/40 pb-1">
              {w}
            </span>
          ))}

          {cells.map((dateKey, i) => {
            if (!dateKey) return <span key={i} />
            const day = Number(dateKey.slice(-2))
            const isToday = dateKey === todayKey
            const hasEvents = Boolean(eventsByDate[dateKey]?.length)
            const isSelected = dateKey === selectedDate
            return (
              <button
                key={i}
                onClick={() => openDate(dateKey)}
                className="flex flex-col items-center gap-0.5 py-0.5"
              >
                <span
                  className={`w-7 h-7 flex items-center justify-center rounded-full text-xs transition-colors ${
                    isToday
                      ? 'bg-ink text-white font-medium'
                      : isSelected
                      ? 'bg-teal-light text-teal-dark font-medium'
                      : 'text-ink/80 hover:bg-ink/5'
                  }`}
                >
                  {day}
                </span>
                <span className={`w-1 h-1 rounded-full ${hasEvents ? 'bg-coral' : 'bg-transparent'}`} />
              </button>
            )
          })}
        </div>

        {loading && <p className="text-xs text-ink/40 mt-2">Carregando...</p>}
      </div>

      {selectedDate && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center sm:justify-center">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setSelectedDate(null)} />
          <div className="relative bg-white rounded-t-card sm:rounded-card border border-line max-h-[70vh] w-full flex flex-col mx-auto sm:max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
              <div>
                <p className="font-display font-semibold text-ink capitalize">{selectedLabel}</p>
                <p className="text-xs text-ink/40">
                  {dayEvents.length === 0 ? 'Nenhum compromisso' : `${dayEvents.length} compromisso(s)`}
                </p>
              </div>
              <div className="flex items-center gap-1">
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
                  const t = parseTime(ev.event_time)
                  const top = t ? ((t.hours * 60 + t.minutes) / (24 * 60)) * (HOUR_HEIGHT * 24) : null
                  if (top === null) return null
                  const isActive = activeEventId === ev.id
                  return (
                    <div key={ev.id} className="absolute left-14 right-0" style={{ top }}>
                      <div className="relative">
                        <div className="absolute left-0 right-0 h-px bg-red-500" style={{ top: 0 }} />
                        <button
                          onClick={() => setActiveEventId(isActive ? null : ev.id)}
                          className="absolute left-2 -top-2.5 max-w-[85%] text-left"
                        >
                          <span className="inline-block bg-white px-1.5 py-0.5 rounded text-xs font-medium text-ink border border-red-500/30 truncate">
                            {ev.event_time?.slice(0, 5)} · {ev.title}
                          </span>
                        </button>
                        {isActive && (
                          <div className="absolute left-2 top-4 z-10 bg-white border border-line rounded-card shadow-lg p-3 w-64 max-w-[80vw]">
                            <p className="font-medium text-ink text-sm">{ev.title}</p>
                            {ev.description && <p className="text-xs text-ink/50 mt-1">{ev.description}</p>}
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-xs text-ink/40">
                                {ev.event_time?.slice(0, 5)}
                                {ev.created_by ? ` · por ${ev.created_by}` : ''}
                              </span>
                              <button
                                onClick={() => removeEvent(ev.id)}
                                aria-label="Excluir compromisso"
                                className="p-1 text-coral hover:bg-coral-light rounded-full"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <Modal
          title="Novo compromisso"
          onClose={() => {
            setShowForm(false)
            setFormError('')
          }}
          footer={
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowForm(false)
                  setFormError('')
                }}
                className="flex-1 py-2 rounded-full border border-line text-sm"
              >
                Cancelar
              </button>
              <button onClick={addEvent} className="flex-1 py-2 rounded-full bg-ink text-white text-sm font-medium">
                Salvar
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <input
                placeholder="Título (ex: Consulta médica)"
                value={form.title}
                onChange={(e) => {
                  setForm({ ...form, title: e.target.value })
                  if (formError) setFormError('')
                }}
                className={`w-full rounded-full border px-4 py-2 text-sm ${formError ? 'border-coral' : 'border-line'}`}
              />
            </div>
            <div className="flex gap-2">
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="flex-1 rounded-full border border-line px-3 py-2 text-sm"
              />
              <input
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                className="w-32 rounded-full border border-line px-3 py-2 text-sm"
              />
            </div>
            <textarea
              placeholder="Detalhes (opcional)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full rounded-2xl border border-line px-4 py-2 text-sm resize-none"
            />
            {formError && <p className="text-xs text-coral px-1">{formError}</p>}
          </div>
        </Modal>
      )}
    </div>
  )
}
