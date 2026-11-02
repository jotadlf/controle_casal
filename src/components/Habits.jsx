import { useEffect, useMemo, useState } from 'react'
import { Plus, Minus, Check, Pencil, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { toISODate } from '../lib/tasks'
import { filterChipClass } from './RepairRequests'
import { EmptyState } from './ShoppingList'
import Modal from './Modal'
import FabButton from './FabButton'

const COLORS = ['#2EA043', '#14B8A6', '#3B82F6', '#A855F7', '#E8A33D', '#E15B4F']
const WEEKS_SHOWN = 53
const HABIT_SELECT = '*, logs:habit_logs(day, count)'
const VIEWS = [
  { key: 'mes', label: 'Mês' },
  { key: 'ano', label: 'Ano' },
]
const WEEKDAYS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']
const TYPES = [
  { key: 'diario', label: 'Diário' },
  { key: 'varias_vezes', label: 'Várias vezes ao dia', targetLabel: 'Vezes por dia', defaultTarget: 8 },
  { key: 'semanal', label: 'Semanal', targetLabel: 'Vezes por semana', defaultTarget: 3, maxTarget: 7 },
]

const emptyForm = () => ({ name: '', color: COLORS[0], frequency: 'diario', target: 1 })

const countsByDay = (habit) => new Map(habit.logs.map((l) => [l.day, l.count]))

// no hábito de várias vezes ao dia a cor vai ficando mais forte até bater a meta
function fillRatio(habit, count) {
  return habit.frequency === 'varias_vezes' ? Math.min(count / habit.target, 1) : 1
}

function squareStyle(habit, count) {
  if (!count) return undefined
  const alpha = Math.round((0.3 + 0.7 * fillRatio(habit, count)) * 255).toString(16).padStart(2, '0')
  return { backgroundColor: `${habit.color}${alpha}` }
}

function squareTitle(habit, date, count) {
  const label = date.toLocaleDateString('pt-BR')
  return habit.frequency === 'varias_vezes' ? `${label}: ${count} de ${habit.target}` : label
}

// tocar no quadradinho soma uma vez até a meta e depois zera; nos outros tipos só marca e desmarca
function nextCount(habit, count) {
  if (habit.frequency === 'varias_vezes') return count >= habit.target ? 0 : count + 1
  return count ? 0 : 1
}

// colunas de segunda a domingo, da semana mais antiga até a atual (que termina hoje)
function buildWeeks(todayISO) {
  const [year, month, day] = todayISO.split('-').map(Number)
  const today = new Date(year, month - 1, day)
  const cursor = new Date(year, month - 1, day - ((today.getDay() + 6) % 7) - (WEEKS_SHOWN - 1) * 7)
  const weeks = []
  while (cursor <= today) {
    const week = []
    for (let i = 0; i < 7 && cursor <= today; i++) {
      week.push({ iso: toISODate(cursor), date: new Date(cursor) })
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
  }
  return weeks
}

function monthLabel(weeks, index) {
  if (index === 0) return ''
  const month = weeks[index][0].date.getMonth()
  if (month === weeks[index - 1][0].date.getMonth()) return ''
  return weeks[index][0].date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
}

function HabitMonth({ habit, month, todayISO, onTapDay }) {
  const counts = countsByDay(habit)
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const blanks = (month.getDay() + 6) % 7
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()

  return (
    <div className="grid grid-cols-7 gap-1 w-max mx-auto">
      {WEEKDAYS.map((weekday, index) => (
        <span key={index} className="text-[10px] leading-4 text-center text-ink/40">
          {weekday}
        </span>
      ))}
      {Array.from({ length: blanks }, (_, index) => (
        <span key={`vazio-${index}`} />
      ))}
      {Array.from({ length: daysInMonth }, (_, index) => {
        const date = new Date(year, monthIndex, index + 1)
        const iso = toISODate(date)
        const count = counts.get(iso) || 0
        const future = iso > todayISO
        const label = squareTitle(habit, date, count)
        return (
          <button
            key={iso}
            onClick={() => onTapDay(habit, iso)}
            disabled={future}
            aria-label={label}
            aria-pressed={count > 0}
            title={label}
            style={squareStyle(habit, count)}
            className={`w-6 h-6 rounded text-[9px] ${count ? '' : 'bg-ink/10'} ${count && fillRatio(habit, count) >= 0.5 ? 'text-white' : 'text-ink/60'} ${future ? 'opacity-40' : ''} ${iso === todayISO ? 'ring-1 ring-ink/50' : ''}`}
          >
            {index + 1}
          </button>
        )
      })}
    </div>
  )
}

// o tamanho dos quadrados acompanha a largura do card, pra caber o ano inteiro sem rolagem
function HabitGrid({ habit, weeks, todayISO, onTapDay }) {
  const counts = countsByDay(habit)

  return (
    <div className="grid gap-px sm:gap-0.5" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
      {weeks.map((week, index) => (
        <div key={week[0].iso} className="flex flex-col gap-px sm:gap-0.5">
          <span className="h-4 text-[10px] leading-4 text-ink/40 whitespace-nowrap">{monthLabel(weeks, index)}</span>
          {week.map(({ iso, date }) => {
            const count = counts.get(iso) || 0
            const label = squareTitle(habit, date, count)
            return (
              <button
                key={iso}
                onClick={() => onTapDay(habit, iso)}
                aria-label={label}
                aria-pressed={count > 0}
                title={label}
                style={squareStyle(habit, count)}
                className={`w-full aspect-square rounded-[2px] ${count ? '' : 'bg-ink/10'} ${iso === todayISO ? 'ring-1 ring-ink/50' : ''}`}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

export default function Habits({ user }) {
  const [habits, setHabits] = useState([])
  const [loading, setLoading] = useState(true)
  const [alert, setAlert] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [view, setView] = useState('mes')
  const [monthOffset, setMonthOffset] = useState(0) // 0 = mês atual, -1 = mês passado...

  const now = new Date()
  const todayISO = toISODate(now)
  const weeks = useMemo(() => buildWeeks(todayISO), [todayISO])
  const month = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const weekStartISO = weeks[weeks.length - 1][0].iso
  const formType = TYPES.find((t) => t.key === form.frequency)

  useEffect(() => {
    if (!alert) return
    const timer = setTimeout(() => setAlert(null), 3500)
    return () => clearTimeout(timer)
  }, [alert])

  // cada pessoa só vê os próprios hábitos; recarrega ao trocar em "Eu sou"
  useEffect(() => {
    let active = true
    setLoading(true)
    supabase
      .from('habits')
      .select(HABIT_SELECT)
      .eq('owner', user)
      .order('created_at')
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          console.error('Falha ao carregar hábitos:', error)
          setAlert({ type: 'error', message: `Não foi possível carregar os hábitos: ${error.message}` })
        }
        setHabits(data || [])
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [user])

  function applyDayCount(id, day, count) {
    setHabits((prev) =>
      prev.map((h) => {
        if (h.id !== id) return h
        const others = h.logs.filter((l) => l.day !== day)
        return { ...h, logs: count ? [...others, { day, count }] : others }
      }),
    )
  }

  async function setDayCount(habit, day, count) {
    const previous = countsByDay(habit).get(day) || 0

    // atualiza na hora e desfaz se o banco recusar
    applyDayCount(habit.id, day, count)
    const { error } = count
      ? await supabase.from('habit_logs').upsert({ habit_id: habit.id, day, count }, { onConflict: 'habit_id,day' })
      : await supabase.from('habit_logs').delete().eq('habit_id', habit.id).eq('day', day)
    if (error) {
      console.error('Erro ao marcar dia:', error)
      applyDayCount(habit.id, day, previous)
      setAlert({ type: 'error', message: `Não foi possível salvar o dia: ${error.message}` })
    }
  }

  function tapDay(habit, day) {
    setDayCount(habit, day, nextCount(habit, countsByDay(habit).get(day) || 0))
  }

  function openNewForm() {
    setEditingId(null)
    setForm(emptyForm())
    setFormError('')
    setConfirmingDelete(false)
    setShowForm(true)
  }

  function openEditForm(habit) {
    setEditingId(habit.id)
    setForm({ name: habit.name, color: habit.color, frequency: habit.frequency, target: habit.target })
    setFormError('')
    setConfirmingDelete(false)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setFormError('')
  }

  function chooseType(type) {
    setForm({ ...form, frequency: type.key, target: type.defaultTarget || 1 })
    setFormError('')
  }

  async function saveHabit() {
    const name = form.name.trim()
    if (!name) {
      setFormError('Informe o nome do hábito.')
      return
    }
    const target = Number(form.target)
    if (!Number.isInteger(target) || target < 1 || target > (formType.maxTarget || 99)) {
      setFormError(`${formType.targetLabel} precisa ser um número de 1 a ${formType.maxTarget || 99}.`)
      return
    }

    const fields = { name, color: form.color, frequency: form.frequency, target }
    const query = editingId
      ? supabase.from('habits').update(fields).eq('id', editingId)
      : supabase.from('habits').insert({ ...fields, owner: user })
    const { data, error } = await query.select(HABIT_SELECT).single()

    if (error) {
      console.error('Erro ao salvar hábito:', error)
      setFormError(`Falha ao salvar hábito: ${error.message}`)
      return
    }
    setHabits((prev) => (editingId ? prev.map((h) => (h.id === data.id ? data : h)) : [...prev, data]))
    closeForm()
  }

  async function removeHabit() {
    const { error } = await supabase.from('habits').delete().eq('id', editingId)
    if (error) {
      console.error('Erro ao excluir hábito:', error)
      setFormError(`Falha ao excluir hábito: ${error.message}`)
      return
    }
    setHabits((prev) => prev.filter((h) => h.id !== editingId))
    closeForm()
  }

  function progressText(habit) {
    const todayCount = countsByDay(habit).get(todayISO) || 0
    if (habit.frequency === 'varias_vezes') return `${todayCount} de ${habit.target} hoje`
    if (habit.frequency === 'semanal') {
      const doneThisWeek = habit.logs.filter((l) => l.day >= weekStartISO).length
      return `${doneThisWeek} de ${habit.target} nesta semana`
    }
    return 'Todo dia'
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display font-semibold text-xl text-ink">Hábitos</h2>
        <p className="text-sm text-ink/60">Toque no quadradinho de um dia para marcar ou desmarcar.</p>
      </div>

      <FabButton onClick={openNewForm} label="Novo hábito">
        <Plus size={16} />
      </FabButton>

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {VIEWS.map((v) => (
            <button key={v.key} onClick={() => setView(v.key)} className={filterChipClass(view === v.key)}>
              {v.label}
            </button>
          ))}
        </div>
        {view === 'mes' && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMonthOffset((o) => o - 1)}
              aria-label="Mês anterior"
              className="p-1 text-ink/50 hover:text-ink rounded-full"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs text-ink/70">
              {month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </span>
            <button
              onClick={() => setMonthOffset((o) => o + 1)}
              disabled={monthOffset === 0}
              aria-label="Próximo mês"
              className="p-1 text-ink/50 hover:text-ink rounded-full disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {alert && (
        <div className="rounded-card border px-4 py-3 text-sm flex items-start justify-between gap-3 bg-coral/10 border-coral text-coral">
          <span>{alert.message}</span>
          <button
            onClick={() => setAlert(null)}
            className="rounded-full p-1 text-current hover:bg-black/5 transition-colors"
            aria-label="Fechar alerta"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-ink/50">Carregando...</p>
      ) : habits.length === 0 ? (
        <EmptyState text="Nenhum hábito ainda. Toque no + abaixo para criar." />
      ) : (
        // no mês o card encolhe e centraliza; no ano ele passa da largura da página pra dar espaço à grade
        <ul
          className={`space-y-2 ${
            view === 'mes'
              ? 'max-w-[18rem] mx-auto'
              : 'sm:relative sm:left-1/2 sm:-translate-x-1/2 sm:w-[min(calc(100vw-2rem),56rem)]'
          }`}
        >
          {habits.map((habit) => {
            const todayCount = countsByDay(habit).get(todayISO) || 0
            const repeats = habit.frequency === 'varias_vezes'
            const reachedToday = todayCount >= (repeats ? habit.target : 1)
            return (
              <li key={habit.id} className="bg-card border border-line rounded-card px-4 py-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{habit.name}</p>
                    <p className="text-xs text-ink/40 truncate">{progressText(habit)}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-1">
                    <button
                      onClick={() => openEditForm(habit)}
                      aria-label={`Editar ${habit.name}`}
                      className="p-1.5 text-ink/30 hover:text-ink/60 rounded-full"
                    >
                      <Pencil size={14} />
                    </button>
                    {repeats && (
                      <button
                        onClick={() => setDayCount(habit, todayISO, todayCount - 1)}
                        disabled={todayCount === 0}
                        aria-label={`Tirar uma vez de ${habit.name} hoje`}
                        className="flex items-center justify-center w-8 h-8 rounded-full border border-line text-ink/50 disabled:opacity-30"
                      >
                        <Minus size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => (repeats ? setDayCount(habit, todayISO, todayCount + 1) : tapDay(habit, todayISO))}
                      aria-label={repeats ? `Somar uma vez em ${habit.name} hoje` : `Marcar ${habit.name} hoje`}
                      aria-pressed={reachedToday}
                      title="Hoje"
                      style={reachedToday ? { backgroundColor: habit.color, borderColor: habit.color } : undefined}
                      className={`flex items-center justify-center w-8 h-8 rounded-full border ${reachedToday ? 'text-white' : 'border-line text-ink/50'}`}
                    >
                      {repeats ? <Plus size={16} /> : <Check size={16} />}
                    </button>
                  </div>
                </div>
                {view === 'mes' ? (
                  <HabitMonth habit={habit} month={month} todayISO={todayISO} onTapDay={tapDay} />
                ) : (
                  <HabitGrid habit={habit} weeks={weeks} todayISO={todayISO} onTapDay={tapDay} />
                )}
              </li>
            )
          })}
        </ul>
      )}

      {showForm && (
        <Modal
          title={editingId ? 'Editar hábito' : 'Novo hábito'}
          onClose={closeForm}
          footer={
            <div className="flex gap-2">
              <button onClick={closeForm} className="flex-1 py-2 rounded-full border border-line text-sm">
                Cancelar
              </button>
              <button onClick={saveHabit} className="flex-1 py-2 rounded-full bg-ink text-base text-sm font-medium">
                {editingId ? 'Salvar' : 'Criar hábito'}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <input
                placeholder="Nome do hábito"
                value={form.name}
                onChange={(e) => {
                  setForm({ ...form, name: e.target.value })
                  if (formError) setFormError('')
                }}
                onKeyDown={(e) => e.key === 'Enter' && saveHabit()}
                autoFocus
                className={`w-full rounded-full border px-4 py-2 text-sm ${formError ? 'border-coral' : 'border-line'}`}
              />
              {formError && <p className="text-xs text-coral mt-1 px-1">{formError}</p>}
            </div>
            <div>
              <span className="block text-xs text-ink/60 mb-1 px-1">Tipo</span>
              <div className="flex flex-wrap gap-1">
                {TYPES.map((type) => (
                  <button key={type.key} onClick={() => chooseType(type)} className={filterChipClass(form.frequency === type.key)}>
                    {type.label}
                  </button>
                ))}
              </div>
            </div>
            {formType.targetLabel && (
              <label className="block">
                <span className="block text-xs text-ink/60 mb-1 px-1">{formType.targetLabel}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={formType.maxTarget || 99}
                  value={form.target}
                  onChange={(e) => {
                    setForm({ ...form, target: e.target.value })
                    if (formError) setFormError('')
                  }}
                  className="w-24 rounded-full border border-line px-4 py-2 text-sm"
                />
              </label>
            )}
            <div className="flex gap-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setForm({ ...form, color })}
                  aria-label={`Cor ${color}`}
                  aria-pressed={form.color === color}
                  style={{ backgroundColor: color }}
                  className={`w-7 h-7 rounded-md ${form.color === color ? 'ring-2 ring-ink ring-offset-2 ring-offset-card' : ''}`}
                />
              ))}
            </div>
            {editingId && (
              <button
                onClick={() => (confirmingDelete ? removeHabit() : setConfirmingDelete(true))}
                className="text-xs text-coral hover:underline"
              >
                {confirmingDelete ? 'Toque de novo para apagar o hábito e todo o histórico' : 'Excluir hábito'}
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
