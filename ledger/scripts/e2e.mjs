// 모바일 화면 크기에서 주요 흐름을 실제 브라우저로 검증한다. (Playwright 필요, 구글 서버는 가짜 응답)
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');
const pwa = join(dirname(fileURLToPath(import.meta.url)), '../pwa');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const p = join(pwa, new URL(req.url, 'http://x').pathname.replace(/\/$/, '/index.html'));
  if (!existsSync(p)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' }).end(readFileSync(p));
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;
const GAS = 'https://script.google.com/macros/s/FAKE/exec';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2, locale: 'ko-KR', serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const server_txs = []; const calls = [];
await page.route(GAS, async (route) => {
  const body = JSON.parse(route.request().postData());
  calls.push(body);
  const ok = (o) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, ...o }) });
  if (body.token !== 'T') return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: false, error: '토큰이 올바르지 않습니다' }) });
  if (body.action === 'ping') return ok({ sheetUrl: 'https://docs.google.com/spreadsheets/d/FAKE', ai: true, categories: ['식비', '카페·간식', '장보기', '교통', '기타'], rules: [] });
  if (body.action === 'list') return ok({ txs: [{ id: 'remote1', date: new Date().toISOString().slice(0, 10), time: '', kind: '수입', category: '정기수입', merchant: '월급', amount: 3000000, method: '', memo: '', source: '정기수입' }] });
  if (body.action === 'add') { server_txs.push(body.tx); return ok({ tx: body.tx }); }
  if (body.action === 'delete') return ok({ deleted: true });
  if (body.action === 'receipt') return ok({ draft: { kind: '지출', amount: 53200, merchant: '이마트 성수점', date: new Date().toISOString().slice(0, 10), time: '18:20', method: '신한카드', memo: '우유, 계란', source: '영수증', category: '장보기', categorySource: 'rule' } });
  if (body.action === 'parse') return ok({ draft: { kind: '지출', amount: 9000, merchant: '낯선가게', date: '2026-11-19', time: '', method: '', memo: '', source: '문자', category: '식비', categorySource: 'ai' } });
  return ok({});
});

const shot = (n) => page.screenshot({ path: join(process.env.SHOTS || '/tmp', `ledger-${n}.png`) });
const step = (m) => console.log('✓', m);

// 1) 첫 화면 (미연결)
await page.goto(base);
assert.match(await page.textContent('#syncBadge'), /미연결/);
step('홈 렌더, 미연결 배지');

// 2) 결제 문자 붙여넣기 → 규칙 분류 → 저장 (서버 없이 로컬)
await page.click('[data-act=paste]');
await page.fill('#pasteBox', '[Web발신]\n[KB국민카드] 11/19 13:45 승인 홍*동 12,500원 일시불 스타벅스강남점 누적1,234,000원');
await page.click('#pGo');
await page.waitForSelector('#fSave');
assert.equal(await page.inputValue('#fAmt'), '12,500');
assert.equal(await page.inputValue('#fMer'), '스타벅스강남점');
assert.equal(await page.inputValue('#fCat'), '카페·간식');
await shot('editor');
await page.click('#fSave');
await page.waitForSelector('#sheet', { state: 'hidden' });
assert.match(await page.textContent('#view'), /스타벅스강남점/);
step('문자 → 자동 분류(카페·간식) → 저장');

// 3) 분류를 고치면 학습
await page.click('[data-act=paste]');
await page.fill('#pasteBox', '[신한카드] 11/19 19:00 승인 8,000원 일시불 동네빵집');
await page.click('#pGo'); await page.waitForSelector('#fSave');
assert.equal(await page.inputValue('#fCat'), '기타');
await page.selectOption('#fCat', '식비');
await page.click('#fSave');
await page.click('[data-act=paste]');
await page.fill('#pasteBox', '[신한카드] 11/19 20:00 승인 9,500원 일시불 동네빵집');
await page.click('#pGo'); await page.waitForSelector('#fSave');
assert.equal(await page.inputValue('#fCat'), '식비');
await page.click('#fCancel');
step('분류 수정 → 다음부터 학습(동네빵집=식비)');

// 4) 수입(정기) 직접 입력
await page.click('[data-act=income]');
await page.fill('#fAmt', '3200000'); await page.fill('#fMer', '회사 급여');
await page.click('.seg button[data-k="정기수입"]');
await page.click('#fSave');
const stat = await page.textContent('#view');
assert.match(stat, /3,200,000원/);
step('수입 입력(정기수입)');
await shot('home');

