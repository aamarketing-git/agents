// Apps Script 백엔드를 가짜 Google 서비스 위에서 실행해 보는 스모크 테스트.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');

function makeEnv({ apiKey = '', fetchImpl } = {}) {
  const sheets = {};
  const props = { TOKEN: 'tok123' };
  if (apiKey) props.ANTHROPIC_API_KEY = apiKey;
  const mkSheet = (name) => {
    const data = []; // 2D 배열, 1-indexed 행/열을 0-index로 저장
    const sh = {
      name, data, formulas: {},
      getLastRow: () => data.length,
      getRange(r, c, nr = 1, nc = 1) {
        const rng = new Proxy({}, {
          get(_, k) {
            if (k === 'getValues') return () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (data[r - 1 + i] || [])[c - 1 + j] ?? ''));
            if (k === 'setValues') return (v) => { v.forEach((row, i) => { data[r - 1 + i] = data[r - 1 + i] || []; row.forEach((x, j) => { data[r - 1 + i][c - 1 + j] = x; }); }); return rng; };
            if (k === 'setFormulas') return (v) => { v.forEach((row, i) => row.forEach((x, j) => { sh.formulas[`${r + i},${c + j}`] = x; })); return rng; };
            if (k === 'setValue') return (x) => { data[r - 1] = data[r - 1] || []; data[r - 1][c - 1] = x; return rng; };
            return () => rng; // 서식 메서드는 전부 no-op, 체이닝 가능
          },
        });
        return rng;
      },
      appendRow(row) { data.push(row); },
      deleteRow(r) { data.splice(r - 1, 1); },
      getCharts: () => [], removeChart() {}, insertChart() {}, clear() { data.length = 0; },
      newChart() { const b = new Proxy({}, { get: (_, k) => (k === 'build' ? () => ({}) : () => b) }); return b; },
    };
    return new Proxy(sh, { get: (t, k) => (k in t ? t[k] : () => sh) });
  };
  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = mkSheet(n)),
    setSpreadsheetTimeZone() {}, setActiveSheet() {}, getUrl: () => 'https://docs.google.com/spreadsheets/d/FAKE',
  };
  const ctx = {
    console,
    SpreadsheetApp: { getActive: () => ss, getUi: () => ({ createMenu: () => ({ addItem() { return this; }, addToUi() {} }), alert() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ create() {} }) }) }) }) },
    Charts: { ChartType: { COLUMN: 'COLUMN' } },
    Utilities: {
      getUuid: () => 'aaaa-bbbb',
      formatDate: (d, tz, f) => { const p = (n) => String(n).padStart(2, '0'); const s = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; return f === 'yyyy-MM-dd' ? s : f === 'HH:mm' ? `${p(d.getHours())}:${p(d.getMinutes())}` : `${s} ${p(d.getHours())}:${p(d.getMinutes())}:00`; },
      parseDate: (s) => new Date(s + 'T00:00:00'),
    },
    UrlFetchApp: { fetch: fetchImpl || (() => { throw new Error('unexpected fetch'); }) },
  };
  vm.createContext(ctx);
  vm.runInContext(read('./Core.gs'), ctx);
  vm.runInContext(read('./Code.gs'), ctx);
  ctx.__call = (req) => JSON.parse(vm.runInContext('doPost', ctx)({ postData: { contents: JSON.stringify({ token: 'tok123', ...req }) } }).text);
  return { ctx, sheets, props };
}

test('setup: 탭 생성, 정산 수식, 토큰 유지', () => {
  const { ctx, sheets, props } = makeEnv();
  ctx.setup();
  for (const n of ['거래내역', '주간정산', '월간정산', '카테고리', '분류규칙', '정기수입']) assert.ok(sheets[n], n);
  const f = sheets['월간정산'].formulas;
  assert.match(f['4,3'], /^=SUMIFS\('거래내역'!\$G\$2:\$G,'거래내역'!\$D\$2:\$D,"수입",'거래내역'!\$E\$2:\$E,"정기수입"/);
  assert.match(f['15,1'], /EDATE\(DATE\(YEAR\(TODAY\(\)\),MONTH\(TODAY\(\)\),1\),0\)/); // 마지막 행 = 이번 달
  assert.match(sheets['주간정산'].formulas['15,1'], /WEEKDAY\(TODAY\(\),2\)/);
  assert.equal(sheets['월간정산'].data[2].length, 8 + 14); // 헤더: 8 + 지출분류 14
  assert.equal(props.TOKEN, 'tok123');
});

test('토큰 없으면 거부', () => {
  const { ctx } = makeEnv(); ctx.setup();
  const out = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action: 'ping', token: 'x' }) } }).text);
  assert.equal(out.ok, false);
});

