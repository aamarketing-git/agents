/* 자료 파일 업로드 → Vercel Blob (사용자별 경로). 본문은 base64 JSON (Vercel 함수 본문 한도 4.5MB) */
import { put, del } from '@vercel/blob'
import { json, body, methodGuard } from '../_lib/http.js'
import { getUser } from '../_lib/auth.js'

export const blobEnabled = !!process.env.BLOB_READ_WRITE_TOKEN
const MAX = 4 * 1024 * 1024

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['POST', 'DELETE'])) return
  const user = await getUser(req)
  if (!user) return json(res, 401, { error: 'login' })
  if (!blobEnabled) return json(res, 503, { error: 'blob-disabled' })
  const b = body(req)
  if (req.method === 'DELETE') {
    if (b.url && b.url.includes(`/${user.id}/`)) { try { await del(b.url) } catch { /* ignore */ } }
    return json(res, 200, { ok: true })
  }
  const { name, mime, data } = b
  if (!name || !data) return json(res, 400, { error: 'file' })
  const buf = Buffer.from(data, 'base64')
  if (buf.length > MAX) return json(res, 413, { error: '파일은 4MB까지 올릴 수 있습니다.' })
  const safe = name.replace(/[^\w.\-가-힣 ]/g, '_').slice(0, 80)
  const blob = await put(`${user.id}/${Date.now()}-${safe}`, buf, { access: 'public', addRandomSuffix: true, contentType: mime || 'application/octet-stream' })
  json(res, 200, { url: blob.url, size: buf.length })
}
