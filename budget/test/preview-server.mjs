// 로컬 미리보기: 실제 Index.html + Code.gs를 가짜 구글 서비스 위에서 띄웁니다.
// 실행: TZ=Asia/Seoul node budget/test/preview-server.mjs  → http://localhost:8787
// 영수증 인식은 가짜 응답(쿠팡 주문 3품목)을 돌려줍니다. 실제 구글 시트·Claude는 쓰지 않습니다.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { loadGas, claudeReply } from './gas-fakes.mjs';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const app = loadGas({
  claude: () => claudeReply({
    is_transaction: true, type: '지출', date: ymd(new Date()), time: '', merchant: '쿠팡', payment_method: '', total: 38900, business_likely: false,
    items: [
      { name: '하기스 기저귀 대형 1팩', amount: 26900, category: '육아·교육', sub: '육아' },
      { name: '오트밀 쿠키 2봉', amount: 6000, category: '식비', sub: '간식' },
      { name: '주방세제 리필', amount: 6000, category: '생활·쇼핑', sub: '생활용품' }
    ]
  })
});
app.props.ANTHROPIC_API_KEY = 'sk-preview';
app.g.setup();
const K = app.props.TOKEN;

// 예시 데이터: 지난 5주치 (SEED=0 이면 빈 시트로 시작)
if (process.env.SEED !== '0') {
  const now = new Date();
  const sms = (d, amt, m) => `신한카드(1234)승인 홍*동 ${amt.toLocaleString('en-US')}원(일시불)${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} ${m}`;
  const at = (daysAgo, h, mnt = 10) => { const d = new Date(now); d.setDate(d.getDate() - daysAgo); d.setHours(h, mnt, 0, 0); return d; };
  const seed = [
    [34, 9, 980000, '관리비'], [30, 12, 12000, '김밥천국'], [28, 19, 54000, '이마트'], [27, 20, 26000, '배달의민족'],
    [23, 13, 5600, '스타벅스'], [21, 19, 29000, '배달의민족'], [20, 18, 31000, '배달의민족'], [16, 10, 61000, '홈플러스'],
    [14, 20, 25000, '배달의민족'], [13, 21, 27000, '요기요'], [9, 8, 4500, '메가커피'], [8, 8, 4500, '메가커피'],
    [7, 8, 4500, '메가커피'], [7, 19, 28000, '배달의민족'], [6, 20, 32000, '배달의민족'], [6, 1, 43000, '무신사'],
    [5, 12, 9800, 'GS25'], [3, 15, 120000, '영어학원'], [2, 11, 23400, '동네마트'], [1, 9, 1450, '티머니'], [0, 8, 5600, '스타벅스']
  ];
  for (const [ago, hr, amt, m] of seed) {
    app.g.doPost({ postData: { contents: JSON.stringify({ token: K, text: sms(at(ago, hr), amt, m) }) }, parameter: {} });
  }
  for (const g of app.g.apiBootstrap(K).pending.slice(3)) app.g.apiConfirm(K, g.group);
  app.g.apiAddText(K, `거래처 A 디자인비 입금 180만`);
  app.g.apiAddText(K, `거래처 B 원고료 입금 90만`);
  app.g.apiSaveSettings(K, { onboarded: process.env.ONBOARD === '1' ? false : true });
}

function page() {
  let html = readFileSync(new URL('../apps-script/Index.html', import.meta.url), 'utf8');
  html = html.replace('<?!= JSON.stringify(k) ?>', JSON.stringify(K));
  const shim = `<script>
  // google.script.run 흉내: 서버 함수를 /api 로 호출
  window.google = { script: { run: (function make(ok, fail) {
    return new Proxy({}, { get: function (_, name) {
      if (name === 'withSuccessHandler') return function (f) { return make(f, fail); };
      if (name === 'withFailureHandler') return function (f) { return make(ok, f); };
      return function () {
        var args = [].slice.call(arguments);
        fetch('/api', { method: 'POST', body: JSON.stringify({ fn: name, args: args }) })
          .then(function (r) { return r.json(); })
          .then(function (j) { if (j.error) { fail && fail(new Error(j.error)); } else { ok && ok(j.result); } });
      };
    } });
  })() } };
  </script>`;
  return html.replace('<script>\nvar K', shim + '\n<script>\nvar K');
}

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const { fn, args } = JSON.parse(body);
      let out;
      try {
        if (!/^api[A-Z]/.test(fn)) throw new Error('not allowed');
        out = { result: JSON.parse(JSON.stringify(app.g[fn](...args) ?? null)) };
      } catch (e) { out = { error: e.message }; }
      setTimeout(() => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(out)); }, fn === 'apiAddImage' ? 600 : 60);
    });
    return;
  }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(page());
}).listen(Number(process.env.PORT || 8787), () => console.log(`미리보기: http://localhost:${process.env.PORT || 8787}`));
