import { json, body, methodGuard } from '../_lib/http.js'
import { authEnabled, createSession, findUserByEmail, publicUser, verifyPassword } from '../_lib/auth.js'
export default async function handler(req, res) {
  if (!methodGuard(req, res, ['POST'])) return
  if (!authEnabled) return json(res, 503, { error: 'auth-disabled' })
  const { email, password } = body(req)
  const u = email && (await findUserByEmail(email))
  if (!u || !verifyPassword(password || '', u.pass)) return json(res, 401, { error: '이메일 또는 비밀번호가 맞지 않습니다.' })
  await createSession(res, u.id)
  json(res, 200, { user: publicUser(u) })
}
