/* 매주 월요일 08:00 KST : 주간 리포트 푸시 */
import { json, todayKST } from '../_lib/http.js'
import { db, K, getJSON } from '../_lib/db.js'
import { sendToUser, pushEnabled } from '../_lib/push.js'
import { weeklyBrief } from '../_lib/brief.js'
export default async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return json(res, 401, { error: 'cron' })
  if (!pushEnabled) return json(res, 200, { sent: 0, reason: 'push-disabled' })
  const today = todayKST()
  const ids = await db.smembers(K.users)
  let sent = 0
  for (const id of ids) {
    const subs = await getJSON(K.push(id)); if (!subs?.length) continue
    const doc = await getJSON(K.state(id)); if (!doc?.state) continue
    const b = weeklyBrief(doc.state, today)
    sent += (await sendToUser(id, { title: b.title, body: b.body, url: '/coach' })).sent
  }
  json(res, 200, { users: ids.length, sent })
}
