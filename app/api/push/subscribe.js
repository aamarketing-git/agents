import { json, body, methodGuard } from '../_lib/http.js'
import { getUser } from '../_lib/auth.js'
import { addSubscription, removeSubscription, sendToUser, pushEnabled } from '../_lib/push.js'
export default async function handler(req, res) {
  if (!methodGuard(req, res, ['POST', 'DELETE'])) return
  const user = await getUser(req)
  if (!user) return json(res, 401, { error: 'login' })
  if (!pushEnabled) return json(res, 503, { error: 'push-disabled' })
  const { subscription, test } = body(req)
  if (req.method === 'DELETE') { await removeSubscription(user.id, subscription?.endpoint); return json(res, 200, { ok: true }) }
  if (!subscription?.endpoint) return json(res, 400, { error: 'subscription' })
  await addSubscription(user.id, subscription)
  if (test) await sendToUser(user.id, { title: '알림이 연결되었습니다', body: '내일 아침 7시 30분에 브리핑을 보내 드릴게요.', url: '/today' })
  json(res, 200, { ok: true })
}
