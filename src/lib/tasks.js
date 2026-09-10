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

// Carrega as tarefas (repair_requests) e escalona pra prioridade alta as
// que estão pendentes há mais de 4 dias sem ser tocadas. Compartilhado
// entre a aba Tarefas e o Kanban do calendário, que exibem os mesmos dados.
export async function loadTasks() {
  const { data, error } = await supabase.from('repair_requests').select('*').order('id', { ascending: false })
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

export function sortByPriorityThenId(a, b) {
  const pa = priorityRank(a.priority)
  const pb = priorityRank(b.priority)
  if (pa !== pb) return pb - pa
  return (b.id || 0) - (a.id || 0)
}