// 4.5) 키·시트 없이 영수증: 기기 안 OCR(가짜 엔진) → 파싱 → 규칙 분류
await page.route('**/tesseract.min.js', (route) => route.fulfill({ contentType: 'text/javascript', body: `window.Tesseract={createWorker:async()=>({recognize:async()=>({data:{text:'이마트 성수점\\n2026-11-18 18:20\\n우유 2,500\\n합 계 53,200\\n신한카드 승인 53,200'}}),terminate:async()=>{}})}` }));
await page.setInputFiles('#photo', { name: 'r.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64') });
await page.waitForSelector('#fSave');
assert.equal(await page.inputValue('#fAmt'), '53,200');
assert.equal(await page.inputValue('#fMer'), '이마트 성수점');
assert.equal(await page.inputValue('#fCat'), '장보기');
assert.equal(await page.inputValue('#fDate'), '2026-11-18');
assert.equal(calls.filter((c) => c.action === 'receipt').length, 0, 'AI 서버 호출 없음');
await page.click('#fCancel');
step('API 키 없이 영수증: 기기 안 OCR → 금액·상호·날짜·분류');

// 5) 내역/정산
await page.click('[data-tab=list]');
assert.match(await page.textContent('#view'), /회사 급여/);
await shot('list');
await page.click('[data-tab=report]');
assert.match(await page.textContent('#view'), /분류별 지출/);
assert.match(await page.textContent('#view'), /정기수입/);
await shot('report-week');
await page.click('[data-act=rm][data-m=month]');
assert.match(await page.textContent('#view'), /월/);
await shot('report-month');
step('내역·주간/월간 정산 렌더');

// 6) 시트 연결 → 불러오기 + 대기 건 전송
await page.click('[data-tab=settings]');
await page.fill('#cfgUrl', GAS); await page.fill('#cfgToken', 'T');
await page.click('[data-act=connect]');
await page.waitForFunction(() => /구글 시트 연결됨/.test(document.querySelector('#syncBadge').textContent), null, { timeout: 8000 });
assert.ok(server_txs.length >= 3, '대기 건이 서버로 전송돼야 함: ' + server_txs.length);
assert.ok(calls.some((c) => c.action === 'add' && c.learn === '동네빵집'), '학습 키워드 전달');
await shot('settings');
step('시트 연결 → 원격 내역 병합 + 미전송분 업로드 + 학습 규칙 전달');

// 7) 영수증 사진 → 편집창에 초안
await page.click('[data-tab=home]');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
await page.setInputFiles('#photo', { name: 'r.png', mimeType: 'image/png', buffer: png });
await page.waitForSelector('#fSave');
assert.equal(await page.inputValue('#fAmt'), '53,200');
assert.equal(await page.inputValue('#fCat'), '장보기');
assert.match(await page.textContent('.panel'), /영수증에서 읽은 내용/);
const rc = calls.find((c) => c.action === 'receipt');
assert.equal(rc.mime, 'image/jpeg'); assert.ok(rc.image.length > 50);
await shot('receipt');
await page.click('#fSave');
step('영수증 사진 → AI 초안 → 확인 후 저장');

// 8) 공유(share_target) 진입
await page.goto(base + '?text=' + encodeURIComponent('[현대카드] 11/19 08:10 승인 4,300원 일시불 GS25 역삼점'));
await page.waitForSelector('#fSave');
assert.equal(await page.inputValue('#fAmt'), '4,300');
assert.equal(await page.inputValue('#fCat'), '장보기');
assert.ok(!page.url().includes('text='), '주소의 공유 파라미터 정리');
step('문자앱 공유 → 바로 확인 화면');

// 9) 삭제
await page.click('#fCancel');
await page.click('[data-tab=list]');
await page.click('.row >> nth=0');
page.once('dialog', (d) => d.accept());
await page.click('#fDel');
await page.waitForTimeout(300);
assert.ok(calls.some((c) => c.action === 'delete'));
step('내역 삭제 → 서버 삭제 요청');

assert.deepEqual(errors, [], '콘솔 오류: ' + errors.join(' | '));
console.log('\nE2E 통과');
await browser.close(); server.close();
