// Code.gs를 가짜 Apps Script 서비스 위에서 실행해, 시트에 실제로 어떻게 쌓이는지 확인합니다.
// 실행: TZ=Asia/Seoul node --test budget/test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGas, claudeReply } from './gas-fakes.mjs';

const plain = (x) => JSON.parse(JSON.stringify(x));
const pad = (n) => String(n).padStart(2, '0');

function smsAt(d, amount, merchant) {
  return `[Web발신]\n신한카드(1234)승인 홍*동 ${amount.toLocaleString('en-US')}원(일시불)${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} ${merchant} 누적1,234,567원`;
}
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function freshApp(claude, withKey = true) {
  const app = loadGas({ claude });
  if (withKey) app.props.ANTHROPIC_API_KEY = 'sk-test';
  app.g.setup();
  app.k = app.props.TOKEN;
  app.ledger = () => app.sheets.find((s) => s.name === '원장');
  app.rows = () => plain(app.g.readLedger_());
  return app;
}

function post(app, body) {
  return JSON.parse(app.g.doPost({ postData: { contents: JSON.stringify(body) }, parameter: {} }).getContent());
}

const coupang = (date) => claudeReply({
  is_transaction: true, type: '지출', date, time: '', merchant: '쿠팡', payment_method: '', total: 38900, business_likely: false,
  items: [
    { name: '하기스 기저귀 대형 1팩', amount: 26900, category: '육아·교육', sub: '육아' },
    { name: '오트밀 쿠키 2봉', amount: 6000, category: '식비', sub: '간식' },
    { name: '주방세제 리필', amount: 6000, category: '생활·쇼핑', sub: '생활용품' }
  ]
});

test('처음 설정: 원장·규칙·설정·요약 탭과 토큰', () => {
  const app = freshApp();
  const names = app.sheets.map((s) => s.name);
  for (const n of ['원장', '규칙', '설정', '요약-일', '요약-주', '요약-월', '요약-항목']) assert.ok(names.includes(n), n);
  assert.equal(app.ledger().data[0][0], 'ID');
  assert.match(app.sheets.find((s) => s.name === '요약-월').formulas['1,1'], /^=QUERY\('원장'!A1:S/);
  assert.equal(app.k.length, 40);
  assert.equal(app.g.getSettings_().taxRate, 10);
});

test('단축어 웹훅: 토큰이 틀리면 거절, 맞으면 원장에 기록', () => {
  const app = freshApp();
  const now = new Date(Date.now() - 3600e3);
  assert.equal(post(app, { token: 'wrong', text: smsAt(now, 5600, '스타벅스') }).error, 'token');
  const r = post(app, { token: app.k, text: smsAt(now, 5600, '스타벅스') });
  assert.equal(r.ok, true);
  const rows = app.rows();
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].merchant, rows[0].amount, rows[0].cat, rows[0].sub, rows[0].method, rows[0].confirmed], ['스타벅스', 5600, '식비', '카페', '신한카드', false]);
  assert.equal(rows[0].date, ymd(now));
  assert.ok(app.props.LAST_SMS);
});

test('카드 문자 + 쿠팡 캡처 = 한 건으로 합치고 품목별로 나눔', () => {
  const now = new Date(Date.now() - 2 * 3600e3);
  const app = freshApp(() => coupang(ymd(now)));
  post(app, { token: app.k, text: smsAt(now, 38900, '쿠팡') });
  const smsGroup = app.rows()[0].group;

  const res = plain(app.g.apiAddImage(app.k, Buffer.from('img').toString('base64'), 'image/jpeg', 'a.jpg', '캡처'));
  assert.equal(res.merged, true);
  assert.equal(res.group.group, smsGroup);
  assert.equal(res.group.items.length, 3);
  assert.equal(res.group.source, '결제 문자+캡처');
  assert.equal(res.group.time, `${pad(now.getHours())}:${pad(now.getMinutes())}`); // 문자의 시간 유지
  assert.equal(res.group.method, '신한카드');
  assert.match(res.group.original, /drive\.google\.com/);
  assert.deepEqual(res.group.items.map((i) => i.cat), ['육아·교육', '식비', '생활·쇼핑']);
  assert.equal(app.rows().length, 3);

  // 같은 문자가 한 번 더 와도 늘지 않음
  const again = post(app, { token: app.k, text: smsAt(now, 38900, '쿠팡') });
  assert.equal(again.duplicate, true);
  assert.equal(app.rows().length, 3);
});

