// 구글 시트 판의 화면(Index.html)과 로직(Logic.gs)에 웹 어댑터를 붙여
// 바로 열어 쓰는 웹 판 한 파일(web/index.html)을 만듭니다.
// 실행: node budget/web/build.mjs
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const index = read('../apps-script/Index.html');
const logic = read('../apps-script/Logic.gs');
const adapter = read('./adapter.js');

const head = index.slice(index.indexOf('<head>') + 6, index.indexOf('</head>'))
  .replace(/<base[^>]*>\s*/, '')
  .replace(/<meta charset="utf-8">\s*/, '');
let body = index.slice(index.indexOf('<body>') + 6, index.indexOf('</body>'));

const kLine = 'var K = <?!= JSON.stringify(k) ?>;';
if (!body.includes(kLine)) throw new Error('Index.html의 토큰 줄을 찾지 못함');
body = body.replace(kLine, "var K = 'web';");
const mainScript = '<script>\nvar K';
if (!body.includes(mainScript)) throw new Error('Index.html의 본 스크립트를 찾지 못함');
body = body.replace(mainScript, `<script>\n/* Logic.gs */\n${logic}\n</script>\n<script>\n${adapter}\n</script>\n${mainScript}`);
if (body.includes('<?')) throw new Error('템플릿 구문이 남아 있음');

const out = `<title>찰칵 가계부</title>
<!-- 자동 생성 파일: budget/web/build.mjs 로 만듭니다. 고칠 때는 apps-script/Index.html · Logic.gs · web/adapter.js 를 고치세요. -->
${head.trim()}
${body.trim()}
`;
writeFileSync(new URL('./index.html', import.meta.url), out);
console.log(`web/index.html ${(out.length / 1024).toFixed(1)} KB`);

/* ---------- 배포 묶음: budget/deploy ----------
 * 그대로 Vercel에 올리면 되는 폴더. 홈 화면 설치(PWA)·오프라인 열기·영수증 읽기 서버 함수 포함.
 * 구글 시트 판(Apps Script) 파일도 google-sheet-version/ 에 같이 넣습니다. */
const D = new URL('../deploy/', import.meta.url);
rmSync(D, { recursive: true, force: true });
mkdirSync(new URL('api/', D), { recursive: true });
mkdirSync(new URL('google-sheet-version/', D), { recursive: true });

const page = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>찰칵 가계부</title>
<meta name="description" content="결제 문자·영수증을 넣으면 자동 분류하고 일·주·월·항목별로 보여주는 가계부">
<meta name="theme-color" content="#1F5F55">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icon-192.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="찰칵 가계부">
<!-- 자동 생성 파일: budget/web/build.mjs 로 만듭니다. -->
${head.trim()}
</head>
<body>
${body.trim()}
<script>
if ('serviceWorker' in navigator) addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
</script>
</body>
</html>
`;
writeFileSync(new URL('index.html', D), page);

const manifest = {
  name: '찰칵 가계부', short_name: '찰칵 가계부', lang: 'ko',
  description: '결제 문자·영수증을 넣으면 자동 분류하는 가계부',
  start_url: './', scope: './', display: 'standalone',
  background_color: '#F6F3EC', theme_color: '#1F5F55',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }
  ]
};
writeFileSync(new URL('manifest.webmanifest', D), JSON.stringify(manifest, null, 2) + '\n');

for (const f of ['icon.svg', 'icon-192.png', 'icon-512.png']) copyFileSync(new URL(`static/${f}`, import.meta.url), new URL(f, D));

const version = createHash('sha256').update(page).digest('hex').slice(0, 10);
writeFileSync(new URL('sw.js', D), `// 찰칵 가계부 오프라인 캐시 (빌드 ${version})
const CACHE = 'chalkak-${version}';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return; // 영수증 읽기는 늘 서버로
  if (e.request.mode === 'navigate') {
    // 화면은 새 버전 먼저, 오프라인이면 저장해 둔 화면
    e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put('index.html', copy)); return r; })
      .catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
`);

copyFileSync(new URL('api/extract.js', import.meta.url), new URL('api/extract.js', D));
writeFileSync(new URL('package.json', D), JSON.stringify({
  name: 'chalkak-budget', private: true, type: 'module',
  description: '찰칵 가계부 — 배포용 (정적 앱 + 영수증 읽기 서버 함수)',
  engines: { node: '>=20' },
  dependencies: { '@anthropic-ai/sdk': '^0.131.0' }
}, null, 2) + '\n');

for (const f of ['Code.gs', 'Logic.gs', 'Claude.gs', 'Index.html', 'appsscript.json']) {
  copyFileSync(new URL(`../apps-script/${f}`, import.meta.url), new URL(`google-sheet-version/${f}`, D));
}
copyFileSync(new URL('deploy-README.md', import.meta.url), new URL('README.md', D));
console.log(`deploy/ 만듦 (index.html ${(page.length / 1024).toFixed(1)} KB, 캐시 버전 ${version})`);
