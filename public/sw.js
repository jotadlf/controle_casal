const CACHE_NAME = 'controle-casal-v14'
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key)
        return null
      })
    ))
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request

  // nunca interceptar chamadas de API (Supabase etc.): sempre buscar da rede,
  // senão dados novos (tarefas, contas...) ficam presos no cache do PWA
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
    return
  }

  // navegação: tenta rede, cai pro cache se offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    )
    return
  }

  // assets estáticos same-origin: cache first
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      return caches.open(CACHE_NAME).then((cache) => {
        try { cache.put(req, res.clone()) } catch (e) { /* ignore opaque */ }
        return res
      })
    }))
  )
})

// --- notificações (lembretes de compromissos enviados pela Edge Function
// "send-reminders"). O payload é JSON: { title, body, tag, date }.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { title: 'Lembrete', body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Lembrete', {
      body: data.body || '',
      tag: data.tag,
      icon: './icons/icon-192.png',
      vibrate: [120, 60, 120],
      data: { date: data.date },
    })
  )
})

// tocar na notificação traz o app pra frente (ou abre, se estiver fechado)
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.startsWith(self.registration.scope))
      if (existing) return existing.focus()
      return self.clients.openWindow(self.registration.scope)
    })
  )
})
