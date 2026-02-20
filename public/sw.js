// Service Worker para Web Push Notifications — MAXEVA GESTION

const CACHE_NAME = 'maxeva-push-v1'

// Install: activar inmediatamente
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

// Activate: tomar control de todas las pestañas
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

// Push: mostrar notificación nativa
self.addEventListener('push', (event) => {
  if (!event.data) return

  let data
  try {
    data = event.data.json()
  } catch (e) {
    data = {
      title: 'MAXEVA GESTION',
      body: event.data.text(),
    }
  }

  const title = data.title || 'MAXEVA GESTION'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'maxeva-notification',
    renotify: true,
    data: {
      url: data.url || '/dashboard',
    },
    actions: [
      {
        action: 'open',
        title: 'Ver',
      },
      {
        action: 'dismiss',
        title: 'Cerrar',
      },
    ],
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  )
})

// Click en notificación: abrir la URL correspondiente
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'dismiss') return

  const url = event.notification.data?.url || '/dashboard'
  const fullUrl = new URL(url, self.location.origin).href

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Si ya hay una pestaña abierta del sitio, navegar ahí
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.navigate(fullUrl)
          return client.focus()
        }
      }
      // Si no hay pestaña, abrir una nueva
      return clients.openWindow(fullUrl)
    })
  )
})
