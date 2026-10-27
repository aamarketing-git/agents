/**
 * saju.js — 만세력 기반 사주 계산 엔진
 * 의존성 없음. ES module.
 *
 *   import { computeSaju } from "./saju.js";
 *   const r = computeSaju({ year:1990, month:10, day:10, hour:14, minute:30,
 *                           gender:"M", city:"서울" });
 *
 * 절기 시각은 VSOP87(ephem)으로 사전 계산한 1899~2101년 테이블을 사용한다.
 */
import { JEOL, LUNAR } from "./saju-data.js";

/* ───────────────────────── 기본 상수 ───────────────────────── */

export const STEMS = ["갑","을","병","정","무","기","경","신","임","계"];
export const STEMS_CN = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
export const BRANCHES = ["자","축","인","묘","진","사","오","미","신","유","술","해"];
export const BRANCHES_CN = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
export const ZODIAC = ["쥐","소","호랑이","토끼","용","뱀","말","양","원숭이","닭","개","돼지"];

// 오행: 0목 1화 2토 3금 4수
const EL = ["목","화","토","금","수"];
const STEM_EL   = [0,0,1,1,2,2,3,3,4,4];
const BRANCH_EL = [4,2,0,0,2,1,1,2,3,3,2,4];
const STEM_YIN   = [0,1,0,1,0,1,0,1,0,1]; // 0=양 1=음
const BRANCH_YIN = [0,1,0,1,0,1,0,1,0,1,0,1];

// 지장간 [천간index, 일수]
const HIDDEN = [
  [[8,10],[9,20]],                 // 자
  [[9,9],[7,3],[5,18]],            // 축
  [[4,7],[2,7],[0,16]],            // 인
  [[0,10],[1,20]],                 // 묘
  [[1,9],[9,3],[4,18]],            // 진
  [[4,7],[6,7],[2,16]],            // 사
  [[2,10],[5,9],[3,11]],           // 오
  [[3,9],[1,3],[5,18]],            // 미
  [[4,7],[8,7],[6,16]],            // 신
  [[6,10],[7,20]],                 // 유
  [[7,9],[3,3],[4,18]],            // 술
  [[4,7],[0,7],[8,16]],            // 해
];

const UNSEONG = ["장생","목욕","관대","건록","제왕","쇠","병","사","묘","절","태","양"];
const JANGSAENG = [11,6,2,9,2,9,5,0,8,3]; // 일간별 장생 지지

const TERM_NAMES = JEOL.names;

/* ───────────────────────── 시간 보정 ───────────────────────── */

// 한국 표준시 자오선 변천사 (KST 기준일, UTC 오프셋 분)
const MERIDIAN = [
  { from: "1000-01-01", offset:  510, lon: 127.5 }, // 1908 이전은 지방시 취급
  { from: "1908-04-01", offset:  510, lon: 127.5 },
  { from: "1912-01-01", offset:  540, lon: 135.0 },
  { from: "1954-03-21", offset:  510, lon: 127.5 },
  { from: "1961-08-10", offset:  540, lon: 135.0 },
];

// 대한민국 서머타임 시행 구간 (현지 날짜 기준, 시작 포함 ~ 종료 미만)
const DST = [
  ["1948-06-01","1948-09-13"], ["1949-04-03","1949-09-11"],
  ["1950-04-01","1950-09-10"], ["1951-05-06","1951-09-09"],
  ["1955-05-05","1955-09-09"], ["1956-05-20","1956-09-30"],
  ["1957-05-05","1957-09-22"], ["1958-05-04","1958-09-21"],
  ["1959-05-03","1959-09-20"], ["1960-05-01","1960-09-18"],
  ["1987-05-10","1987-10-11"], ["1988-05-08","1988-10-09"],
];

