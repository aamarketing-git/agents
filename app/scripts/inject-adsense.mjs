/* 빌드 후 정적 페이지(dist/tips)에 AdSense 코드 주입. ADSENSE_CLIENT 가 없으면 주석만 남김 */
import fs from 'node:fs'
const client = process.env.VITE_ADSENSE_CLIENT || ''
const slot = process.env.VITE_ADSENSE_SLOT_LIST || ''
const f = 'dist/tips/index.html'
if (!fs.existsSync(f)) process.exit(0)
let html = fs.readFileSync(f, 'utf8')
if (client) {
  html = html.replace('<!--ADSENSE-->', `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}" crossorigin="anonymous"></script>`)
  html = html.replaceAll('<!--ADSLOT-->', `<ins class="adsbygoogle" style="display:block" data-ad-client="${client}" data-ad-slot="${slot}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script>`)
}
fs.writeFileSync(f, html)
console.log('adsense inject:', client ? 'enabled' : 'placeholder')