test('add 는 upsert: 같은 id 재전송해도 중복 없음, delete, list', () => {
  const { ctx, sheets } = makeEnv(); ctx.setup();
  const tx = { id: 'a1', date: '2026-11-19', time: '13:45', kind: '지출', category: '카페·간식', merchant: '스타벅스', amount: 4500 };
  assert.equal(ctx.__call({ action: 'add', tx }).ok, true);
  assert.equal(ctx.__call({ action: 'add', tx: { ...tx, amount: 5000 } }).ok, true);
  assert.equal(sheets['거래내역'].data.length, 2); // 헤더 + 1행
  const list = ctx.__call({ action: 'list' }).txs;
  assert.equal(list.length, 1); assert.equal(list[0].amount, 5000); assert.equal(list[0].time, '13:45');
  assert.equal(ctx.__call({ action: 'delete', id: 'a1' }).deleted, true);
  assert.equal(sheets['거래내역'].data.length, 1);
});

test('잘못된 분류는 기타로, 수입은 정기/비정기로 정리', () => {
  const { ctx } = makeEnv(); ctx.setup();
  assert.equal(ctx.__call({ action: 'add', tx: { kind: '지출', category: '없는분류', amount: 100, date: '2026-11-19' } }).tx.category, '기타');
  assert.equal(ctx.__call({ action: 'add', tx: { kind: '수입', category: '식비', amount: 100, date: '2026-11-19' } }).tx.category, '비정기수입');
  assert.equal(ctx.__call({ action: 'add', tx: { kind: '지출', amount: 0 } }).ok, false);
});

test('ingest: 문자 → 파싱 → 규칙 분류 → 저장 (AI 키 없이도 동작)', () => {
  const { ctx, sheets } = makeEnv(); ctx.setup();
  const out = ctx.__call({ action: 'ingest', text: '[KB국민카드] 11/19 13:45 승인 홍*동 12,500원 일시불 스타벅스강남점 누적1,234,000원' });
  assert.equal(out.ok, true);
  assert.equal(out.tx.category, '카페·간식'); assert.equal(out.tx.amount, 12500); assert.equal(out.tx.source, '자동전달');
  assert.equal(sheets['거래내역'].data.length, 2);
  assert.equal(ctx.__call({ action: 'ingest', text: '택배가 도착했습니다' }).ok, false);
});

test('사용자 규칙/학습이 기본 사전보다 우선', () => {
  const { ctx } = makeEnv(); ctx.setup();
  ctx.__call({ action: 'add', learn: '동네밥집', tx: { kind: '지출', category: '장보기', merchant: '동네밥집', amount: 9000, date: '2026-11-19' } });
  const cfg = ctx.__call({ action: 'config' });
  assert.ok(cfg.rules.some((r) => r.keyword === '동네밥집' && r.category === '장보기'));
  const d = ctx.__call({ action: 'parse', text: '[신한카드] 11/19 12:00 승인 9,000원 일시불 동네밥집' }).draft;
  assert.equal(d.category, '장보기'); assert.equal(d.categorySource, 'rule-user');
});

test('영수증: AI 응답을 검증해 초안으로 변환 (분류 규칙 > AI)', () => {
  let sent;
  const { ctx } = makeEnv({
    apiKey: 'sk-test',
    fetchImpl: (url, opts) => {
      sent = { url, opts, body: JSON.parse(opts.payload) };
      const text = '```json\n{"merchant":"이마트 성수점","date":"2026-11-18","time":"18:20","total":53200,"method":"신한카드","category":"쇼핑·의류","items":["우유","계란"]}\n```';
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ content: [{ type: 'text', text }] }) };
    },
  });
  ctx.setup();
  const out = ctx.__call({ action: 'receipt', image: 'AAAA', mime: 'image/png' });
  assert.equal(out.ok, true);
  assert.equal(out.draft.amount, 53200);
  assert.equal(out.draft.category, '장보기'); // 이마트 규칙이 AI의 '쇼핑·의류'보다 우선
  assert.equal(out.draft.source, '영수증'); assert.equal(out.draft.memo, '우유, 계란');
  assert.equal(sent.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(sent.opts.headers['x-api-key'], 'sk-test');
  const img = sent.body.messages[0].content[0];
  assert.equal(img.type, 'image'); assert.equal(img.source.media_type, 'image/png');
});

test('영수증: 키 없음/금액 못 읽음은 명확한 오류', () => {
  const a = makeEnv(); a.ctx.setup();
  assert.match(a.ctx.__call({ action: 'receipt', image: 'AAAA' }).error, /ANTHROPIC_API_KEY/);
  const b = makeEnv({ apiKey: 'k', fetchImpl: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ content: [{ text: '{"total":0}' }] }) }) });
  b.ctx.setup();
  assert.match(b.ctx.__call({ action: 'receipt', image: 'AAAA' }).error, /읽지 못했습니다/);
});

test('정기수입: 지정일이 지났고 이번 달 미등록이면 한 번만 등록', () => {
  const { ctx, sheets } = makeEnv(); ctx.setup();
  const rec = sheets['정기수입'];
  rec.data[1] = ['월급', 3000000, 1, '국민은행', ''];
  ctx.runRecurring(); ctx.runRecurring();
  const rows = sheets['거래내역'].data.slice(1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][3], '수입'); assert.equal(rows[0][4], '정기수입'); assert.equal(rows[0][6], 3000000);
  assert.match(String(rec.data[1][4]), /^\d{4}-\d{2}$/);
});
