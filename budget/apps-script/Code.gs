/**
 * 찰칵 가계부 — 구글 시트가 곧 데이터베이스인 가계부 앱 (Google Apps Script)
 *
 * 시트 구성
 *  - 원장: 모든 거래 한 줄씩 (한 결제에 품목이 여러 개면 같은 '그룹'으로 여러 줄)
 *  - 규칙: 사용자가 고친 분류를 기억 (키워드 → 대분류)
 *  - 설정: 세금 비율, 저축 목표, 주문 메일 읽기
 *  - 요약-일/주/월/항목: 원장을 QUERY로 자동 집계
 *
 * 설치 방법은 budget/README.md 를 보세요.
 */

var SHEET_LEDGER = '원장';
var SHEET_RULES = '규칙';
var SHEET_SETTINGS = '설정';
var DRIVE_FOLDER_NAME = '찰칵 가계부 영수증';
var MAIL_LABEL = '가계부처리';

var HEADERS = ['ID', '날짜', '시간', '구분', '대분류', '소분류', '금액', '가맹점', '품목', '개인/사업', '결제수단', '출처', '확인', '원본', '메모', '월', '주', '그룹', '등록시각'];
var C = {};
HEADERS.forEach(function (h, i) { C[h] = i; });

var SETTING_ROWS = [
  ['세금비율(%)', 10, '사업소득에서 세금 몫으로 떼어둘 비율'],
  ['월저축목표(원)', 0, '‘이번 달 써도 되는 돈’에서 먼저 빼 둘 금액'],
  ['주문메일읽기', false, '쿠팡·네이버페이·배달앱 주문 메일을 한 시간마다 읽기'],
  ['메일검색어', 'newer_than:3d (from:coupang.com OR from:naverpay OR from:baemin OR from:yogiyo OR from:kurly OR subject:(주문 결제))', 'Gmail 검색어 (고급)'],
  ['온보딩완료', false, '첫 실행 안내를 마쳤는지']
];

/* ───────── 메뉴 · 처음 설정 ───────── */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('가계부')
    .addItem('처음 설정', 'setup')
    .addItem('앱 주소 보기', 'showAppUrl')
    .addSeparator()
    .addItem('주문 메일 지금 읽기', 'scanOrderMails')
    .addToUi();
}

function setup() {
  var ss = SpreadsheetApp.getActive();

  var ledger = ss.getSheetByName(SHEET_LEDGER) || ss.insertSheet(SHEET_LEDGER, 0);
  if (ledger.getLastRow() === 0) ledger.appendRow(HEADERS);
  ledger.setFrozenRows(1);
  ledger.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#E3EEEB');
  // 날짜·시간·월·주는 글자로 저장 (시트가 날짜로 바꾸면서 시간대가 틀어지는 것을 막음)
  ['날짜', '시간', '월', '주'].forEach(function (h) { ledger.getRange(2, C[h] + 1, ledger.getMaxRows() - 1, 1).setNumberFormat('@'); });
  ledger.getRange(2, C['금액'] + 1, ledger.getMaxRows() - 1, 1).setNumberFormat('#,##0');

  var rules = ss.getSheetByName(SHEET_RULES) || ss.insertSheet(SHEET_RULES);
  if (rules.getLastRow() === 0) {
    rules.appendRow(['키워드', '대분류', '소분류', '개인/사업', '메모']);
    rules.setFrozenRows(1);
    rules.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#E3EEEB');
  }

  var st = ss.getSheetByName(SHEET_SETTINGS) || ss.insertSheet(SHEET_SETTINGS);
  if (st.getLastRow() === 0) {
    st.appendRow(['항목', '값', '설명']);
    st.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#E3EEEB');
    SETTING_ROWS.forEach(function (r) { st.appendRow(r); });
  }

  var summaries = [
    ['요약-일', "select B, sum(G) where D='지출' group by B order by B desc label B '날짜', sum(G) '지출'"],
    ['요약-주', "select Q, sum(G) where D='지출' group by Q order by Q desc label Q '주(월요일)', sum(G) '지출'"],
    ['요약-월', "select P, sum(G) where D is not null group by P pivot D order by P desc label P '월'"],
    ['요약-항목', "select E, sum(G) where D='지출' group by E pivot P label E '대분류'"]
  ];
  summaries.forEach(function (s) {
    var sh = ss.getSheetByName(s[0]) || ss.insertSheet(s[0]);
    sh.getRange('A1').setFormula('=QUERY(\'' + SHEET_LEDGER + '\'!A1:S, "' + s[1] + '", 1)');
  });

  getToken_();
  getFolder_();
  var msg = '처음 설정을 마쳤어요.\n\n다음 순서:\n1) 프로젝트 설정 → 스크립트 속성에 ANTHROPIC_API_KEY 추가\n2) 배포 → 새 배포 → 웹 앱 (실행: 나, 액세스: 모든 사용자)\n3) 시트 메뉴 [가계부 → 앱 주소 보기]로 휴대폰에서 열기';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}

