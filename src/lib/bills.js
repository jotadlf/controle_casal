// Calcula a próxima data de vencimento a partir do dia do mês configurado.
export function nextDueDate(dueDay) {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()

  let due = new Date(year, month, dueDay)
  if (due < today) {
    due = new Date(year, month + 1, dueDay)
  }
  return due
}

export function daysUntil(date) {
  const ms = new Date(date).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

export function currentReferenceMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function urgencyColor(daysLeft, paid) {
  if (paid) return 'gray'
  if (daysLeft < 0) return 'coral'
  if (daysLeft <= 3) return 'coral'
  if (daysLeft <= 7) return 'amber'
  return 'teal'
}
