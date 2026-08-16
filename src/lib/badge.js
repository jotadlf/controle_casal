import { supabase } from './supabaseClient'

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// atualiza o número no ícone do PWA com a quantidade de compromissos de hoje do usuário
export async function refreshAppBadge(user) {
  if (!user || !('setAppBadge' in navigator)) return

  const { count, error } = await supabase
    .from('calendar_events')
    .select('*', { count: 'exact', head: true })
    .eq('created_by', user)
    .eq('event_date', todayKey())

  if (error) {
    console.error('Falha ao atualizar badge do app:', error)
    return
  }

  if (count > 0) {
    navigator.setAppBadge(count).catch(() => {})
  } else {
    navigator.clearAppBadge().catch(() => {})
  }
}
