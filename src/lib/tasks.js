import { supabase } from './supabaseClient'

function parseDue(raw) {
  if (!raw) return null
  const s = String(raw)
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]))
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d
  const maybe = s.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (maybe) return new Date(Number(maybe[1]), Number(maybe[2]) - 1, Number(maybe[3]))
  return null
}

// data local em YYYY-MM-DD (toISOString usaria UTC e viraria o dia à noite no Brasil)
export function toISODate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function formatDue(raw) {
  const due = parseDue(raw)
  return due ? due.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function isOverdue(task, now = new Date()) {
  const due = parseDue(task.due_date)
  return Boolean(due) && due < startOfDay(now)
}

// A semana vai de segunda a domingo. Tarefa atrasada ou sem data fica em "Essa semana".
export function isThisWeek(task, now = new Date()) {
  const due = parseDue(task.due_date)
  if (!due) return true
  const endOfWeek = startOfDay(now)
  endOfWeek.setDate(endOfWeek.getDate() + ((7 - endOfWeek.getDay()) % 7))
  return due <= endOfWeek
}

export const TASK_SELECT = '*, subtasks:repair_subtasks(*)'

export function sortedSubtasks(task) {
  return [...(task.subtasks || [])].sort((a, b) => a.position - b.position)
}

// Grava só o que mudou em relação às microtarefas atuais da tarefa, pra não
// desfazer um "feito" marcado por outra pessoa enquanto o formulário estava aberto.
export async function saveSubtasks(requestId, current, next) {
  const rows = next.map((s, position) => ({ ...s, position }))
  const keptIds = rows.filter((s) => s.id).map((s) => s.id)
  const removedIds = current.filter((s) => !keptIds.includes(s.id)).map((s) => s.id)
  const added = rows
    .filter((s) => !s.id)
    .map((s) => ({ request_id: requestId, title: s.title, position: s.position }))
  const changed = rows.filter((s) => {
    const before = current.find((c) => c.id === s.id)
    return before && (before.title !== s.title || before.position !== s.position)
  })

  const results = await Promise.all([
    ...(removedIds.length ? [supabase.from('repair_subtasks').delete().in('id', removedIds)] : []),
    ...(added.length ? [supabase.from('repair_subtasks').insert(added)] : []),
    ...changed.map((s) =>
      supabase.from('repair_subtasks').update({ title: s.title, position: s.position }).eq('id', s.id),
    ),
  ])
  return { error: results.find((r) => r.error)?.error || null }
}

// Carrega as tarefas (repair_requests) e escalona pra prioridade alta as
// que estão com a data vencida há mais de 4 dias.
export async function loadTasks() {
  const { data, error } = await supabase.from('repair_requests').select(TASK_SELECT).order('created_at', { ascending: false })
  if (error) return { tasks: [], error }

  const now = new Date()
  const MS_PER_DAY = 1000 * 60 * 60 * 24
  const toUpdate = []

  const normalized = (data || []).map((t) => {
    const due = parseDue(t.due_date)
    if (due) {
      const daysPast = Math.floor((now.getTime() - due.getTime()) / MS_PER_DAY)
      if (daysPast > 4 && t.priority !== 'alta') {
        toUpdate.push(t.id)
        return { ...t, priority: 'alta' }
      }
    }
    return t
  })

  if (toUpdate.length > 0) {
    Promise.all(
      toUpdate.map((id) => supabase.from('repair_requests').update({ priority: 'alta' }).eq('id', id)),
    ).catch((e) => console.error('Falha ao escalonar prioridades:', e))
  }

  return { tasks: normalized, error: null }
}

const priorityRank = (p) => (p === 'alta' ? 1 : 0)

export function sortByPriorityThenDate(a, b) {
  const pa = priorityRank(a.priority)
  const pb = priorityRank(b.priority)
  if (pa !== pb) return pb - pa
  return (a.due_date || '').localeCompare(b.due_date || '')
}
