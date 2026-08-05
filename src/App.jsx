import { useState } from 'react'
import { ShoppingCart, Receipt, Car, ListChecks, Calendar as CalendarIcon, Users, Heart, Cat } from 'lucide-react'
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
            <span className="ml-3 inline-flex items-center gap-1" aria-hidden>
              <Users size={16} />
              <Heart size={16} className="text-coral" />
              <Cat size={16} />
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