function showAppUrl() {
  var url = ScriptApp.getService().getUrl();
  var msg = url
    ? '휴대폰에서 이 주소를 열고 “홈 화면에 추가”하세요. 이 주소는 비밀번호와 같으니 다른 사람과 공유하지 마세요.\n\n' + url + '?k=' + getToken_()
    : '아직 웹 앱으로 배포하지 않았어요. 배포 → 새 배포 → 유형: 웹 앱 (실행: 나, 액세스: 모든 사용자)';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}

/* ───────── 토큰 · 설정 ───────── */

function getToken_() {
  var props = PropertiesService.getScriptProperties();
  var t = props.getProperty('TOKEN');
  if (!t) {
    t = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    props.setProperty('TOKEN', t);
  }
  return t;
}

function checkToken_(k) {
  if (!k || k !== getToken_()) throw new Error('주소가 올바르지 않아요. 시트 메뉴 [가계부 → 앱 주소 보기]의 주소로 열어 주세요.');
}

function getSettings_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_SETTINGS);
  var map = {};
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) { map[r[0]] = r[1]; });
  }
  var bool = function (v) { return v === true || String(v).toUpperCase() === 'TRUE'; };
  return {
    taxRate: Number(map['세금비율(%)'] || 0),
    savingGoal: Number(map['월저축목표(원)'] || 0),
    mailScan: bool(map['주문메일읽기']),
    mailQuery: String(map['메일검색어'] || SETTING_ROWS[3][1]),
    onboarded: bool(map['온보딩완료'])
  };
}

function setSetting_(key, value) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_SETTINGS);
  if (!sh) { setup(); sh = ss.getSheetByName(SHEET_SETTINGS); }
  var keys = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return r[0]; }) : [];
  var i = keys.indexOf(key);
  if (i >= 0) sh.getRange(i + 2, 2).setValue(value);
  else sh.appendRow([key, value, '']);
}

function getFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* 지워졌으면 새로 만듦 */ }
  }
  var f = DriveApp.createFolder(DRIVE_FOLDER_NAME);
  props.setProperty('FOLDER_ID', f.getId());
  return f;
}

function todayStr_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }

function nowStr_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'); }

/* ───────── 원장 읽기 · 쓰기 ───────── */

function ledger_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_LEDGER);
  if (!sh) { setup(); sh = SpreadsheetApp.getActive().getSheetByName(SHEET_LEDGER); }
  return sh;
}

function cellStr_(v, pattern) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), pattern);
  return v === null || v === undefined ? '' : String(v);
}

function readLedger_() {
  var sh = ledger_();
  var values = sh.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var v = values[i];
    if (!v[C['ID']] && !v[C['금액']]) continue;
    rows.push({
      rowIndex: i + 1,
      id: String(v[C['ID']]),
      date: cellStr_(v[C['날짜']], 'yyyy-MM-dd'),
      time: cellStr_(v[C['시간']], 'HH:mm'),
      type: String(v[C['구분']] || '지출'),
      cat: String(v[C['대분류']] || '기타'),
      sub: String(v[C['소분류']] || ''),
      amount: Number(v[C['금액']]) || 0,
      merchant: String(v[C['가맹점']] || ''),
      item: String(v[C['품목']] || ''),
      biz: String(v[C['개인/사업']] || ''),
      method: String(v[C['결제수단']] || ''),
      source: String(v[C['출처']] || ''),
      confirmed: v[C['확인']] === true || String(v[C['확인']]).toUpperCase() === 'TRUE',
      original: String(v[C['원본']] || ''),
      memo: String(v[C['메모']] || ''),
      group: String(v[C['그룹']] || v[C['ID']])
    });
  }
  return rows;
}

