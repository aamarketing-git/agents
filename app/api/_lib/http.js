/* 공통 HTTP 헬퍼 (Vercel Node 함수) */
export function json(res, status, data) { res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(data)) }
export function body(req) { if (!req.body) return {}; if (typeof req.body === 'string') { try { return JSON.parse(req.body) } catch { return {} } } return req.body }
export function cookies(req) {
  const out = {}
  for (const part of (req.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()) }
  return out
}
/* 같은 출처 확인 (CSRF 완화) */
export function sameOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return true
  try { return new URL(origin).host === req.headers.host } catch { return false }
}
export function methodGuard(req, res, allowed) {
  if (!allowed.includes(req.method)) { json(res, 405, { error: 'method' }); return false }
  if (req.method !== 'GET' && !sameOrigin(req)) { json(res, 403, { error: 'origin' }); return false }
  return true
}
export const todayKST = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
