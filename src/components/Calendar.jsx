import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Trash2, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { refreshAppBadge } from '../lib/badge'
import { currentReferenceMonth, installmentNumber } from '../lib/bills'
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
  const [form, setForm] = useState({ title: '', description: '', date: '', time: '', endTime: '' })
  const [activeEventId, setActiveEventId] = useState(null)
  const [editingEventId, setEditingEventId] = useState(null)
  const [now, setNow] = useState(() => new Date())
  const timelineRef = useRef(null)
  const [highPriorityTasks, setHighPriorityTasks] = useState([])
  const [dueBills, setDueBills] = useState([])

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  async function loadDaySummary() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayDay = today.getDate()
    const refMonth = currentReferenceMonth()

    const [{ data: tasksData }, { data: billsData }, { data: paymentsData }] = await Promise.all([
      supabase.from('repair_requests').select('*').eq('status', 'pendente').eq('priority', 'alta'),
      supabase.from('bills').select('*').eq('active', true),
      supabase.from('bill_payments').select('*').eq('reference_month', refMonth),
    ])

    const paidBillIds = new Set((paymentsData || []).filter((p) => p.paid).map((p) => p.bill_id))
    const due = (billsData || []).filter((bill) => {
      if (paidBillIds.has(bill.id)) return false
      if (bill.recurrence_type === 'installment') {
        const number = installmentNumber(bill, refMonth)
        if (number < 1 || number > bill.installments_total) return false
      }
      return bill.due_day <= todayDay
    })

    setHighPriorityTasks(tasksData || [])
    setDueBills(due)
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
    setFormError('')
    setEditingEventId(null)
    setForm({ title: '', description: '', date: selectedDate || todayKey, time: '', endTime: '' })
    setShowForm(true)
  }

  function openEditEventForm(ev) {
    setFormError('')
    setEditingEventId(ev.id)
    setForm({
      title: ev.title,
      description: ev.description || '',
      date: ev.event_date,
      time: ev.event_time ? ev.event_time.slice(0, 5) : '',
      endTime: ev.event_end_time ? ev.event_end_time.slice(0, 5) : '',
    })
    setActiveEventId(null)
    setShowForm(true)
  }

  async function saveEvent() {
    if (!form.title.trim()) {
      setFormError('Informe o título do compromisso.')
      return
    }
    if (!form.date) {
      setFormError('Informe a data.')
      return
    }
    if (form.endTime && (!form.time || form.endTime <= form.time)) {
      setFormError('A hora de término deve ser depois do início.')
      return
    }
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      event_date: form.date,
      event_time: form.time || null,
      event_end_time: form.time ? form.endTime || null : null,
    }

    if (editingEventId) {
      const { data, error } = await supabase.from('calendar_events').update(payload).eq('id', editingEventId).select().single()
      if (error) {
        setFormError(`Falha ao salvar: ${error.message}`)
        return
      }
      if (data) {
        setEvents((prev) => prev.map((e) => (e.id === data.id ? data : e)))
        setShowForm(false)
        setFormError('')
        setEditingEventId(null)
        setSelectedDate(data.event_date)
        if (data.event_date === todayKey) refreshAppBadge(user)
      }
    } else {
      const { data, error } = await supabase
        .from('calendar_events')
        .insert({ ...payload, created_by: user })
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
        if (data.event_date === todayKey) refreshAppBadge(user)
      }
    }
  }

  async function removeEvent(id) {
    const removed = events.find((e) => e.id === id)
    await supabase.from('calendar_events').delete().eq('id', id)
    setEvents((prev) => prev.filter((e) => e.id !== id))
    setActiveEventId(null)
    if (removed?.event_date === todayKey) refreshAppBadge(user)
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
                  className={`w-7 h-7 flex items-center justify-center rounded-full text-xs transition-all duration-300 ${
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

      <div className="bg-white border border-line rounded-card p-4 space-y-4">
        <h3 className="font-display font-semibold text-sm text-ink">Resumo do dia</h3>

        <div>
          <p className="text-xs text-ink/40 mb-1.5">Tarefas de prioridade alta</p>
          {highPriorityTasks.length === 0 ? (
            <p className="text-xs text-ink/30">Nenhuma.</p>
          ) : (
            <ul className="space-y-1.5">
              {highPriorityTasks.map((t) => (
                <li key={t.id} className="text-sm text-ink flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-coral shrink-0" />
                  <span className="truncate">{t.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="text-xs text-ink/40 mb-1.5">Contas vencendo hoje ou atrasadas</p>
          {dueBills.length === 0 ? (
            <p className="text-xs text-ink/30">Nenhuma.</p>
          ) : (
            <ul className="space-y-1.5">
              {dueBills.map((bill) => {
                const overdueDays = now.getDate() - bill.due_day
                return (
                  <li key={bill.id} className="text-sm text-ink flex items-center justify-between gap-2">
                    <span className="truncate">{bill.name}</span>
                    <span className="text-xs text-coral shrink-0">
                      {overdueDays > 0 ? `Venceu há ${overdueDays}d` : 'Vence hoje'}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {selectedDate && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center sm:justify-center">
          <div className="absolute inset-0 bg-ink/40 animate-fade-in" onClick={() => setSelectedDate(null)} />
          <div className="relative bg-white rounded-t-card sm:rounded-card border border-line max-h-[70vh] w-full flex flex-col mx-auto sm:max-w-lg animate-pop-in">
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

                  return (
                    <div
                      key={ev.id}
                      className={`absolute left-14 right-2 transition-opacity duration-300 ${isPast ? 'opacity-40' : ''}`}
                      style={{ top, height: hasRange ? height : undefined }}
                    >
                      <div className="relative h-full">
                        {hasRange ? (
                          <button
                            onClick={() => setActiveEventId(isActive ? null : ev.id)}
                            className="absolute inset-0 rounded-md bg-sky-200 border border-sky-400 px-2 py-1 text-left overflow-hidden"
                          >
                            <p className="text-xs font-medium text-sky-900 truncate">{ev.title}</p>
                            <p className="text-[10px] text-sky-700">{timeLabel}</p>
                          </button>
                        ) : (
                          <>
                            <div className="absolute left-0 right-0 h-px bg-ink/25" style={{ top: 0 }} />
                            <button
                              onClick={() => setActiveEventId(isActive ? null : ev.id)}
                              className="absolute left-2 -top-2.5 max-w-[85%] text-left"
                            >
                              <span className="inline-block bg-white px-1.5 py-0.5 rounded text-xs font-medium text-ink border border-line truncate">
                                {timeLabel} · {ev.title}
                              </span>
                            </button>
                          </>
                        )}
                        {isActive && (
                          <div
                            className={`absolute left-2 z-10 bg-white border border-line rounded-card shadow-lg p-3 w-64 max-w-[80vw] animate-pop-in ${
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

      {showForm && (
        <Modal
          title={editingEventId ? 'Editar compromisso' : 'Novo compromisso'}
          onClose={() => {
            setShowForm(false)
            setFormError('')
            setEditingEventId(null)
          }}
          footer={
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowForm(false)
                  setFormError('')
                  setEditingEventId(null)
                }}
                className="flex-1 py-2 rounded-full border border-line text-sm"
              >
                Cancelar
              </button>
              <button onClick={saveEvent} className="flex-1 py-2 rounded-full bg-ink text-white text-sm font-medium">
                {editingEventId ? 'Salvar alterações' : 'Salvar'}
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
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full rounded-full border border-line px-3 py-2 text-sm"
            />
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={form.time}
                onChange={(e) => {
                  setForm({ ...form, time: e.target.value })
                  if (formError) setFormError('')
                }}
                className="flex-1 rounded-full border border-line px-3 py-2 text-sm"
              />
              <span className="text-xs text-ink/40 shrink-0">até</span>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => {
                  setForm({ ...form, endTime: e.target.value })
                  if (formError) setFormError('')
                }}
                disabled={!form.time}
                className="flex-1 rounded-full border border-line px-3 py-2 text-sm disabled:opacity-40"
              />
            </div>
            {form.endTime && (
              <p className="text-xs text-ink/40 px-1">
                Compromisso vai ocupar o intervalo de {form.time} até {form.endTime} na agenda do dia.
              </p>
            )}
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
