/**
 * ============================================================
 * 소상공인 주문·결제 시트앱  (토스페이먼츠 연동)  v1.0
 * ============================================================
 *  - 로그인 없음(이름+전화로 조회)
 *  - 사장님이 '상품설정' 시트에 상품명+단가 등록 → 고객은 수량만 선택
 *  - 결제는 토스페이먼츠 (금액은 서버가 '상품설정' 단가로 재계산 → 변조 방지)
 *  - 미네랄 시스템과 완전히 분리된 "새 스프레드시트 + 새 Apps Script"에 넣으세요.
 *
 *  [설치 순서]
 *   1) 새 구글 스프레드시트 생성 → 확장프로그램 > Apps Script
 *   2) 이 코드 전체 붙여넣기 → 저장
 *   3) 아래 TOSS_SECRET_KEY 에 토스 '테스트 시크릿키' 입력 (test_sk_...)
 *   4) 배포 > 새 배포 > 유형:웹앱 > 실행:나, 액세스:모든 사용자 > 배포
 *      → 생성된 /exec URL 을 index.html / success.html / order-status.html 의 API_URL 에 붙여넣기
 *   5) 스프레드시트 새로고침 > '📦 주문관리' 메뉴 > '상품설정 시트 만들기' 실행 후 상품 입력
 * ============================================================
 */

// ★★ 토스 시크릿키 (서버에서만 사용, 외부 노출 안 됨) ★★
//   토스 개발자센터 > 내 개발정보 > API 키 > "테스트" 탭의 '시크릿 키' 복사
var TOSS_SECRET_KEY = 'test_sk_여기에_테스트_시크릿키_붙여넣기';

var ORDER_SHEET   = '신규주문';
var DONE_SHEET    = '완료';
var PRODUCT_SHEET = '상품설정';

// 신규주문/완료 시트 헤더 (18열)
function getHeaders() {
  return ['주문번호','주문일시','상태','주문자명','전화번호','받는분','받는분전화',
          '우편번호','주소','상세주소','배송요청',
          '상품내역','총수량','총금액','결제수단','결제키','영수증URL','승인일시'];
}

// ────────────────────────────────────────────────
// 라우팅
// ────────────────────────────────────────────────
function doGet(e) {
  var result;
  try {
    var action = (e.parameter.action || '').toLowerCase();
    if (action === 'ping') {
      result = { success: true, server: 'shop-order', time: new Date().toISOString() };
    } else if (action === 'products') {
      result = { success: true, products: getProducts() };
    } else if (action === 'order') {
      result = saveOrder(e.parameter);
    } else if (action === 'confirm') {
      result = confirmPayment(e.parameter);
    } else if (action === 'search') {
      result = searchOrders(e.parameter.name, e.parameter.phone);
    } else {
      result = { success: false, error: 'UNKNOWN_ACTION' };
    }
  } catch (err) {
    result = { success: false, error: 'SERVER_ERROR', message: String(err) };
  }
  return jsonp(e, result);
}

// JSONP(callback 있으면) / JSON 응답
function jsonp(e, obj) {
  var json = JSON.stringify(obj);
  var cb = e && e.parameter && e.parameter.callback;
  if (cb) {
    return ContentService.createTextOutput(cb + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

// ────────────────────────────────────────────────
// 상품설정 읽기
//   컬럼: A상품명 B단가 C설명 D판매여부(Y/N) E정렬
// ────────────────────────────────────────────────
function getProducts() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(PRODUCT_SHEET);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  var data = sheet.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][0] || '').trim();
    var price = parseInt(String(data[i][1]).replace(/[^0-9]/g, '')) || 0;
    var desc = String(data[i][2] || '').trim();
    var onSale = String(data[i][3] || 'Y').trim().toUpperCase();
    var order = parseInt(data[i][4]) || (i);
    if (!name || price <= 0) continue;
    if (onSale === 'N') continue;
    list.push({ name: name, price: price, desc: desc, order: order });
  }
  list.sort(function(a, b){ return a.order - b.order; });
  return list;
}

// 상품명 → 단가 맵 (서버측 금액 재계산용, 판매여부 무관하게 전체 조회)
function getPriceMap() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(PRODUCT_SHEET);
  var map = {};
  if (!sheet || sheet.getLastRow() <= 1) return map;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][0] || '').trim();
    var price = parseInt(String(data[i][1]).replace(/[^0-9]/g, '')) || 0;
    if (name && price > 0) map[name] = price;
  }
  return map;
}

