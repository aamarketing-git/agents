/**
 * 순수 로직 (시트·네트워크 없음) — Node 테스트(budget/test)에서도 그대로 불러 씁니다.
 * 날짜는 모두 'yyyy-MM-dd' 문자열, 시간은 'HH:mm' 문자열로 다룹니다.
 */

var EXPENSE_CATS = ['고정비', '식비', '생활·쇼핑', '육아·교육', '교통', '건강', '경조사', '사업경비', '기타'];
var INCOME_CATS = ['사업소득', '근로소득', '기타수입'];

// [대분류, 소분류, 정규식] — 위에서부터 먼저 맞는 것을 씁니다 (편의점을 장보기보다 먼저: '이마트24' ⊃ '마트').
var KEYWORD_RULES = [
  ['식비', '배달', /배달의민족|배민|요기요|쿠팡이츠|땡겨요/i],
  ['식비', '카페', /스타벅스|커피|카페|이디야|메가엠지씨|메가커피|투썸|빽다방|컴포즈|폴바셋|할리스|파리바게|뚜레쥬르|베이커리/i],
  ['식비', '편의점', /GS25|CU|세븐일레븐|이마트24|미니스톱|편의점/i],
  ['식비', '장보기', /이마트(?!24)|홈플러스|롯데마트|마트|컬리|하나로|농협|노브랜드|정육|청과|반찬/i],
  ['식비', '외식', /식당|김밥|분식|치킨|피자|맥도날드|버거|롯데리아|국밥|짜장|중국집|초밥|스시|고기|갈비|냉면|떡볶이|점심|저녁|아침|식사/i],
  ['교통', '대중교통', /KTX|코레일|SRT|지하철|버스|티머니|캐시비|교통/i],
  ['교통', '택시', /택시|카카오T|카카오모빌리티|타다|우티/i],
  ['교통', '자동차', /주유|GS칼텍스|SK에너지|S-OIL|에쓰오일|현대오일|주차|하이패스|세차/i],
  ['고정비', '구독', /넷플릭스|NETFLIX|유튜브|YOUTUBE|멜론|지니뮤직|티빙|웨이브|쿠팡와우|와우멤버십|디즈니|왓챠|애플|APPLE|구글플레이|GOOGLE|구독|네이버플러스/i],
  ['고정비', '통신', /SKT|KT(?!X)|LG\s?U\+|유플러스|알뜰폰|통신/i],
  ['고정비', '주거', /관리비|월세|전기|가스|수도|도시가스/i],
  ['고정비', '보험', /보험|생명|화재/i],
  ['건강', '병원·약국', /약국|병원|의원|치과|한의원|안과|피부과|정형외과/i],
  ['건강', '운동', /헬스|필라테스|요가|수영|스포츠/i],
  ['육아·교육', '육아', /어린이집|유치원|키즈|아기|기저귀|분유|유아|베이비/i],
  ['육아·교육', '교육', /학원|교육|학습지|교재|문구|서점|교보문고|알라딘|예스24/i],
  ['경조사', '경조사', /축의|부의|조의|경조|화환|꽃집|플라워/i],
  ['생활·쇼핑', '온라인쇼핑', /쿠팡|11번가|G마켓|지마켓|옥션|SSG|네이버페이|무신사|에이블리|지그재그|알리|테무/i],
  ['생활·쇼핑', '생활용품', /다이소|올리브영|세탁|생활용품|세제|휴지/i]
];

var INCOME_RULES = [
  ['근로소득', '급여', /급여|월급|상여|봉급/],
  ['기타수입', '환급', /환급|캐시백|이자|환불/]
];

function pad2(n) { return (n < 10 ? '0' : '') + n; }

function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

