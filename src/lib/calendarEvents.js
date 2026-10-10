import { toDateKey } from './date'
import { DEFAULT_EVENT_COLOR } from './eventColors'

// antecedência do lembrete (minutos antes do início). '' = sem lembrete.
export const DEFAULT_REMINDER = '15'
export const REMINDER_OPTIONS = [
  { value: '', label: 'Sem lembrete' },
  { value: '0', label: 'Na hora' },
  { value: '5', label: '5 min antes' },
  { value: '10', label: '10 min antes' },
  { value: '15', label: '15 min antes' },
  { value: '30', label: '30 min antes' },
  { value: '60', label: '1 hora antes' },
  { value: '120', label: '2 horas antes' },
  { value: '1440', label: '1 dia antes' },
]

export function reminderToForm(minutes) {
  return minutes === null || minutes === undefined ? '' : String(minutes)
}

export function reminderFromForm(value, hasTime = true) {
  return hasTime && value !== '' && value !== undefined ? Number(value) : null
}

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
    reminder_minutes: ev.reminder_minutes ?? null,
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
    reminder: reminderToForm(ev.reminder_minutes),
  }
}

export function dateKeyOf(date) {
  return toDateKey(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + n)
  return d
}
