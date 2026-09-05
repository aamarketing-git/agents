import { json } from './_lib/http.js'
import { cloudEnabled } from './_lib/db.js'
import { authEnabled } from './_lib/auth.js'
import { pushEnabled } from './_lib/push.js'
export default async function handler(req, res) {
  json(res, 200, { ok: true, cloud: authEnabled, persistent: cloudEnabled, ai: !!process.env.ANTHROPIC_API_KEY, push: pushEnabled, beta: process.env.BETA_ALL_ACCESS !== '0' })
}
