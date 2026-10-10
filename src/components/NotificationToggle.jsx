import { useEffect, useState } from 'react'
import { Bell, BellOff, BellRing } from 'lucide-react'
import { enablePush, disablePush, getPushState, syncPushSubscription } from '../lib/push'

// botão do cabeçalho que liga/desliga os lembretes neste aparelho
export default function NotificationToggle({ user }) {
  const [state, setState] = useState('unsupported') // 'unsupported' | 'denied' | 'on' | 'off'
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getPushState().then(setState).catch(() => setState('unsupported'))
    syncPushSubscription(user)
  }, [user])

  if (state === 'unsupported') return null

  async function toggle() {
    if (state === 'denied') {
      window.alert('As notificações estão bloqueadas pra este app. Libere em Configurações do Android → Apps → Chrome (ou o app instalado) → Notificações.')
      return
    }
    setBusy(true)
    try {
      if (state === 'on') {
        await disablePush()
      } else {
        await enablePush(user)
      }
    } catch (err) {
      console.error('Falha ao configurar notificações:', err)
      window.alert(`Não foi possível ${state === 'on' ? 'desativar' : 'ativar'} as notificações: ${err.message || err}`)
    }
    setState(await getPushState())
    setBusy(false)
  }

  const label = state === 'on'
    ? 'Lembretes ativados neste aparelho (toque pra desativar)'
    : state === 'denied'
    ? 'Notificações bloqueadas'
    : 'Ativar lembretes neste aparelho'
  const Icon = state === 'on' ? BellRing : state === 'denied' ? BellOff : Bell

  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-label={label}
      title={label}
      className={`p-2 rounded-full border transition-colors disabled:opacity-50 ${
        state === 'on' ? 'border-teal text-teal-dark bg-teal-light' : 'border-line text-ink/60 hover:bg-ink/5'
      }`}
    >
      <Icon size={16} />
    </button>
  )
}
