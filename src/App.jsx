import { useState, useEffect } from 'react'
import { ShoppingCart, ListChecks, Clapperboard, Car, Sun, Moon } from 'lucide-react'
import UserSwitch, { useCurrentUser } from './components/UserSwitch'
import ShoppingList from './components/ShoppingList'
import RepairRequests from './components/RepairRequests'
import Movies from './components/Movies'
import Trip, { isTripTabVisible } from './components/Trip'
import { useTheme } from './lib/theme'
import appIcon from './assets/app-icon.png'

const TABS = [
  { key: 'tarefas', label: 'Tarefas', icon: ListChecks, Component: RepairRequests },
  { key: 'compras', label: 'Compras', icon: ShoppingCart, Component: ShoppingList },
  { key: 'filmes', label: 'Filmes', icon: Clapperboard, Component: Movies },
  // aba temporária: some depois de 30/12
  { key: 'viagem', label: 'Viagem', icon: Car, Component: Trip, visible: isTripTabVisible },
]

export default function App() {
  const [tab, setTab] = useState('tarefas')
  const [user, setUser] = useCurrentUser()
  const [theme, setTheme] = useTheme()
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showInstall, setShowInstall] = useState(false)

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowInstall(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // o calendário (que mostrava no ícone os compromissos do dia) saiu do app;
  // limpa o número que tenha ficado no ícone de instalações antigas
  useEffect(() => {
    if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(() => {})
  }, [])

  if (!user) {
    return <NamePicker onPick={setUser} />
  }

  const tabs = TABS.filter((t) => !t.visible || t.visible())
  const Active = (tabs.find((t) => t.key === tab) || tabs[0]).Component

  return (
    <div className="min-h-screen bg-base pb-24 sm:pb-0">
      <header className="border-b border-line bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <img src={appIcon} alt="Casa" className="h-9 w-9" />
          <div className="flex items-center gap-2">
            {showInstall && (
              <button
                onClick={async () => {
                  if (!deferredPrompt) return
                  deferredPrompt.prompt()
                  const choice = await deferredPrompt.userChoice
                  setShowInstall(false)
                  setDeferredPrompt(null)
                }}
                className="px-3 py-1 rounded-full border border-line text-sm bg-ink/5"
              >
                Instalar
              </button>
            )}
            <button
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
              title={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
              className="p-2 rounded-full border border-line text-ink/60 hover:bg-ink/5 transition-colors"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <UserSwitch user={user} setUser={setUser} />
          </div>
        </div>
        <nav className="max-w-3xl mx-auto px-4 hidden sm:flex gap-1 -mb-px justify-center">
          {tabs.map((t) => (
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

      <nav className="fixed bottom-0 inset-x-0 bg-card border-t border-line flex sm:hidden z-10">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            aria-label={t.label}
            title={t.label}
            className={`flex-1 flex items-center justify-center py-3.5 ${
              tab === t.key ? 'text-teal-dark' : 'text-ink/40'
            }`}
          >
            <t.icon size={22} />
          </button>
        ))}
      </nav>
    </div>
  )
}

function NamePicker({ onPick }) {
  return (
    <div className="min-h-screen bg-base flex items-center justify-center px-4">
        <div className="bg-card border border-line rounded-card p-8 max-w-sm w-full text-center space-y-4">
        <img src={appIcon} alt="Casa" className="h-14 w-14 mx-auto" />
        <p className="text-sm text-ink/60">Quem é você?</p>
        <div className="flex flex-col gap-2">
          {['Jairon', 'Bruna'].map((name) => (
            <button
              key={name}
              onClick={() => onPick(name)}
              className="w-full py-2 text-sm rounded-full border border-line hover:border-teal hover:bg-teal-light font-medium text-ink transition-colors"
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