function parseYmd(s) {
  var p = String(s).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function addDays(s, n) {
  var d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/** 그 주의 월요일 */
function weekStart(s) {
  var d = parseYmd(s);
  var dow = (d.getDay() + 6) % 7; // 월=0 … 일=6
  d.setDate(d.getDate() - dow);
  return ymd(d);
}

function monthKey(s) { return String(s).slice(0, 7); }

function daysInMonth(key) {
  var p = key.split('-');
  return new Date(Number(p[0]), Number(p[1]), 0).getDate();
}

function shiftMonth(key, n) {
  var p = key.split('-');
  var d = new Date(Number(p[0]), Number(p[1]) - 1 + n, 1);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
}

function toInt(s) { return Number(String(s).replace(/[^\d]/g, '')) || 0; }

/**
 * 카드·은행 결제 문자 해석.
 * @return {{ok:boolean, type:string, amount:number, date:string, time:string, merchant:string, method:string, cancel:boolean}}
 */
function parseBankSms(text, now) {
  now = now || new Date();
  var t = String(text || '').replace(/\[Web발신\]/g, '').replace(/\r/g, '').trim();
  var res = { ok: false, type: '지출', amount: 0, date: ymd(now), time: '', merchant: '', method: '', cancel: false };
  if (!t) return res;

  res.cancel = /취소/.test(t);
  var isIncome = /입금/.test(t) && !/승인/.test(t);
  res.type = isIncome ? '수입' : '지출';

  // 금액: '누적'·'잔액' 뒤의 숫자는 제외
  var m, re = /(누적|잔액)?\s*([\d,]{1,15})\s*원/g;
  while ((m = re.exec(t)) !== null) {
    if (!m[1] && toInt(m[2]) > 0) { res.amount = toInt(m[2]); break; }
  }
  if (!res.amount) {
    var b = t.match(/(입금|출금|이체|결제|승인)\s*([\d,]{1,15})/);
    if (b) res.amount = toInt(b[2]);
  }
  if (!res.amount) return res;

  // 날짜·시간 (MM/DD HH:mm) — 연도는 오늘 기준, 미래가 되면 작년
  var dt = t.match(/(\d{1,2})[\/.\-](\d{1,2})\s*(\d{1,2}):(\d{2})/);
  var rest = t;
  if (dt) {
    var d = new Date(now.getFullYear(), Number(dt[1]) - 1, Number(dt[2]));
    if (d.getTime() - now.getTime() > 86400000) d.setFullYear(d.getFullYear() - 1);
    res.date = ymd(d);
    res.time = pad2(Number(dt[3])) + ':' + dt[4];
    rest = t.slice(dt.index + dt[0].length);
  }

  var card = t.match(/([가-힣A-Za-z]{1,8}카드)/);
  var bank = t.match(/(신한|국민|KB|우리|하나|농협|NH|기업|IBK|카카오뱅크|토스뱅크|케이뱅크|SC제일|새마을|우체국|부산|대구|경남|광주|전북|제주|수협)/);
  res.method = card ? card[1] : (bank ? bank[1] : '');

  res.merchant = pickMerchant_(rest) || pickMerchant_(dt ? t.slice(0, dt.index) : '');
  res.ok = true;
  return res;
}

function cleanChunk_(chunk) {
  var c = chunk.split(/누적|잔액|입금|출금|사용|승인|취소/)[0];
  c = c.replace(/[\d,]+\s*원/g, ' ')
    .replace(/일시불|할부\S*|\d+개월|체크|신용/g, ' ')
    .replace(/[가-힣]{1,4}님/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ');
  var tokens = c.split(/\s+/).filter(function (tok) {
    if (!tok) return false;
    if (/\*/.test(tok)) return false;             // 마스킹된 이름·계좌
    if (/^[\d,:\/.\-()]+$/.test(tok)) return false; // 숫자·날짜 조각
    if (/카드$/.test(tok)) return false;
    return true;
  });
  return tokens.join(' ').trim();
}

function pickMerchant_(text) {
  var lines = String(text || '').split(/\n/);
  for (var i = 0; i < lines.length; i++) {
    var c = cleanChunk_(lines[i]);
    if (c) return c;
  }
  return '';
}

/** 결제 문자처럼 보이는지 (한 줄 입력에 문자를 붙여 넣은 경우 구분) */
function looksLikeBankSms(text) {
  var t = String(text || '');
  return /\d{1,2}[\/.\-]\d{1,2}\s*\d{1,2}:\d{2}/.test(t) && /(승인|입금|출금|카드|결제|취소)/.test(t);
}

/**
 * 한 줄 입력 해석: "점심 김밥 4500", "A사 디자인비 입금 150만", "어제 택시 12,000원"
 */
function parseQuickText(text, now) {
  now = now || new Date();
  var t = String(text || '').trim();
  var res = { ok: false, type: '지출', amount: 0, date: ymd(now), time: '', merchant: '' };
  var m = t.match(/(\d[\d,]*(?:\.\d+)?)\s*(만\s*원|만|천\s*원|천|원)?/g);
  if (!m) return res;
  // 가장 뒤에 나오는 금액 표현을 사용
  var last = m[m.length - 1];
  var mm = last.match(/(\d[\d,]*(?:\.\d+)?)\s*(만\s*원|만|천\s*원|천|원)?/);
  var num = Number(mm[1].replace(/,/g, ''));
  var unit = (mm[2] || '').replace(/\s/g, '');
  if (unit.indexOf('만') === 0) num *= 10000;
  else if (unit.indexOf('천') === 0) num *= 1000;
  res.amount = Math.round(num);
  if (!res.amount) return res;
  if (/입금|수입|받음|받았|정산|급여|월급|원고료|용역비|환급/.test(t)) res.type = '수입';
  if (/그제|그저께/.test(t)) res.date = addDays(ymd(now), -2);
  else if (/어제/.test(t)) res.date = addDays(ymd(now), -1);
  res.merchant = t.replace(last, ' ').replace(/오늘|어제|그제|그저께|입금|수입|받음|받았어?|지출/g, ' ').replace(/\s+/g, ' ').trim();
  res.ok = true;
  return res;
}

/**
 * 분류: 내 규칙(학습) → 키워드 → 기타
 * rules: [{keyword, cat, sub, biz}]
 */
function categorize(text, type, rules) {
  var s = String(text || '');
  var list = (rules || []).slice().sort(function (a, b) { return String(b.keyword).length - String(a.keyword).length; });
  for (var i = 0; i < list.length; i++) {
    var k = String(list[i].keyword || '').trim();
    if (k && s.toLowerCase().indexOf(k.toLowerCase()) >= 0) {
      return { cat: list[i].cat, sub: list[i].sub || '', biz: list[i].biz || '', learned: true };
    }
  }
  if (type === '수입') {
    for (var j = 0; j < INCOME_RULES.length; j++) {
      if (INCOME_RULES[j][2].test(s)) return { cat: INCOME_RULES[j][0], sub: INCOME_RULES[j][1], biz: '', learned: false };
    }
    return { cat: '사업소득', sub: '', biz: '사업', learned: false };
  }
  for (var r = 0; r < KEYWORD_RULES.length; r++) {
    if (KEYWORD_RULES[r][2].test(s)) return { cat: KEYWORD_RULES[r][0], sub: KEYWORD_RULES[r][1], biz: '', learned: false };
  }
  return { cat: '기타', sub: '', biz: '', learned: false };
}

function minutesOf_(date, time) {
  var d = parseYmd(date);
  var mins = Math.round(d.getTime() / 60000);
  if (time) {
    var p = time.split(':');
    mins += Number(p[0]) * 60 + Number(p[1]);
  }
  return mins;
}

/**
 * 같은 결제가 다른 경로(문자·메일·사진)로 또 들어왔는지 찾기.
 * groups: [{group, type, date, time, total}]
 */
function findDuplicate(tx, groups, windowMinutes) {
  windowMinutes = windowMinutes || 20;
  var best = null, bestGap = Infinity;
  for (var i = 0; i < groups.length; i++) {
    var g = groups[i];
    if (g.type !== tx.type || Math.abs(g.total) !== Math.abs(tx.total)) continue;
    var gap;
    if (g.time && tx.time) {
      gap = Math.abs(minutesOf_(g.date, g.time) - minutesOf_(tx.date, tx.time));
      if (gap > windowMinutes) continue;
    } else {
      // 한쪽에 시간이 없으면(영수증·메일) 날짜가 하루 이내면 같은 결제로 봄
      gap = Math.abs(minutesOf_(g.date, '') - minutesOf_(tx.date, '')) ;
      if (gap > 1440) continue;
      gap += windowMinutes + 1; // 시간까지 맞는 후보보다 뒤로
    }
    if (gap < bestGap) { best = g; bestGap = gap; }
  }
  return best;
}

/** 품목 합이 총액과 다르면(할인·배송비) 조정 줄을 붙임 */
function balanceItems(items, total) {
  var sum = 0;
  items.forEach(function (it) { sum += Number(it.amount) || 0; });
  var diff = Math.round(total - sum);
  if (items.length && diff !== 0) {
    items.push({ name: diff < 0 ? '할인' : '배송비·기타', amount: diff, cat: items[0].cat, sub: '조정' });
  }
  return items;
}

/* ───────── 집계 ───────── */

/**
 * rows: [{id, date, time, type, cat, sub, amount, merchant, item, biz, group, confirmed}]
 * 금액은 양수(취소는 음수), 구분(type)으로 수입/지출을 나눕니다.
 */
function sumBy_(rows, keyFn) {
  var out = {};
  rows.forEach(function (r) {
    var k = keyFn(r);
    out[k] = (out[k] || 0) + r.amount;
  });
  return out;
}

function inRange_(r, from, to) { return r.date >= from && r.date <= to; }

function periodRange(period, anchor) {
  if (period === 'week') {
    var ws = weekStart(anchor);
    return { from: ws, to: addDays(ws, 6), prevFrom: addDays(ws, -7), prevTo: addDays(ws, -1) };
  }
  if (period === 'day') return { from: anchor, to: anchor, prevFrom: addDays(anchor, -1), prevTo: addDays(anchor, -1) };
  var mk = monthKey(anchor), pk = shiftMonth(mk, -1);
  return {
    from: mk + '-01', to: mk + '-' + pad2(daysInMonth(mk)),
    prevFrom: pk + '-01', prevTo: pk + '-' + pad2(daysInMonth(pk))
  };
}

function computeSummary(rows, period, anchor, today) {
  var R = periodRange(period === 'cat' ? 'month' : period, anchor);
  var cur = rows.filter(function (r) { return inRange_(r, R.from, R.to); });
  var prev = rows.filter(function (r) { return inRange_(r, R.prevFrom, R.prevTo); });
  var exp = cur.filter(function (r) { return r.type === '지출'; });
  var inc = cur.filter(function (r) { return r.type === '수입'; });
  var prevExp = prev.filter(function (r) { return r.type === '지출'; });

  var totalExp = 0, totalInc = 0, fixed = 0;
  exp.forEach(function (r) { totalExp += r.amount; if (r.cat === '고정비') fixed += r.amount; });
  inc.forEach(function (r) { totalInc += r.amount; });

  var byCat = sumBy_(exp, function (r) { return r.cat || '기타'; });
  var prevByCat = sumBy_(prevExp, function (r) { return r.cat || '기타'; });
  var cats = Object.keys(byCat).map(function (k) {
    return { name: k, amount: byCat[k], share: totalExp ? byCat[k] / totalExp : 0, delta: byCat[k] - (prevByCat[k] || 0), biz: k === '사업경비' };
  }).sort(function (a, b) { return b.amount - a.amount; });

  var byIncome = sumBy_(inc, function (r) { return (r.cat || '수입') + ' · ' + (r.merchant || '미지정'); });
  var incomes = Object.keys(byIncome).map(function (k) { return { name: k, amount: byIncome[k] }; })
    .sort(function (a, b) { return b.amount - a.amount; });

  // 일별 합계 (달력·주간 막대)
  var byDay = sumBy_(exp, function (r) { return r.date; });
  var days = [];
  for (var d = R.from; d <= R.to; d = addDays(d, 1)) {
    days.push({ date: d, amount: byDay[d] || 0, future: today ? d > today : false });
  }
  var maxDay = 0;
  days.forEach(function (x) { if (x.amount > maxDay) maxDay = x.amount; });
  days.forEach(function (x) {
    x.level = x.future ? -1 : (x.amount <= 0 ? 0 : (x.amount >= maxDay * 0.66 ? 3 : (x.amount >= maxDay * 0.33 ? 2 : 1)));
  });

  var weekend = 0;
  exp.forEach(function (r) { var w = parseYmd(r.date).getDay(); if (w === 0 || w === 6) weekend += r.amount; });

  var prevTotal = 0;
  prevExp.forEach(function (r) { prevTotal += r.amount; });

  return {
    period: period, from: R.from, to: R.to,
    income: totalInc, expense: totalExp, left: totalInc - totalExp,
    fixed: fixed, variable: totalExp - fixed,
    prevExpense: prevTotal, weekend: weekend,
    cats: cats, incomes: incomes, days: days
  };
}

/** 기록을 시작한 날 이후, 오늘까지 지출이 없는 날 */
function noSpendDays(rows, from, to) {
  var first = null;
  rows.forEach(function (r) { if (!first || r.date < first) first = r.date; });
  if (!first) return [];
  var spent = {};
  rows.forEach(function (r) { if (r.type === '지출' && r.amount > 0) spent[r.date] = true; });
  var out = [];
  for (var d = (from > first ? from : first); d <= to; d = addDays(d, 1)) if (!spent[d]) out.push(d);
  return out;
}

function hourOf_(time) { return time ? Number(String(time).split(':')[0]) : -1; }

/** 새는 곳 찾기: 주말 배달, 심야 결제, 같은 곳 소액 반복 */
function findLeaks(expRows) {
  var leaks = [];
  var delivery = expRows.filter(function (r) { var w = parseYmd(r.date).getDay(); return r.sub === '배달' && (w === 0 || w === 6); });
  if (delivery.length >= 2) {
    leaks.push({ type: 'weekend_delivery', label: '주말 배달', count: delivery.length, amount: total_(delivery) });
  }
  var night = expRows.filter(function (r) { var h = hourOf_(r.time); return h >= 0 && h < 5; });
  if (night.length >= 1) leaks.push({ type: 'late_night', label: '밤 12시 이후 결제', count: night.length, amount: total_(night) });
  var small = {};
  expRows.forEach(function (r) {
    if (r.amount > 0 && r.amount < 10000 && r.merchant) (small[r.merchant] = small[r.merchant] || []).push(r);
  });
  Object.keys(small).forEach(function (k) {
    if (small[k].length >= 3) leaks.push({ type: 'small_repeat', label: k + ' 소액 반복', merchant: k, count: small[k].length, amount: total_(small[k]) });
  });
  return leaks.sort(function (a, b) { return b.amount - a.amount; });
}

function total_(rows) { var s = 0; rows.forEach(function (r) { s += r.amount; }); return s; }

function missionFor(leak) {
  if (!leak) return { type: 'nospend', target: 2, text: '이번 주 무지출 데이 2일 만들기', saving: 0 };
  var avg = leak.count ? leak.amount / leak.count : 0;
  if (leak.type === 'weekend_delivery') {
    var t = Math.max(0, leak.count - 2);
    return { type: 'weekend_delivery', target: t, text: '주말 배달 ' + t + '회 이하', saving: Math.round(avg * (leak.count - t)) };
  }
  if (leak.type === 'late_night') return { type: 'late_night', target: 0, text: '밤 12시 이후 결제 0회', saving: Math.round(leak.amount) };
  var n = Math.max(0, leak.count - 2);
  return { type: 'small_repeat', merchant: leak.merchant, target: n, text: leak.merchant + ' 주 ' + n + '회 이하', saving: Math.round(avg * (leak.count - n)) };
}

/** 진행 중인 미션의 이번 주 횟수 */
function missionProgress(mission, rows, today) {
  if (!mission || !mission.type) return null;
  var ws = weekStart(today), we = addDays(ws, 6);
  var exp = rows.filter(function (r) { return r.type === '지출' && inRange_(r, ws, we); });
  var count;
  if (mission.type === 'weekend_delivery') count = exp.filter(function (r) { var w = parseYmd(r.date).getDay(); return r.sub === '배달' && (w === 0 || w === 6); }).length;
  else if (mission.type === 'late_night') count = exp.filter(function (r) { var h = hourOf_(r.time); return h >= 0 && h < 5; }).length;
  else if (mission.type === 'small_repeat') count = exp.filter(function (r) { return r.merchant === mission.merchant && r.amount < 10000; }).length;
  else count = noSpendDays(rows, ws, today < we ? today : we).length;
  var ok = mission.type === 'nospend' ? count >= mission.target : count <= mission.target;
  return { count: count, target: mission.target, ok: ok };
}

/**
 * 주간 리포트 (지난 한 주 월~일) + 프리랜서 머니 체크 + 장보기 가격 변화
 * settings: {taxRate(%), savingGoal(원)}
 */
function computeWeeklyReport(rows, today, settings, mission) {
  settings = settings || {};
  var thisWs = weekStart(today);
  var from = addDays(thisWs, -7), to = addDays(thisWs, -1);
  var pFrom = addDays(thisWs, -14), pTo = addDays(thisWs, -8);
  var week = rows.filter(function (r) { return r.type === '지출' && inRange_(r, from, to); });
  var prev = rows.filter(function (r) { return r.type === '지출' && inRange_(r, pFrom, pTo); });
  var tw = total_(week), tp = total_(prev);

  // 잘한 점: 가장 많이 줄어든 항목 or 무지출 데이
  var good;
  var cw = sumBy_(week, function (r) { return r.cat; }), cp = sumBy_(prev, function (r) { return r.cat; });
  var bestCat = null, bestDrop = 0;
  Object.keys(cp).forEach(function (k) { var drop = cp[k] - (cw[k] || 0); if (drop > bestDrop) { bestDrop = drop; bestCat = k; } });
  var ns = noSpendDays(rows, from, to).length;
  if (prev.length && tw < tp) good = '지난주보다 ' + won(tp - tw) + ' 덜 썼어요' + (bestCat ? ' (특히 ' + bestCat + ' ' + won(bestDrop) + ' ↓)' : '') + '.';
  else if (bestCat) good = bestCat + ' 지출이 지난주보다 ' + won(bestDrop) + ' 줄었어요.';
  else if (ns > 0) good = '무지출 데이를 ' + ns + '일 만들었어요.';
  else good = '한 주 동안 빠짐없이 기록했어요.';

  var leaks = findLeaks(week);
  var top = leaks[0] || null;
  var leakText = top ? top.label + ' ' + top.count + '회, ' + won(top.amount) + '.' : '눈에 띄게 새는 곳이 없어요.';
  var next = missionFor(top);

  // 프리랜서: 이번 달 써도 되는 돈 = 최근 6개월 평균 수입 − 저축 목표 − 세금 몫 − 이번 달 지출
  var mk = monthKey(today);
  var monthly = {};
  rows.forEach(function (r) { if (r.type === '수입') { var k = monthKey(r.date); monthly[k] = (monthly[k] || 0) + r.amount; } });
  var hist = [];
  for (var i = 1; i <= 6; i++) { var k = shiftMonth(mk, -i); if (monthly[k]) hist.push(monthly[k]); }
  var avgIncome = hist.length ? Math.round(hist.reduce(function (a, b) { return a + b; }, 0) / hist.length) : 0;
  var monthRows = rows.filter(function (r) { return monthKey(r.date) === mk; });
  var bizIncome = total_(monthRows.filter(function (r) { return r.type === '수입' && (r.cat === '사업소득' || r.biz === '사업'); }));
  var rate = Number(settings.taxRate) || 0;
  var tax = Math.round(bizIncome * rate / 100);
  var spent = total_(monthRows.filter(function (r) { return r.type === '지출'; }));
  var base = avgIncome || total_(monthRows.filter(function (r) { return r.type === '수입'; }));
  var canSpend = base ? base - (Number(settings.savingGoal) || 0) - tax - spent : null;

  // 장보기 가격 변화: 같은 품목의 최근 두 번 가격
  var byItem = {};
  rows.forEach(function (r) {
    if (r.type === '지출' && r.item && r.sub !== '조정') (byItem[r.item] = byItem[r.item] || []).push(r);
  });
  var prices = [];
  Object.keys(byItem).forEach(function (k) {
    var list = byItem[k].sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (list.length >= 2) {
      var last = list[list.length - 1], before = list[list.length - 2];
      if (last.amount !== before.amount && last.date >= addDays(today, -60)) prices.push({ item: k, diff: last.amount - before.amount, last: last.amount, date: last.date });
    }
  });
  prices.sort(function (a, b) { return Math.abs(b.diff) - Math.abs(a.diff); });

  return {
    from: from, to: to, total: tw, prevTotal: tp,
    good: good, leak: leakText, leaks: leaks.slice(0, 3), mission: next,
    missionProgress: missionProgress(mission, rows, today),
    money: { avgIncome: avgIncome, months: hist.length, bizIncome: bizIncome, taxRate: rate, tax: tax, spent: spent, canSpend: canSpend, savingGoal: Number(settings.savingGoal) || 0 },
    prices: prices.slice(0, 5)
  };
}

function won(n) {
  n = Math.round(n);
  var sign = n < 0 ? '-' : '';
  n = Math.abs(n);
  if (n >= 10000) {
    var man = n / 10000;
    return sign + (man >= 100 ? Math.round(man) : Math.round(man * 10) / 10) + '만 원';
  }
  return sign + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원';
}

/** CSV 한 줄 */
function csvLine(values) {
  return values.map(function (v) {
    var s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',');
}
