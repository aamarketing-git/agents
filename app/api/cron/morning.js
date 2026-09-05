/* 매일 07:30 KST : 모든 사용자에게 아침 브리핑 푸시 */
import { json, todayKST } from '../_lib/http.js'
import { db, K, getJSON } from '../_lib/db.js'
import { sendToUser, pushEnabled } from '../_lib/push.js'
import { morningBrief } from '../_lib/brief.js'
export default async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return json(res, 401, { error: 'cron' })
  if (!pushEnabled) return json(res, 200, { sent: 0, reason: 'push-disabled' })
  const today = todayKST()
  const ids = await db.smembers(K.users)
  let sent = 0
  for (const id of ids) {
    const subs = await getJSON(K.push(id)); if (!subs?.length) continue
    const doc = await getJSON(K.state(id)); if (!doc?.state) continue
    const b = morningBrief(doc.state, today)
    sent += (await sendToUser(id, { title: b.title, body: b.body, url: '/today' })).sent
  }
  json(res, 200, { users: ids.length, sent })
}
