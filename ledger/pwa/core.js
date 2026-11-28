/* Ledger core — PWA와 Google Apps Script가 함께 쓰는 순수 로직 (모듈 없이 동작).
 * 수정 후에는 `node ledger/scripts/sync-core.mjs` 로 복사본을 갱신하세요. */
(function (root) {
  'use strict';

  var INCOME_REGULAR = '정기수입';
  var INCOME_IRREGULAR = '비정기수입';

  var EXPENSE_CATEGORIES = [
    '식비', '카페·간식', '장보기', '교통', '주거·통신', '생활용품', '의료·건강',
    '문화·여가', '쇼핑·의류', '교육', '경조사·선물', '보험·금융', '여행', '기타'
  ];

  var CATEGORY_ICONS = {
    '식비': '🍚', '카페·간식': '☕', '장보기': '🛒', '교통': '🚌', '주거·통신': '🏠',
    '생활용품': '🧴', '의료·건강': '💊', '문화·여가': '🎬', '쇼핑·의류': '👕', '교육': '📚',
    '경조사·선물': '🎁', '보험·금융': '🏦', '여행': '✈️', '기타': '📦',
    '정기수입': '🔁', '비정기수입': '✨'
  };

  // 분류 → 가맹점 키워드. 여러 키워드가 걸리면 "가장 긴 키워드"가 이긴다(쿠팡이츠 > 쿠팡).
  var DEFAULT_RULES = {
    '카페·간식': ['스타벅스', '이디야', '메가커피', '메가MGC', '투썸', '컴포즈', '빽다방', '할리스', '폴바셋', '커피', '카페', '베이커리', '파리바게뜨', '뚜레쥬르', '던킨', '배스킨', '설빙', '디저트', '아이스크림', '도넛', '와플', '떡집'],
    '식비': ['맥도날드', '버거킹', '롯데리아', '맘스터치', 'KFC', '서브웨이', '김밥', '치킨', '피자', '족발', '보쌈', '국밥', '식당', '한식', '중식', '분식', '횟집', '고기', '삼겹', '냉면', '곱창', '배달의민족', '배민', '요기요', '쿠팡이츠', '샤브', '초밥', '마라', '감자탕', '순대', '갈비', '반점', '레스토랑', '뷔페', '주점', '호프', '이자카야', '술집', '칼국수', '파스타', '스시', '돈까스', '밥'],
    '장보기': ['이마트', '홈플러스', '롯데마트', '코스트코', '하나로마트', '마트', '마켓컬리', '컬리', '오아시스', '정육', '과일', '채소', '청과', '수산', '편의점', 'CU', 'GS25', '세븐일레븐', '이마트24', '미니스톱', '반찬'],
    '교통': ['택시', '카카오T', '카카오택시', '지하철', '버스', '티머니', '교통', '코레일', 'KTX', 'SRT', '주유', 'GS칼텍스', 'SK에너지', 'S-OIL', '에쓰오일', '현대오일뱅크', '주차', '하이패스', '톨게이트', '도로공사', '쏘카', '타다', '고속버스', '충전소', '세차', '자동차'],
    '주거·통신': ['월세', '관리비', '전기요금', '한국전력', '한전', '도시가스', '가스공사', '수도요금', '통신', 'SKT', 'KT', 'LG유플러스', '유플러스', '인터넷', '알뜰폰', '아파트', '수도'],
    '생활용품': ['다이소', '쿠팡', '올리브영', '이케아', '무인양품', '리빙', '세탁', '철물', '문구', '알리익스프레스', '테무', '생활', '화장품', '미용', '헤어', '미장원', '이발'],
    '의료·건강': ['병원', '의원', '약국', '치과', '한의원', '내과', '외과', '안과', '피부과', '정형외과', '이비인후과', '소아과', '검진', '헬스', '필라테스', '요가', '메디', '클리닉', '건강'],
    '문화·여가': ['CGV', '메가박스', '롯데시네마', '영화', '넷플릭스', '유튜브', '디즈니', '티빙', '웨이브', '왓챠', '스포티파이', '멜론', '지니뮤직', '노래방', '볼링', '골프', '스크린', '공연', '티켓', '인터파크', '예스24', '교보문고', '영풍문고', '서점', '게임', '스팀', '닌텐도', '플레이스테이션', '당구', 'PC방', '찜질', '목욕', '사우나', '키즈카페'],
    '쇼핑·의류': ['무신사', '지그재그', '에이블리', '유니클로', '자라', 'ZARA', 'H&M', '나이키', '아디다스', '백화점', '신세계', '아울렛', '의류', '신발', '11번가', 'G마켓', '옥션', '네이버쇼핑', '스마트스토어', '쇼핑', '패션', '안경'],
    '교육': ['학원', '학교', '교육', '인강', '클래스101', '탈잉', '유데미', '토익', '어학', '과외', '등록금', '수강', '도서'],
    '경조사·선물': ['축의금', '부의금', '조의금', '경조사', '선물', '화환', '플라워', '꽃집', '기프트', '상품권'],
    '보험·금융': ['보험', '삼성화재', '현대해상', 'DB손해', 'KB손해', '한화생명', '교보생명', '대출', '이자', '수수료', '적금', '카드대금', '연회비', '국세', '지방세', '세금', '과태료'],
    '여행': ['호텔', '모텔', '리조트', '펜션', '숙박', '에어비앤비', '야놀자', '여기어때', '항공', '대한항공', '아시아나', '제주항공', '진에어', '티웨이', '아고다', '부킹닷컴', '트립닷컴', '여행', '렌터카', '면세']
  };

  // ---------- 날짜 도우미 (문자열 'YYYY-MM-DD' 기반, 타임존 영향 없음) ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtUTC(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function parseYmd(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  }
  function ymd(date) { // 로컬 시각 기준 오늘 같은 값이 필요할 때
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }
  function addDays(s, n) { var d = parseYmd(s); d.setUTCDate(d.getUTCDate() + n); return fmtUTC(d); }
  function addMonths(s, n) { // 월 첫날 기준
    var d = parseYmd(s);
    return fmtUTC(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)));
  }
  function weekRange(s) { // 월~일
    var d = parseYmd(s);
    var off = (d.getUTCDay() + 6) % 7;
    var from = addDays(s, -off);
    return { from: from, to: addDays(from, 6) };
  }
  function monthRange(s) {
    var d = parseYmd(s);
    var from = fmtUTC(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
    var to = fmtUTC(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
    return { from: from, to: to };
  }

  // ---------- 자동 분류 ----------
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function keywordMatches(text, kw) {
    var k = kw.toLowerCase();
    if (!k) return false;
    if (/^[a-z0-9&\-. ]+$/.test(k) && k.length <= 3) { // CU, KT 같은 짧은 영문은 단어 경계로
      return new RegExp('(^|[^a-z0-9])' + escRe(k) + '($|[^a-z0-9])').test(text);
    }
    return text.indexOf(k) >= 0;
  }
  function bestMatch(text, pairs) { // pairs: [{keyword, category}]
    var best = null;
    for (var i = 0; i < pairs.length; i++) {
      var p = pairs[i];
      if (keywordMatches(text, p.keyword) && (!best || p.keyword.length > best.keyword.length)) best = p;
    }
    return best;
  }
  function defaultPairs() {
    var out = [];
    Object.keys(DEFAULT_RULES).forEach(function (cat) {
      DEFAULT_RULES[cat].forEach(function (kw) { out.push({ keyword: kw, category: cat }); });
    });
    return out;
  }
  // 사용자 규칙(시트의 '분류규칙' 탭 / 학습 결과)이 기본 사전보다 우선한다.
  function categorize(text, userRules) {
    var t = String(text || '').toLowerCase();
    if (!t) return null;
    var u = bestMatch(t, (userRules || []).filter(function (r) { return r && r.keyword && r.category; }));
    if (u) return { category: u.category, source: 'rule-user', keyword: u.keyword };
    var d = bestMatch(t, defaultPairs());
    if (d) return { category: d.category, source: 'rule', keyword: d.keyword };
    return null;
  }
  function guessIncomeType(text) {
    return /급여|월급|봉급|연금|임대|월세|이자|배당|정기|용돈|수당/.test(String(text || '')) ? INCOME_REGULAR : INCOME_IRREGULAR;
  }
  // 학습용 키워드: '스타벅스강남점' → '스타벅스'
  function learnKeyword(merchant) {
    var m = String(merchant || '').trim();
    var short = m;
    if (/ [가-힣0-9]+(?:지점|점)$/.test(m)) short = m.replace(/ [가-힣0-9]+(?:지점|점)$/, '');
    else if (/[가-힣]{2}(?:지점|점)$/.test(m)) short = m.replace(/[가-힣]{2}(?:지점|점)$/, '');
    short = short.trim();
    return short.length >= 2 ? short : m;
  }

  // ---------- 결제 문자/알림 파싱 ----------
  var NOISE = /승인취소|승인|취소|환불|일시불|할부\s*\d*\s*(?:개월)?|\d+\s*개월|체크카드|신용카드|체크|결제|출금|입금|해외|사용|이용|고객님|님|정상|완료/g;
  var METHOD_RE = /[가-힣A-Za-z]{0,8}(?:카드|뱅크|은행|페이)/;

  function parseMessage(raw, today) {
    today = today || ymd(new Date());
    var text = String(raw == null ? '' : raw).replace(/\r/g, '').trim();
    var res = { ok: false, kind: '지출', amount: 0, merchant: '', date: today, time: '', method: '', cancel: false, confidence: 0 };
    if (!text) return res;

    var body = text.replace(/[\[(](?:Web발신|국제발신|광고)[\])]/g, ' ').replace(/Web발신/g, ' ');
    var cut = body.search(/누적|잔액|잔여|한도|가용/);
    var main = cut > 3 ? body.slice(0, cut) : body;

    var am = /(\d{1,3}(?:,\d{3})+|\d+)\s*원/.exec(main) || /(\d{1,3}(?:,\d{3})+|\d+)\s*원/.exec(body);
    if (am) res.amount = parseInt(am[1].replace(/,/g, ''), 10);

    var income = /입금|급여|월급/.test(main) && !/출금|승인|결제|사용/.test(main);
    res.kind = income ? '수입' : '지출';
    res.cancel = !income && /취소|환불/.test(main);
    if (res.cancel && res.amount) res.amount = -res.amount;

    // 날짜
    var dm, y, mo, d;
    if ((dm = /(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(main))) {
      y = +dm[1]; mo = +dm[2]; d = +dm[3];
    } else if ((dm = /(?:^|[^\d])(\d{1,2})\s*\/\s*(\d{1,2})(?!\d)/.exec(main)) || (dm = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(main))) {
      mo = +dm[1]; d = +dm[2]; y = +today.slice(0, 4);
    }
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      var cand = y + '-' + pad(mo) + '-' + pad(d);
      if (cand > addDays(today, 1) && dm && dm.length === 3 && !/^\d{4}/.test(dm[0].trim())) cand = (y - 1) + cand.slice(4);
      res.date = cand;
    }
    var tm = /(\d{1,2}):(\d{2})/.exec(main);
    if (tm) res.time = pad(+tm[1]) + ':' + tm[2];

    // 결제수단
    var head = main.slice(0, 40);
    var mm = METHOD_RE.exec(head);
    var methodStr = '';
    if (mm) {
      methodStr = mm[0];
      var last4 = /\((\d{4})\)/.exec(head);
      res.method = methodStr + (last4 ? '(' + last4[1] + ')' : '');
    }

    // 가맹점 = 잡음 제거 후 남은 문자열
    var s = main;
    s = s.replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ');
    if (methodStr) s = s.replace(methodStr, ' ');
    s = s.replace(/\d{4}[-./]\d{1,2}[-./]\d{1,2}/g, ' ')
      .replace(/\d{1,2}\s*월\s*\d{1,2}\s*일/g, ' ')
      .replace(/\d{1,2}\s*\/\s*\d{1,2}/g, ' ')
      .replace(/\d{1,2}:\d{2}(?::\d{2})?/g, ' ')
      .replace(/(\d{1,3}(?:,\d{3})+|\d+)\s*원/g, ' ')
      .replace(NOISE, ' ')
      .replace(/[가-힣]\*+[가-힣]?/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s\-:·,.]+|[\s\-:·,.]+$/g, '');
    res.merchant = s.slice(0, 40);

    res.ok = res.amount !== 0;
    res.confidence = res.ok ? (res.merchant ? 0.9 : 0.5) : 0;
    return res;
  }


  // ---------- 영수증 OCR 텍스트 파싱 (AI 없이) ----------
  function parseReceiptText(raw, today) {
    today = today || ymd(new Date());
    var lines = String(raw || '').replace(/\r/g, '').split('\n').map(function (l) { return l.replace(/[ \t]+/g, ' ').trim(); }).filter(Boolean);
    var res = { ok: false, amount: 0, merchant: '', date: today, time: '', method: '', confidence: 0 };
    if (!lines.length) return res;
    var num = function (s) { return parseInt(String(s).replace(/[^0-9]/g, ''), 10) || 0; };
    var amtRe = /(\d{1,3}(?:[,.]\d{3})+|\d{3,9})/g;

    // 금액: 합계 계열 키워드가 있는 줄 우선, 없으면 가장 큰 금액
    var KEY = /합\s*계|총\s*액|결제\s*금액|받을\s*금액|청구\s*금액|승인\s*금액|카드\s*결제|총\s*결제|TOTAL/i;
    var SKIP = /부가세|과세|면세|공급가|VAT|거스름|받은\s*금액|포인트|잔액|전화|TEL|사업자|승인\s*번호|카드\s*번호/i;
    var best = 0, fallback = 0, m;
    lines.forEach(function (l, i) {
      var found = [];
      amtRe.lastIndex = 0;
      while ((m = amtRe.exec(l))) found.push(num(m[1]));
      if (!found.length) return;
      if (KEY.test(l) && !SKIP.test(l)) {
        var v = found[found.length - 1];
        if (!found.length || v < 100) return;
        best = Math.max(best, v);
      } else if (!SKIP.test(l) && !/\d{2,4}[-.\/]\d{1,2}[-.\/]\d{1,2}/.test(l) && !/\d{2,3}-\d{3,4}-\d{4}/.test(l)) {
        found.forEach(function (v) { if (v >= 100 && v < 100000000) fallback = Math.max(fallback, v); });
      }
    });
    res.amount = best || fallback;

    // 날짜/시간
    var dm = /(20\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/.exec(raw) || /(?:^|\D)(\d{2})[-./](\d{1,2})[-./](\d{1,2})(?!\d)/.exec(raw);
    if (dm) {
      var yy = +dm[1] < 100 ? 2000 + (+dm[1]) : +dm[1];
      if (+dm[2] >= 1 && +dm[2] <= 12 && +dm[3] >= 1 && +dm[3] <= 31) res.date = yy + '-' + pad(+dm[2]) + '-' + pad(+dm[3]);
    }
    var tm = /(\d{1,2}):(\d{2})/.exec(raw);
    if (tm && +tm[1] < 24) res.time = pad(+tm[1]) + ':' + tm[2];

    // 결제수단
    if (/현금/.test(raw) && !/카드/.test(raw)) res.method = '현금';
    else { var cm = /(KB국민|국민|신한|삼성|현대|롯데|하나|우리|BC|비씨|NH농협|농협|씨티)\s*카드/.exec(raw); if (cm) res.method = cm[0].replace(/\s+/g, ''); }

    // 상호: '상호/매장명' 라벨 값, 없으면 위쪽에서 숫자·잡음이 적은 첫 줄
    var lab = /(?:상\s*호|매장\s*명|가맹점\s*명?)\s*[:：]?\s*(.+)/.exec(raw);
    var mer = lab ? lab[1].trim() : '';
    if (!mer) {
      for (var i = 0; i < Math.min(lines.length, 8); i++) {
        var l = lines[i];
        if (/[가-힣A-Za-z]{2,}/.test(l) && !/영수증|카드|전표|승인|사업자|전화|TEL|주소|대표|고객|판매|\d{3}-\d{2}-\d{5}/i.test(l) && (l.replace(/[^0-9]/g, '').length / l.length) < 0.3) { mer = l; break; }
      }
    }
    res.merchant = mer.replace(/[\[\]()|_*#~`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
    res.ok = res.amount > 0;
    res.confidence = res.ok ? (res.merchant ? 0.7 : 0.4) : 0;
    return res;
  }

  // ---------- 집계 ----------
  function summarize(txs, from, to) {
    var out = { regular: 0, irregular: 0, income: 0, expense: 0, net: 0, byCategory: {} };
    (txs || []).forEach(function (t) {
      if (!t || t.date < from || t.date > to) return;
      var a = Number(t.amount) || 0;
      if (t.kind === '수입') {
        if (t.category === INCOME_REGULAR) out.regular += a; else out.irregular += a;
        out.income += a;
      } else {
        out.expense += a;
        out.byCategory[t.category || '기타'] = (out.byCategory[t.category || '기타'] || 0) + a;
      }
    });
    out.net = out.income - out.expense;
    return out;
  }

  function makeId() {
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  var api = {
    INCOME_REGULAR: INCOME_REGULAR, INCOME_IRREGULAR: INCOME_IRREGULAR,
    EXPENSE_CATEGORIES: EXPENSE_CATEGORIES, CATEGORY_ICONS: CATEGORY_ICONS, DEFAULT_RULES: DEFAULT_RULES,
    categorize: categorize, guessIncomeType: guessIncomeType, learnKeyword: learnKeyword,
    parseMessage: parseMessage, parseReceiptText: parseReceiptText, summarize: summarize, makeId: makeId,
    ymd: ymd, addDays: addDays, addMonths: addMonths, weekRange: weekRange, monthRange: monthRange
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LedgerCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
