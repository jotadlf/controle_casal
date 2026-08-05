import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { nextDueDate, daysUntil } from '../lib/bills'

// Visualização mensal simples; cores já definidas no design system.
export default function Calendar() {
  const [bills, setBills] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadAll() {
      setLoading(true)
      // buscar contas ativas e tarefas que têm due_date
      const [
        { data: billsData },
        { data: tasksWithDue },
      ] = await Promise.all([
        supabase.from('bills').select('*').eq('active', true),
        supabase.from('repair_requests').select('*').not('due_date', null),
      ])
      // depuração: mostrar tarefas retornadas
      // eslint-disable-next-line no-console
      console.log('Calendar: tasksWithDue', tasksWithDue)
      setBills(billsData || [])
      setTasks(tasksWithDue || [])
      setLoading(false)
    }
    loadAll()
  }, [])

  // construir mapa de itens por dia do mês atual
  const monthData = useMemo(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()

    const map = {}
    for (let d = 1; d <= daysInMonth; d++) map[d] = { bills: [], tasks: [] }

    // avaliar contas: gerar nextDueDate a partir de due_day; se cair neste mês, adicionar
    bills.forEach((b) => {
      const due = nextDueDate(b.due_day)
      if (due.getFullYear() === year && due.getMonth() === month) {
        const day = due.getDate()
        map[day] = map[day] || { bills: [], tasks: [] }
        map[day].bills.push({ id: b.id, name: b.name, due })
      }
    })

    // tarefas com due_date (assume ISO yyyy-mm-dd)
    tasks.forEach((t) => {
      if (!t.due_date) return
      const d = new Date(t.due_date)
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate()
        map[day] = map[day] || { bills: [], tasks: [] }
        map[day].tasks.push({ id: t.id, title: t.title, due: d })
      }
    })

    return { map, daysInMonth, firstDayWeekday: firstDay.getDay() }
  }, [bills, tasks])

  function colorForItem(d) {
    const left = daysUntil(d)
    if (left < 0) return 'coral'
    if (left <= 7) return 'amber'
    return 'teal'
  }

  const [selectedDay, setSelectedDay] = useState(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-semibold text-xl text-ink">Calendário</h2>
          <p className="text-sm text-ink/60">Vencimentos e prazos deste mês.</p>
        </div>
      </div>

      <div className="bg-white border border-line rounded-card p-4">
        <div className="grid grid-cols-7 gap-2 text-center text-xs text-ink/60 mb-2">
          {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {/* leading empty cells */}
          {Array.from({ length: monthData.firstDayWeekday }).map((_, i) => (
            <div key={'e'+i} className="p-2"></div>
          ))}
          {Array.from({ length: monthData.daysInMonth }).map((_, idx) => {
            const day = idx + 1
            const cell = monthData.map[day] || { bills: [], tasks: [] }
            const hasBills = cell.bills.length > 0
            const hasTasks = cell.tasks.length > 0
            return (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className="p-2 border border-line rounded-card text-left min-h-[60px] bg-white"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink">{day}</span>
                </div>
                <div className="mt-2 flex gap-1 flex-wrap">
                  {cell.bills.slice(0,2).map((b) => (
                    <span key={b.id} className={`text-[10px] px-2 py-0.5 rounded-full ${colorForItem(b.due) === 'coral' ? 'bg-coral-light text-coral' : colorForItem(b.due) === 'amber' ? 'bg-amber-light text-amber' : 'bg-teal-light text-teal-dark'}`}>
                      {b.name}
                    </span>
                  ))}
                  {cell.tasks.slice(0,2).map((t) => (
                    <span key={t.id} className={`text-[10px] px-2 py-0.5 rounded-full ${colorForItem(t.due) === 'coral' ? 'bg-coral-light text-coral' : colorForItem(t.due) === 'amber' ? 'bg-amber-light text-amber' : 'bg-teal-light text-teal-dark'}`}>
                      {t.title}
                    </span>
                  ))}
                </div>
              </button>
            )
          })}
        </div>

        <div className="mt-4">
          {selectedDay ? (
            <div>
              <h3 className="font-medium text-ink">Itens para {selectedDay}</h3>
              <ul className="mt-2 space-y-2">
                {(monthData.map[selectedDay]?.bills || []).map((b) => (
                  <li key={`b-${b.id}`} className="flex items-center justify-between bg-base rounded-card p-2">
                    <div>
                      <div className="font-medium text-ink">{b.name}</div>
                      <div className="text-xs text-ink/50">Conta • vence em {b.due.toISOString().slice(0,10)}</div>
                    </div>
                  </li>
                ))}
                {(monthData.map[selectedDay]?.tasks || []).map((t) => (
                  <li key={`t-${t.id}`} className="flex items-center justify-between bg-base rounded-card p-2">
                    <div>
                      <div className="font-medium text-ink">{t.title}</div>
                      <div className="text-xs text-ink/50">Tarefa • prazo {t.due.toISOString().slice(0,10)}</div>
                    </div>
                  </li>
                ))}
                {((monthData.map[selectedDay]?.bills || []).length === 0 && (monthData.map[selectedDay]?.tasks || []).length === 0) && (
                  <p className="text-sm text-ink/60">Nada para este dia.</p>
                )}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-ink/60">Clique num dia para ver vencimentos e prazos.</p>
          )}
        </div>
      </div>
    </div>
  )
}