function groupsOf_(rows) {
  var map = {}, order = [];
  rows.forEach(function (r) {
    var g = map[r.group];
    if (!g) {
      g = map[r.group] = {
        group: r.group, type: r.type, date: r.date, time: r.time, merchant: r.merchant, method: r.method,
        source: r.source, original: r.original, biz: r.biz, confirmed: true, total: 0, rows: [], rowIndexes: [], hasItems: false
      };
      order.push(g);
    }
    g.total += r.amount;
    g.rows.push(r);
    g.rowIndexes.push(r.rowIndex);
    if (r.item) g.hasItems = true;
    if (!r.confirmed) g.confirmed = false;
  });
  return order;
}

function toClientGroup_(g) {
  return {
    group: g.group, type: g.type, date: g.date, time: g.time, merchant: g.merchant, method: g.method,
    source: g.source, original: g.original, biz: g.biz, confirmed: g.confirmed, total: g.total,
    items: g.rows.map(function (r) { return { id: r.id, name: r.item, amount: r.amount, cat: r.cat, sub: r.sub }; })
  };
}

function rowValues_(tx, it, gid) {
  var w = weekStart(tx.date);
  var v = [];
  v[C['ID']] = Utilities.getUuid().slice(0, 8);
  v[C['날짜']] = tx.date;
  v[C['시간']] = tx.time || '';
  v[C['구분']] = tx.type;
  v[C['대분류']] = it.cat;
  v[C['소분류']] = it.sub || '';
  v[C['금액']] = it.amount;
  v[C['가맹점']] = tx.merchant || '';
  v[C['품목']] = it.name || '';
  v[C['개인/사업']] = it.biz || tx.biz || '개인';
  v[C['결제수단']] = tx.method || '';
  v[C['출처']] = tx.source || '';
  v[C['확인']] = !!tx.confirmed;
  v[C['원본']] = tx.original || '';
  v[C['메모']] = tx.memo || '';
  v[C['월']] = monthKey(tx.date);
  v[C['주']] = w;
  v[C['그룹']] = gid;
  v[C['등록시각']] = nowStr_();
  return v;
}

/** 시트 행이 모자라면 늘리고, 새 행도 날짜·시간을 글자 형식으로 */
function ensureRows_(sh, lastNeeded) {
  var max = sh.getMaxRows();
  if (lastNeeded <= max) return;
  var add = lastNeeded - max + 500;
  sh.insertRowsAfter(max, add);
  ['날짜', '시간', '월', '주'].forEach(function (h) { sh.getRange(max + 1, C[h] + 1, add, 1).setNumberFormat('@'); });
  sh.getRange(max + 1, C['금액'] + 1, add, 1).setNumberFormat('#,##0');
}

function mergeSources_(a, b) {
  var parts = (a ? a.split('+') : []).concat(b ? b.split('+') : []);
  return parts.filter(function (x, i) { return x && parts.indexOf(x) === i; }).join('+');
}

/**
 * 거래 저장. 같은 결제가 다른 경로로 이미 들어와 있으면 합칩니다.
 * tx: {type, date, time, merchant, method, total, items:[{name, amount, cat, sub, biz}], biz, source, original, confirmed, cancel}
 */
