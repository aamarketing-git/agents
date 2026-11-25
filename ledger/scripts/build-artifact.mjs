// pwa/ 파일들을 한 장짜리 HTML(미리보기용)로 합친다. 사용: node build-artifact.mjs <출력경로>
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const pwa = join(dirname(fileURLToPath(import.meta.url)), '../pwa');
const rd = (f) => readFileSync(join(pwa, f), 'utf8');
const sub = (s, a, b) => { assert.ok(s.includes(a), '치환 대상 없음: ' + a.slice(0, 40)); return s.replace(a, b); };

let css = rd('style.css');
const dark = /@media \(prefers-color-scheme: dark\) \{\n  :root \{([\s\S]*?)\n  \}\n\}/.exec(css);
assert.ok(dark, 'dark block');
css = css.replace(dark[0], `:root:not([data-theme="light"]) {${dark[1]}\n  color-scheme: dark;\n}\n:root[data-theme="dark"] {${dark[1]}\n  color-scheme: dark;\n}`);
// :root 가 미디어 밖으로 나오며 "일단 다크"가 되지 않도록 prefers-color-scheme 으로 감싼다
css = css.replace(':root:not([data-theme="light"]) {', '@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {').replace(/(:root:not\(\[data-theme="light"\]\) \{[\s\S]*?color-scheme: dark;\n\})/, '$1 }');
css += `
.top { top: env(safe-area-inset-top, 0px); padding: 12px max(16px, env(safe-area-inset-right, 0px)) 12px max(16px, env(safe-area-inset-left, 0px)); }
#view { padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--bg); }
.tabs { position: fixed; } .demo { background: var(--accent-soft); color: var(--accent); border-radius: 12px; padding: 9px 12px; font-size: 13px; margin-bottom: 12px; }
`;

let core = rd('core.js');
let app = rd('app.js');
app = sub(app, "if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { /* file:// 등에서는 무시 */ });", '');
// 처음 열면 보이는 예시 내역 (이 미리보기 전용, source = 예시)
const seed = `
  if (!S.txs.length && !store.get('seeded', false)) {
    var t0 = today(), ex = [
      [0, '지출', '카페·간식', '스타벅스강남점', 5600, '신한카드'], [0, '지출', '식비', '맛나식당', 38900, '신한카드'],
      [1, '지출', '장보기', '이마트 성수점', 53200, '신한카드'], [2, '지출', '교통', '카카오택시', 12400, '카카오페이'],
      [3, '지출', '식비', '배달의민족', 21500, '삼성카드'], [4, '지출', '문화·여가', '넷플릭스', 17000, '현대카드'],
      [6, '지출', '의료·건강', '연세약국', 8700, '현금'], [9, '지출', '주거·통신', 'KT 통신요금', 55000, 'KB국민카드'],
      [11, '지출', '쇼핑·의류', '무신사', 69000, '삼성카드'], [14, '지출', '장보기', '홈플러스', 84200, '신한카드'],
      [2, '수입', '정기수입', '회사 급여', 3200000, '국민은행'], [5, '수입', '비정기수입', '중고거래', 45000, '']
    ];
    ex.forEach(function (e, i) {
      S.txs.push({ id: 'demo' + i, date: C.addDays(t0, -e[0]), time: '', kind: e[1], category: e[2], merchant: e[3], amount: e[4], method: e[5], memo: '예시', source: '예시', synced: true });
    });
    store.set('seeded', true); save();
  }
`;
app = sub(app, "  render();\n  var q = new URLSearchParams", seed + "  render();\n  var q = new URLSearchParams");
app = sub(app, `<button class="btn small" data-act="csv">CSV 내보내기</button>`, `<button class="btn small" data-act="csv">CSV 내보내기</button><button class="btn small danger" data-act="clearDemo">예시 내역 지우기</button>`);
app = sub(app, "else if (act === 'csv') exportCsv();", "else if (act === 'csv') exportCsv();\n    else if (act === 'clearDemo') { S.txs = S.txs.filter(function (t) { return t.source !== '예시'; }); save(); toast('예시 내역을 지웠어요'); render(); }");
app = sub(app, "var recent = sorted()", "var demo = S.txs.some(function (t) { return t.source === '예시'; }) ? '<div class=\"demo\">미리보기용 <b>예시 내역</b>이 들어 있어요. 설정에서 지울 수 있어요.</div>' : '';\n    var recent = sorted()");
app = sub(app, "return '<div class=\"grid2\">' +\n      '<div class=\"stat\"><small>이번 주 지출", "return demo + '<div class=\"grid2\">' +\n      '<div class=\"stat\"><small>이번 주 지출");

const body = rd('index.html').match(/<body>([\s\S]*?)<script src="core.js">/)[1];
const out = `<title>가계부</title>
<style>${css}</style>
${body}
<script>${core}</script>
<script>${app}</script>
`;
writeFileSync(process.argv[2], out);
console.log('written', process.argv[2], (out.length / 1024).toFixed(0) + 'KB');