// 주요 도시 경도 (동경). 필요한 만큼 확장해서 쓰면 된다.
export const CITIES = {
  "서울":126.978,"인천":126.705,"수원":127.029,"성남":127.127,"용인":127.178,
  "고양":126.832,"부천":126.766,"안양":126.957,"평택":127.113,"의정부":127.047,
  "춘천":127.730,"강릉":128.876,"원주":127.947,"대전":127.385,"세종":127.289,
  "천안":127.114,"청주":127.489,"충주":127.926,"전주":127.148,"군산":126.737,
  "익산":126.958,"광주":126.852,"목포":126.392,"여수":127.662,"순천":127.487,
  "대구":128.601,"포항":129.343,"경주":129.225,"안동":128.729,"구미":128.344,
  "부산":129.075,"울산":129.311,"창원":128.682,"진주":128.104,"김해":128.889,
  "제주":126.531,"서귀포":126.560,
  "도쿄":139.692,"오사카":135.502,"베이징":116.407,"상하이":121.474,
  "뉴욕":-74.006,"로스앤젤레스":-118.243,"런던":-0.128,"시드니":151.209,
};

const pad = (n) => String(n).padStart(2, "0");
const dstr = (y,m,d) => `${y}-${pad(m)}-${pad(d)}`;

function meridianFor(dateStr) {
  let cur = MERIDIAN[0];
  for (const m of MERIDIAN) if (dateStr >= m.from) cur = m;
  return cur;
}
function isDST(dateStr) {
  return DST.some(([a,b]) => dateStr >= a && dateStr < b);
}

/* ───────────────────────── 날짜 유틸 ───────────────────────── */

// 그레고리력 → 율리우스일수(정수, 정오 기준)
export function toJDN(y, m, d) {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy
           + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}
export function fromJDN(jdn) {
  let a = jdn + 32044;
  let b = Math.floor((4 * a + 3) / 146097);
  let c = a - Math.floor(146097 * b / 4);
  let d2 = Math.floor((4 * c + 3) / 1461);
  let e = c - Math.floor(1461 * d2 / 4);
  let m = Math.floor((5 * e + 2) / 153);
  return {
    day: e - Math.floor((153 * m + 2) / 5) + 1,
    month: m + 3 - 12 * Math.floor(m / 10),
    year: 100 * b + d2 - 4800 + Math.floor(m / 10),
  };
}

// 1899-01-01 00:00 UTC 기준 경과 분
const EPOCH_JDN = toJDN(1899, 1, 1);
function minutesFromEpochUTC(y, m, d, hh, mi) {
  return (toJDN(y, m, d) - EPOCH_JDN) * 1440 + hh * 60 + mi;
}

/* ───────────────────────── 절기 테이블 ───────────────────────── */

// 절(節) 시각을 epoch 분 단위 절대값으로 복원
const TERMS = (() => {
  const out = [];
  let acc = 0;
  for (let i = 0; i < JEOL.deltas.length; i++) {
    acc += JEOL.deltas[i];
    out.push({ name: TERM_NAMES[JEOL.order[i]], utcMin: acc });
  }
  return out;
})();

/** 주어진 UTC epoch분 직전의 절(節) 인덱스 */
function termIndexBefore(utcMin) {
  let lo = 0, hi = TERMS.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (TERMS[mid].utcMin <= utcMin) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans;
}

// 절 이름 → 월지 (입춘=인월)
const TERM_TO_BRANCH = {
  "입춘":2,"경칩":3,"청명":4,"입하":5,"망종":6,"소서":7,
  "입추":8,"백로":9,"한로":10,"입동":11,"대설":0,"소한":1,
};

/* ───────────────────────── 음력 변환 ───────────────────────── */

const LUNAR_MONTHS = (() => {
  const baseJDN = toJDN(1899, 1, 1);
  let acc = 0;
  return LUNAR.rows.map(([dd, y, m, leap]) => {
    acc += dd;
    return { jdn: baseJDN + acc, year: y, month: m, leap: !!leap };
  });
})();