function addTransaction_(tx) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = ledger_();
    var recentFrom = addDays(todayStr_(), -60);
    var groups = groupsOf_(readLedger_().filter(function (r) { return r.date >= recentFrom; }));
    var dup = tx.cancel ? null : findDuplicate({ type: tx.type, date: tx.date, time: tx.time, total: tx.total }, groups);
    var gid = Utilities.getUuid().slice(0, 8);
    var hasItems = tx.items.some(function (it) { return it.name; });
    var merged = false;

    if (dup) {
      if (hasItems && !dup.hasItems) {
        // 카드 문자(품목 없음) → 영수증·메일(품목 있음)로 교체, 문자의 시간·결제수단은 살림
        tx.time = tx.time || dup.time;
        tx.date = dup.time ? dup.date : tx.date;
        tx.method = tx.method || dup.method;
        tx.merchant = tx.merchant || dup.merchant;
        tx.source = mergeSources_(dup.source, tx.source);
        tx.original = tx.original || dup.original;
        gid = dup.group;
        dup.rowIndexes.slice().sort(function (a, b) { return b - a; }).forEach(function (ri) { sh.deleteRow(ri); });
        merged = true;
      } else if (!hasItems && dup.hasItems) {
        // 영수증이 먼저, 카드 문자가 나중: 시간·결제수단·출처만 채움
        dup.rowIndexes.forEach(function (ri) {
          if (!dup.time && tx.time) sh.getRange(ri, C['시간'] + 1).setValue(tx.time);
          if (!dup.method && tx.method) sh.getRange(ri, C['결제수단'] + 1).setValue(tx.method);
          sh.getRange(ri, C['출처'] + 1).setValue(mergeSources_(dup.source, tx.source));
        });
        return { group: dup.group, duplicate: true, merged: true };
      } else {
        return { group: dup.group, duplicate: true, merged: false };
      }
    }

    var values = tx.items.map(function (it) { return rowValues_(tx, it, gid); });
    var start = sh.getLastRow() + 1;
    ensureRows_(sh, start + values.length - 1);
    sh.getRange(start, 1, values.length, HEADERS.length).setValues(values);
    return { group: gid, duplicate: false, merged: merged };
  } finally {
    lock.releaseLock();
  }
}

/* ───────── 규칙(학습) ───────── */

function readRules_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_RULES);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues()
    .filter(function (r) { return r[0] && r[1]; })
    .map(function (r) { return { keyword: String(r[0]), cat: String(r[1]), sub: String(r[2] || ''), biz: String(r[3] || '') }; });
}

function upsertRule_(keyword, cat, sub, biz) {
  keyword = String(keyword || '').trim();
  if (keyword.length < 2) return;
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_RULES);
  var last = sh.getLastRow();
  var keys = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return String(r[0]); }) : [];
  var i = keys.indexOf(keyword);
  var row = [keyword, cat, sub || '', biz || '', '앱에서 고침 ' + todayStr_()];
  if (i >= 0) sh.getRange(i + 2, 1, 1, 5).setValues([row]);
  else sh.appendRow(row);
}

/* ───────── 기록 경로: 문자 · 한 줄 · 사진 · 메일 ───────── */

function bizFor_(cat, fallback) {
  if (cat === '사업경비' || cat === '사업소득') return '사업';
  return fallback || '개인';
}

