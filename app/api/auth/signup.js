import { json, body, methodGuard } from '../_lib/http.js'
import { authEnabled, createSession, createUser, findUserByEmail, publicUser, validEmail } from '../_lib/auth.js'
export default async function handler(req, res) {
  if (!methodGuard(req, res, ['POST'])) return
  if (!authEnabled) return json(res, 503, { error: 'auth-disabled' })
  const { email, password } = body(req)
  if (!validEmail(email)) return json(res, 400, { error: '이메일 형식을 확인해 주세요.' })
  if (!password || password.length < 6) return json(res, 400, { error: '비밀번호는 6자 이상이어야 합니다.' })
  if (await findUserByEmail(email)) return json(res, 409, { error: '이미 가입된 이메일입니다. 로그인해 주세요.' })
  const u = await createUser(email, password)
  await createSession(res, u.id)
  json(res, 200, { user: publicUser(u) })
}
