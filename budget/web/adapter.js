/*
 * 찰칵 가계부 — 바로 쓰는 웹 판 어댑터
 * Apps Script 판의 서버 함수(api*)를 브라우저 안에서 같은 모양으로 구현합니다.
 * 화면(Index.html)과 로직(Logic.gs)은 구글 시트 판과 그대로 공유합니다.
 *
 * 저장: claude.ai 안에서는 이 앱의 저장소(db), 그 밖에서는 브라우저(localStorage)
 * 영수증 읽기: claude.ai 안에서 내 Claude 계정(sample)
 * 내보내기: CSV 저장(downloads), 구글 시트로 보내기(Google Drive 커넥터)
 */
(function () {
  var LS_KEY = 'chalkak-budget-v1';
  var mem = { groups: {}, rules: [], settings: { taxRate: 10, savingGoal: 0, onboarded: false, mission: null } };
  var mode = 'memory'; // db | local | memory
  var db = null;
  var listeners = [];
  var notifyTimer = null;

  function notify() {
    clearTimeout(notifyTimer);
    notifyTimer = setTimeout(function () { listeners.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); }, 200);
  }

  // claude.ai 밖(직접 배포한 사이트 등)에서 열렸는지
  var STANDALONE = !(window.claude && typeof window.claude.use === 'function');

  window.BUDGET_ENV = {
    mode: 'web',
    standalone: STANDALONE,
    subscribe: function (f) { listeners.push(f); },
    photoNote: STANDALONE
      ? '사진·캡처 읽기는 이 앱을 배포한 서버(Claude API)가 해요. 비밀번호를 정해 배포했다면 ‘내 데이터 → 설정’에 넣어 주세요.'
      : '사진·캡처 읽기는 claude.ai에서 열었을 때 내 Claude 계정으로 동작해요. 처음 한 번 허용을 물어요.'
  };

  // 사진 입력은 이미지로 한정 (PDF는 구글 시트 판에서)
  try { document.getElementById('filePick').setAttribute('accept', 'image/*'); } catch (e) { /* 입력이 아직 없으면 무시 */ }

  /* ---------- 저장소 ---------- */
  function capability(name) {
    var c = window.claude;
    if (!c || typeof c.use !== 'function') return Promise.resolve(null);
    return c.use(name).catch(function () { return null; });
  }

  function loadLocal() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        mem.groups = d.groups || {};
        mem.rules = d.rules || [];
        mem.settings = Object.assign(mem.settings, d.settings || {});
      }
      localStorage.setItem(LS_KEY + '-probe', '1');
      localStorage.removeItem(LS_KEY + '-probe');
      return true;
    } catch (e) { return false; }
  }
  function saveLocal() {
    if (mode !== 'local') return;
    try { localStorage.setItem(LS_KEY, JSON.stringify(mem)); } catch (e) { /* 저장 불가: 메모리로만 유지 */ }
  }

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  var ready = capability('db').then(function (d) {
    if (!d) { mode = loadLocal() ? 'local' : 'memory'; return; }
    db = d;
    mode = 'db';
    return new Promise(function (resolve) {
      var waiting = 3;
      var first = { tx: true, rules: true, settings: true };
      function arrived(key) { if (first[key]) { first[key] = false; if (--waiting === 0) resolve(); } else notify(); }
      db.collection('tx').orderBy('date', 'desc').limit(1000).onSnapshot(function (snap) {
        var g = {};
        snap.docs.forEach(function (doc) { var v = doc.data(); if (v) { g[doc.id] = clone(v); g[doc.id].id = doc.id; } });
        mem.groups = g;
        arrived('tx');
      }, function () { arrived('tx'); });
      db.doc('meta/rules').onSnapshot(function (snap) {
        var v = snap.exists ? snap.data() : null;
        mem.rules = v && v.list ? clone(v.list) : [];
        arrived('rules');
      }, function () { arrived('rules'); });
      db.doc('meta/settings').onSnapshot(function (snap) {
        if (snap.exists) mem.settings = Object.assign({ taxRate: 10, savingGoal: 0, onboarded: false, mission: null }, clone(snap.data()));
        arrived('settings');
      }, function () { arrived('settings'); });
    });
  });

  function dbError(e) {
    if (e && e.code === 'quota_exceeded') return new Error('저장 공간이 가득 찼어요 (최대 5,000건). 오래된 기록을 CSV로 받은 뒤 지워 주세요.');
    if (e && (e.code === 'revoked' || e.code === 'not_granted')) return new Error('저장할 수 없어요. 페이지를 새로 열어 주세요.');
    return new Error('저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  }
  function putGroup(g) {
    mem.groups[g.id] = g;
    if (mode === 'db') {
      var body = clone(g); delete body.id;
      return db.doc('tx/' + g.id).set(body).catch(function (e) { throw dbError(e); });
    }
    saveLocal();
    return Promise.resolve();
  }
  function removeGroup(id) {
    delete mem.groups[id];
    if (mode === 'db') return db.doc('tx/' + id).delete().catch(function (e) { throw dbError(e); });
    saveLocal();
    return Promise.resolve();
  }
  function putRules() {
    if (mode === 'db') return db.doc('meta/rules').set({ list: clone(mem.rules) }).catch(function (e) { throw dbError(e); });
    saveLocal();
    return Promise.resolve();
  }
  function putSettings() {
    if (mode === 'db') return db.doc('meta/settings').set(clone(mem.settings)).catch(function (e) { throw dbError(e); });
    saveLocal();
    return Promise.resolve();
  }

  /* ---------- 모양 변환 ---------- */
  function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function today() { return ymd(new Date()); }
  function nowTime() { var d = new Date(); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function groupsList() { return Object.keys(mem.groups).map(function (k) { return mem.groups[k]; }); }
  function totalOf(g) { var s = 0; g.items.forEach(function (it) { s += Number(it.amount) || 0; }); return s; }
  function rowsAll() {
    var rows = [];
    groupsList().forEach(function (g) {
      g.items.forEach(function (it) {
        rows.push({
          id: it.id, date: g.date, time: g.time || '', type: g.type, cat: it.cat, sub: it.sub || '', amount: Number(it.amount) || 0,
          merchant: g.merchant || '', item: it.name || '', biz: it.biz || g.biz || '개인', method: g.method || '', source: g.source || '',
          confirmed: !!g.confirmed, original: g.original || '', memo: g.memo || '', group: g.id, createdAt: g.createdAt || ''
        });
      });
    });
    return rows;
  }
  function toClient(g) {
    return {
      group: g.id, type: g.type, date: g.date, time: g.time || '', merchant: g.merchant || '', method: g.method || '',
      source: g.source || '', original: g.original || '', biz: g.biz || '개인', confirmed: !!g.confirmed, total: totalOf(g),
      items: g.items.map(function (it) { return { id: it.id, name: it.name || '', amount: it.amount, cat: it.cat, sub: it.sub || '' }; })
    };
  }
  function settingsOut() {
    return { taxRate: Number(mem.settings.taxRate) || 0, savingGoal: Number(mem.settings.savingGoal) || 0, mailScan: false, mailQuery: '', onboarded: !!mem.settings.onboarded, hasPasscode: !!passcode() };
  }
  function bizFor(cat, fallback) { return cat === '사업경비' || cat === '사업소득' ? '사업' : (fallback || '개인'); }
  function mergeSources(a, b) {
    var parts = (a ? a.split('+') : []).concat(b ? b.split('+') : []);
    return parts.filter(function (x, i) { return x && parts.indexOf(x) === i; }).join('+');
  }

  /* ---------- 기록 (Code.gs addTransaction_과 같은 규칙) ---------- */
  function addTransaction(tx) {
    var from = addDays(today(), -60);
    var recent = groupsList().filter(function (g) { return g.date >= from; }).map(function (g) {
      return { group: g.id, type: g.type, date: g.date, time: g.time || '', total: totalOf(g), hasItems: g.items.some(function (it) { return it.name; }), g: g };
    });
    var dup = tx.cancel ? null : findDuplicate({ type: tx.type, date: tx.date, time: tx.time, total: tx.total }, recent);
    var hasItems = tx.items.some(function (it) { return it.name; });
    var id = uid(), merged = false, createdAt = new Date().toISOString();
    if (dup) {
      var old = dup.g;
      if (hasItems && !dup.hasItems) {
        // 카드 문자(품목 없음) → 영수증·캡처(품목 있음)로 바꾸고 문자의 시간·결제수단은 살림
        tx.time = tx.time || old.time;
        tx.date = old.time ? old.date : tx.date;
        tx.method = tx.method || old.method;
        tx.merchant = tx.merchant || old.merchant;
        tx.source = mergeSources(old.source, tx.source);
        id = old.id; createdAt = old.createdAt || createdAt; merged = true;
      } else if (!hasItems && dup.hasItems) {
        old.time = old.time || tx.time;
        old.method = old.method || tx.method;
        old.source = mergeSources(old.source, tx.source);
        return putGroup(old).then(function () { return { group: old.id, duplicate: true, merged: true }; });
      } else {
        return Promise.resolve({ group: old.id, duplicate: true, merged: false });
      }
    }
    var g = {
      id: id, type: tx.type, date: tx.date, time: tx.time || '', merchant: tx.merchant || '', method: tx.method || '',
      source: tx.source || '', original: tx.original || '', biz: tx.biz || '개인', confirmed: !!tx.confirmed, memo: '', createdAt: createdAt,
      items: tx.items.map(function (it) { return { id: uid(), name: it.name || '', amount: Math.round(Number(it.amount) || 0), cat: it.cat, sub: it.sub || '', biz: it.biz || tx.biz || '개인' }; })
    };
    return putGroup(g).then(function () { return { group: id, duplicate: false, merged: merged }; });
  }

  function txFromExtract(ext, source) {
    var type = ext.type === '수입' ? '수입' : '지출';
    var cats = type === '수입' ? INCOME_CATS : EXPENSE_CATS;
    var src = ext.items && ext.items.length ? ext.items : [{ name: ext.merchant, amount: ext.total, category: '', sub: '' }];
    var items = src.map(function (it) {
      var learned = categorize(ext.merchant + ' ' + it.name, type, mem.rules);
      var cat = learned.learned ? learned.cat : (cats.indexOf(it.category) >= 0 ? it.category : categorize(ext.merchant + ' ' + it.name, type, []).cat);
      var biz = learned.learned && learned.biz ? learned.biz : bizFor(cat, ext.business_likely ? '사업' : '개인');
      return { name: it.name === ext.merchant && src.length <= 1 ? '' : String(it.name || ''), amount: Math.round(Number(it.amount) || 0), cat: cat, sub: learned.learned ? learned.sub : (it.sub || ''), biz: biz };
    });
    var total = Math.round(Number(ext.total) || 0);
    if (!total) items.forEach(function (it) { total += it.amount; });
    balanceItems(items, total);
    return {
      type: type, date: /^\d{4}-\d{2}-\d{2}$/.test(ext.date) ? ext.date : today(), time: /^\d{2}:\d{2}$/.test(ext.time) ? ext.time : '',
      merchant: String(ext.merchant || ''), method: String(ext.payment_method || ''), total: total, items: items,
      biz: ext.business_likely ? '사업' : '개인', source: source, original: '', confirmed: false
    };
  }

  /* ---------- Claude로 읽기 (sample) ---------- */
  function extractPrompt(extra) {
    var ruleText = mem.rules.slice(0, 60).map(function (r) {
      return '- "' + r.keyword + '" → ' + r.cat + (r.sub ? '/' + r.sub : '') + (r.biz ? ' (' + r.biz + ')' : '');
    }).join('\n');
    return [
      '당신은 한국 가계부 앱의 영수증·결제내역 읽기 담당입니다. 프리랜서와 일하는 주부가 올린 영수증 사진, 쇼핑앱 주문내역 캡처, 붙여 넣은 주문확인 메일에서 결제 정보를 정확히 뽑습니다.',
      '오늘 날짜는 ' + today() + ' 입니다. 연도가 안 보이면 오늘에 가장 가까운 과거 날짜로 판단하세요.',
      '',
      '규칙:',
      '- total은 실제로 결제된 최종 금액(원, 정수)입니다. 할인·쿠폰·포인트 사용 후, 배송비 포함.',
      '- items의 amount 합이 total과 같도록 나누세요. 할인을 품목에 나누기 어려우면 그대로 두세요(앱이 차액을 조정합니다).',
      '- 한 결제에 성격이 다른 물건이 섞여 있으면 품목마다 category를 따로 정하세요. 예: 기저귀는 육아·교육, 과자는 식비, 세제는 생활·쇼핑.',
      '- 지출 category: ' + EXPENSE_CATS.join(', ') + '. (고정비=월세·관리비·통신·보험·구독, 사업경비=일에 쓴 비용)',
      '- 수입 category: ' + INCOME_CATS.join(', ') + '. (사업소득=거래처 입금·원고료·용역비, 근로소득=급여)',
      '- 결제·입금 내역이 아니면 is_transaction을 false로 하고 나머지는 빈 값·0으로 채우세요.',
      '- 안 보이거나 확실하지 않은 칸은 지어내지 말고 빈 문자열이나 0으로 두세요.',
      ruleText ? '\n이 사용자가 직접 고친 분류 규칙입니다. 해당하면 따르세요:\n' + ruleText : '',
      '',
      '다음 모양의 JSON 객체 하나로만 답하세요:',
      '{"is_transaction": true, "type": "지출" 또는 "수입", "date": "YYYY-MM-DD 또는 빈 문자열", "time": "HH:mm 또는 빈 문자열", "merchant": "가게·판매처 이름", "payment_method": "카드사·결제수단 또는 빈 문자열", "total": 38900, "business_likely": false, "items": [{"name": "품목 이름", "amount": 26900, "category": "육아·교육", "sub": "소분류(예: 장보기, 배달, 카페, 육아)"}]}',
      extra ? '\n읽을 내용:\n' + extra : '\n첨부한 이미지의 결제 정보를 읽어 주세요.'
    ].join('\n');
  }

  function sampleMessage(e) {
    switch (e && e.code) {
      case 'not_granted': case 'sampling_disabled': case 'not_declared': case 'capability_disabled': case 'capability_removed':
        return '이 화면에서는 Claude로 읽을 수 없어요. 한 줄로 직접 기록해 주세요.';
      case 'images_unavailable': return '이 화면에서는 사진을 읽을 수 없어요. claude.ai 앱이나 브라우저에서 열어 주세요.';
      case 'image_rejected': return '사진을 열 수 없어요. 다른 사진(JPG·PNG)을 올려 주세요.';
      case 'rate_limited': return '요청이 많아 잠시 멈췄어요. 조금 뒤 다시 올려 주세요.';
      case 'session_expired': return 'claude.ai에 다시 로그인해 주세요.';
      case 'refused': return '이 이미지는 읽을 수 없어요. 다른 사진으로 시도해 주세요.';
      case 'invalid_json': case 'empty_completion': return '결제 내역을 읽지 못했어요. 다시 올려 주세요.';
      case 'prompt_too_large': return '내용이 너무 길어요. 결제 부분만 붙여 넣어 주세요.';
      default: return '읽기에 실패했어요. 잠시 뒤 다시 시도해 주세요.';
    }
  }

  function passcode() { try { return localStorage.getItem(LS_KEY + '-pass') || ''; } catch (e) { return ''; } }

  function serverMessage(status, code) {
    if (status === 404 || status === 405) return '영수증 읽기 서버가 없어요. 배포 안내의 ‘Vercel로 배포’를 따라 주세요. 그 전까지는 한 줄로 기록해 주세요.';
    if (status === 401) return '앱 비밀번호가 맞지 않아요. ‘내 데이터 → 설정’에서 배포할 때 정한 비밀번호를 넣어 주세요.';
    switch (code) {
      case 'no_key': case 'bad_key': return '서버에 ANTHROPIC_API_KEY가 없거나 틀려요. 배포 설정을 확인해 주세요.';
      case 'rate_limited': return '요청이 많아 잠시 멈췄어요. 조금 뒤 다시 올려 주세요.';
      case 'refused': return '이 이미지는 읽을 수 없어요. 다른 사진으로 시도해 주세요.';
      case 'too_long': return '내용이 너무 길어요. 결제 부분만 올려 주세요.';
      case 'bad_request': return '사진을 읽을 수 없어요. 다른 사진(JPG·PNG)을 올려 주세요.';
      default: return '읽기에 실패했어요. 잠시 뒤 다시 시도해 주세요.';
    }
  }

  // 직접 배포한 사이트: 같은 사이트의 api/extract 서버 함수가 Claude API를 부름
  function extractViaServer(opts) {
    var body = { today: today(), rules: mem.rules.slice(0, 60) };
    if (opts.b64) body.image = { data: opts.b64, mime: opts.mime };
    else body.text = opts.text;
    return fetch('api/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-app-passcode': passcode() },
      body: JSON.stringify(body)
    }).catch(function () { throw new Error('인터넷 연결을 확인해 주세요.'); })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.ok && j.ext) return j.ext;
          throw new Error(serverMessage(r.status, j.error));
        });
      });
  }

  function extract(opts) {
    if (STANDALONE) return extractViaServer(opts).then(normalizeExt);
    return capability('sample').then(function (sample) {
      if (!sample) throw new Error('영수증·캡처 읽기는 claude.ai에서 열었을 때만 돼요. 한 줄로 직접 기록해 주세요.');
      var check = opts.images
        ? sample.limits().catch(function () { return null; }).then(function (lim) {
          if (!lim || !lim.images) throw new Error('이 화면에서는 사진을 읽을 수 없어요. claude.ai 앱이나 브라우저에서 열어 주세요.');
        })
        : Promise.resolve();
      return check.then(function () {
        return sample.json(extractPrompt(opts.text), opts.images ? { images: opts.images } : {}).catch(function (e) { throw new Error(sampleMessage(e)); });
      });
    }).then(normalizeExt);
  }

  function normalizeExt(ext) {
    if (!ext || typeof ext !== 'object' || Array.isArray(ext)) throw new Error('결제 내역을 읽지 못했어요. 다시 올려 주세요.');
    return {
      is_transaction: ext.is_transaction !== false,
      type: ext.type === '수입' ? '수입' : '지출',
      date: String(ext.date || ''), time: String(ext.time || ''),
      merchant: String(ext.merchant || ''), payment_method: String(ext.payment_method || ''),
      total: Math.round(Number(ext.total) || 0), business_likely: !!ext.business_likely,
      items: Array.isArray(ext.items) ? ext.items.filter(function (it) { return it && typeof it === 'object'; }).map(function (it) {
        return { name: String(it.name || ''), amount: Math.round(Number(it.amount) || 0), category: String(it.category || ''), sub: String(it.sub || '') };
      }) : []
    };
  }

  function b64ToBlob(b64, mime) {
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  /* ---------- 내보내기 ---------- */
  var CSV_HEAD = ['날짜', '시간', '구분', '대분류', '소분류', '금액', '가맹점', '품목', '개인/사업', '결제수단', '출처', '메모'];
  function csvOf(rows) {
    rows = rows.slice().sort(function (a, b) { return (a.date + a.time) < (b.date + b.time) ? -1 : 1; });
    return [csvLine(CSV_HEAD)].concat(rows.map(function (r) {
      return csvLine([r.date, r.time, r.type, r.cat, r.sub, r.amount, r.merchant, r.item, r.biz, r.method, r.source, r.memo]);
    })).join('\n');
  }

  function mcpMessage(e) {
    switch (e && e.code) {
      case 'server_not_connected': case 'server_not_found': return 'claude.ai 설정 → 커넥터에서 Google Drive를 추가한 뒤 다시 눌러 주세요.';
      case 'needs_reauth': return 'claude.ai 설정 → 커넥터에서 Google Drive를 다시 연결해 주세요.';
      case 'selection_required': return 'Google Drive 연결이 여러 개예요. 뜨는 창에서 하나를 골라 주세요.';
      case 'not_in_manifest': return 'Google Drive 사용을 허용하지 않았어요. 대신 CSV를 받아 구글 시트에서 가져오기 해 주세요.';
      case 'blocked_by_policy': case 'approval_required': return '조직 정책으로 Google Drive를 쓸 수 없어요. CSV를 받아 가져오기 해 주세요.';
      case 'tool_error': return 'Google Drive가 파일을 만들지 못했어요: ' + (e.message || '');
      case 'server_unavailable': case 'upstream_error': return 'Google Drive가 응답하지 않아요. 드라이브에 파일이 생겼는지 확인한 뒤 다시 눌러 주세요.';
      default: return '구글 시트로 보내지 못했어요. CSV를 받아 구글 시트에서 가져오기 해 주세요.';
    }
  }

  /* ---------- 예시 기록 ---------- */
  function sampleGroups() {
    var t = today();
    var list = [
      [1, '08:12', '스타벅스', '식비', '카페', 5600], [1, '12:40', '김밥천국', '식비', '외식', 8500], [2, '19:05', '배달의민족', '식비', '배달', 27000],
      [3, '10:20', '이마트', '식비', '장보기', 64300], [4, '08:10', '메가커피', '식비', '카페', 4500], [5, '08:05', '메가커피', '식비', '카페', 4500],
      [6, '08:15', '메가커피', '식비', '카페', 4500], [7, '20:10', '배달의민족', '식비', '배달', 31000], [8, '19:40', '요기요', '식비', '배달', 24000],
      [9, '01:20', '무신사', '생활·쇼핑', '온라인쇼핑', 43000], [10, '15:00', '영어학원', '육아·교육', '교육', 180000], [12, '09:00', '관리비', '고정비', '주거', 215000],
      [13, '11:30', '티머니', '교통', '대중교통', 1450], [14, '18:20', '올리브영', '생활·쇼핑', '생활용품', 23800], [15, '14:10', '약국', '건강', '병원·약국', 9800],
      [16, '10:00', '어도비', '사업경비', '소프트웨어', 37000], [18, '20:30', '배달의민족', '식비', '배달', 28000], [20, '11:10', '홈플러스', '식비', '장보기', 58200]
    ];
    var groups = list.map(function (x, i) {
      return {
        id: 'ex' + i, type: '지출', date: addDays(t, -x[0]), time: x[1], merchant: x[2], method: '예시카드', source: '예시',
        biz: x[3] === '사업경비' ? '사업' : '개인', confirmed: i > 2, memo: '', createdAt: new Date(Date.now() - x[0] * 864e5).toISOString(),
        items: [{ id: 'exi' + i, name: '', amount: x[5], cat: x[3], sub: x[4], biz: x[3] === '사업경비' ? '사업' : '개인' }]
      };
    });
    groups.push({
      id: 'exc', type: '지출', date: addDays(t, -2), time: '22:14', merchant: '쿠팡', method: '예시카드', source: '예시', biz: '개인', confirmed: false, memo: '',
      createdAt: new Date().toISOString(),
      items: [
        { id: 'exc1', name: '하기스 기저귀 대형 1팩', amount: 26900, cat: '육아·교육', sub: '육아', biz: '개인' },
        { id: 'exc2', name: '오트밀 쿠키 2봉', amount: 6000, cat: '식비', sub: '간식', biz: '개인' },
        { id: 'exc3', name: '주방세제 리필', amount: 6000, cat: '생활·쇼핑', sub: '생활용품', biz: '개인' }
      ]
    });
    [['exa', 3, '거래처 A 디자인비', 1800000], ['exb', 11, '거래처 B 원고료', 900000], ['exd', 35, '거래처 A 디자인비', 2100000]].forEach(function (x) {
      groups.push({
        id: x[0], type: '수입', date: addDays(t, -x[1]), time: '10:00', merchant: x[2], method: '', source: '예시', biz: '사업', confirmed: true, memo: '',
        createdAt: new Date().toISOString(), items: [{ id: x[0] + '1', name: '', amount: x[3], cat: '사업소득', sub: '', biz: '사업' }]
      });
    });
    return groups;
  }

  /* ---------- 화면이 부르는 함수 (구글 시트 판 Code.gs와 같은 이름·모양) ---------- */
  function after(fn) { return function () { var args = arguments; return ready.then(function () { return fn.apply(null, args); }); }; }

  window.BUDGET_API = {
    apiBootstrap: after(function () {
      var rows = rowsAll();
      var groups = groupsList().sort(function (a, b) { return (b.date + b.time) < (a.date + a.time) ? -1 : 1; });
      var t = today();
      var where = mode === 'db' ? '이 앱의 저장소에 보관돼요 · 같은 링크를 연 기기 어디서나'
        : mode === 'local' ? '이 브라우저에만 저장돼요 · 다른 기기에서는 안 보여요'
          : '저장되지 않아요 · 창을 닫으면 사라져요';
      return {
        today: t,
        settings: settingsOut(),
        cats: { expense: EXPENSE_CATS, income: INCOME_CATS },
        pending: groups.filter(function (g) { return !g.confirmed; }).slice(0, 40).map(toClient),
        recent: groups.filter(function (g) { return g.confirmed; }).slice(0, 15).map(toClient),
        noSpend: noSpendDays(rows, monthKey(t) + '-01', addDays(t, -1)).length,
        sheet: { url: '', name: '내 가계부', where: where, rows: rows.length, rules: mem.rules.length },
        preview: rows.slice().sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; }).slice(0, 5)
          .map(function (r) { return { date: r.date, merchant: r.merchant, item: r.item, cat: r.cat, type: r.type, amount: r.amount }; }),
        hook: { url: '', token: '' }, lastSms: '', lastMail: '',
        mission: mem.settings.mission || null,
        hasSamples: groups.some(function (g) { return g.source === '예시'; }),
        empty: groups.length === 0
      };
    }),

    apiAddText: after(function (k, text) {
      text = String(text || '');
      var now = new Date(), sms = looksLikeBankSms(text);
      var p = sms ? parseBankSms(text, now) : parseQuickText(text, now);
      if (!p.ok) {
        if (text.length < 20) throw new Error('금액을 찾지 못했어요. 예: 점심 김밥 4500');
        // 붙여 넣은 주문 메일처럼 긴 글은 Claude로 읽기
        return extract({ text: text.slice(0, 20000) }).then(function (ext) {
          if (!ext.is_transaction || !ext.total) throw new Error('결제 내역을 찾지 못했어요. 예: 점심 김밥 4500');
          var tx = txFromExtract(ext, '붙여넣기');
          return addTransaction(tx).then(function (res) {
            res.parsed = { merchant: tx.merchant, amount: tx.total, cat: tx.items[0].cat, type: tx.type };
            return res;
          });
        });
      }
      var c = categorize(p.merchant, p.type, mem.rules);
      var amount = p.cancel ? -p.amount : p.amount;
      var tx = {
        type: p.type, date: p.date, time: p.time || (sms ? '' : nowTime()), merchant: p.merchant, method: p.method || '', total: amount,
        items: [{ name: '', amount: amount, cat: c.cat, sub: p.cancel ? '취소' : c.sub, biz: bizFor(c.cat, c.biz) }],
        biz: bizFor(c.cat, c.biz), source: sms ? '결제 문자' : '직접 입력', confirmed: !sms || c.learned, cancel: !!p.cancel
      };
      return addTransaction(tx).then(function (res) {
        res.parsed = { merchant: p.merchant, amount: amount, cat: c.cat, type: p.type };
        return res;
      });
    }),

    apiAddImage: after(function (k, base64, mime, name, source) {
      if (mime === 'application/pdf') throw new Error('PDF는 아직 못 읽어요. 화면을 캡처해서 올려 주세요.');
      return extract({ images: [b64ToBlob(base64, mime)], b64: base64, mime: mime }).then(function (ext) {
        if (!ext.is_transaction || !ext.total) throw new Error('결제 내역을 찾지 못했어요. 영수증이 잘 보이게 다시 찍어 주세요.');
        return addTransaction(txFromExtract(ext, source || '영수증 사진'));
      }).then(function (res) {
        var g = mem.groups[res.group];
        return { duplicate: res.duplicate, merged: res.merged, group: g ? toClient(g) : null };
      });
    }),

    apiGetGroup: after(function (k, gid) {
      var g = mem.groups[gid];
      if (!g) throw new Error('기록을 찾지 못했어요.');
      return toClient(g);
    }),

    apiUpdateGroup: after(function (k, gid, patch) {
      var g = mem.groups[gid];
      if (!g) throw new Error('기록을 찾지 못했어요.');
      g = clone(g);
      var byId = {};
      (patch.items || []).forEach(function (it) { byId[it.id] = it; });
      var learned = false;
      g.items.forEach(function (it) {
        var p = byId[it.id];
        var cat = p && p.cat ? p.cat : it.cat;
        var sub = cat !== it.cat ? '' : it.sub;
        var biz = patch.biz || it.biz || g.biz;
        var changed = cat !== it.cat || biz !== (it.biz || g.biz);
        if (patch.learn && changed) {
          var keyword = String(g.items.length === 1 || !it.name ? g.merchant : it.name).trim();
          if (keyword.length >= 2) {
            mem.rules = mem.rules.filter(function (r) { return r.keyword !== keyword; });
            mem.rules.push({ keyword: keyword, cat: cat, sub: sub, biz: biz });
            learned = true;
          }
        }
        it.cat = cat; it.sub = sub; it.biz = biz;
      });
      if (patch.biz) g.biz = patch.biz;
      g.confirmed = true;
      return putGroup(g).then(function () { return learned ? putRules() : null; }).then(function () { return true; });
    }),

    apiConfirm: after(function (k, gid) {
      var g = mem.groups[gid];
      if (!g) return true;
      g = clone(g); g.confirmed = true;
      return putGroup(g).then(function () { return true; });
    }),

    apiDeleteGroup: after(function (k, gid) { return removeGroup(gid).then(function () { return true; }); }),

    apiDashboard: after(function (k, period, anchor, day) {
      var t = today();
      anchor = anchor || t;
      var rows = rowsAll();
      var s = computeSummary(rows, period === 'day' ? 'month' : period, anchor, t);
      var target = day || anchor;
      s.dayItems = rows.filter(function (r) { return r.date === target; })
        .map(function (r) { return { merchant: r.merchant, item: r.item, cat: r.cat, type: r.type, amount: r.amount, time: r.time }; });
      s.day = target;
      s.noSpend = noSpendDays(rows, s.from, s.to < t ? s.to : addDays(t, -1));
      return s;
    }),

    apiReport: after(function () {
      return computeWeeklyReport(rowsAll(), today(), settingsOut(), mem.settings.mission || null);
    }),

    apiStartMission: after(function (k, m) {
      mem.settings = clone(mem.settings);
      mem.settings.mission = { type: m.type, target: Number(m.target) || 0, text: String(m.text || ''), merchant: m.merchant || '', saving: Number(m.saving) || 0, start: today() };
      return putSettings().then(function () { return mem.settings.mission; });
    }),

    apiSaveSettings: after(function (k, patch) {
      mem.settings = clone(mem.settings);
      if (patch.taxRate !== undefined) mem.settings.taxRate = Math.max(0, Math.min(60, Number(patch.taxRate) || 0));
      if (patch.savingGoal !== undefined) mem.settings.savingGoal = Math.max(0, Math.round(Number(patch.savingGoal) || 0));
      if (patch.onboarded !== undefined) mem.settings.onboarded = !!patch.onboarded;
      if (patch.passcode !== undefined && patch.passcode !== '') {
        try { localStorage.setItem(LS_KEY + '-pass', String(patch.passcode)); } catch (e) { /* 저장 불가 */ }
      }
      return putSettings().then(settingsOut);
    }),

    apiExportCsv: after(function (k, kind) {
      var year = today().slice(0, 4);
      var rows = rowsAll();
      if (kind === 'biz') rows = rows.filter(function (r) { return r.biz === '사업' && r.date.slice(0, 4) === year; });
      if (!rows.length) throw new Error(kind === 'biz' ? '올해 사업 관련 기록이 아직 없어요.' : '아직 기록이 없어요.');
      var name = (kind === 'biz' ? year + '년 사업 수입·경비' : '가계부 전체') + ' ' + today() + '.csv';
      var data = '﻿' + csvOf(rows); // 엑셀에서 한글이 깨지지 않도록 BOM
      return capability('downloads').then(function (dl) {
        if (dl) {
          return dl.save({ filename: name, data: data }).then(function () {
            return { name: name, count: rows.length, message: '“' + name + '”을 저장했어요 (' + rows.length + '줄)' };
          }, function (e) {
            if (e && e.code === 'declined') throw new Error('저장을 취소했어요.');
            if (e && e.code === 'rate_limited') throw new Error('저장 창이 이미 열려 있어요. 잠시 뒤 다시 눌러 주세요.');
            throw new Error('이 화면에서는 파일을 저장할 수 없어요. 구글 시트로 보내기를 써 주세요.');
          });
        }
        // claude.ai 밖(내 컴퓨터에 저장한 파일 등): 브라우저 다운로드
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([data], { type: 'text/csv' }));
        a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        return { name: name, count: rows.length, message: '“' + name + '”을 내려받았어요' };
      });
    }),

    apiExportSheet: after(function () {
      var rows = rowsAll();
      if (!rows.length) throw new Error('아직 기록이 없어요.');
      var title = '찰칵 가계부 ' + today();
      return capability('mcp').then(function (mcp) {
        if (!mcp) throw new Error('구글 시트로 보내기는 claude.ai에서 열었을 때만 돼요. CSV를 받아 구글 시트에서 가져오기 해 주세요.');
        return mcp.callTool('Google Drive', 'create_file', { title: title, textContent: csvOf(rows), contentMimeType: 'text/csv' })
          .catch(function (e) { throw new Error(mcpMessage(e)); });
      }).then(function (res) {
        var p = res && res.payload && typeof res.payload === 'object' ? res.payload : {};
        var f = p.file && typeof p.file === 'object' ? p.file : p;
        var id = f.id || f.fileId || '';
        var url = f.webViewLink || f.alternateLink || f.url || (id ? 'https://docs.google.com/spreadsheets/d/' + id + '/edit' : '');
        return { url: url, name: title, count: rows.length };
      });
    }),

    apiLoadSamples: after(function () {
      // 한꺼번에 쓰면 저장소가 거절할 수 있어 하나씩
      return sampleGroups().reduce(function (p, g) { return p.then(function () { return putGroup(g); }); }, Promise.resolve()).then(function () { return true; });
    }),

    apiClearSamples: after(function () {
      var ids = groupsList().filter(function (g) { return g.source === '예시'; }).map(function (g) { return g.id; });
      return ids.reduce(function (p, id) { return p.then(function () { return removeGroup(id); }); }, Promise.resolve()).then(function () { return true; });
    })
  };
})();
