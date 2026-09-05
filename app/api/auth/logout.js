import { json, methodGuard } from '../_lib/http.js'
import { clearSession } from '../_lib/auth.js'
export default async function handler(req, res) { if (!methodGuard(req, res, ['POST'])) return; clearSession(res); json(res, 200, { ok: true }) }