// ────────────────────────────────────────────────
// 주문 저장 (상태: 결제대기)  — 금액은 서버가 재계산
//   p.items = JSON [{name, qty}, ...]
// ────────────────────────────────────────────────
function saveOrder(p) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ORDER_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ORDER_SHEET);
    sheet.appendRow(getHeaders());
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,getHeaders().length).setFontWeight('bold').setBackground('#e8f5e9');
  }

  // 입력 검증
  var orderId = String(p.orderId || '').trim();
  var vName   = String(p.ordererName || '').trim();
  var vPhone  = String(p.ordererPhone || '').trim();
  var vRecv   = String(p.receiverName || p.ordererName || '').trim();
  var vRphone = String(p.receiverPhone || p.ordererPhone || '').trim();
  var zip     = String(p.zipcode || '').trim();
  var addr    = String(p.addr || '').trim();
  var addrDt  = String(p.addrDetail || '').trim();
  var memo    = String(p.memo || '').trim();
  var phoneOK = /^01[016789]-?\d{3,4}-?\d{4}$/.test(vPhone.replace(/\s/g,''));

  var items;
  try { items = JSON.parse(p.items || '[]'); } catch (e) { items = []; }
  if (!orderId || !vName || !phoneOK || !vRecv || addr.length < 3 || !items.length) {
    return { success: false, error: 'INVALID_INPUT', message: '필수 입력값이 올바르지 않습니다.' };
  }

  // 중복 주문번호 방지
  if (findRowByOrderId(sheet, orderId) > 0) {
    return { success: false, error: 'DUPLICATE_ORDER', message: '이미 접수된 주문번호입니다.' };
  }

  // ★ 서버측 금액 재계산 (상품설정 단가 기준) — 변조 방지
  var priceMap = getPriceMap();
  var totalQty = 0, totalAmount = 0;
  var lines = [];
  for (var i = 0; i < items.length; i++) {
    var nm = String(items[i].name || '').trim();
    var qty = parseInt(items[i].qty) || 0;
    if (qty <= 0) continue;
    var unit = priceMap[nm];
    if (!unit) return { success: false, error: 'BAD_PRODUCT', message: '상품 정보가 올바르지 않습니다: ' + nm };
    totalQty += qty;
    totalAmount += unit * qty;
    lines.push(nm + ' x' + qty + ' (' + (unit*qty).toLocaleString() + '원)');
  }
  if (totalQty <= 0 || totalAmount <= 0) {
    return { success: false, error: 'EMPTY_ORDER', message: '주문 수량을 확인해주세요.' };
  }

  var now = new Date();
  var rowData = [
    orderId, now, '결제대기', vName, vPhone, vRecv, vRphone,
    zip, addr, addrDt, memo,
    lines.join(' / '), totalQty, totalAmount, '', '', '', ''
  ];
  sheet.appendRow(rowData);

  return { success: true, orderId: orderId, amount: totalAmount, qty: totalQty };
}

// ────────────────────────────────────────────────
// 결제 승인 (토스 confirm) → 상태 결제완료
// ────────────────────────────────────────────────
function confirmPayment(p) {
  var paymentKey = String(p.paymentKey || '').trim();
  var orderId    = String(p.orderId || '').trim();
  var amount      = parseInt(p.amount) || 0;
  if (!paymentKey || !orderId || !amount) {
    return { success: false, error: 'INVALID_INPUT', message: '결제 정보가 올바르지 않습니다.' };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ORDER_SHEET);
  var rowNum = sheet ? findRowByOrderId(sheet, orderId) : -1;
  if (rowNum < 0) {
    return { success: false, error: 'ORDER_NOT_FOUND', message: '주문을 찾을 수 없습니다.' };
  }

  // 이미 결제완료면(새로고침 등) 그대로 성공 반환 (중복 승인 방지)
  var curStatus = String(sheet.getRange(rowNum, 3).getValue()).trim();
  var savedAmount = parseInt(sheet.getRange(rowNum, 14).getValue()) || 0;
  if (curStatus === '결제완료') {
    return { success: true, already: true, order: readOrderRow(sheet, rowNum) };
  }

  // 금액 변조 체크 (저장된 서버 금액과 일치해야 함)
  if (savedAmount !== amount) {
    return { success: false, error: 'AMOUNT_MISMATCH', message: '결제 금액이 주문 금액과 일치하지 않습니다.' };
  }

  // 토스 결제 승인 API 호출
  var res = UrlFetchApp.fetch('https://api.tosspayments.com/v1/payments/confirm', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Basic ' + Utilities.base64Encode(TOSS_SECRET_KEY + ':') },
    payload: JSON.stringify({ paymentKey: paymentKey, orderId: orderId, amount: amount }),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  var body = {};
  try { body = JSON.parse(res.getContentText()); } catch (e) {}

  if (code !== 200) {
    // 승인 실패 → 상태 결제실패 표시
    sheet.getRange(rowNum, 3).setValue('결제실패');
    return { success: false, error: 'TOSS_FAIL', code: (body.code || code), message: (body.message || '결제 승인에 실패했습니다.') };
  }

  // 승인 성공 → 시트 업데이트
  var method  = body.method || '';
  var receipt = (body.receipt && body.receipt.url) ? body.receipt.url : '';
  var approvedAt = body.approvedAt || new Date().toISOString();
  sheet.getRange(rowNum, 3).setValue('결제완료');            // 상태
  sheet.getRange(rowNum, 15).setValue(method);               // 결제수단
  sheet.getRange(rowNum, 16).setValue(paymentKey);           // 결제키
  sheet.getRange(rowNum, 17).setValue(receipt);              // 영수증URL
  sheet.getRange(rowNum, 18).setValue(approvedAt);           // 승인일시

  return { success: true, order: readOrderRow(sheet, rowNum) };
}

// ────────────────────────────────────────────────
// 이름 + 전화 조회
// ────────────────────────────────────────────────
function searchOrders(name, phone) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var vName = String(name || '').trim();
  var vPhone = String(phone || '').replace(/[^0-9]/g, '');
  if (!vName || !vPhone) return { success: true, orders: [] };

  var orders = [];
  var sheets = [ORDER_SHEET, DONE_SHEET];
  for (var s = 0; s < sheets.length; s++) {
    var sheet = ss.getSheetByName(sheets[s]);
    if (!sheet || sheet.getLastRow() <= 1) continue;
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var rName = String(data[i][3] || '').trim();
      var rPhone = String(data[i][4] || '').replace(/[^0-9]/g, '');
      if (rName === vName && rPhone === vPhone) {
        orders.push({
          orderId: String(data[i][0] || ''),
          date: fmtDate(data[i][1]),
          status: String(data[i][2] || ''),
          receiver: String(data[i][5] || ''),
          addr: String(data[i][8] || '') + ' ' + String(data[i][9] || ''),
          items: String(data[i][11] || ''),
          totalQty: data[i][12] || 0,
          totalAmount: data[i][13] || 0,
          method: String(data[i][14] || ''),
          receipt: String(data[i][16] || '')
        });
      }
    }
  }
  // 최신순
  orders.sort(function(a,b){ return (a.date < b.date) ? 1 : -1; });
  return { success: true, orders: orders };
}

