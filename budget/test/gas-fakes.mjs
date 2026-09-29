// Apps Script 서비스(시트·드라이브·속성·UrlFetch 등)의 최소 가짜 구현.
// 실제 Code.gs / Claude.gs / Logic.gs 를 Node에서 그대로 실행해 보기 위한 것입니다.
// 날짜 계산이 한국 시간과 같도록 TZ=Asia/Seoul 로 실행하세요 (package.json 스크립트 참고).
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';

const pad = (n) => String(n).padStart(2, '0');

function formatDate(d, _tz, pattern) {
  return pattern
    .replace('yyyy', d.getFullYear())
    .replace('MM', pad(d.getMonth() + 1))
    .replace('dd', pad(d.getDate()))
    .replace('HH', pad(d.getHours()))
    .replace('mm', pad(d.getMinutes()));
}

class Range {
  constructor(sheet, row, col, nr = 1, nc = 1) {
    if (row + nr - 1 > sheet.maxRows) throw new Error(`범위가 시트 크기를 넘음: ${row + nr - 1} > ${sheet.maxRows}`);
    Object.assign(this, { sheet, row, col, nr, nc });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.nr; r++) {
      const src = this.sheet.data[this.row - 1 + r] || [];
      const line = [];
      for (let c = 0; c < this.nc; c++) line.push(src[this.col - 1 + c] ?? '');
      out.push(line);
    }
    return out;
  }
  setValues(values) {
    values.forEach((line, r) => {
      const i = this.row - 1 + r;
      this.sheet.data[i] = this.sheet.data[i] || [];
      line.forEach((v, c) => { this.sheet.data[i][this.col - 1 + c] = v; });
    });
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  setFormula(f) { this.sheet.formulas[`${this.row},${this.col}`] = f; return this; }
  setNumberFormat() { return this; }
  setFontWeight() { return this; }
  setBackground() { return this; }
}

class Sheet {
  constructor(name) { this.name = name; this.data = []; this.maxRows = 1000; this.formulas = {}; }
  getName() { return this.name; }
  getLastRow() {
    for (let i = this.data.length - 1; i >= 0; i--) {
      if ((this.data[i] || []).some((v) => v !== '' && v !== undefined && v !== null)) return i + 1;
    }
    return 0;
  }
  getMaxRows() { return this.maxRows; }
  getDataRange() {
    const nc = Math.max(1, ...this.data.map((r) => (r || []).length));
    return new Range(this, 1, 1, Math.max(1, this.getLastRow()), nc);
  }
  getRange(a, b, c, d) {
    if (typeof a === 'string') {
      const m = a.match(/^([A-Z])(\d+)$/);
      return new Range(this, Number(m[2]), m[1].charCodeAt(0) - 64);
    }
    return new Range(this, a, b, c ?? 1, d ?? 1);
  }
  appendRow(row) {
    const i = this.getLastRow();
    if (i + 1 > this.maxRows) this.maxRows = i + 1;
    this.data[i] = row.slice();
    return this;
  }
  deleteRow(r) { this.data.splice(r - 1, 1); this.maxRows--; }
  insertRowsAfter(_after, n) { this.maxRows += n; }
  setFrozenRows() {}
}

/**
 * @param {object} opts
 * @param {(body:object, headers:object)=>object} opts.claude  가짜 Claude 응답(JSON 객체)을 돌려주는 함수
 */
export function loadGas(opts = {}) {
  const sheets = [];
  const props = {};
  const files = [];
  const requests = [];
  const triggers = [];

  const ss = {
    getSheetByName: (n) => sheets.find((s) => s.name === n) || null,
    insertSheet: (n) => { const s = new Sheet(n); sheets.push(s); return s; },
    getUrl: () => 'https://docs.google.com/spreadsheets/d/FAKE',
    getName: () => '우리집 가계부 2026'
  };
  const folder = {
    getId: () => 'folder1',
    createFile: (blobOrName, content, mime) => {
      const f = { name: typeof blobOrName === 'string' ? blobOrName : blobOrName.name, content, mime };
      files.push(f);
      return { getUrl: () => `https://drive.google.com/file/d/f${files.length}`, ...f };
    }
  };

  const ctx = vm.createContext({
    console,
    SpreadsheetApp: { getActive: () => ss, getUi: () => { throw new Error('no ui in tests'); } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = String(v); } }) },
    Utilities: {
      getUuid: () => randomUUID(),
      formatDate,
      base64Decode: (s) => Buffer.from(s, 'base64'),
      newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
      sleep: () => {}
    },
    Session: { getScriptTimeZone: () => 'Asia/Seoul' },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    DriveApp: { createFolder: () => folder, getFolderById: () => folder },
    MimeType: { CSV: 'text/csv' },
    ScriptApp: {
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/FAKE/exec' }),
      getProjectTriggers: () => triggers,
      deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1),
      newTrigger: (fn) => ({ timeBased: () => ({ everyHours: () => ({ create: () => triggers.push({ getHandlerFunction: () => fn }) }) }) })
    },
    UrlFetchApp: {
      fetch: (url, o) => {
        const body = JSON.parse(o.payload);
        requests.push({ url, headers: o.headers, body });
        const out = opts.claude ? opts.claude(body, o.headers) : { error: { type: 'x', message: 'no fake' } };
        const code = out && out.__status ? out.__status : 200;
        return { getResponseCode: () => code, getContentText: () => JSON.stringify(out) };
      }
    },
    ContentService: {
      createTextOutput: (s) => ({ setMimeType() { return this; }, getContent: () => s }),
      MimeType: { JSON: 'json' }
    },
    Logger: { log: () => {} },
    GmailApp: { getUserLabelByName: () => null, createLabel: () => ({}), search: () => [] }
  });
  for (const f of ['Logic.gs', 'Claude.gs', 'Code.gs']) {
    vm.runInContext(readFileSync(new URL(`../apps-script/${f}`, import.meta.url), 'utf8'), ctx, { filename: f });
  }
  return { g: ctx, sheets, props, files, requests, triggers, ss };
}

/** Claude 응답 모양 (구조화 출력 결과를 text 블록에 담음) */
export function claudeReply(obj) {
  return { id: 'msg_fake', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(obj) }] };
}
