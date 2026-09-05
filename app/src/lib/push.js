/* 클라이언트 웹 푸시 구독 */
import { api } from './api'
const b64ToU8 = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...b].map((c) => c.charCodeAt(0))) }
export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export async function currentSubscription() {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration(); return reg ? reg.pushManager.getSubscription() : null
}
export async function enablePush() {
  if (!pushSupported()) throw new Error('이 브라우저는 알림을 지원하지 않습니다. 홈 화면에 추가한 앱에서 열어 주세요.')
  const { enabled, publicKey } = await api('/push/vapid')
  if (!enabled) throw new Error('서버에 알림 키가 설정되지 않았습니다.')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('알림 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요.')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(publicKey) }))
  await api('/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON(), test: true } })
  return sub
}
export async function disablePush() {
  const sub = await currentSubscription(); if (!sub) return
  try { await api('/push/subscribe', { method: 'DELETE', body: { subscription: sub.toJSON() } }) } catch { /* ignore */ }
  await sub.unsubscribe()
}