// ────────────────────────────────────────────────
// 유틸
// ────────────────────────────────────────────────
function findRowByOrderId(sheet, orderId) {
  if (!sheet || sheet.getLastRow() <= 1) return -1;
  var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === orderId) return i + 2;
  }
  return -1;
}

function readOrderRow(sheet, rowNum) {
  var r = sheet.getRange(rowNum, 1, 1, getHeaders().length).getValues()[0];
  return {
    orderId: String(r[0] || ''),
    date: fmtDate(r[1]),
    status: String(r[2] || ''),
    ordererName: String(r[3] || ''),
    receiver: String(r[5] || ''),
    addr: String(r[8] || '') + ' ' + String(r[9] || ''),
    items: String(r[11] || ''),
    totalQty: r[12] || 0,
    totalAmount: r[13] || 0,
    method: String(r[14] || ''),
    receipt: String(r[16] || '')
  };
}

function fmtDate(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
  return String(v || '');
}

// ────────────────────────────────────────────────
// 메뉴 / 초기 세팅
// ────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi().createMenu('📦 주문관리')
    .addItem('상품설정 시트 만들기', 'setupProductSheet')
    .addItem('신규주문 시트 만들기', 'setupOrderSheet')
    .addSeparator()
    .addItem('결제완료 주문 → 완료 이동', 'moveDoneOrders')
    .addToUi();
}

function setupOrderSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  [ORDER_SHEET, DONE_SHEET].forEach(function(nm){
    var sh = ss.getSheetByName(nm);
    if (!sh) { sh = ss.insertSheet(nm); sh.appendRow(getHeaders()); sh.setFrozenRows(1);
      sh.getRange(1,1,1,getHeaders().length).setFontWeight('bold').setBackground('#e8f5e9'); }
  });
  SpreadsheetApp.getUi().alert('신규주문 / 완료 시트 준비 완료');
}

function setupProductSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(PRODUCT_SHEET);
  if (!sheet) sheet = ss.insertSheet(PRODUCT_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['상품명','단가','설명','판매여부(Y/N)','정렬']);
    sheet.appendRow(['오륜미네랄 1박스', 30000, '프리미엄 이온 미네랄', 'Y', 1]);
    sheet.appendRow(['상품2 (이름 수정)', 15000, '설명 입력', 'Y', 2]);
    sheet.appendRow(['상품3 (이름 수정)', 20000, '설명 입력', 'Y', 3]);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,5).setFontWeight('bold').setBackground('#ede7f6');
    sheet.setColumnWidth(1, 220); sheet.setColumnWidth(3, 240);
  }
  SpreadsheetApp.getUi().alert('상품설정 시트 준비 완료\n\n상품명·단가를 수정/추가하세요.\n판매여부 N 은 주문서에서 숨겨집니다.');
}

// 결제완료 건을 완료 시트로 이동 (선택 기능)
function moveDoneOrders() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName(ORDER_SHEET);
  var dst = ss.getSheetByName(DONE_SHEET);
  if (!src || src.getLastRow() <= 1) { SpreadsheetApp.getUi().alert('신규주문이 없습니다.'); return; }
  if (!dst) { dst = ss.insertSheet(DONE_SHEET); dst.appendRow(getHeaders()); dst.setFrozenRows(1); }
  var data = src.getDataRange().getValues();
  var moved = 0, delRows = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][2]).trim() === '결제완료') {
      dst.appendRow(data[i]); delRows.push(i + 1); moved++;
    }
  }
  for (var d = delRows.length - 1; d >= 0; d--) src.deleteRow(delRows[d]);
  SpreadsheetApp.getUi().alert(moved + '건을 완료 시트로 이동했습니다.');
}
