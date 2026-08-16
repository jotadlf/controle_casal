const CACHE_NAME = 'controle-casal-v4'
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
