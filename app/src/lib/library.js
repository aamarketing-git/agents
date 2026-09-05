/* =========================================================
   자료실 : 업종 자료(메모·링크·파일) 저장 · 검색 · AI 정리 · 고객 전달
   - 메타데이터/본문/요약은 state.library 에 저장(계정 동기화)
   - 파일 본체: 서버(Vercel Blob) 업로드, 서버 없으면 IndexedDB 로컬 저장
   ========================================================= */
import { api, getHealth } from './api'

export const LIB_CATEGORIES = [
  { id: 'product', label: '제품', ico: '📦' },
  { id: 'health', label: '건강', ico: '💚' },
  { id: 'business', label: '사업', ico: '📈' },
  { id: 'customer', label: '고객용', ico: '🎁' },
  { id: 'education', label: '교육', ico: '🎓' },
  { id: 'other', label: '기타', ico: '📁' },
]
export const catLabel = (id) => LIB_CATEGORIES.find((c) => c.id === id)?.label || '기타'
export const catIco = (id) => LIB_CATEGORIES.find((c) => c.id === id)?.ico || '📁'

/* ---------- IndexedDB (로컬 파일 본체) ---------- */
function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('aisec-files', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('files')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
export async function idbPut(id, blob) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(blob, id); tx.oncomplete = res; tx.onerror = () => rej(tx.error) }) }
export async function idbGet(id) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('files', 'readonly'); const r = tx.objectStore('files').get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error) }) }
export async function idbDel(id) { const db = await idb(); return new Promise((res) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').delete(id); tx.oncomplete = res; tx.onerror = res }) }

export const toBase64 = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file) })
export const fmtSize = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB')

/* 파일 저장 : 서버(Blob) → 실패 시 로컬 */
export async function storeFile(id, file) {
  const h = await getHealth()
  if (h.cloud && h.blob) {
    try {
      const data = await toBase64(file)
      const r = await api('/library/upload', { method: 'POST', body: { name: file.name, mime: file.type, data } })
      return { where: 'cloud', url: r.url }
    } catch (e) { if (e.status !== 503 && e.status !== 413) { /* fall through to local */ } else if (e.status === 413) throw e }
  }
  await idbPut(id, file)
  return { where: 'local', url: '' }
}
export async function loadFileBlob(item) {
  if (item.where === 'cloud' && item.url) { const r = await fetch(item.url); return r.blob() }
  return idbGet(item.id)
}
export async function removeFile(item) {
  if (item.where === 'cloud' && item.url) { try { await api('/library/upload', { method: 'DELETE', body: { url: item.url } }) } catch { /* ignore */ } }
  else await idbDel(item.id)
}

/* AI 정리 (서버 필요). 실패하면 null */
export async function aiExtract({ item, file }) {
  const h = await getHealth()
  if (!h.ai) return null
  const payload = { kind: item.type === 'file' ? 'file' : item.type === 'link' ? 'link' : 'text', mime: item.mime, title: item.title, url: item.type === 'link' ? item.url : item.where === 'cloud' ? item.url : '', text: item.content }
  if (item.type === 'file' && file) payload.data = await toBase64(file)
  else if (item.type === 'file' && item.where === 'local') { const b = await loadFileBlob(item); if (b) payload.data = await toBase64(b) }
  try { const r = await api('/library/extract', { method: 'POST', body: payload }); return r.ok ? r : null } catch (e) { if (e.status === 429) throw new Error('오늘 AI 사용 한도에 도달했습니다.'); return null }
}

/* ---------- 검색 (한국어 부분 일치 + 가중치) ---------- */
const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ')
export function searchLibrary(items, query, { category = '', limit = 50 } = {}) {
  const q = norm(query)
  const words = q.split(' ').filter((w) => w.length >= 1)
  let list = items
  if (category) list = list.filter((i) => i.category === category)
  if (!words.length) return list.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, limit)
  return list
    .map((i) => {
      const t = norm(i.title), tg = norm((i.tags || []).join(' ')), sm = norm(i.summary), kp = norm((i.keyPoints || []).join(' ')), ct = norm(i.content)
      let score = 0
      for (const w of words) {
        if (t.includes(w)) score += 10
        if (tg.includes(w)) score += 6
        if (sm.includes(w)) score += 4
        if (kp.includes(w)) score += 3
        if (ct.includes(w)) score += 1
      }
      return { i, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.i.updatedAt || '').localeCompare(a.i.updatedAt || ''))
    .slice(0, limit)
    .map((x) => x.i)
}

/* AI 컨텍스트용 스니펫 */
export function librarySnippets(items, query, n = 4) {
  return searchLibrary(items, query, { limit: n }).map((i) => `- [${i.title}] (${catLabel(i.category)}) ${i.summary || (i.content || '').slice(0, 200)}${i.keyPoints?.length ? ' | 핵심: ' + i.keyPoints.slice(0, 3).join('; ') : ''}${i.url ? ' | ' + i.url : ''}`).join('\n')
}

/* 고객 전달용 문장 */
export function customerText(item, userName) {
  const body = item.customerMessage || item.summary || (item.content || '').slice(0, 200)
  return `${body}\n${item.url ? `\n👉 ${item.url}` : ''}\n\n${userName ? `${userName} 드림` : ''}`.trim()
}

/* 오늘 복습할 자료 : 가장 오래 안 본 것, 없으면 최신 */
export function todayStudyItem(items) {
  if (!items.length) return null
  return [...items].sort((a, b) => (a.lastStudied || '').localeCompare(b.lastStudied || '') || (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0]
}
