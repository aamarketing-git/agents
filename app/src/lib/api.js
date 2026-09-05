/* 서버 API 래퍼 : 같은 출처 /api, 쿠키 세션. 서버가 없으면(GitHub Pages·단일 파일) cloud=false 로 동작 */
let health = null
export async function getHealth() {
  if (health) return health
  try { const r = await fetch('/api/health', { cache: 'no-store' }); if (!r.ok) throw 0; const j = await r.json(); health = j.ok ? j : { cloud: false } } catch { health = { cloud: false, ai: false, push: false } }
  return health
}
export async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch('/api' + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' })
  let data = null
  try { data = await r.json() } catch { /* empty */ }
  if (!r.ok) { const e = new Error(data?.error || `HTTP ${r.status}`); e.status = r.status; e.data = data; throw e }
  return data
}
export const auth = {
  me: () => api('/auth/me'),
  login: (email, password) => api('/auth/login', { method: 'POST', body: { email, password } }),
  signup: (email, password) => api('/auth/signup', { method: 'POST', body: { email, password } }),
  logout: () => api('/auth/logout', { method: 'POST' }),
}
export const cloud = {
  load: () => api('/state'),
  save: (state, version) => api('/state', { method: 'PUT', body: { state, version } }),
}
export const LOCAL_ONLY_KEY = 'ai-secretary-local-only'
