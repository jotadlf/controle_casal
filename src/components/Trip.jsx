import { useEffect, useState } from 'react'
import { Car } from 'lucide-react'

// data da viagem (mês começa em 0: 11 = dezembro)
export const TRIP_DATE = new Date(2026, 11, 30)

// a aba some sozinha no dia seguinte à viagem
export function isTripTabVisible(now = new Date()) {
  return daysUntil(TRIP_DATE, now) >= 0
}

function daysUntil(target, now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target - today) / 86400000)
}

export default function Trip() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const days = daysUntil(TRIP_DATE, now)
  const msLeft = Math.max(0, TRIP_DATE - now)
  const hours = Math.floor(msLeft / 3600000) % 24
  const minutes = Math.floor(msLeft / 60000) % 60
  const seconds = Math.floor(msLeft / 1000) % 60

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-card border border-line p-8 text-center space-y-4">
        <div className="mx-auto h-14 w-14 rounded-full bg-teal-light text-teal-dark flex items-center justify-center">
          <Car size={26} />
        </div>
        {days > 0 ? (
          <>
            <p className="text-sm text-ink/60">Faltam</p>
            <p className="font-display font-semibold text-7xl text-ink leading-none">{days}</p>
            <p className="font-display text-lg text-ink">{days === 1 ? 'dia para a viagem' : 'dias para a viagem'}</p>
            <p className="text-xs text-ink/40 tabular-nums">
              {Math.floor(msLeft / 86400000)}d {String(hours).padStart(2, '0')}h {String(minutes).padStart(2, '0')}m {String(seconds).padStart(2, '0')}s
            </p>
          </>
        ) : (
          <p className="font-display font-semibold text-3xl text-ink">É hoje! Boa viagem!</p>
        )}
        <p className="text-sm text-ink/50">
          {TRIP_DATE.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>
    </div>
  )
}
