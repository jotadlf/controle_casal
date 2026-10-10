// Edge Function "send-reminders": chamada a cada minuto pelo pg_cron (ver
// supabase/notifications.sql). Pega os lembretes vencidos e manda um Web
// Push pra cada aparelho inscrito do dono do compromisso.
//
// Segredos necessários (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ex.: mailto:voce@exemplo.com)
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm prontos no ambiente.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import webpush from 'npm:web-push@3.6.7'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

type CalendarEvent = {
  id: number
  title: string
  description: string | null
  event_date: string
  event_time: string
  event_end_time: string | null
  reminder_minutes: number
  created_by: string | null
}

type Subscription = { id: number; endpoint: string; p256dh: string; auth: string }

function leadLabel(minutes: number) {
  if (minutes <= 0) return 'agora'
  if (minutes % 1440 === 0) return minutes === 1440 ? 'amanhã' : `em ${minutes / 1440} dias`
  if (minutes % 60 === 0) return minutes === 60 ? 'em 1 hora' : `em ${minutes / 60} horas`
  return `em ${minutes} min`
}

function notificationFor(ev: CalendarEvent) {
  const start = ev.event_time.slice(0, 5)
  const end = ev.event_end_time ? `–${ev.event_end_time.slice(0, 5)}` : ''
  return {
    title: ev.title,
    body: `${start}${end} · ${leadLabel(ev.reminder_minutes)}${ev.description ? `\n${ev.description}` : ''}`,
    tag: `event-${ev.id}`,
    date: ev.event_date,
  }
}

Deno.serve(async () => {
  const { data: due, error } = await supabase.rpc('claim_due_reminders')
  if (error) {
    console.error('Falha ao buscar lembretes:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }

  const events = (due ?? []) as CalendarEvent[]
  let sent = 0
  let removed = 0

  for (const ev of events) {
    if (!ev.created_by) continue
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_name', ev.created_by)

    const payload = JSON.stringify(notificationFor(ev))
    await Promise.all(((subs ?? []) as Subscription[]).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 60 * 60 },
        )
        sent++
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        // inscrição expirada/cancelada no aparelho: remove do banco
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
          removed++
        } else {
          console.error(`Falha ao enviar push (evento ${ev.id}):`, err)
        }
      }
    }))
  }

  return Response.json({ reminders: events.length, sent, removed })
})
