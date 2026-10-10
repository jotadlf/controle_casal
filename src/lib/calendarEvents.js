import { toDateKey } from './date'
import { DEFAULT_EVENT_COLOR } from './eventColors'

// campos editáveis de um compromisso, usados pra duplicar ou recriar um
// compromisso excluído (o id é gerado pelo banco, então fica de fora).
export function pickEventFields(ev) {
  return {
    title: ev.title,
    description: ev.description || null,
    event_date: ev.event_date,
    event_time: ev.event_time || null,
    event_end_time: ev.event_end_time || null,
    color: ev.color || DEFAULT_EVENT_COLOR,
  }
}

// formato da "área de transferência" de compromissos (copiar/colar)
export function clipboardFromEvent(ev) {
  return {
    title: ev.title,
    description: ev.description || '',
    time: ev.event_time ? ev.event_time.slice(0, 5) : '',
    endTime: ev.event_end_time ? ev.event_end_time.slice(0, 5) : '',
    color: ev.color || DEFAULT_EVENT_COLOR,
  }
}

export function dateKeyOf(date) {
  return toDateKey(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + n)
  return d
}
