import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('./core.js');
const TODAY = '2026-11-19';

test('카드 승인 문자 — KB국민', () => {
  const r = C.parseMessage('[Web발신]\n[KB국민카드] 11/19 13:45 승인 홍*동 12,500원 일시불 스타벅스강남점 누적1,234,000원', TODAY);
  assert.equal(r.amount, 12500); assert.equal(r.kind, '지출');
  assert.equal(r.date, '2026-11-19'); assert.equal(r.time, '13:45');
  assert.equal(r.merchant, '스타벅스강남점'); assert.match(r.method, /카드/);
  assert.equal(C.categorize(r.merchant).category, '카페·간식');
});
test('카드 승인 문자 — 신한(붙여쓴 형식)', () => {
  const r = C.parseMessage('신한카드(1234)승인 홍*동 38,900원(일시불)11/18 19:02 맛나식당 누적123,000원', TODAY);
  assert.equal(r.amount, 38900); assert.equal(r.date, '2026-11-18'); assert.equal(r.merchant, '맛나식당');
  assert.equal(r.method, '신한카드(1234)');
  assert.equal(C.categorize(r.merchant).category, '식비');
});
test('할부·삼성카드', () => {
  const r = C.parseMessage('삼성카드(5678) 승인 홍*동 1,290,000원 3개월 11/17 20:10 무신사', TODAY);
  assert.equal(r.amount, 1290000); assert.equal(r.merchant, '무신사');
  assert.equal(C.categorize(r.merchant).category, '쇼핑·의류');
});
test('승인취소는 음수 지출', () => {
  const r = C.parseMessage('[현대카드] 승인취소 홍*동 12,500원 11/19 14:00 스타벅스', TODAY);
  assert.equal(r.cancel, true); assert.equal(r.amount, -12500); assert.equal(r.kind, '지출');
});
test('입금 문자는 수입 + 정기/비정기 추정', () => {
  const r = C.parseMessage('[KB국민] 11/25 09:00 입금 3,200,000원 (주)한빛 급여 잔액5,000,000원', TODAY);
  assert.equal(r.kind, '수입'); assert.equal(r.amount, 3200000);
  assert.equal(C.guessIncomeType(r.merchant + ' 급여'), '정기수입');
  assert.equal(C.guessIncomeType('중고거래 입금'), '비정기수입');
});
test('연말 문자의 12월을 1월에 받으면 작년으로 해석', () => {
  const r = C.parseMessage('[신한카드] 12/31 23:10 승인 5,000원 편의점', '2027-01-01');
  assert.equal(r.date, '2026-12-31');
});
test('금액 없는 문자는 ok=false', () => {
  assert.equal(C.parseMessage('안녕하세요 택배가 도착했습니다', TODAY).ok, false);
  assert.equal(C.parseMessage('', TODAY).ok, false);
});
test('분류: 긴 키워드 우선, 짧은 영문은 단어 경계, 사용자 규칙 우선', () => {
  assert.equal(C.categorize('쿠팡이츠').category, '식비');
  assert.equal(C.categorize('쿠팡').category, '생활용품');
  assert.equal(C.categorize('CU강남점').category, '장보기');
  assert.equal(C.categorize('KTX 예매').category, '교통');
  assert.equal(C.categorize('Cucumber Lab'), null);
  assert.equal(C.categorize('스타벅스', [{ keyword: '스타벅스', category: '교육' }]).category, '교육');
  assert.equal(C.categorize('알수없는가게'), null);
});
test('학습 키워드는 지점명을 떼어낸다', () => {
  assert.equal(C.learnKeyword('스타벅스강남점'), '스타벅스');
  assert.equal(C.learnKeyword('점'), '점');
});
test('주·월 범위와 집계', () => {
  assert.deepEqual(C.weekRange('2026-11-19'), { from: '2026-11-16', to: '2026-11-22' });
  assert.deepEqual(C.monthRange('2026-02-10'), { from: '2026-02-01', to: '2026-02-28' });
  assert.equal(C.addMonths('2026-11-19', 2), '2027-01-01');
  const txs = [
    { date: '2026-11-16', kind: '지출', category: '식비', amount: 10000 },
    { date: '2026-11-22', kind: '지출', category: '교통', amount: 2000 },
    { date: '2026-11-23', kind: '지출', category: '식비', amount: 999 },
    { date: '2026-11-20', kind: '수입', category: '정기수입', amount: 3000000 },
    { date: '2026-11-21', kind: '수입', category: '비정기수입', amount: 50000 },
  ];
  const s = C.summarize(txs, '2026-11-16', '2026-11-22');
  assert.equal(s.expense, 12000); assert.equal(s.regular, 3000000); assert.equal(s.irregular, 50000);
  assert.equal(s.net, 3038000); assert.equal(s.byCategory['식비'], 10000);
});
test('복사본(pwa/core.js, apps-script/Core.gs)이 원본과 같다', () => {
  const src = readFileSync(new URL('./core.js', import.meta.url), 'utf8');
  for (const p of ['../pwa/core.js', '../apps-script/Core.gs']) {
    assert.equal(readFileSync(new URL(p, import.meta.url), 'utf8'), src, p + ' 가 오래됨: node ledger/scripts/sync-core.mjs');
  }
});
