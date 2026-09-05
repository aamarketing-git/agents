/* 웹 푸시 (VAPID) */
import webpush from 'web-push'
import { db, K, getJSON, setJSON } from './db.js'

const PUB = process.env.VAPID_PUBLIC_KEY, PRIV = process.env.VAPID_PRIVATE_KEY
export const pushEnabled = !!(PUB && PRIV)
if (pushEnabled) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', PUB, PRIV)
export const vapidPublicKey = PUB || ''

export async function addSubscription(uid, sub) {
  const list = (await getJSON(K.push(uid))) || []
  if (!list.find((s) => s.endpoint === sub.endpoint)) list.push(sub)
  await setJSON(K.push(uid), list.slice(-5))
}
export async function removeSubscription(uid, endpoint) {
  const list = ((await getJSON(K.push(uid))) || []).filter((s) => s.endpoint !== endpoint)
  await setJSON(K.push(uid), list)
}
export async function sendToUser(uid, payload) {
  if (!pushEnabled) return { sent: 0 }
  const list = (await getJSON(K.push(uid))) || []
  let sent = 0
  const alive = []
  for (const s of list) {
    try { await webpush.sendNotification(s, JSON.stringify(payload)); sent++; alive.push(s) } catch (e) { if (e.statusCode !== 404 && e.statusCode !== 410) alive.push(s) }
  }
  if (alive.length !== list.length) await setJSON(K.push(uid), alive)
  return { sent }
}
export { db }
