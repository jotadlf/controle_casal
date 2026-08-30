// Data de vencimento dentro de um mês específico (usado para navegação por mês).
export function dueDateInMonth(dueDay, monthDate) {
  return new Date(monthDate.getFullYear(), monthDate.getMonth(), dueDay)
}

export function daysUntil(date) {
  const ms = new Date(date).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

export function referenceMonthOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

export function currentReferenceMonth() {
  return referenceMonthOf(new Date())
}

export function monthLabel(date) {
  const label = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function monthsBetween(startMonth, refMonth) {
  const [sy, sm] = startMonth.split('-').map(Number)
  const [ry, rm] = refMonth.split('-').map(Number)
  return (ry - sy) * 12 + (rm - sm)
}

// Em qual parcela a conta está no mês de referência (1-indexed).
export function installmentNumber(bill, refMonth) {
  if (!bill.start_month) return null
  return monthsBetween(bill.start_month, refMonth) + 1
}

export function urgencyColor(daysLeft, paid) {
  if (paid) return 'gray'
  if (daysLeft < 0) return 'coral'
  if (daysLeft <= 3) return 'coral'
  if (daysLeft <= 7) return 'amber'
  return 'teal'
}
