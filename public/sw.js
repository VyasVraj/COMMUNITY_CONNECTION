/**
 * Community Roots — Progressive Web App Service Worker
 *
 * Invariants & Policies:
 * 1. Conservative Caching Strategy: Caches application shell and immutable static assets only.
 * 2. Privacy & Security: NEVER caches Supabase API responses, auth headers, access tokens, or personal family census records.
 * 3. Navigation: Network-first for HTML navigations with offline fallback to /offline.html.
 * 4. Fast Update: Uses skipWaiting on message trigger and automatic cache version pruning on activation.
 */

const CACHE_VERSION = 'v2'
const SHELL_CACHE = `community-roots-shell-${CACHE_VERSION}`
const RUNTIME_CACHE = `community-roots-runtime-${CACHE_VERSION}`

// Critical App Shell resources to precache
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
  '/pwa-maskable-512.png',
  '/pwa-icon-192.svg',
  '/pwa-icon-512.svg',
  '/pwa-maskable-512.svg',
]

// Install Event: Precache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => {
        // Trigger activation immediately on installation
        return self.skipWaiting()
      })
  )
})

// Activate Event: Clean up outdated cache versions
self.addEventListener('activate', (event) => {
  const currentCaches = [SHELL_CACHE, RUNTIME_CACHE]
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (!currentCaches.includes(cacheName)) {
              return caches.delete(cacheName)
            }
          })
        )
      })
      .then(() => self.clients.claim())
  )
})

// Message Event: Allow client to trigger skipWaiting on update acceptance
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// Fetch Event: Conservative, privacy-preserving routing
self.addEventListener('fetch', (event) => {
  const request = event.request

  // Only handle HTTP/HTTPS GET requests
  if (request.method !== 'GET') {
    return
  }

  const url = new URL(request.url)

  // STRICT PRIVACY EXCLUSION:
  // Never intercept, cache, or modify Supabase API calls, Auth endpoints,
  // RPC mutations, realtime web sockets, or third-party sensitive requests.
  if (
    url.hostname.includes('supabase.co') ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/auth/v1') ||
    url.pathname.startsWith('/rest/v1')
  ) {
    return
  }

  // 1. Navigation Requests (HTML Pages / React Router paths)
  // Strategy: Network-first with fallback to cached index.html or offline.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          // If valid response from server, return it
          if (networkResponse && networkResponse.status === 200) {
            return networkResponse
          }
          return caches.match('/index.html')
        })
        .catch(() => {
          // Offline navigation fallback
          return caches.match('/offline.html').then((offlineRes) => {
            return offlineRes || caches.match('/index.html')
          })
        })
    )
    return
  }

  // 2. Versioned Content-Hashed Production Assets (/assets/*.js, *.css)
  // Strategy: Cache-first with background revalidation (safe because names have content hashes)
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse
        }
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone()
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, responseToCache)
            })
          }
          return networkResponse
        })
      })
    )
    return
  }

  // 3. Static Icons, Manifest, and Fonts
  // Strategy: Stale-while-revalidate for local static files
  if (
    url.origin === self.location.origin &&
    (url.pathname.endsWith('.svg') ||
      url.pathname.endsWith('.png') ||
      url.pathname.endsWith('.webmanifest') ||
      url.pathname.endsWith('.woff2'))
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone()
              caches.open(RUNTIME_CACHE).then((cache) => {
                cache.put(request, responseToCache)
              })
            }
            return networkResponse
          })
          .catch(() => cachedResponse)

        return cachedResponse || fetchPromise
      })
    )
    return
  }
})
