(function () {
  'use strict';
  var C = LedgerCore;
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); };
  var nf = function (n) { return Math.abs(Math.round(n)).toLocaleString('ko-KR'); };
  var won = function (n) { return (n < 0 ? '-' : '') + nf(n) + '원'; };
  var signed = function (n) { return (n > 0 ? '+' : n < 0 ? '-' : '') + nf(n) + '원'; };
  var today = function () { return C.ymd(new Date()); };
  var icon = function (cat) { return C.CATEGORY_ICONS[cat] || '🏷️'; };

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('ledger.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('ledger.' + k, JSON.stringify(v)); } catch (e) { /* 저장 불가 환경 */ } }
  };

  var H = window.LEDGER_HOOKS || {}; // 호스팅 환경(미리보기 등)이 저장/영수증/파일저장을 대신할 때 쓰는 확장점

  var S = {
    txs: store.get('txs', []), deletes: store.get('deletes', []), cfg: store.get('cfg', { url: '', token: '' }),
    rules: store.get('rules', []), cats: store.get('cats', C.EXPENSE_CATEGORIES.slice()),
    sheetUrl: store.get('sheetUrl', ''), ai: store.get('ai', false),
    tab: 'home', listMonth: C.monthRange(today()).from, listKind: '전체', rep: { mode: 'week', anchor: today() }
  };
  function save() { store.set('txs', S.txs); store.set('deletes', S.deletes); }
  function connected() { return !!(S.cfg.url && S.cfg.token); }

  // ───────── 서버 통신 ─────────
  function api(action, payload, timeoutMs) {
    if (!connected()) return Promise.reject(new Error('NOT_CONNECTED'));
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, timeoutMs || 60000);
    var body = Object.assign({ action: action, token: S.cfg.token }, payload || {});
    return fetch(S.cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: ctrl.signal })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || '서버 오류'); return j; })
      .catch(function (e) { throw e.name === 'AbortError' ? new Error('응답 시간이 초과됐어요') : e; })
      .finally(function () { clearTimeout(timer); });
  }

  var flushing = false;
  function flush() {
    if (!connected() || flushing || !navigator.onLine) return Promise.resolve();
    flushing = true;
    var chain = Promise.resolve();
    S.deletes.slice().forEach(function (id) {
      chain = chain.then(function () { return api('delete', { id: id }); }).then(function () { S.deletes = S.deletes.filter(function (x) { return x !== id; }); save(); });
    });
    S.txs.filter(function (t) { return !t.synced; }).forEach(function (t) {
      chain = chain.then(function () {
        var tx = Object.assign({}, t); delete tx.synced; delete tx._learn;
        return api('add', { tx: tx, learn: t._learn || '' });
      }).then(function () { t.synced = true; delete t._learn; save(); });
    });
    return chain.catch(function (e) { console.warn('sync', e); }).finally(function () { flushing = false; paintBadge(); if (!sheetOpen()) render(); });
  }

  function refreshConfig(info) {
    S.cats = info.categories && info.categories.length ? info.categories : S.cats;
    S.rules = info.rules || S.rules; S.sheetUrl = info.sheetUrl || S.sheetUrl; S.ai = !!info.ai;
    store.set('cats', S.cats); store.set('rules', S.rules); store.set('sheetUrl', S.sheetUrl); store.set('ai', S.ai);
  }
  function pull() {
    return api('list', { limit: 1000 }).then(function (r) {
      var have = {}; S.txs.forEach(function (t) { have[t.id] = 1; });
      var n = 0;
      r.txs.forEach(function (t) { if (!have[t.id]) { S.txs.push(Object.assign({}, t, { synced: true })); n++; } });
      save(); return n;
    });
  }

  // ───────── 화면 공통 ─────────
  function toast(msg, ms) {
    var el = $('#toast'); el.textContent = msg; el.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, ms || 2600);
  }
  function sheetOpen() { return !$('#sheet').hidden; }
  function openSheet(html) { var s = $('#sheet'); s.innerHTML = '<div class="panel">' + html + '</div>'; s.hidden = false; return s.firstChild; }
  function closeSheet() { var s = $('#sheet'); s.hidden = true; s.innerHTML = ''; }
  $('#sheet').addEventListener('click', function (e) { if (e.target.id === 'sheet') closeSheet(); });

  function paintBadge() {
    var b = $('#syncBadge'); b.hidden = false;
    if (H.badge) { b.className = 'badge ok'; b.textContent = H.badge; return; }
    if (!connected()) { b.className = 'badge'; b.textContent = '시트 미연결 · 이 기기에만 저장'; return; }
    var pending = S.txs.filter(function (t) { return !t.synced; }).length + S.deletes.length;
    b.className = 'badge' + (pending ? '' : ' ok');
    b.textContent = pending ? '전송 대기 ' + pending + '건' : '구글 시트 연결됨';
  }
  $('#syncBadge').addEventListener('click', function () { if (!connected()) setTab('settings'); else flush(); });

  function setTab(t) {
    S.tab = t;
    document.querySelectorAll('#tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === t); });
    render(); window.scrollTo(0, 0);
  }
  $('#tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setTab(b.dataset.tab); });

  function sorted() {
    return S.txs.slice().sort(function (a, b) { return (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')); });
  }
  function rowHtml(t) {
    var inc = t.kind === '수입';
    var shown = inc ? t.amount : -t.amount;
    var sub = esc(t.category) + (t.method ? ' · ' + esc(t.method) : '') + (t.time ? ' · ' + esc(t.time) : '') +
      (connected() && !t.synced ? ' <span class="unsynced">● 전송 대기</span>' : '');
    return '<div class="row" data-act="edit" data-id="' + esc(t.id) + '"><div class="ic">' + icon(t.category) + '</div>' +
      '<div class="mid"><b>' + esc(t.merchant || t.category) + '</b><small>' + sub + '</small></div>' +
      '<div class="amt ' + (shown > 0 ? 'pos' : '') + '">' + signed(shown) + '</div></div>';
  }
  var PAL = ['#2f7d6b', '#e0a43a', '#d4475b', '#4a7bd0', '#8a5fc4', '#d9772b', '#3aa6b9', '#7a8a52', '#a8798f', '#8c8c8c'];
  function catOrder(byCat) { return Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; }); }
  function man(v) { return v >= 10000 ? (Math.round(v / 1000) / 10).toString().replace(/\.0$/, '') + '만' : String(Math.round(v)); }
  function donut(byCat, total) {
    var keys = catOrder(byCat).filter(function (k) { return byCat[k] > 0; });
    if (!keys.length || total <= 0) return '';
    var R = 52, CIRC = 2 * Math.PI * R, off = 0, segs = '';
    keys.forEach(function (k, i) {
      var len = byCat[k] / total * CIRC;
      segs += '<circle r="' + R + '" cx="70" cy="70" fill="none" stroke="' + PAL[i % PAL.length] + '" stroke-width="22" stroke-dasharray="' + len.toFixed(2) + ' ' + (CIRC - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 70 70)"><title>' + esc(k) + ' ' + nf(byCat[k]) + '원</title></circle>';
      off += len;
    });
    return '<svg viewBox="0 0 140 140" width="150" height="150" role="img" aria-label="분류별 지출 비율" style="flex:none">' + segs +
      '<text x="70" y="66" text-anchor="middle" style="fill:var(--muted);font-size:10px">총지출</text><text x="70" y="84" text-anchor="middle" style="fill:var(--text);font-size:15px;font-weight:800">' + man(total) + '원</text></svg>';
  }
  function barChart(cols, mode) {
    var W = 340, Hh = 176, pl = 38, pb = 24, pt = 12, n = cols.length;
    var max = Math.max.apply(null, cols.map(function (c) { return Math.max(c.s.income, c.s.expense); }).concat([1]));
    var step = Math.pow(10, Math.floor(Math.log10(max))), top = Math.ceil(max / step) * step;
    var ch = Hh - pb - pt, gw = (W - pl - 6) / n, bw = Math.min(16, gw / 2 - 3), svg = '';
    [0, 0.5, 1].forEach(function (f) {
      var y = pt + ch - ch * f;
      svg += '<line x1="' + pl + '" x2="' + (W - 4) + '" y1="' + y + '" y2="' + y + '" style="stroke:var(--line)"/><text x="' + (pl - 5) + '" y="' + (y + 3.5) + '" text-anchor="end" style="fill:var(--muted);font-size:9px">' + (f ? man(top * f) : '0') + '</text>';
    });
    cols.forEach(function (c, i) {
      var cx = pl + gw * i + gw / 2, hi = ch * c.s.income / top, he = ch * c.s.expense / top;
      svg += '<rect x="' + (cx - bw - 1) + '" y="' + (pt + ch - hi) + '" width="' + bw + '" height="' + hi + '" style="fill:var(--income)"' + (c.cur ? '' : ' opacity=".55"') + '><title>수입 ' + nf(c.s.income) + '원</title></rect>' +
        '<rect x="' + (cx + 1) + '" y="' + (pt + ch - he) + '" width="' + bw + '" height="' + he + '" style="fill:var(--expense)"' + (c.cur ? '' : ' opacity=".55"') + '><title>지출 ' + nf(c.s.expense) + '원</title></rect>' +
        '<text x="' + cx + '" y="' + (Hh - 8) + '" text-anchor="middle" style="fill:var(--' + (c.cur ? 'text' : 'muted') + ');font-size:10px;font-weight:' + (c.cur ? 700 : 400) + '">' + esc(mode === 'week' ? label(mode, c.r).split('~')[0] : Number(c.r.from.slice(5, 7)) + '월') + '</text>';
    });
    return '<svg viewBox="0 0 ' + W + ' ' + Hh + '" width="100%" role="img" aria-label="기간별 수입과 지출">' + svg + '</svg>' +
      '<div style="display:flex;gap:14px;font-size:12px;color:var(--muted);justify-content:center"><span><b style="color:var(--income)">■</b> 수입</span><span><b style="color:var(--expense)">■</b> 지출</span></div>';
  }
  function weekStrip() { // 최근 7일 일별 지출
    var days = [], t = today(), mx = 1;
    for (var i = 6; i >= 0; i--) { var d = C.addDays(t, -i); var v = C.summarize(S.txs, d, d).expense; days.push({ d: d, v: v }); mx = Math.max(mx, v); }
    return '<div style="display:flex;align-items:flex-end;gap:8px;height:84px">' + days.map(function (x, i) {
      var h = Math.max(3, Math.round(x.v / mx * 60)), dow = '일월화수목금토'[new Date(x.d + 'T00:00:00').getDay()];
      return '<div style="flex:1;text-align:center;font-size:11px;color:var(--muted)" title="' + nf(x.v) + '원"><div style="height:' + h + 'px;background:var(--' + (i === 6 ? 'accent' : 'accent-soft') + ');margin-bottom:4px;' + (i === 6 ? '' : 'border:1px solid var(--line)') + '"></div>' + dow + '</div>';
    }).join('') + '</div>';
  }
  function catBars(byCat, total) {
    var keys = catOrder(byCat);
    if (!keys.length) return '<div class="empty">아직 지출이 없어요</div>';
    return keys.map(function (k, i) {
      var pct = total > 0 ? Math.max(0, Math.round(byCat[k] / total * 100)) : 0;
      return '<div class="cat"><div class="l"><span>' + icon(k) + ' ' + esc(k) + '</span><span><b>' + nf(byCat[k]) + '원</b> <small style="color:var(--muted)">' + pct + '%</small></span></div><div class="bar"><span style="width:' + pct + '%;background:' + PAL[i % PAL.length] + '"></span></div></div>';
    }).join('');
  }

  // ───────── 홈 ─────────
  function viewHome() {
    var t = today(), w = C.weekRange(t), m = C.monthRange(t);
    var sw = C.summarize(S.txs, w.from, w.to), sm = C.summarize(S.txs, m.from, m.to);
    var recent = sorted().slice(0, 6).map(rowHtml).join('') || '<div class="empty">아래 버튼으로 첫 지출을 기록해 보세요</div>';
    return '<div class="grid2">' +
      '<div class="stat"><small>이번 주 지출</small><b class="neg">' + won(sw.expense) + '</b></div>' +
      '<div class="stat"><small>이번 달 지출</small><b class="neg">' + won(sm.expense) + '</b></div>' +
      '<div class="stat"><small>이번 달 수입</small><b class="pos">' + won(sm.income) + '</b></div>' +
      '<div class="stat"><small>이번 달 남은 돈</small><b>' + won(sm.net) + '</b></div></div>' +
      '<div class="actions">' +
      '<button class="act primary" data-act="receipt"><i>📷</i>영수증 찍기<small>자동으로 읽고 분류</small></button>' +
      '<button class="act" data-act="paste"><i>💬</i>결제 문자 붙여넣기<small>카드·간편결제 내역</small></button>' +
      '<button class="act" data-act="expense"><i>✏️</i>지출 직접 입력<small>현금·기타</small></button>' +
      '<button class="act" data-act="income"><i>💰</i>수입 입력<small>정기 · 비정기</small></button></div>' +
      '<div class="card"><h2>최근 7일 지출</h2>' + weekStrip() + '</div>' +
      '<div class="card"><h2>최근 내역</h2>' + recent + '</div>';
  }

  // ───────── 내역 ─────────
  function viewList() {
    var r = C.monthRange(S.listMonth);
    var items = sorted().filter(function (t) { return t.date >= r.from && t.date <= r.to && (S.listKind === '전체' || t.kind === S.listKind); });
    var s = C.summarize(S.txs, r.from, r.to);
    var html = '<div class="nav"><button data-act="lm-prev" aria-label="이전 달">‹</button><b>' + r.from.slice(0, 4) + '년 ' + Number(r.from.slice(5, 7)) + '월</b><button data-act="lm-next" aria-label="다음 달">›</button></div>' +
      '<div class="seg">' + ['전체', '지출', '수입'].map(function (k) { return '<button data-act="lk" data-k="' + k + '" class="' + (S.listKind === k ? 'on' : '') + '">' + k + '</button>'; }).join('') + '</div>' +
      '<div class="grid2" style="margin-bottom:6px"><div class="stat"><small>지출</small><b class="neg">' + won(s.expense) + '</b></div><div class="stat"><small>수입</small><b class="pos">' + won(s.income) + '</b></div></div>';
    if (!items.length) return html + '<div class="empty">이 달 내역이 없어요</div>';
    var byDay = {};
    items.forEach(function (t) { (byDay[t.date] = byDay[t.date] || []).push(t); });
    Object.keys(byDay).sort().reverse().forEach(function (d) {
      var sum = byDay[d].reduce(function (a, t) { return a + (t.kind === '수입' ? 0 : t.amount); }, 0);
      var dow = '일월화수목금토'[new Date(d + 'T00:00:00').getDay()];
      html += '<div class="day"><span>' + Number(d.slice(5, 7)) + '월 ' + Number(d.slice(8)) + '일 (' + dow + ')</span><span>' + (sum ? '지출 ' + nf(sum) + '원' : '') + '</span></div><div class="card" style="padding:4px 14px">' + byDay[d].map(rowHtml).join('') + '</div>';
    });
    return html;
  }

  // ───────── 정산 (엑셀 스타일) ─────────
  function periodOf(mode, anchor) { return mode === 'week' ? C.weekRange(anchor) : C.monthRange(anchor); }
  function shiftAnchor(mode, anchor, n) { return mode === 'week' ? C.addDays(anchor, 7 * n) : C.addMonths(anchor, n); }
  function label(mode, r) {
    var md = function (s) { return Number(s.slice(5, 7)) + '/' + Number(s.slice(8)); };
    return mode === 'week' ? md(r.from) + '~' + md(r.to) : r.from.slice(2, 4) + '년 ' + Number(r.from.slice(5, 7)) + '월';
  }
  function viewReport() {
    var mode = S.rep.mode, r = periodOf(mode, S.rep.anchor), s = C.summarize(S.txs, r.from, r.to);
    var N = 6, cols = [];
    for (var i = N - 1; i >= 0; i--) { var pr = periodOf(mode, shiftAnchor(mode, S.rep.anchor, -i)); cols.push({ r: pr, s: C.summarize(S.txs, pr.from, pr.to), cur: i === 0 }); }
    var short = function (r) { return mode === 'week' ? label(mode, r).split('~')[0] + '~' : Number(r.from.slice(5, 7)) + '월'; };
    var head = '<th>' + (mode === 'week' ? '주 시작' : '월') + '</th>' + cols.map(function (c) { return '<th>' + short(c.r) + '</th>'; }).join('');
    var line = function (name, fn) { return '<tr><td>' + name + '</td>' + cols.map(function (c) { return '<td' + (c.cur ? ' style="font-weight:700;background:var(--accent-soft)"' : '') + '>' + fn(c.s) + '</td>'; }).join('') + '</tr>'; };
    var allCats = {};
    cols.forEach(function (c) { Object.keys(c.s.byCategory).forEach(function (k) { allCats[k] = 1; }); });
    var catRows = Object.keys(allCats).sort(function (a, b) { return S.cats.indexOf(a) - S.cats.indexOf(b); })
      .map(function (k) { return line(icon(k) + ' ' + esc(k), function (x) { return x.byCategory[k] ? nf(x.byCategory[k]) : '-'; }); }).join('');
    var sheetBtn = S.sheetUrl ? '<a class="btn primary" style="text-align:center;text-decoration:none;display:block;margin-top:4px" href="' + esc(S.sheetUrl) + '" target="_blank" rel="noopener">📗 구글 시트에서 열기</a>' : '';
    return '<div class="seg"><button data-act="rm" data-m="week" class="' + (mode === 'week' ? 'on' : '') + '">주간</button><button data-act="rm" data-m="month" class="' + (mode === 'month' ? 'on' : '') + '">월간</button></div>' +
      '<div class="nav"><button data-act="rp" aria-label="이전">‹</button><b>' + label(mode, r) + (mode === 'week' ? ' (월~일)' : '') + '</b><button data-act="rn" aria-label="다음">›</button></div>' +
      '<div class="grid2"><div class="stat"><small>총수입</small><b class="pos">' + won(s.income) + '</b><small>정기 ' + nf(s.regular) + ' · 비정기 ' + nf(s.irregular) + '</small></div>' +
      '<div class="stat"><small>총지출</small><b class="neg">' + won(s.expense) + '</b><small>순수지 ' + signed(s.net) + '</small></div></div>' +
      '<div class="card" style="margin-top:12px"><h2>분류별 지출</h2><div style="display:flex;justify-content:center;margin-bottom:8px">' + donut(s.byCategory, s.expense) + '</div>' + catBars(s.byCategory, s.expense) + '</div>' +
      '<div class="card"><h2>' + (mode === 'week' ? '최근 6주' : '최근 6개월') + ' 수입 · 지출</h2>' + barChart(cols, mode) + '</div>' +
      '<div class="card"><h2>한눈에 보기 (구글 시트 정산표와 같은 구성)</h2><div class="scroll"><table class="xl"><tr>' + head + '</tr>' +
      line('정기수입', function (x) { return x.regular ? nf(x.regular) : '-'; }) + line('비정기수입', function (x) { return x.irregular ? nf(x.irregular) : '-'; }) +
      line('<b>총지출</b>', function (x) { return x.expense ? nf(x.expense) : '-'; }) + line('<b>순수지</b>', function (x) { return (x.net < 0 ? '-' : '') + nf(x.net); }) +
      '<tr><td colspan="' + (N + 1) + '" style="text-align:left;color:var(--muted);font-size:12px">지출 분류</td></tr>' + catRows + '</table></div></div>' + sheetBtn;
  }

  // ───────── 설정 ─────────
  function viewSettings() {
    var snippet = connected()
      ? 'POST ' + S.cfg.url + '\nContent-Type: text/plain\n\n{"action":"ingest","token":"' + S.cfg.token + '","source":"자동전달","text":"<문자/알림 내용>"}'
      : '(먼저 위에서 시트를 연결하세요)';
    return '<div class="card"><h2>구글 시트 연결</h2>' +
      '<label class="f"><span>웹 앱 URL (Apps Script 배포 주소)</span><input type="url" id="cfgUrl" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(S.cfg.url) + '"></label>' +
      '<label class="f"><span>연결 토큰</span><input type="password" id="cfgToken" autocomplete="off" value="' + esc(S.cfg.token) + '"></label>' +
      '<div class="btns"><button class="btn primary" data-act="connect">저장하고 연결 확인</button></div>' +
      '<p class="hint" style="margin-top:10px">' + (connected() ? (S.ai ? '✅ AI 영수증 인식 사용 중' : '영수증은 폰 안에서 글자를 읽어요 (AI 키 불필요). 가끔 틀릴 수 있으니 저장 전에 확인하세요.') : '연결 방법은 ledger/README.md 를 보세요. 연결 없이도 이 기기에서 쓸 수 있어요.') + '</p></div>' +
      '<div class="card"><h2>데이터</h2><div class="btns" style="flex-wrap:wrap"><button class="btn small" data-act="sync">지금 동기화</button><button class="btn small" data-act="pull">시트에서 불러오기</button><button class="btn small" data-act="csv">CSV 내보내기</button></div>' +
      '<p class="hint" style="margin-top:10px">저장된 내역 ' + S.txs.length + '건 · 학습된 분류 규칙 ' + S.rules.length + '개<br>정기수입(월급 등)은 시트의 <b>정기수입</b> 탭에 적어 두면 매월 자동 등록돼요. 분류 규칙·카테고리도 시트 탭에서 고칠 수 있어요.</p></div>' +
      '<div class="card"><details class="how"><summary>📲 문자·알림 자동 전달 (선택)</summary>' +
      '<p class="hint">결제 문자가 올 때마다 폰이 위 주소로 보내면, 앱을 열지 않아도 읽고·분류하고·시트에 저장돼요.<br>• 안드로이드: MacroDroid/Tasker로 “문자 수신(승인 포함)” → HTTP 요청<br>• 아이폰: 단축어 자동화 “메시지” → URL 콘텐츠 가져오기(POST)</p><pre>' + esc(snippet) + '</pre></details></div>';
  }

  function render() {
    var v = $('#view');
    $('#title').textContent = { home: 'MONEY 다이어리', list: '내역', report: '정산', settings: '설정' }[S.tab];
    v.innerHTML = { home: viewHome, list: viewList, report: viewReport, settings: viewSettings }[S.tab]();
    paintBadge();
    document.querySelectorAll('.scroll').forEach(function (el) { el.scrollLeft = el.scrollWidth; }); // 최신 기간이 보이게
  }

  // ───────── 입력/수정 시트 ─────────
  function blank(kind) { return { kind: kind || '지출', date: today(), time: '', amount: '', merchant: '', category: kind === '수입' ? C.INCOME_IRREGULAR : '기타', method: '', memo: '', source: '직접', categorySource: 'none' }; }

  function openEditor(draft, opts) {
    opts = opts || {};
    var d = Object.assign(blank(draft && draft.kind), draft);
    d.suggested = opts.keepSuggested === false ? '' : (d.kind === '지출' && d.categorySource !== 'none' ? d.category : '');
    var editing = !!d.id;

    function paint() {
      var inc = d.kind === '수입';
      var notes = '';
      if (d.source === '영수증' && !editing) notes = '<p class="hint ai">🧾 영수증에서 읽은 내용이에요. 금액과 분류가 맞는지 확인하세요.</p>';
      else if (d.categorySource === 'ai' && !editing) notes = '<p class="hint ai">🤖 AI가 분류했어요. 틀리면 바꿔 주세요 — 다음부터 기억해요.</p>';
      else if (/^rule/.test(d.categorySource) && !editing) notes = '<p class="hint ai">✨ 자동 분류됨 · ' + esc(d.category) + '</p>';
      else if (d.categorySource === 'default' && !editing) notes = '<p class="hint ai">처음 보는 곳이에요. 분류를 골라 주세요 — 다음부터 기억해요.</p>';
      var catCtl = inc
        ? '<div class="seg">' + [C.INCOME_REGULAR, C.INCOME_IRREGULAR].map(function (k) { return '<button type="button" data-k="' + k + '" class="' + (d.category === k ? 'on' : '') + '">' + icon(k) + ' ' + k + '</button>'; }).join('') + '</div>'
        : '<label class="f"><span>분류</span><select id="fCat">' + S.cats.map(function (c) { return '<option value="' + esc(c) + '"' + (c === d.category ? ' selected' : '') + '>' + icon(c) + ' ' + esc(c) + '</option>'; }).join('') + '</select></label>';
      var p = openSheet('<h3>' + (editing ? '내역 수정' : inc ? '수입 기록' : '지출 기록') + '</h3>' + notes +
        '<div class="seg" id="kindSeg">' + ['지출', '수입'].map(function (k) { return '<button type="button" data-kind="' + k + '" class="' + (d.kind === k ? 'on' : '') + '">' + k + '</button>'; }).join('') + '</div>' +
        '<label class="f"><span>금액 (취소·환불은 -)</span><input class="money" id="fAmt" type="text" inputmode="numeric" placeholder="0" value="' + esc(d.amount === '' ? '' : Number(d.amount).toLocaleString('ko-KR')) + '"></label>' +
        '<label class="f"><span>' + (inc ? '입금처/내용' : '가맹점/내용') + '</span><input type="text" id="fMer" value="' + esc(d.merchant) + '" placeholder="' + (inc ? '예: 회사 급여' : '예: 스타벅스') + '"></label>' +
        (inc ? '<span class="hint">수입 유형</span>' : '') + catCtl +
        '<div class="grid2"><label class="f"><span>날짜</span><input type="date" id="fDate" value="' + esc(d.date) + '"></label>' +
        '<label class="f"><span>결제수단</span><input type="text" id="fMethod" value="' + esc(d.method) + '" placeholder="카드/현금"></label></div>' +
        '<label class="f"><span>메모</span><input type="text" id="fMemo" value="' + esc(d.memo) + '"></label>' +
        '<div class="btns">' + (editing ? '<button class="btn danger" id="fDel">삭제</button>' : '<button class="btn" id="fCancel">취소</button>') + '<button class="btn primary" id="fSave">저장</button></div>');

      function pull() {
        d.merchant = p.querySelector('#fMer').value.trim(); d.date = p.querySelector('#fDate').value || today();
        d.method = p.querySelector('#fMethod').value.trim(); d.memo = p.querySelector('#fMemo').value.trim();
        var a = p.querySelector('#fAmt').value.replace(/[^0-9-]/g, ''); d.amount = a === '' || a === '-' ? '' : parseInt(a, 10);
        var sel = p.querySelector('#fCat'); if (sel) d.category = sel.value;
      }
      p.querySelector('#kindSeg').addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b || b.dataset.kind === d.kind) return;
        pull(); d.kind = b.dataset.kind;
        d.category = d.kind === '수입' ? C.guessIncomeType(d.merchant) : (C.categorize(d.merchant, S.rules) || { category: '기타' }).category;
        d.categorySource = 'none'; d.suggested = ''; paint();
      });
      p.querySelectorAll('.seg button[data-k]').forEach(function (b) { b.addEventListener('click', function () { pull(); d.category = b.dataset.k; paint(); }); });
      var amt = p.querySelector('#fAmt');
      amt.addEventListener('input', function () { var neg = amt.value.trim().charAt(0) === '-'; var n = amt.value.replace(/[^0-9]/g, ''); amt.value = n ? (neg ? '-' : '') + Number(n).toLocaleString('ko-KR') : (neg ? '-' : ''); });
      var cancel = p.querySelector('#fCancel'); if (cancel) cancel.addEventListener('click', closeSheet);
      var del = p.querySelector('#fDel');
      if (del) del.addEventListener('click', function () { if (confirm('이 내역을 삭제할까요?')) { removeTx(d.id); closeSheet(); render(); } });
      p.querySelector('#fSave').addEventListener('click', function () {
        pull();
        if (!d.amount) { toast('금액을 입력해 주세요'); p.querySelector('#fAmt').focus(); return; }
        commit(d, editing); closeSheet();
      });
      if (!editing && !d.amount) amt.focus({ preventScroll: true });
    }
    paint();
  }

  function commit(d, editing) {
    var tx = {
      id: d.id || C.makeId(), date: d.date, time: d.time || '', kind: d.kind, category: d.category,
      merchant: d.merchant, amount: Number(d.amount), method: d.method, memo: d.memo, source: d.source || '직접', synced: false
    };
    // 자동 분류를 사용자가 고쳤다면 규칙으로 학습
    if (tx.kind === '지출' && d.suggested && d.suggested !== tx.category && tx.merchant) {
      var kw = C.learnKeyword(tx.merchant);
      if (kw.length >= 2) {
        tx._learn = kw;
        S.rules = S.rules.filter(function (r) { return r.keyword !== kw; }).concat([{ keyword: kw, category: tx.category }]);
        store.set('rules', S.rules);
      }
    }
    var i = S.txs.findIndex(function (t) { return t.id === tx.id; });
    if (i >= 0) S.txs[i] = tx; else S.txs.push(tx);
    save(); render();
    if (H.onSave) H.onSave(Object.assign({}, tx, { synced: undefined, _learn: undefined }));
    toast((editing ? '수정됨' : '저장됨') + ' · ' + tx.category + (tx._learn ? ' (다음부터 ' + tx._learn + ' 은(는) 이 분류로)' : ''));
    flush();
  }
  function removeTx(id) {
    S.txs = S.txs.filter(function (t) { return t.id !== id; });
    if (connected()) S.deletes.push(id);
    save(); flush();
    if (H.onDelete) H.onDelete(id);
  }

  // ───────── 문자/알림 → 초안 ─────────
  function localDraft(text) {
    var p = C.parseMessage(text, today());
    var d = { kind: p.kind, date: p.date, time: p.time, amount: p.amount || '', merchant: p.merchant, method: p.method, memo: '', source: '문자', category: '기타', categorySource: 'none' };
    if (d.kind === '수입') { d.category = C.guessIncomeType(d.merchant); d.categorySource = 'rule'; return d; }
    var hit = C.categorize(d.merchant, S.rules);
    if (hit) { d.category = hit.category; d.categorySource = hit.source; } else d.categorySource = 'default';
    return d;
  }
  function analyze(text) {
    text = String(text || '').trim();
    if (!text) { toast('내용을 붙여넣어 주세요'); return; }
    var d = localDraft(text);
    var needServer = connected() && S.ai && (!d.amount || !d.merchant || d.categorySource === 'none');
    if (!needServer) return finish(d);
    var p = openSheet('<h3>분석 중…</h3><p class="hint"><span class="spin"></span>AI가 문자를 읽고 있어요</p>');
    api('parse', { text: text }, 30000).then(function (r) { finish(r.draft); }).catch(function () { finish(d); });
    function finish(x) {
      if (!x.amount) toast('금액을 찾지 못했어요. 직접 입력해 주세요');
      openEditor(x);
    }
  }
  function openPaste(prefill) {
    var p = openSheet('<h3>결제 문자·알림 붙여넣기</h3><p class="hint">카드 승인 문자, 은행 입금/출금 문자, 간편결제 알림 내용을 그대로 붙여넣으세요.<br>안드로이드는 문자앱의 <b>공유</b> 버튼 → 가계부로 바로 보낼 수도 있어요.</p>' +
      '<textarea id="pasteBox" placeholder="[KB국민카드] 11/19 13:45 승인 홍*동 12,500원 일시불 스타벅스…">' + esc(prefill || '') + '</textarea>' +
      '<div class="btns"><button class="btn" id="pClip">📋 클립보드</button><button class="btn primary" id="pGo">분석하기</button></div>');
    p.querySelector('#pClip').addEventListener('click', function () {
      if (!navigator.clipboard || !navigator.clipboard.readText) { toast('이 브라우저는 길게 눌러 직접 붙여넣어 주세요'); return; }
      navigator.clipboard.readText().then(function (t) { p.querySelector('#pasteBox').value = t; }).catch(function () { toast('클립보드 권한이 없어요. 길게 눌러 붙여넣어 주세요'); });
    });
    p.querySelector('#pGo').addEventListener('click', function () { analyze(p.querySelector('#pasteBox').value); });
  }

  // ───────── 영수증 사진 ─────────
  function toJpegBase64(file, max) {
    max = max || 1400;
    var load = window.createImageBitmap
      ? createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return viaImg(); })
      : viaImg();
    function viaImg() {
      return new Promise(function (res, rej) {
        var url = URL.createObjectURL(file), img = new Image();
        img.onload = function () { URL.revokeObjectURL(url); res(img); };
        img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('이미지를 열 수 없어요')); };
        img.src = url;
      });
    }
    return load.then(function (img) {
      var w = img.width || img.naturalWidth, h = img.height || img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
      var cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      return cv.toDataURL('image/jpeg', 0.82).split(',')[1];
    });
  }
  function startReceipt() { $('#photo').click(); }
  // 키 없이 폰 안에서 글자 읽기(Tesseract.js, 첫 사용 때 한글 데이터 약 수 MB 내려받음)
  var ocrLoading;
  function loadOcr() {
    if (window.Tesseract) return Promise.resolve();
    return ocrLoading || (ocrLoading = new Promise(function (res, rej) {
      var sc = document.createElement('script');
      sc.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
      sc.onload = res; sc.onerror = function () { ocrLoading = null; rej(new Error('글자 인식 모듈을 불러오지 못했어요. 인터넷 연결을 확인하세요')); };
      document.head.appendChild(sc);
    }));
  }
  function ocrReceipt(file, setMsg) {
    setMsg('글자 인식 모듈 준비 중…');
    return loadOcr().then(function () { return toJpegBase64(file, 1800); }).then(function (b64) {
      return Tesseract.createWorker('kor+eng', 1, { logger: function (m) { if (m.status === 'recognizing text') setMsg('글자 읽는 중… ' + Math.round(m.progress * 100) + '%'); else if (/loading/.test(m.status)) setMsg('한글 데이터 내려받는 중…'); } })
        .then(function (w) { return w.recognize('data:image/jpeg;base64,' + b64).then(function (r) { return w.terminate().then(function () { return r.data.text; }); }); });
    }).then(function (text) {
      var r = C.parseReceiptText(text, today());
      if (!r.ok) throw new Error('영수증에서 금액을 읽지 못했어요. 밝은 곳에서 영수증을 펴고 다시 찍어 주세요.');
      var d = { kind: '지출', amount: r.amount, merchant: r.merchant, date: r.date, time: r.time, method: r.method, memo: '', source: '영수증', category: '기타', categorySource: 'default' };
      var hit = C.categorize(d.merchant, S.rules);
      if (hit) { d.category = hit.category; d.categorySource = hit.source; }
      return d;
    });
  }
  $('#photo').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    var useAi = connected() && S.ai;
    var p = openSheet('<h3>영수증 읽는 중…</h3><p class="hint"><span class="spin"></span><span id="ocrMsg">' + (useAi ? '사진을 AI에게 보내고 있어요 (10~20초)' : '폰에서 직접 글자를 읽어요 (처음엔 1분 정도)') + '</span></p>');
    var setMsg = function (m) { var el = p.querySelector('#ocrMsg'); if (el) el.textContent = m; };
    var job = H.receipt ? H.receipt(f, setMsg) : useAi
      ? toJpegBase64(f).then(function (b64) { return api('receipt', { image: b64, mime: 'image/jpeg' }, 90000); }).then(function (r) { return r.draft; })
      : ocrReceipt(f, setMsg);
    job.then(function (draft) { openEditor(draft); })
      .catch(function (err) {
        var p2 = openSheet('<h3>읽지 못했어요</h3><p class="hint">' + esc(err.message) + '</p><div class="btns"><button class="btn" id="a">직접 입력</button><button class="btn primary" id="b">다시 찍기</button></div>');
        p2.querySelector('#a').addEventListener('click', function () { var d = blank('지출'); d.source = '영수증'; openEditor(d); });
        p2.querySelector('#b').addEventListener('click', function () { closeSheet(); $('#photo').click(); });
      });
  });

  // ───────── 이벤트 위임 ─────────
  function exportCsv() {
    var head = ['날짜', '시간', '구분', '분류', '내용', '금액', '결제수단', '메모', '입력경로'];
    var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var rows = sorted().reverse().map(function (t) { return [t.date, t.time, t.kind, t.category, t.merchant, t.amount, t.method, t.memo, t.source].map(q).join(','); });
    var csv = '\ufeff' + head.join(',') + '\n' + rows.join('\n');
    if (H.saveFile) { H.saveFile('가계부_' + today() + '.csv', csv); return; }
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '가계부_' + today() + '.csv'; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  $('#view').addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el) return;
    var act = el.dataset.act;
    if (act === 'receipt') startReceipt();
    else if (act === 'paste') openPaste();
    else if (act === 'expense') openEditor(blank('지출'));
    else if (act === 'income') openEditor(blank('수입'));
    else if (act === 'edit') { var t = S.txs.find(function (x) { return x.id === el.dataset.id; }); if (t) openEditor(Object.assign({}, t, { categorySource: 'none' })); }
    else if (act === 'lm-prev') { S.listMonth = C.addMonths(S.listMonth, -1); render(); }
    else if (act === 'lm-next') { S.listMonth = C.addMonths(S.listMonth, 1); render(); }
    else if (act === 'lk') { S.listKind = el.dataset.k; render(); }
    else if (act === 'rm') { S.rep.mode = el.dataset.m; S.rep.anchor = today(); render(); }
    else if (act === 'rp') { S.rep.anchor = shiftAnchor(S.rep.mode, S.rep.anchor, -1); render(); }
    else if (act === 'rn') { S.rep.anchor = shiftAnchor(S.rep.mode, S.rep.anchor, 1); render(); }
    else if (act === 'connect') {
      S.cfg = { url: $('#cfgUrl').value.trim(), token: $('#cfgToken').value.trim() }; store.set('cfg', S.cfg);
      if (!connected()) { toast('URL과 토큰을 모두 입력해 주세요'); return; }
      toast('연결 확인 중…');
      api('ping', {}, 30000).then(function (info) { refreshConfig(info); return pull().then(function (n) { toast('연결됨 · 시트에서 ' + n + '건 불러옴'); return flush(); }); })
        .catch(function (err) { toast('연결 실패: ' + err.message, 4500); }).finally(render);
    }
    else if (act === 'sync') { if (!connected()) toast('먼저 시트를 연결하세요'); else flush().then(function () { toast('동기화 완료'); }); }
    else if (act === 'pull') { if (!connected()) toast('먼저 시트를 연결하세요'); else pull().then(function (n) { toast(n + '건 새로 불러왔어요'); render(); }).catch(function (err) { toast(err.message, 4000); }); }
    else if (act === 'csv') exportCsv();
  });

  window.addEventListener('online', flush);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { /* file:// 등에서는 무시 */ });

  // ───────── 시작 ─────────
  render();
  var q = new URLSearchParams(location.search);
  var shared = ['title', 'text', 'url'].map(function (k) { return q.get(k); }).filter(Boolean).join('\n');
  var add = q.get('add');
  if (shared || add) history.replaceState(null, '', location.pathname);
  if (shared) setTimeout(function () { analyze(shared); }, 0);
  else if (add === 'receipt') setTimeout(startReceipt, 0);
  else if (add === 'paste') setTimeout(function () { openPaste(); }, 0);
  else if (add === 'expense') setTimeout(function () { openEditor(blank('지출')); }, 0);
  if (H.load) H.load().then(function (remote) {
    var have = {}; S.txs.forEach(function (t) { have[t.id] = 1; });
    (remote || []).forEach(function (t) { if (!have[t.id]) S.txs.push(Object.assign({}, t, { synced: true })); });
    if (remote && remote.length) S.txs = S.txs.filter(function (t) { return t.source !== '예시'; });
    save(); if (!sheetOpen()) render();
  }).catch(function () { /* 저장소 없음 */ });
  if (connected()) api('ping', {}, 30000).then(refreshConfig).then(pull).then(flush).catch(function () { /* 오프라인 */ }).finally(function () { if (!sheetOpen()) render(); });
})();