/** 결제 문자나 한 줄 입력을 기록 */
function recordText_(text, source) {
  var now = new Date();
  var rules = readRules_();
  var p, sms = looksLikeBankSms(text);
  if (sms) p = parseBankSms(text, now);
  else p = parseQuickText(text, now);
  if (!p.ok) throw new Error('금액을 찾지 못했어요. 예: 점심 김밥 4500');
  var c = categorize(p.merchant, p.type, rules);
  var amount = p.cancel ? -p.amount : p.amount;
  var tx = {
    type: p.type, date: p.date, time: p.time || (sms ? '' : Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm')),
    merchant: p.merchant, method: p.method || '', total: amount,
    items: [{ name: '', amount: amount, cat: c.cat, sub: p.cancel ? '취소' : c.sub, biz: bizFor_(c.cat, c.biz) }],
    biz: bizFor_(c.cat, c.biz), source: sms ? (source || '결제 문자') : '직접 입력',
    // 직접 쓴 한 줄, 또는 내가 고쳐 둔 규칙에 맞은 문자는 확인된 것으로 봄
    confirmed: !sms || c.learned, cancel: !!p.cancel
  };
  var res = addTransaction_(tx);
  res.parsed = { merchant: p.merchant, amount: amount, cat: c.cat, type: p.type };
  return res;
}

function txFromExtract_(ext, source, original, rules) {
  var type = ext.type === '수입' ? '수입' : '지출';
  var cats = type === '수입' ? INCOME_CATS : EXPENSE_CATS;
  var src = ext.items && ext.items.length ? ext.items : [{ name: ext.merchant, amount: ext.total, category: '', sub: '' }];
  var items = src.map(function (it) {
      var learned = categorize(ext.merchant + ' ' + it.name, type, rules);
      var cat = learned.learned ? learned.cat : (cats.indexOf(it.category) >= 0 ? it.category : categorize(ext.merchant + ' ' + it.name, type, []).cat);
      var biz = learned.learned && learned.biz ? learned.biz : bizFor_(cat, ext.business_likely ? '사업' : '개인');
      return { name: it.name === ext.merchant && src.length <= 1 ? '' : it.name, amount: Math.round(Number(it.amount) || 0), cat: cat, sub: learned.learned ? learned.sub : (it.sub || ''), biz: biz };
    });
  var total = Math.round(Number(ext.total) || 0);
  if (!total) items.forEach(function (it) { total += it.amount; });
  balanceItems(items, total);
  return {
    type: type, date: /^\d{4}-\d{2}-\d{2}$/.test(ext.date) ? ext.date : todayStr_(), time: /^\d{2}:\d{2}$/.test(ext.time) ? ext.time : '',
    merchant: ext.merchant || '', method: ext.payment_method || '', total: total, items: items,
    biz: ext.business_likely ? '사업' : '개인', source: source, original: original || '', confirmed: false
  };
}

/* ───────── 웹 앱 ───────── */

function doGet(e) {
  var k = e && e.parameter ? e.parameter.k : '';
  if (!k || k !== getToken_()) {
    return HtmlService.createHtmlOutput('<p style="font-family:sans-serif;padding:24px;line-height:1.6">가계부 주소가 올바르지 않아요.<br>시트 메뉴 <b>가계부 → 앱 주소 보기</b>의 주소로 열어 주세요.</p>')
      .setTitle('찰칵 가계부').addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  var t = HtmlService.createTemplateFromFile('Index');
  t.k = k;
  return t.evaluate()
    .setTitle('찰칵 가계부')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/** 아이폰 단축어·자동화 앱이 결제 문자를 보내는 곳 */
function doPost(e) {
  var out = function (o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); };
  try {
    var body = {};
    var raw = e && e.postData ? e.postData.contents : '';
    if (raw) { try { body = JSON.parse(raw); } catch (x) { body = { text: raw }; } }
    var params = (e && e.parameter) || {};
    var k = body.token || params.k;
    if (!k || k !== getToken_()) return out({ ok: false, error: 'token' });
    var text = body.text || params.text || '';
    if (!String(text).trim()) return out({ ok: false, error: 'empty' });
    var res = recordText_(String(text), '결제 문자');
    PropertiesService.getScriptProperties().setProperty('LAST_SMS', nowStr_());
    return out({ ok: true, duplicate: res.duplicate, merged: res.merged, parsed: res.parsed });
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err) });
  }
}

/* ───────── 앱에서 부르는 함수 (google.script.run) ───────── */

function apiBootstrap(k) {
  checkToken_(k);
  var ss = SpreadsheetApp.getActive();
  var rows = readLedger_();
  var groups = groupsOf_(rows).sort(function (a, b) { return (b.date + b.time) < (a.date + a.time) ? -1 : 1; });
  var today = todayStr_();
  var props = PropertiesService.getScriptProperties();
  var mission = props.getProperty('MISSION');
  return {
    today: today,
    settings: getSettings_(),
    cats: { expense: EXPENSE_CATS, income: INCOME_CATS },
    pending: groups.filter(function (g) { return !g.confirmed; }).slice(0, 40).map(toClientGroup_),
    recent: groups.filter(function (g) { return g.confirmed; }).slice(0, 15).map(toClientGroup_),
    noSpend: noSpendDays(rows, monthKey(today) + '-01', addDays(today, -1)).length,
    sheet: { url: ss.getUrl(), name: ss.getName(), rows: rows.length, rules: readRules_().length },
    preview: rows.slice(-5).reverse().map(function (r) { return { date: r.date, merchant: r.merchant, item: r.item, cat: r.cat, type: r.type, amount: r.amount }; }),
    hook: { url: ScriptApp.getService().getUrl() || '', token: getToken_() },
    lastSms: props.getProperty('LAST_SMS') || '',
    lastMail: props.getProperty('LAST_MAIL') || '',
    mission: mission ? JSON.parse(mission) : null
  };
}

function apiAddText(k, text) {
  checkToken_(k);
  return recordText_(String(text || ''), '결제 문자');
}

