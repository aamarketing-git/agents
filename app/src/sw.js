/* 서비스 워커 : 오프라인 캐시(Workbox) + 웹 푸시 수신 */
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { clientsClaim } from 'workbox-core'

self.skipWaiting(); clientsClaim()
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/\/api\//, /\/tips\//] }))

self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { body: e.data?.text() } }
  e.waitUntil(self.registration.showNotification(d.title || '나의 AI 비서', { body: d.body || '', icon: './icon.svg', badge: './icon.svg', data: { url: d.url || './' }, tag: d.tag || 'aisec', renotify: true }))
})
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => { const w = list.find((c) => 'focus' in c); if (w) { w.navigate(url); return w.focus() } return self.clients.openWindow(url) }))
})