/** 양력 → 음력 */
export function solarToLunar(y, m, d) {
  const jdn = toJDN(y, m, d);
  let lo = 0, hi = LUNAR_MONTHS.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (LUNAR_MONTHS[mid].jdn <= jdn) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  const mo = LUNAR_MONTHS[ans];
  return { year: mo.year, month: mo.month, day: jdn - mo.jdn + 1, leap: mo.leap };
}

/** 음력 → 양력 */
export function lunarToSolar(y, m, d, leap = false) {
  const mo = LUNAR_MONTHS.find(x => x.year === y && x.month === m && x.leap === !!leap);
  if (!mo) throw new Error(`존재하지 않는 음력 날짜: ${y}-${m}${leap ? "(윤)" : ""}`);
  return fromJDN(mo.jdn + d - 1);
}

/* ───────────────────────── 십신 / 십이운성 ───────────────────────── */

const SHIN = [
  ["비견","겁재"], ["식신","상관"], ["편재","정재"], ["편관","정관"], ["편인","정인"],
];
/** 일간 기준 상대 천간의 십신 */
export function sipsin(dayStem, other) {
  const me = STEM_EL[dayStem], you = STEM_EL[other];
  const same = STEM_YIN[dayStem] === STEM_YIN[other] ? 0 : 1;
  let rel;
  if (you === me) rel = 0;                       // 비겁
  else if (you === (me + 1) % 5) rel = 1;        // 식상 (내가 생)
  else if (you === (me + 2) % 5) rel = 2;        // 재성 (내가 극)
  else if (you === (me + 3) % 5) rel = 3;        // 관성 (나를 극)
  else rel = 4;                                  // 인성 (나를 생)
  return SHIN[rel][same];
}
/** 지지의 십신 (정기 기준) */
export function sipsinBranch(dayStem, branch) {
  const main = HIDDEN[branch][HIDDEN[branch].length - 1][0];
  return sipsin(dayStem, main);
}

export function unseong(dayStem, branch) {
  const start = JANGSAENG[dayStem];
  const dir = STEM_YIN[dayStem] === 0 ? 1 : -1;
  const idx = ((branch - start) * dir % 12 + 12) % 12;
  return UNSEONG[idx];
}

/* ───────────────────────── 신살 ───────────────────────── */

const CHEONEUL = [ // 일간별 천을귀인 지지
  [1,7],[0,8],[11,9],[11,9],[1,7],[0,8],[1,7],[6,2],[3,5],[3,5],
];
const DOHWA = {2:3,6:3,10:3, 8:9,0:9,4:9, 5:6,9:6,1:6, 11:0,3:0,7:0}; // 삼합국별 도화
const YEOKMA = {2:8,6:8,10:8, 8:2,0:2,4:2, 5:11,9:11,1:11, 11:5,3:5,7:5};
const HWAGAE = {2:10,6:10,10:10, 8:4,0:4,4:4, 5:1,9:1,1:1, 11:7,3:7,7:7};
const YANGIN = {0:3,2:6,4:6,6:9,8:0}; // 양간만

function sinsal(dayStem, dayBranch, yearBranch, branches) {
  const out = {};
  const hit = (arr) => branches.map((b,i)=>arr.includes(b)?i:-1).filter(i=>i>=0);
  out["천을귀인"] = hit(CHEONEUL[dayStem]);
  const dh = [DOHWA[dayBranch], DOHWA[yearBranch]];
  out["도화"] = hit(dh);
  out["역마"] = hit([YEOKMA[dayBranch], YEOKMA[yearBranch]]);
  out["화개"] = hit([HWAGAE[dayBranch], HWAGAE[yearBranch]]);
  if (YANGIN[dayStem] !== undefined) out["양인"] = hit([YANGIN[dayStem]]);
  return Object.fromEntries(Object.entries(out).filter(([,v]) => v.length));
}

/** 공망 */
function gongmang(dayIdx) {
  const head = dayIdx - (dayIdx % 10);
  const hb = head % 12;
  return [(hb + 10) % 12, (hb + 11) % 12];
}

