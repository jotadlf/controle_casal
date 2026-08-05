// Previsão simples baseada no intervalo médio entre compras do mesmo item.
// Não é machine learning — é estatística direta, mas funciona bem pra consumo doméstico.

export function daysBetween(a, b) {
  const ms = new Date(b) - new Date(a)
  return ms / (1000 * 60 * 60 * 24)
}

export function analyzeItem(purchases) {
  // purchases: array de { purchased_at } ordenado ou não, só desse item
  if (!purchases || purchases.length === 0) {
    return { avgIntervalDays: null, lastPurchase: null, nextPredicted: null, daysLeft: null, timesBought: 0 }
  }

  const sorted = [...purchases].sort(
    (a, b) => new Date(a.purchased_at) - new Date(b.purchased_at)
  )

  const lastPurchase = sorted[sorted.length - 1].purchased_at

  if (sorted.length < 2) {
    return {
      avgIntervalDays: null,
      lastPurchase,
      nextPredicted: null,
      daysLeft: null,
      timesBought: sorted.length,
    }
  }

  const intervals = []
  for (let i = 1; i < sorted.length; i++) {
    intervals.push(daysBetween(sorted[i - 1].purchased_at, sorted[i].purchased_at))
  }

  const avgIntervalDays = intervals.reduce((s, v) => s + v, 0) / intervals.length

  const nextPredicted = new Date(lastPurchase)
  nextPredicted.setDate(nextPredicted.getDate() + Math.round(avgIntervalDays))

  const daysLeft = Math.round(daysBetween(new Date().toISOString(), nextPredicted.toISOString()))

  return {
    avgIntervalDays: Math.round(avgIntervalDays),
    lastPurchase,
    nextPredicted: nextPredicted.toISOString().slice(0, 10),
    daysLeft,
    timesBought: sorted.length,
  }
}

export function urgencyLabel(daysLeft) {
  if (daysLeft === null) return { label: 'Sem histórico suficiente', color: 'gray' }
  if (daysLeft <= 0) return { label: 'Deve ter acabado', color: 'coral' }
  if (daysLeft <= 3) return { label: `Acaba em ${daysLeft}d`, color: 'coral' }
  if (daysLeft <= 7) return { label: `Acaba em ${daysLeft}d`, color: 'amber' }
  return { label: `~${daysLeft}d restantes`, color: 'teal' }
}
