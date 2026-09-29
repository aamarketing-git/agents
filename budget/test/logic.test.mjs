// Apps Script 파일(Logic.gs)을 그대로 불러와 순수 로직을 검사합니다.
// 실행: node --test budget/test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({});
vm.runInContext(readFileSync(new URL('../apps-script/Logic.gs', import.meta.url), 'utf8'), ctx);
const L = ctx;
const NOW = new Date(2026, 8, 28, 21, 0); // 2026-09-28 (월) 21:00

test('신한카드 한 줄 승인 문자', () => {
  const r = L.parseBankSms('[Web발신]\n신한카드(1234)승인 홍*동 12,000원(일시불)09/27 22:14 스타벅스 누적1,234,567원', NOW);
  assert.equal(r.ok, true);
  assert.equal(r.amount, 12000);
  assert.equal(r.date, '2026-09-27');
  assert.equal(r.time, '22:14');
  assert.equal(r.merchant, '스타벅스');
  assert.equal(r.method, '신한카드');
  assert.equal(r.type, '지출');
});

test('여러 줄 카드 문자 (누적 금액 무시)', () => {
  const r = L.parseBankSms('[Web발신]\nKB국민카드1234승인\n홍*동\n38,900원 일시불\n09/27 22:14\n쿠팡\n누적1,234,567원', NOW);
  assert.equal(r.amount, 38900);
  assert.equal(r.merchant, '쿠팡');
  assert.equal(r.method, 'KB국민카드');
});

test('이름님 형식 + 사용', () => {
  const r = L.parseBankSms('[KB국민카드]홍길동님 09/27 22:14 38,900원 일시불 쿠팡 사용', NOW);
  assert.equal(r.amount, 38900);
  assert.equal(r.merchant, '쿠팡');
});

test('은행 입금 문자 (원 없이 금액)', () => {
  const r = L.parseBankSms('[Web발신]\n[신한]09/28 10:02\n110-***-123456\n입금 1,800,000\n잔액 2,345,678\n주식회사에이', NOW);
  assert.equal(r.type, '수입');
  assert.equal(r.amount, 1800000);
  assert.equal(r.merchant, '주식회사에이');
  assert.equal(r.time, '10:02');
});

test('한 줄 은행 입금', () => {
  const r = L.parseBankSms('[KB]09/28 10:02 123456**789 (주)에이디자인 입금 1,800,000 잔액3,000,000', NOW);
  assert.equal(r.type, '수입');
  assert.equal(r.amount, 1800000);
  assert.equal(r.merchant, '(주)에이디자인');
});

test('취소 문자', () => {
  const r = L.parseBankSms('신한카드(1234)취소 홍*동 12,000원 09/27 22:14 스타벅스', NOW);
  assert.equal(r.cancel, true);
  assert.equal(r.merchant, '스타벅스');
});

test('연말에 받은 1월 문자는 작년이 아님 / 미래 날짜는 작년', () => {
  const r = L.parseBankSms('삼성카드 승인 12,000원 12/31 23:50 GS25', new Date(2027, 0, 1, 9, 0));
  assert.equal(r.date, '2026-12-31');
});

test('문자가 아닌 글은 실패', () => {
  assert.equal(L.parseBankSms('안녕하세요', NOW).ok, false);
  assert.equal(L.looksLikeBankSms('점심 김밥 4500'), false);
  assert.equal(L.looksLikeBankSms('신한카드 승인 12,000원 09/27 22:14 스타벅스'), true);
});

test('한 줄 입력', () => {
  let r = L.parseQuickText('점심 김밥 4500', NOW);
  assert.deepEqual([r.amount, r.type, r.merchant, r.date], [4500, '지출', '점심 김밥', '2026-09-28']);
  r = L.parseQuickText('A사 디자인비 입금 150만', NOW);
  assert.deepEqual([r.amount, r.type, r.merchant], [1500000, '수입', 'A사 디자인비']);
  r = L.parseQuickText('어제 택시 12,000원', NOW);
  assert.deepEqual([r.amount, r.date, r.merchant], [12000, '2026-09-27', '택시']);
  assert.equal(L.parseQuickText('메모만', NOW).ok, false);
});

test('분류: 키워드, KTX는 교통, 학습 규칙 우선', () => {
  assert.equal(L.categorize('배달의민족', '지출', []).sub, '배달');
  assert.equal(L.categorize('코레일 KTX', '지출', []).cat, '교통');
  assert.equal(L.categorize('KT 통신요금', '지출', []).cat, '고정비');
  assert.equal(L.categorize('이마트24', '지출', []).sub, '편의점');
  assert.equal(L.categorize('모르는가게', '지출', []).cat, '기타');
  const rules = [{ keyword: '모르는가게', cat: '사업경비', sub: '재료', biz: '사업' }];
  const c = L.categorize('모르는가게 강남점', '지출', rules);
  assert.equal(c.cat, '사업경비');
  assert.equal(c.learned, true);
  assert.equal(L.categorize('급여', '수입', []).cat, '근로소득');
  assert.equal(L.categorize('주식회사에이', '수입', []).cat, '사업소득');
});