test('Claude 요청 모양: 모델·구조화 출력·fallback·이미지 블록', () => {
  const app = freshApp(() => coupang(ymd(new Date())));
  app.g.apiAddImage(app.k, Buffer.from('img').toString('base64'), 'image/jpeg', 'a.jpg');
  const req = app.requests[0];
  assert.equal(req.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(req.headers['anthropic-version'], '2023-06-01');
  assert.equal(req.headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
  assert.equal(req.body.model, 'claude-opus-5-5');
  assert.equal(req.body.fallbacks, 'default');
  assert.equal(req.body.output_config.format.type, 'json_schema');
  assert.equal(req.body.output_config.effort, 'medium');
  assert.equal(req.body.thinking, undefined);
  assert.equal(req.body.messages[0].content[0].type, 'image');
  assert.ok(req.body.output_config.format.schema.properties.items.items.properties.category.enum.includes('사업경비'));
});

test('API 키가 없으면 알기 쉬운 오류, 거절(refusal)도 안내', () => {
  const app = freshApp(() => ({ ...claudeReply({}), stop_reason: 'refusal', content: [] }), false);
  assert.throws(() => app.g.apiAddImage(app.k, 'aW1n', 'image/jpeg'), /ANTHROPIC_API_KEY/);
  app.props.ANTHROPIC_API_KEY = 'sk-test';
  assert.throws(() => app.g.apiAddImage(app.k, 'aW1n', 'image/jpeg'), /읽을 수 없어요/);
  assert.throws(() => app.g.apiAddImage(app.k, 'aW1n', 'text/html'), /PDF만/);
});

test('한 번 고치면 다음부터 자동 분류 (규칙 학습)', () => {
  const app = freshApp();
  const now = new Date(Date.now() - 3600e3);
  post(app, { token: app.k, text: smsAt(now, 45000, '모르는공방') });
  let row = app.rows()[0];
  assert.equal(row.cat, '기타');
  app.g.apiUpdateGroup(app.k, row.group, { biz: '사업', learn: true, items: [{ id: row.id, cat: '사업경비' }] });
  row = app.rows()[0];
  assert.deepEqual([row.cat, row.biz, row.confirmed], ['사업경비', '사업', true]);
  const rules = plain(app.g.readRules_());
  assert.deepEqual(rules.map((r) => [r.keyword, r.cat, r.biz]), [['모르는공방', '사업경비', '사업']]);

  const later = new Date(Date.now() - 1800e3);
  post(app, { token: app.k, text: smsAt(later, 12000, '모르는공방') });
  const r2 = app.rows()[1];
  assert.deepEqual([r2.cat, r2.biz, r2.confirmed], ['사업경비', '사업', true]);
});

test('한 줄 입력·수입, 확인·삭제, 요약·리포트·내보내기', () => {
  const app = freshApp();
  app.g.apiAddText(app.k, '점심 김밥 4500');
  app.g.apiAddText(app.k, 'A사 디자인비 입금 150만');
  let boot = plain(app.g.apiBootstrap(app.k));
  assert.equal(boot.pending.length, 0); // 직접 쓴 기록은 확인된 것으로
  assert.equal(boot.recent.length, 2);
  assert.equal(boot.hook.url, 'https://script.google.com/macros/s/FAKE/exec');

  post(app, { token: app.k, text: smsAt(new Date(Date.now() - 600e3), 8000, 'GS25') });
  boot = plain(app.g.apiBootstrap(app.k));
  assert.equal(boot.pending.length, 1);
  app.g.apiConfirm(app.k, boot.pending[0].group);
  assert.equal(plain(app.g.apiBootstrap(app.k)).pending.length, 0);

  const d = plain(app.g.apiDashboard(app.k, 'month'));
  assert.equal(d.income, 1500000);
  assert.equal(d.expense, 12500);
  assert.equal(d.incomes[0].name, '사업소득 · A사 디자인비');
  const day = plain(app.g.apiDashboard(app.k, 'day', undefined, boot.today));
  assert.equal(day.dayItems.length >= 2, true);

  const rep = plain(app.g.apiReport(app.k));
  assert.equal(rep.money.taxRate, 10);
  assert.equal(rep.money.tax, 150000);

  const ex = plain(app.g.apiExportCsv(app.k, 'biz'));
  assert.equal(ex.count, 1);
  assert.ok(app.files.at(-1).content.startsWith('﻿날짜,'));

  const gsGroup = app.rows().find((r) => r.merchant === 'GS25').group;
  app.g.apiDeleteGroup(app.k, gsGroup);
  assert.equal(app.rows().length, 2);
});

test('설정 저장: 메일 읽기 켜면 트리거 생성, 끄면 삭제', () => {
  const app = freshApp();
  let s = plain(app.g.apiSaveSettings(app.k, { taxRate: 8, savingGoal: 300000, mailScan: true, onboarded: true }));
  assert.deepEqual([s.taxRate, s.savingGoal, s.mailScan, s.onboarded], [8, 300000, true, true]);
  assert.equal(app.triggers.length, 1);
  s = plain(app.g.apiSaveSettings(app.k, { mailScan: false }));
  assert.equal(app.triggers.length, 0);
});

test('시트 행이 모자라면 늘려서 기록', () => {
  const app = freshApp();
  app.ledger().maxRows = 1;
  app.g.apiAddText(app.k, '택시 12000');
  assert.equal(app.rows().length, 1);
});

test('토큰 없이 API 호출 불가', () => {
  const app = freshApp();
  assert.throws(() => app.g.apiBootstrap('nope'), /주소가 올바르지 않아요/);
});