function apiAddImage(k, base64, mime, name, source) {
  checkToken_(k);
  var ok = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
  if (ok.indexOf(mime) < 0) throw new Error('사진(JPG·PNG) 또는 PDF만 올릴 수 있어요.');
  var file = getFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(base64), mime, name || ('영수증-' + nowStr_() + (mime === 'application/pdf' ? '.pdf' : '.jpg'))));
  var rules = readRules_();
  var ext = claudeExtract_([imageBlock_(base64, mime), { type: 'text', text: '이 이미지의 결제 정보를 뽑아 주세요.' }], todayStr_(), rules);
  if (!ext.is_transaction || !ext.total) throw new Error('결제 내역을 찾지 못했어요. 사진은 드라이브 “' + DRIVE_FOLDER_NAME + '” 폴더에 저장했어요.');
  var res = addTransaction_(txFromExtract_(ext, source || '영수증 사진', file.getUrl(), rules));
  var g = groupsOf_(readLedger_().filter(function (r) { return r.group === res.group; }))[0];
  return { duplicate: res.duplicate, merged: res.merged, group: g ? toClientGroup_(g) : null };
}

function apiGetGroup(k, gid) {
  checkToken_(k);
  var g = groupsOf_(readLedger_().filter(function (r) { return r.group === gid; }))[0];
  if (!g) throw new Error('기록을 찾지 못했어요.');
  return toClientGroup_(g);
}

/** patch: {biz:'개인'|'사업', items:[{id, cat}], learn:boolean} */
function apiUpdateGroup(k, gid, patch) {
  checkToken_(k);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = ledger_();
    var rows = readLedger_().filter(function (r) { return r.group === gid; });
    if (!rows.length) throw new Error('기록을 찾지 못했어요.');
    var byId = {};
    (patch.items || []).forEach(function (it) { byId[it.id] = it; });
    rows.forEach(function (r) {
      var p = byId[r.id];
      var cat = p && p.cat ? p.cat : r.cat;
      var sub = cat !== r.cat ? '' : r.sub;
      var biz = patch.biz || r.biz;
      sh.getRange(r.rowIndex, C['대분류'] + 1, 1, 2).setValues([[cat, sub]]);
      sh.getRange(r.rowIndex, C['개인/사업'] + 1).setValue(biz);
      sh.getRange(r.rowIndex, C['확인'] + 1).setValue(true);
      var changed = cat !== r.cat || biz !== r.biz;
      if (patch.learn && changed) {
        var keyword = rows.length === 1 || !r.item ? r.merchant : r.item;
        upsertRule_(keyword, cat, sub, biz);
      }
    });
  } finally {
    lock.releaseLock();
  }
  return true;
}

function apiConfirm(k, gid) {
  checkToken_(k);
  var sh = ledger_();
  readLedger_().forEach(function (r) { if (r.group === gid) sh.getRange(r.rowIndex, C['확인'] + 1).setValue(true); });
  return true;
}

function apiDeleteGroup(k, gid) {
  checkToken_(k);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = ledger_();
    readLedger_().filter(function (r) { return r.group === gid; })
      .map(function (r) { return r.rowIndex; }).sort(function (a, b) { return b - a; })
      .forEach(function (ri) { sh.deleteRow(ri); });
  } finally {
    lock.releaseLock();
  }
  return true;
}

/** period: day|week|month|cat, anchor/day: yyyy-MM-dd */
function apiDashboard(k, period, anchor, day) {
  checkToken_(k);
  var today = todayStr_();
  anchor = anchor || today;
  var rows = readLedger_();
  var s = computeSummary(rows, period === 'day' ? 'month' : period, anchor, today);
  var target = day || anchor;
  s.dayItems = rows.filter(function (r) { return r.date === target; })
    .map(function (r) { return { merchant: r.merchant, item: r.item, cat: r.cat, type: r.type, amount: r.amount, time: r.time }; });
  s.day = target;
  s.noSpend = noSpendDays(rows, s.from, s.to < today ? s.to : addDays(today, -1));
  return s;
}

function apiReport(k) {
  checkToken_(k);
  var raw = PropertiesService.getScriptProperties().getProperty('MISSION');
  return computeWeeklyReport(readLedger_(), todayStr_(), getSettings_(), raw ? JSON.parse(raw) : null);
}

