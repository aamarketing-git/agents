/* 사용자 상태 전체 저장/불러오기 (문서 1개, 버전 번호로 충돌 감지) */
import { json, body, methodGuard } from './_lib/http.js'
import { getUser } from './_lib/auth.js'
import { K, getJSON, setJSON } from './_lib/db.js'
const MAX = 5 * 1024 * 1024
export default async function handler(req, res) {
  if (!methodGuard(req, res, ['GET', 'PUT'])) return
  const user = await getUser(req)
  if (!user) return json(res, 401, { error: 'login' })
  if (req.method === 'GET') { const doc = await getJSON(K.state(user.id)); return json(res, 200, doc || { state: null, version: 0 }) }
  const { state, version } = body(req)
  if (!state || typeof state !== 'object') return json(res, 400, { error: 'state' })
  if (JSON.stringify(state).length > MAX) return json(res, 413, { error: '저장 용량을 초과했습니다.' })
  const cur = (await getJSON(K.state(user.id))) || { version: 0 }
  if (typeof version === 'number' && version < cur.version) return json(res, 409, { error: 'conflict', server: cur })
  const doc = { state: { ...state, chat: (state.chat || []).slice(-30) }, version: (cur.version || 0) + 1, updatedAt: new Date().toISOString() }
  await setJSON(K.state(user.id), doc)
  json(res, 200, { version: doc.version, updatedAt: doc.updatedAt })
}
