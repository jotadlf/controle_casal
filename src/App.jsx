import { useState } from 'react'
import { ShoppingCart, Receipt, Car, ListChecks, Calendar as CalendarIcon } from 'lucide-react'
import UserSwitch, { useCurrentUser } from './components/UserSwitch'
import ShoppingList from './components/ShoppingList'
import Bills from './components/Bills'
import CarMaintenance from './components/CarMaintenance'
import RepairRequests from './components/RepairRequests'
import Calendar from './components/Calendar'

const TABS = [
  { key: 'compras', label: 'Compras', icon: ShoppingCart, Component: ShoppingList },
  { key: 'calendario', label: 'Calendário', icon: CalendarIcon, Component: Calendar },
  { key: 'contas', label: 'Contas', icon: Receipt, Component: Bills },
  { key: 'carro', label: 'Carro', icon: Car, Component: CarMaintenance },
  { key: 'tarefas', label: 'Tarefas', icon: ListChecks, Component: RepairRequests },
]

export default function App() {
  const [tab, setTab] = useState('compras')
  const [user, setUser] = useCurrentUser()

  if (!user) {
    return <NamePicker onPick={setUser} />
  }

  const Active = TABS.find((t) => t.key === tab).Component

  return (
    <div className="min-h-screen bg-base pb-24 sm:pb-0">
      <header className="border-b border-line bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="font-display font-bold text-lg text-ink tracking-tight">
            Casa
            <span className="ml-3 inline-flex items-center gap-2" aria-hidden>
              {/* casal (duas silhuetas minimalistas) */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-ink">
                <path d="M8 11a2 2 0 100-4 2 2 0 000 4z" fill="currentColor" />
                <path d="M8 13c-2.21 0-4 1.79-4 4v1h8v-1c0-2.21-1.79-4-4-4z" fill="currentColor" />
                <path d="M16 11a2 2 0 100-4 2 2 0 000 4z" fill="currentColor" />
                <path d="M16 13c-1.66 0-3 1.34-3 3v1h6v-1c0-1.66-1.34-3-3-3z" fill="currentColor" />
              </svg>
              {/* gatinho */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-ink">
                <path d="M12 2c.6 0 1 .4 1 1v1l.7.3c.5.2 1 .5 1.5.9.4.4.7.9.9 1.5.2.5.3 1 .3 1.6 0 3.3-2.7 6-6 6s-6-2.7-6-6c0-.6.1-1.1.3-1.6.2-.6.5-1.1.9-1.5.5-.4 1-.7 1.5-.9L11 4V3c0-.6.4-1 1-1z" fill="currentColor"/>
                <path d="M9 14c0 1.7 1.3 3 3 3s3-1.3 3-3v-1H9v1z" fill="currentColor"/>
                <path d="M10 9.5c.3.3.8.3 1.1 0 .3-.3.3-.8 0-1.1-.3-.3-.8-.3-1.1 0-.3.3-.3.8 0 1.1zM14 9.5c.3.3.8.3 1.1 0 .3-.3.3-.8 0-1.1-.3-.3-.8-.3-1.1 0-.3.3-.3.8 0 1.1z" fill="currentColor"/>
              </svg>
            </span>
            <span className="text-teal">.</span>
          </h1>
          <UserSwitch user={user} setUser={setUser} />
        </div>
        <nav className="max-w-3xl mx-auto px-4 hidden sm:flex gap-1 -mb-px">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key ? 'border-teal text-teal-dark' : 'border-transparent text-ink/50 hover:text-ink'
              }`}
            >
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <Active user={user} />
      </main>

      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-line flex sm:hidden z-10">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
              tab === t.key ? 'text-teal-dark' : 'text-ink/40'
            }`}
          >
            <t.icon size={20} />
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

function NamePicker({ onPick }) {
  return (
    <div className="min-h-screen bg-base flex items-center justify-center px-4">
      <div className="bg-white border border-line rounded-card p-8 max-w-sm w-full text-center space-y-4">
        <h1 className="font-display font-bold text-2xl text-ink">
          Casa<span className="text-teal">.</span>
        </h1>
        <p className="text-sm text-ink/60">Quem é você?</p>
        <div className="flex flex-col gap-2">
          {['Jairon', 'Bruna'].map((name) => (
            <button
              key={name}
              onClick={() => onPick(name)}
              className="w-full py-3 rounded-full border border-line hover:border-teal hover:bg-teal-light font-medium text-ink transition-colors"
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
