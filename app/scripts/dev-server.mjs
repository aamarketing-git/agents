/* 로컬 통합 테스트용 서버 : dist 정적 파일 + api/ 함수 (Vercel 유사 req/res). 실행: node scripts/dev-server.mjs */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const root = path.resolve('dist'), apiDir = path.resolve('api')
const PORT = process.env.PORT || 4180
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.png': 'image/png' }
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)) }
  if (url.pathname.startsWith('/api/')) {
    const file = path.join(apiDir, url.pathname.slice(5) + '.js')
    if (!fs.existsSync(file)) { res.status(404).json({ error: 'not found' }); return }
    let raw = ''; for await (const ch of req) raw += ch
    req.body = raw ? (() => { try { return JSON.parse(raw) } catch { return raw } })() : undefined
    req.query = Object.fromEntries(url.searchParams)
    try { const mod = await import(pathToFileURL(file).href + '?t=' + Date.now()); await mod.default(req, res) } catch (e) { console.error(e); if (!res.headersSent) res.status(500).json({ error: String(e.message) }) }
    return
  }
  let p = path.join(root, decodeURIComponent(url.pathname))
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html')
  if (!fs.existsSync(p)) p = path.join(root, 'index.html')
  res.setHeader('Content-Type', MIME[path.extname(p)] || 'application/octet-stream')
  fs.createReadStream(p).pipe(res)
}).listen(PORT, '127.0.0.1', () => console.log('dev server http://127.0.0.1:' + PORT))