function apiStartMission(k, mission) {
  checkToken_(k);
  var m = { type: mission.type, target: Number(mission.target) || 0, text: String(mission.text || ''), merchant: mission.merchant || '', saving: Number(mission.saving) || 0, start: todayStr_() };
  PropertiesService.getScriptProperties().setProperty('MISSION', JSON.stringify(m));
  return m;
}

/** patch: {taxRate, savingGoal, mailScan, onboarded} */
function apiSaveSettings(k, patch) {
  checkToken_(k);
  if (patch.taxRate !== undefined) setSetting_('세금비율(%)', Math.max(0, Math.min(60, Number(patch.taxRate) || 0)));
  if (patch.savingGoal !== undefined) setSetting_('월저축목표(원)', Math.max(0, Math.round(Number(patch.savingGoal) || 0)));
  if (patch.onboarded !== undefined) setSetting_('온보딩완료', !!patch.onboarded);
  if (patch.mailScan !== undefined) {
    setSetting_('주문메일읽기', !!patch.mailScan);
    setMailTrigger_(!!patch.mailScan);
  }
  return getSettings_();
}

/** kind: 'biz'(올해 사업 관련 수입·경비) | 'all' — 드라이브에 CSV를 만들고 주소를 돌려줌 */
function apiExportCsv(k, kind) {
  checkToken_(k);
  var year = todayStr_().slice(0, 4);
  var rows = readLedger_();
  if (kind === 'biz') rows = rows.filter(function (r) { return r.biz === '사업' && r.date.slice(0, 4) === year; });
  var head = ['날짜', '시간', '구분', '대분류', '소분류', '금액', '가맹점', '품목', '개인/사업', '결제수단', '출처', '원본', '메모'];
  var lines = [csvLine(head)].concat(rows.map(function (r) {
    return csvLine([r.date, r.time, r.type, r.cat, r.sub, r.amount, r.merchant, r.item, r.biz, r.method, r.source, r.original, r.memo]);
  }));
  var name = (kind === 'biz' ? year + '년 사업 수입·경비' : '가계부 전체') + ' ' + todayStr_() + '.csv';
  // 엑셀에서 한글이 깨지지 않도록 BOM을 붙임
  var file = getFolder_().createFile(name, '﻿' + lines.join('\n'), MimeType.CSV);
  return { url: file.getUrl(), name: name, count: rows.length };
}

/* ───────── 주문 메일 읽기 ───────── */

function setMailTrigger_(on) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'scanOrderMails') ScriptApp.deleteTrigger(t);
  });
  if (on) ScriptApp.newTrigger('scanOrderMails').timeBased().everyHours(1).create();
}

function scanOrderMails() {
  var s = getSettings_();
  if (!s.mailScan) return;
  var label = GmailApp.getUserLabelByName(MAIL_LABEL) || GmailApp.createLabel(MAIL_LABEL);
  var threads = GmailApp.search(s.mailQuery + ' -label:' + MAIL_LABEL, 0, 10);
  var rules = readRules_();
  var today = todayStr_();
  threads.forEach(function (th) {
    var msg = th.getMessages().pop();
    var body = msg.getPlainBody() || '';
    // 주문 정보는 메일 앞부분에 있어요. 아주 긴 광고성 본문만 잘라냅니다.
    if (body.length > 60000) body = body.slice(0, 60000);
    try {
      var ext = claudeExtract_([{
        type: 'text',
        text: '다음은 주문·결제 확인 메일입니다. 결제 정보를 뽑아 주세요.\n\n제목: ' + msg.getSubject() + '\n보낸 사람: ' + msg.getFrom() +
          '\n받은 시각: ' + Utilities.formatDate(msg.getDate(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') + '\n\n' + body
      }], today, rules);
      if (ext.is_transaction && ext.total) {
        addTransaction_(txFromExtract_(ext, '주문 메일', 'https://mail.google.com/mail/u/0/#all/' + msg.getId(), rules));
      }
    } catch (e) {
      console.warn('메일 읽기 실패: ' + msg.getSubject() + ' — ' + e.message);
    }
    th.addLabel(label);
  });
  PropertiesService.getScriptProperties().setProperty('LAST_MAIL', nowStr_());
}
