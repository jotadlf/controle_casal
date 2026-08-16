const CACHE_NAME = 'controle-casal-v3'
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
  // navigation requests: try network, fallback to cache
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    )
    return
  }
  // for other requests, try cache first
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      // optionally cache runtime assets
      return caches.open(CACHE_NAME).then((cache) => {
        try { cache.put(req, res.clone()) } catch (e) { /* ignore opaque */ }
        return res
      })
    })).catch(() => {
      // final fallback: icons or index
      return caches.match('./icons/icon-192.png')
    })
  )
})