/* ───────────────────────── 메인 계산 ───────────────────────── */

/**
 * @param {object} i
 *  year,month,day  출생 연월일 (입력 달력 기준)
 *  hour,minute     출생 시각 (출생지 시계 시각). 모르면 timeUnknown:true
 *  gender          "M" | "F"
 *  calendar        "solar"(기본) | "lunar"
 *  leapMonth       음력 입력 시 윤달 여부
 *  city            CITIES 키. 또는 longitude 직접 지정
 *  longitude       경도(동경 +). city보다 우선
 *  trueSolarTime   진태양시 보정 사용 (기본 true)
 *  dayBoundary     "23:00"(기본, 자시법) | "00:00"(야자시법)
 *  timeUnknown     시주 제외
 */
export function computeSaju(i) {
  // 화면에서는 "남"/"여"로, 코드에서는 "M"/"F"로 넘어온다. 둘 다 받는다.
  const gRaw = String(i.gender == null ? "" : i.gender).trim().toUpperCase();
  const gender = (gRaw.startsWith("F") || gRaw.startsWith("W")
                  || gRaw.indexOf("여") === 0 || gRaw === "2") ? "F" : "M";
  const useTST = i.trueSolarTime !== false;
  const boundary = i.dayBoundary || "23:00";

  // 1) 입력 달력 정규화
  //    화면에서는 "음"/"양"으로, 코드에서는 "lunar"/"solar"로 넘어온다. 둘 다 받는다.
  const calRaw = String(i.calendar == null ? "" : i.calendar).trim().toLowerCase();
  const isLunar = calRaw === "lunar" || calRaw === "음" || calRaw === "음력";
  let { year, month, day } = i;
  let lunarInput = null;
  if (isLunar) {
    lunarInput = { year, month, day, leap: !!i.leapMonth };
    ({ year, month, day } = lunarToSolar(year, month, day, !!i.leapMonth));
  }

  const hour   = i.timeUnknown ? 12 : (i.hour ?? 0);
  const minute = i.timeUnknown ? 0  : (i.minute ?? 0);
  const civilDate = dstr(year, month, day);

  // 2) 시간 보정 — 서머타임 → 표준자오선 → 진태양시
  const notes = [];
  let adj = 0;
  if (isDST(civilDate)) { adj -= 60; notes.push("서머타임 시행 기간: -60분"); }

  const mer = meridianFor(civilDate);
  const lon = i.longitude ?? CITIES[i.city] ?? CITIES["서울"];
  if (useTST) {
    const delta = Math.round((lon - mer.lon) * 4); // 경도 1도 = 4분
    adj += delta;
    notes.push(`표준자오선 ${mer.lon}°E 대비 경도보정: ${delta >= 0 ? "+" : ""}${delta}분`);
  } else {
    notes.push("진태양시 보정 미적용 (시계시각 그대로)");
  }

  // 보정된 "명식용 시각"
  let cm = hour * 60 + minute + adj;
  let cj = toJDN(year, month, day);
  while (cm < 0)     { cm += 1440; cj -= 1; }
  while (cm >= 1440) { cm -= 1440; cj += 1; }
  const corrected = fromJDN(cj);
  const cHour = Math.floor(cm / 60), cMin = cm % 60;

  // 3) 절기 기준 시각 (UTC epoch 분) — 절입 비교는 표준시 기준으로 한다
  const utcMin = minutesFromEpochUTC(year, month, day, hour, minute)
               - mer.offset - (isDST(civilDate) ? 60 : 0);
  const ti = termIndexBefore(utcMin);
  const curTerm = TERMS[ti], nextTerm = TERMS[ti + 1];

  // 4) 년주 — 입춘 기준
  //    현재 절기부터 거슬러 올라가 가장 가까운 입춘을 찾는다
  let ipchunIdx = ti;
  while (TERMS[ipchunIdx].name !== "입춘") ipchunIdx--;
  const ipchunYear = fromJDN(EPOCH_JDN + Math.floor(TERMS[ipchunIdx].utcMin / 1440)).year;
  const yearStem   = ((ipchunYear - 4) % 10 + 10) % 10;
  const yearBranch = ((ipchunYear - 4) % 12 + 12) % 12;

  // 5) 월주 — 절입 기준, 월두법
  const monthBranch = TERM_TO_BRANCH[curTerm.name];
  const offsetFromIn = ((monthBranch - 2) % 12 + 12) % 12;
  const monthStem = ((yearStem % 5) * 2 + 2 + offsetFromIn) % 10;

  // 6) 일주 — 보정시각 기준. 자시법이면 23시 이후 다음날로 넘긴다
  let dayJDN = cj;
  if (boundary === "23:00" && cHour >= 23) dayJDN += 1;
  const dayIdx    = (dayJDN + 49) % 60;
  const dayStem   = dayIdx % 10;
  const dayBranch = dayIdx % 12;

  // 7) 시주 — 시두법
  let hourStem = null, hourBranch = null;
  if (!i.timeUnknown) {
    hourBranch = Math.floor((cm + 60) / 120) % 12;
    hourStem = ((dayStem % 5) * 2 + hourBranch) % 10;
  }

  const pillars = {
    year:  { stem: yearStem,  branch: yearBranch },
    month: { stem: monthStem, branch: monthBranch },
    day:   { stem: dayStem,   branch: dayBranch },
    hour:  i.timeUnknown ? null : { stem: hourStem, branch: hourBranch },
  };

  // 8) 오행 분포 (천간 1.0 / 지지 정기 1.0 / 지지 여·중기 0.5 가중)
  const dist = [0,0,0,0,0];
  const addStem = (s) => { dist[STEM_EL[s]] += 1; };
  const addBranch = (b) => {
    const h = HIDDEN[b];
    h.forEach((x, k) => { dist[STEM_EL[x[0]]] += (k === h.length - 1 ? 1 : 0.5); });
  };
  for (const key of ["year","month","day","hour"]) {
    const p = pillars[key]; if (!p) continue;
    addStem(p.stem); addBranch(p.branch);
  }
  const total = dist.reduce((a,b)=>a+b,0);
  const elements = EL.map((n, k) => ({
    name: n, score: +dist[k].toFixed(1), ratio: +(dist[k] / total * 100).toFixed(1),
  }));

  // 9) 대운
  const forward = (STEM_YIN[yearStem] === 0) === (gender === "M");
  let spanMin;
  if (forward) spanMin = nextTerm.utcMin - utcMin;
  else         spanMin = utcMin - curTerm.utcMin;
  /* 3일을 1년으로 환산한다. 만세력은 날수를 세어 3으로 나눈 몫을 쓰고 나머지는 버린다.
     분 단위로 반올림하면 같은 날 태어나도 시각에 따라 대운수가 한 살씩 튄다. */
  const spanDays = Math.floor(spanMin / 1440);
  const daeunNum = Math.max(1, Math.floor(spanDays / 3));
  const remDays  = spanDays - daeunNum * 3;
  const exactStartAge = spanMin / 1440 / 3;   // 참고용 정밀값

  const daeun = [];
  for (let k = 1; k <= 10; k++) {
    const step = forward ? k : -k;
    daeun.push({
      order: k,
      startAge: daeunNum + (k - 1) * 10,
      stem:   ((monthStem + step) % 10 + 10) % 10,
      branch: ((monthBranch + step) % 12 + 12) % 12,
    });
  }

  // 10) 부가 정보
  const branchesArr = [yearBranch, monthBranch, dayBranch].concat(
    i.timeUnknown ? [] : [hourBranch]);
  const gm = gongmang(dayIdx);

  const fmt = (p) => p == null ? null : {
    stem: STEMS[p.stem], stemCn: STEMS_CN[p.stem],
    branch: BRANCHES[p.branch], branchCn: BRANCHES_CN[p.branch],
    gapja: STEMS[p.stem] + BRANCHES[p.branch],
    gapjaCn: STEMS_CN[p.stem] + BRANCHES_CN[p.branch],
    stemElement: EL[STEM_EL[p.stem]],
    branchElement: EL[BRANCH_EL[p.branch]],
    stemSipsin: p.stem === dayStem && p === pillars.day ? "일간" : sipsin(dayStem, p.stem),
    branchSipsin: sipsinBranch(dayStem, p.branch),
    unseong: unseong(dayStem, p.branch),
    hidden: HIDDEN[p.branch].map(([s]) => STEMS[s]),
  };

  return {
    input: {
      given: { year: i.year, month: i.month, day: i.day,
               hour: i.timeUnknown ? null : i.hour, minute: i.timeUnknown ? null : i.minute,
               calendar: isLunar ? "음" : "양", leapMonth: !!i.leapMonth,
               lunar: lunarInput },
      gender, city: i.city ?? null, longitude: lon, timeUnknown: !!i.timeUnknown,
      dayBoundary: boundary,
    },
    solar: { year, month, day, hour, minute },
    lunar: (() => { const l = solarToLunar(year, month, day);
                    return { ...l, label: `${l.year}-${l.month}-${l.day}${l.leap ? " (윤달)" : ""}` }; })(),
    corrected: {
      year: corrected.year, month: corrected.month, day: corrected.day,
      hour: cHour, minute: cMin, shiftMinutes: adj, notes,
    },
    term: {
      current: curTerm.name,
      currentAt: epochToKST(curTerm.utcMin, mer.offset),
      next: nextTerm ? nextTerm.name : null,
      nextAt: nextTerm ? epochToKST(nextTerm.utcMin, mer.offset) : null,
    },
    zodiac: ZODIAC[yearBranch],
    pillars: {
      year: fmt(pillars.year), month: fmt(pillars.month),
      day: fmt(pillars.day), hour: fmt(pillars.hour),
    },
    dayMaster: {
      stem: STEMS[dayStem], stemCn: STEMS_CN[dayStem],
      element: EL[STEM_EL[dayStem]], yinyang: STEM_YIN[dayStem] === 0 ? "양" : "음",
    },
    elements,
    gongmang: gm.map(b => BRANCHES[b]),
    sinsal: sinsal(dayStem, dayBranch, yearBranch, branchesArr),
    daeun: {
      direction: forward ? "순행" : "역행",
      startNumber: daeunNum,
      calc: {
        forward, spanDays, remDays, exactStartAge: +exactStartAge.toFixed(2),
        fromTerm: forward ? (nextTerm ? nextTerm.name : null) : curTerm.name,
        fromAt: forward ? (nextTerm ? epochToKST(nextTerm.utcMin, mer.offset) : null)
                        : epochToKST(curTerm.utcMin, mer.offset),
      },
      list: daeun.map(d => ({
        ...d, gapja: STEMS[d.stem] + BRANCHES[d.branch],
        gapjaCn: STEMS_CN[d.stem] + BRANCHES_CN[d.branch],
        sipsin: sipsin(dayStem, d.stem),
      })),
    },
  };
}

function epochToKST(utcMin, offsetMin) {
  const t = utcMin + offsetMin;
  const d = fromJDN(EPOCH_JDN + Math.floor(t / 1440));
  const r = ((t % 1440) + 1440) % 1440;
  return `${d.year}-${pad(d.month)}-${pad(d.day)} ${pad(Math.floor(r/60))}:${pad(r%60)}`;
}

/** 특정 연도의 세운 간지 (입춘 기준) */
export function seun(year) {
  const s = ((year - 4) % 10 + 10) % 10;
  const b = ((year - 4) % 12 + 12) % 12;
  return { year, stem: STEMS[s], branch: BRANCHES[b],
           gapja: STEMS[s] + BRANCHES[b], gapjaCn: STEMS_CN[s] + BRANCHES_CN[b] };
}