test('중복 찾기: 같은 금액 20분 이내, 시간 없는 영수증은 하루 이내', () => {
  const groups = [
    { group: 'g1', type: '지출', date: '2026-09-27', time: '22:14', total: 38900 },
    { group: 'g2', type: '지출', date: '2026-09-27', time: '09:00', total: 38900 },
    { group: 'g3', type: '지출', date: '2026-09-27', time: '22:20', total: 5600 }
  ];
  assert.equal(L.findDuplicate({ type: '지출', date: '2026-09-27', time: '22:20', total: 38900 }, groups).group, 'g1');
  assert.equal(L.findDuplicate({ type: '지출', date: '2026-09-27', time: '', total: 38900 }, groups).group, 'g1');
  assert.equal(L.findDuplicate({ type: '지출', date: '2026-09-27', time: '15:00', total: 38900 }, groups), null);
  assert.equal(L.findDuplicate({ type: '수입', date: '2026-09-27', time: '22:14', total: 38900 }, groups), null);
});

test('품목 합이 다르면 조정 줄', () => {
  const items = L.balanceItems([{ name: 'a', amount: 30000, cat: '육아·교육' }, { name: 'b', amount: 10000, cat: '식비' }], 38900);
  assert.equal(items.length, 3);
  assert.equal(items[2].amount, -1100);
  assert.equal(items[2].name, '할인');
});

function row(date, amount, cat, extra = {}) {
  return { date, amount, cat, type: '지출', sub: '', time: '', merchant: '', item: '', biz: '', ...extra };
}

test('월 요약: 수입·지출·고정비·전월 대비·달력', () => {
  const rows = [
    row('2026-09-01', 980000, '고정비'),
    row('2026-09-27', 38900, '육아·교육'),
    row('2026-08-10', 50000, '식비'),
    row('2026-09-12', 72000, '식비'),
    { ...row('2026-09-28', 1800000, '사업소득'), type: '수입', merchant: '거래처 A' }
  ];
  const s = L.computeSummary(rows, 'month', '2026-09-28', '2026-09-28');
  assert.equal(s.income, 1800000);
  assert.equal(s.expense, 980000 + 38900 + 72000);
  assert.equal(s.fixed, 980000);
  assert.equal(s.cats[0].name, '고정비');
  assert.equal(s.cats.find((c) => c.name === '식비').delta, 22000);
  assert.equal(s.days.length, 30);
  assert.equal(s.days[29].level, -1); // 30일은 미래
  assert.equal(s.incomes[0].name, '사업소득 · 거래처 A');
});

test('주간 요약은 월요일부터', () => {
  const s = L.computeSummary([row('2026-09-27', 10000, '식비')], 'week', '2026-09-24', '2026-09-28');
  assert.equal(s.from, '2026-09-21');
  assert.equal(s.to, '2026-09-27');
  assert.equal(s.weekend, 10000);
});

test('주간 리포트: 주말 배달 누수 → 미션, 세금 몫, 가격 변화', () => {
  const rows = [
    row('2026-09-26', 25000, '식비', { sub: '배달', merchant: '배달의민족' }),
    row('2026-09-27', 29000, '식비', { sub: '배달', merchant: '배달의민족' }),
    row('2026-09-20', 28000, '식비', { sub: '배달', merchant: '배달의민족' }),
    row('2026-09-26', 12000, '식비', { sub: '배달', merchant: '요기요' }),
    row('2026-09-15', 100000, '식비'),
    row('2026-09-02', 2900, '식비', { item: '우유 900ml' }),
    row('2026-09-25', 3200, '식비', { item: '우유 900ml' }),
    { ...row('2026-09-10', 2700000, '사업소득'), type: '수입' },
    { ...row('2026-08-10', 3000000, '사업소득'), type: '수입' },
    { ...row('2026-07-10', 4000000, '사업소득'), type: '수입' }
  ];
  const rep = L.computeWeeklyReport(rows, '2026-09-28', { taxRate: 10, savingGoal: 500000 });
  assert.equal(rep.from, '2026-09-21');
  assert.equal(rep.leaks[0].type, 'weekend_delivery');
  assert.equal(rep.leaks[0].count, 3);
  assert.equal(rep.mission.target, 1);
  assert.equal(rep.money.tax, 270000);
  assert.equal(rep.money.avgIncome, 3500000);
  // 3,500,000 − 500,000 − 270,000 − 이번 달 지출
  const spent = 25000 + 29000 + 28000 + 12000 + 100000 + 2900 + 3200;
  assert.equal(rep.money.canSpend, 3500000 - 500000 - 270000 - spent);
  assert.equal(rep.prices[0].item, '우유 900ml');
  assert.equal(rep.prices[0].diff, 300);
});

test('미션 진행: 이번 주 배달 횟수', () => {
  const rows = [row('2026-10-03', 20000, '식비', { sub: '배달' }), row('2026-10-01', 20000, '식비', { sub: '배달' })];
  const p = L.missionProgress({ type: 'weekend_delivery', target: 1 }, rows, '2026-09-30');
  assert.deepEqual([p.count, p.ok], [1, true]);
});

test('금액 표기', () => {
  assert.equal(L.won(5600), '5,600원');
  assert.equal(L.won(38900), '3.9만 원');
  assert.equal(L.won(2870000), '287만 원');
  assert.equal(L.csvLine(['a,b', 'c"d', 1]), '"a,b","c""d",1');
});
