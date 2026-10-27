/* 전수 스캔 — undefined / 조사 오류 / 중복 문장 / 빈 본문 */
import { computeSaju, CITIES, lunarToSolar, solarToLunar } from "./saju.js";
import { JOB_OPTIONS, JOB_GROUPS, modernFit, jobMatch, fixJosa } from "./report.js";
import { buildSimple, buildManse, buildTeamCompat, buildCompatReport } from "./manse.js";
import { buildSinsal } from "./sinsal.js";
import { EXAMPLES, examplesFor, hasExample } from "./examples.js";

const BAD_JOSA = [
  /수은\b/, /수이\s/, /금를/, /목를/, /화를\s살/, /[가-힣]이\s받쳐주는\s구도/,
  /\*\*\*\*/,                   // 이중 볼드
  /undefined/, /NaN/, /\[object/,
  /§[AB]/,                      // 미치환 토큰
  /앞사람|뒷사람/,
];
const cities = Object.keys(CITIES).slice(0, 6);
let probs = 0, checked = 0;
const seen = new Map();

function check(label, obj) {
  const walk = (v, path) => {
    if (typeof v === "string") {
      checked++;
      for (const re of BAD_JOSA)
        if (re.test(v)) { console.log(`✗ [${label}] ${path}\n   ${re} → ${v.slice(0, 160)}`); probs++; }
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => walk(x, `${path}.${k}`));
    else if (v === undefined) { console.log(`✗ [${label}] ${path} = undefined`); probs++; }
  };
  walk(obj, "");
}

let n = 0;
for (let y = 1960; y <= 2008; y += 4)
for (const mo of [1, 3, 6, 9, 12])
for (const d of [1, 15, 28])
for (const h of [0, 7, 13, 23])
for (const gd of ["남", "여"]) {
  const saju = computeSaju({
    year: y, month: mo, day: d, hour: h, minute: 30, gender: gd,
    calendar: n % 7 === 0 ? "음" : "양",
    city: cities[n % cities.length], trueSolarTime: true,
    dayBoundary: n % 3 === 0 ? "00:00" : "23:00",
  });
  const job = JOB_OPTIONS[n % JOB_OPTIONS.length].v;
  const label = `${y}-${mo}-${d} ${h}시 ${gd} ${job}`;
  try {
    const sp = buildSimple(saju, { job });
    check(label, sp);
    // 빈 본문 검사
    sp.cats.forEach(c => c.items.forEach(it => {
      if (!it.body.length) { console.log(`✗ [${label}] ${c.name} #${it.no} 본문 비었음: ${it.q}`); probs++; }
      if (!it.q) { console.log(`✗ [${label}] ${c.name} #${it.no} 질문 없음`); probs++; }
    }));
    // 항목 수
    sp.cats.forEach(c => { if (c.items.length !== 6) { console.log(`✗ [${label}] ${c.name} 항목 ${c.items.length}개`); probs++; } });
    // 만세력 4주
    if (sp.manse.cols.length !== 4) { console.log(`✗ [${label}] 만세력 기둥 ${sp.manse.cols.length}개`); probs++; }
    // 중복 문장 수집 (같은 명식 안에서)
    const bag = new Set();
    sp.cats.forEach(c => c.items.forEach(it => it.body.forEach(b => {
      const key = b.replace(/[\d.%]/g, "").trim();
      if (key.length > 40) {
        if (bag.has(key)) seen.set(key, (seen.get(key) || 0) + 1);
        bag.add(key);
      }
    })));
  } catch (e) {
    console.log(`✗✗ [${label}] 예외: ${e.message}`);
    probs++;
  }
  n++;
}

/* 팀 궁합 — 2~5인 조합 */
const pool = [
  { name: "소영", y: 1967, m: 10, d: 26, h: 8, g: "여" },
  { name: "윤주", y: 1995, m: 3, d: 14, h: 10, g: "여" },
  { name: "혁주", y: 1998, m: 7, d: 22, h: 14, g: "남" },
  { name: "민",   y: 1993, m: 2, d: 9,  h: 22, g: "남" },
  { name: "하늘", y: 2001, m: 11, d: 3, h: 4, g: "여" },
].map(p => ({ name: p.name, saju: computeSaju({ year: p.y, month: p.m, day: p.d, hour: p.h, minute: 0, gender: p.g, calendar: "양", city: "서울", trueSolarTime: true, dayBoundary: "23:00" }) }));

for (let k = 2; k <= 5; k++) {
  for (let off = 0; off + k <= pool.length; off++) {
    const grp = pool.slice(off, off + k);
    try {
      const t = buildTeamCompat(grp);
      check(`team-${k}-${off}`, t);
      if (t.pairs.length !== k * (k - 1) / 2) { console.log(`✗ team-${k} pairs ${t.pairs.length}`); probs++; }
      if (!t.members.every(mm => mm.teamRole)) { console.log(`✗ team-${k} 역할 누락`); probs++; }
    } catch (e) { console.log(`✗✗ team-${k}-${off}: ${e.message}`); probs++; }
  }
}

/* 연인 궁합 */
for (let i = 0; i < pool.length; i++)
for (let j = i + 1; j < pool.length; j++) {
  try {
    const c = buildCompatReport(pool[i].saju, pool[j].saju, { nameA: pool[i].name, nameB: pool[j].name });
    check(`compat-${pool[i].name}-${pool[j].name}`, c);
  } catch (e) { console.log(`✗✗ compat ${i}${j}: ${e.message}`); probs++; }
}

const dups = [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log(`\n명식 ${n}개 · 문장 ${checked}개 검사 · 문제 ${probs}건`);
if (dups.length) { console.log("\n한 결과지 안에서 반복되는 문장:"); dups.forEach(([t, c]) => console.log(`  (${c}회) ${t.slice(0, 110)}`)); }
else console.log("한 결과지 안의 중복 문장: 없음");

/* 이름 조사 집중 검사 — 종성 있는 이름 / 없는 이름을 섞어 모든 분기를 돌린다 */
const NAMES = ["민", "소영", "박준", "하나", "김솔", "수아", "정현", "유리"];
const BIRTHS = [
  [1988, 2, 4, 5], [1991, 5, 20, 11], [1994, 8, 8, 17], [1997, 11, 12, 23],
  [2000, 1, 30, 3], [2003, 6, 15, 14], [1985, 9, 1, 8], [1979, 12, 24, 20],
];
const JOSA_BAD = [
  /[가-힣]+(?<!이)이\s(받쳐|끌려|눌립|끌고|맡는)/,   // 받침 없는 이름 + 이
  /[^\s]*[^\s가-힣]*[가-힣]+을\s(누릅|살립)/,         // 거친 검사 — 아래에서 정밀 검사
  /§/,
];
let jp = 0, jc = 0;
for (let i = 0; i < BIRTHS.length; i++)
for (let j = 0; j < BIRTHS.length; j++) {
  if (i === j) continue;
  const mkS = ([y, mo, d, h]) => computeSaju({ year:y, month:mo, day:d, hour:h, minute:0,
    gender: h % 2 ? "남" : "여", calendar:"양", city:"서울", trueSolarTime:true, dayBoundary:"23:00" });
  const t = buildTeamCompat([
    { name: NAMES[i], saju: mkS(BIRTHS[i]) },
    { name: NAMES[j], saju: mkS(BIRTHS[j]) },
  ]);
  const all = [...t.pairs.flatMap(p => p.lines), ...t.howTo, ...t.risks];
  all.forEach(line => {
    jc++;
    // 정밀 검사: 이름 뒤 조사가 종성과 맞는지
    [NAMES[i], NAMES[j]].forEach(nm => {
      const jong = (nm.charCodeAt(nm.length - 1) - 0xac00) % 28 !== 0;
      const wrong = jong
        ? [nm + "가", nm + "는", nm + "를", nm + "와", nm + "라서", nm + "로 "]
        : [nm + "이 ", nm + "은 ", nm + "을 ", nm + "과 ", nm + "이라서", nm + "으로 "];
      wrong.forEach(w => { if (line.includes(w)) { console.log(`✗ 조사 [${nm}] "${w}" → ${line.slice(0,120)}`); jp++; } });
    });
    if (/§/.test(line)) { console.log(`✗ 미치환 토큰 → ${line.slice(0,120)}`); jp++; }
  });
}
console.log(`\n이름 조사 검사: 문장 ${jc}개 · 오류 ${jp}건`);


/* ── 직업 목록 무결성 + 전 직업 verdict 검사 ── */
{
  const probe = computeSaju({ year:1995, month:3, day:14, hour:10, minute:30, gender:"남",
    calendar:"양", city:"서울", trueSolarTime:true, dayBoundary:"23:00" });
  const fields = new Set(modernFit(probe).all.map(f => f.k));
  const groups = new Set(JOB_GROUPS);
  let jf = 0;

  const vs = JOB_OPTIONS.map(o => o.v);
  vs.filter((v, i) => vs.indexOf(v) !== i).forEach(v => { console.log("✗ 중복 v: " + v); jf++; });
  JOB_OPTIONS.forEach(o => {
    if (!groups.has(o.g)) { console.log(`✗ 없는 업종 그룹: ${o.v} → ${o.g}`); jf++; }
    if (o.field && !fields.has(o.field)) { console.log(`✗ 없는 분야: ${o.v} → ${o.field}`); jf++; }
    if (!o.field && !o.note) { console.log(`✗ 분야 없는 직업인데 note 없음: ${o.v}`); jf++; }
  });
  JOB_GROUPS.forEach(g => {
    if (!JOB_OPTIONS.some(o => o.g === g)) { console.log(`✗ 빈 업종 그룹: ${g}`); jf++; }
  });
  /* 조사 사전 등록 여부 */
  [...fields, ...groups].forEach(k => {
    const jongK = (k.slice(-1).charCodeAt(0) - 0xAC00) % 28 !== 0;
    if (jongK && fixJosa(k + "가") === k + "가") { console.log(`✗ 조사 사전 누락: ${k}`); jf++; }
  });

  /* 모든 명식 × 모든 직업 */
  const BIRTHS = [];
  for (let y = 1964; y <= 2006; y += 7)
  for (const mo of [1, 4, 7, 10])
  for (const gd of ["남", "여"]) BIRTHS.push([y, mo, 12, 9, gd]);

  let jc = 0;
  BIRTHS.forEach(([y, mo, d, hh, gd]) => {
    const saju = computeSaju({ year:y, month:mo, day:d, hour:hh, minute:0, gender:gd,
      calendar:"양", city:"서울", trueSolarTime:true, dayBoundary:"23:00" });
    JOB_OPTIONS.forEach(o => {
      const j = jobMatch(saju, o.v);
      if (!j) { console.log(`✗ jobMatch null: ${o.v}`); jf++; return; }
      [j.verdict, j.bridge, j.mode].filter(Boolean).forEach(t => {
        jc++;
        const fixed = fixJosa(t);
        if (/undefined|NaN|\[object|§/.test(fixed)) { console.log(`✗ [${y} ${o.v}] ${fixed.slice(0,140)}`); jf++; }
        /* 조사: 분야명 바로 뒤 */
        [...fields].forEach(k => {
          const jongK = (k.slice(-1).charCodeAt(0) - 0xAC00) % 28 !== 0;
          const wrong = jongK ? [k+"가 ", k+"는 ", k+"를 ", k+"와 "] : [k+"이 ", k+"은 ", k+"을 ", k+"과 "];
          wrong.forEach(w => { if (fixed.includes(w)) { console.log(`✗ 조사 [${k}] "${w.trim()}" → ${fixed.slice(0,120)}`); jf++; } });
        });
      });
      /* 순위와 문구가 어긋나지 않는지 */
      if (j.rank === 2 && /명식과 거리가 있습니다/.test(j.verdict)) { console.log(`✗ 2순위인데 '거리가 있다': ${y} ${o.v}`); jf++; }
      if (j.rank === 1 && j.bridge) { console.log(`✗ 1순위인데 bridge 있음: ${y} ${o.v}`); jf++; }
    });
  });
  console.log(`\n직업 검사: 명식 ${BIRTHS.length}개 × 직업 ${JOB_OPTIONS.length}개 · 문장 ${jc}개 · 오류 ${jf}건`);
}


/* ── 신살 전수 검사 ── */
{
  let sf = 0, sc = 0, hit = {};
  const TW = ["겁살","재살","천살","지살","연살","월살","망신살","장성살","반안살","역마살","육해살","화개살"];
  /* 연도는 12와 서로소인 간격으로 건너뛴다. 3씩 건너뛰면 년지가 네 개만 나온다 */
  for (let y = 1930; y <= 2020; y += 1)
  for (const mo of [2, 6, 10])
  for (const d of [9, 24])
  for (const hh of [2, 13, 20]) {
    const saju = computeSaju({ year:y, month:mo, day:d, hour:hh, minute:0, gender: hh % 2 ? "남" : "여",
      calendar:"양", city:"서울", trueSolarTime:true, dayBoundary:"23:00" });
    const S = buildSinsal(saju);
    sc++;
    /* 십이신살은 기둥마다 정확히 하나, 이름이 열둘 안에 있어야 한다 */
    ["year","month","day","hour"].forEach(k => {
      const t = S.twelve[k];
      if (!t || !t.name) { console.log(`✗ 십이신살 없음 ${y} ${k}`); sf++; return; }
      if (TW.indexOf(t.name) < 0) { console.log(`✗ 이상한 십이신살 ${t.name}`); sf++; }
      if (!t.cn) { console.log(`✗ 십이신살 한자 없음 ${t.name}`); sf++; }
    });
    /* 모든 항목에 한자·설명·자리가 있어야 하고, 기둥이 중복되면 안 된다 */
    S.list.forEach(x => {
      hit[x.name] = (hit[x.name] || 0) + 1;
      if (!x.cn || !x.short || !x.long || !x.where) { console.log(`✗ 설명 누락 ${x.name}`); sf++; }
      if (["길","중","흉"].indexOf(x.kind) < 0) { console.log(`✗ 분류 이상 ${x.name} ${x.kind}`); sf++; }
      if (new Set(x.whereKeys).size !== x.whereKeys.length) { console.log(`✗ 기둥 중복 ${x.name} ${x.where}`); sf++; }
      if (/undefined|NaN|\[object/.test(x.short + x.long + x.where)) { console.log(`✗ ${x.name} 문자열 이상`); sf++; }
    });
    /* 같은 이름이 두 번 들어가면 안 된다 */
    const nm = S.list.map(x => x.name);
    nm.filter((v, i) => nm.indexOf(v) !== i).forEach(v => { console.log(`✗ 목록 중복 ${y}: ${v}`); sf++; });
    if (/undefined|NaN/.test(S.summary + S.note + S.twelveBase)) { console.log(`✗ 요약 이상 ${y}`); sf++; }
  }
  const names = Object.keys(hit).sort((a, b) => hit[b] - hit[a]);
  const miss = ["천을귀인","천덕귀인","월덕귀인","문창귀인","학당귀인","태극귀인","금여","건록","암록",
    "도화","홍염살","역마","화개","양인","백호살","괴강살","고란살","현침살","원진살","귀문관살",
    "천라지망","급각살","탕화살","장성살","반안살","지살","겁살","재살","망신살","월살","육해살","천살"]
    .filter(n => !hit[n]);
  if (miss.length) { console.log("✗ 한 번도 안 잡힌 신살: " + miss.join(", ")); sf += miss.length; }
  console.log(`\n신살 검사: 명식 ${sc}개 · 오류 ${sf}건`);
  console.log(`잡힌 신살 ${names.length}종 — ` + names.map(n => `${n} ${(hit[n]/sc*100).toFixed(0)}%`).join(", "));
}


/* ── 음력 입력 검사 — "음"/"lunar" 둘 다 변환되어야 한다 ── */
{
  let lf = 0, lc = 0;
  const base = { hour:8, minute:18, gender:"여", city:"서울", trueSolarTime:true, dayBoundary:"23:00" };
  for (let y = 1920; y <= 2030; y += 3)
  for (const mo of [1, 3, 6, 9, 11])
  for (const d of [2, 15, 28]) {
    /* 그 음력 날짜가 실제로 있는지 먼저 확인 */
    const sol = lunarToSolar(y, mo, d, false);
    if (!sol || !sol.year) continue;
    const back = solarToLunar(sol.year, sol.month, sol.day);
    if (!back || back.year !== y || back.month !== mo || back.day !== d) continue;
    lc++;

    const byKo = computeSaju({ ...base, year:y, month:mo, day:d, calendar:"음" });
    const byEn = computeSaju({ ...base, year:y, month:mo, day:d, calendar:"lunar" });
    const asSolar = computeSaju({ ...base, year:sol.year, month:sol.month, day:sol.day, calendar:"양" });

    if (byKo.pillars.day.gapja !== byEn.pillars.day.gapja) {
      console.log(`✗ "음"과 "lunar"가 다름 ${y}-${mo}-${d}`); lf++;
    }
    if (byKo.pillars.day.gapja !== asSolar.pillars.day.gapja) {
      console.log(`✗ 음력 ${y}-${mo}-${d} 변환 불일치: 음력입력 ${byKo.pillars.day.gapjaCn} ≠ 양력(${sol.year}-${sol.month}-${sol.day}) ${asSolar.pillars.day.gapjaCn}`); lf++;
    }
    if (byKo.solar.year !== sol.year || byKo.solar.month !== sol.month || byKo.solar.day !== sol.day) {
      console.log(`✗ 음력 ${y}-${mo}-${d} solar 필드 틀림: ${JSON.stringify(byKo.solar)}`); lf++;
    }
    if (byKo.lunar.year !== y || byKo.lunar.month !== mo || byKo.lunar.day !== d) {
      console.log(`✗ 음력 ${y}-${mo}-${d} lunar 필드 틀림: ${byKo.lunar.label}`); lf++;
    }
    if (byKo.input.given.calendar !== "음" || asSolar.input.given.calendar !== "양") {
      console.log(`✗ given.calendar 틀림 ${y}-${mo}-${d}`); lf++;
    }
  }
  /* 윤달 */
  [[2020,4],[2023,2],[2025,6],[2028,5]].forEach(([y, mo]) => {
    const p = computeSaju({ ...base, year:y, month:mo, day:10, calendar:"음", leapMonth:true });
    const n = computeSaju({ ...base, year:y, month:mo, day:10, calendar:"음", leapMonth:false });
    lc += 2;
    if (!p.lunar.leap) { console.log(`✗ ${y} 윤${mo}월이 윤달로 안 잡힘`); lf++; }
    if (n.lunar.leap)  { console.log(`✗ ${y} 평${mo}월이 윤달로 잡힘`); lf++; }
    if (p.pillars.day.gapja === n.pillars.day.gapja) { console.log(`✗ ${y} 윤${mo}월과 평${mo}월이 같은 일주`); lf++; }
  });
  console.log(`\n음력 입력 검사: ${lc}건 · 오류 ${lf}건`);
}


/* ── 성별·대운 검사 ── */
{
  let gf = 0, gc = 0;
  for (let y = 1920; y <= 2030; y++)
  for (const mo of [2, 6, 11])
  for (const g of ["남", "여"]) {
    const a = computeSaju({ year:y, month:mo, day:14, hour:7, minute:30, gender:g,
      calendar:"양", city:"서울", trueSolarTime:true, dayBoundary:"23:00" });
    gc++;
    /* 한글 성별이 제대로 들어갔는지 */
    const want = g === "여" ? "F" : "M";
    if (a.input.gender !== want) { console.log(`✗ 성별 ${y} ${g} → ${a.input.gender}`); gf++; }
    /* 양남음녀 순행 / 음남양녀 역행 */
    const yangYear = ((y - 4) % 10 + 10) % 10 % 2 === 0;
    const dirWant = (yangYear === (g === "남")) ? "순행" : "역행";
    if (a.daeun.direction !== dirWant) { console.log(`✗ 대운 방향 ${y} ${g}: ${a.daeun.direction} ≠ ${dirWant}`); gf++; }
    /* 대운수 1~10, 칸 나이는 정수이고 10년 간격 */
    if (!(a.daeun.startNumber >= 1 && a.daeun.startNumber <= 10)) { console.log(`✗ 대운수 ${y} ${g}: ${a.daeun.startNumber}`); gf++; }
    a.daeun.list.forEach((d, k) => {
      if (!Number.isInteger(d.startAge)) { console.log(`✗ 대운 나이 정수 아님 ${y}: ${d.startAge}`); gf++; }
      if (d.startAge !== a.daeun.startNumber + k * 10) { console.log(`✗ 대운 간격 ${y} ${k}`); gf++; }
    });
    /* 같은 생일 남녀는 방향이 반대라 간지도 달라야 한다 */
    if (g === "여") {
      const m = computeSaju({ year:y, month:mo, day:14, hour:7, minute:30, gender:"남",
        calendar:"양", city:"서울", trueSolarTime:true, dayBoundary:"23:00" });
      if (m.daeun.direction === a.daeun.direction) { console.log(`✗ ${y} 남녀 대운 방향이 같음`); gf++; }
      if (m.daeun.list[0].gapja === a.daeun.list[0].gapja) { console.log(`✗ ${y} 남녀 첫 대운 간지가 같음`); gf++; }
    }
    /* 여자는 배우자를 관성으로, 남자는 재성으로 본다 — report 쪽 분기가 살아있는지 */
    if (/undefined|NaN/.test(JSON.stringify(a.daeun.calc))) { console.log(`✗ 대운 근거 이상 ${y}`); gf++; }
  }
  console.log(`\n성별·대운 검사: ${gc}건 · 오류 ${gf}건`);
}


/* ── 예시 검사 ── */
{
  let ef = 0;
  /* 사전 자체 */
  const ks = EXAMPLES.map(e => e.k);
  ks.filter((v, i) => ks.indexOf(v) !== i).forEach(k => { console.log(`✗ 예시 키 중복: ${k}`); ef++; });
  EXAMPLES.forEach(e => {
    if (!e.k || e.k.length < 4) { console.log(`✗ 예시 키가 너무 짧음: ${e.k}`); ef++; }
    if (!e.ex || !e.ex.length) { console.log(`✗ 예시 없음: ${e.k}`); ef++; }
    (e.ex || []).forEach(x => {
      if (typeof x !== "string" || x.trim().length < 15) { console.log(`✗ 예시가 빈약함: ${e.k}`); ef++; }
      if (/undefined|NaN|\[object/.test(x)) { console.log(`✗ 예시 문자열 이상: ${e.k}`); ef++; }
    });
    /* 짝 가운데 적어도 하나는 손에 잡혀야 한다 — 숫자·실제 문장·시기·장치 중 하나 */
    const CONCRETE = new RegExp(["[0-9]","\u201C|\u201D",
      "분기|달력|하루|이번 달|연초|주말|요일|날짜|기간",
      "한 줄|한 문장|한 번|하나|한 군데|세 명|세 줄|절반",
      "적어|써 두|쓰세요|메모|목록|문서|기록|종이|노트",
      "통장|자동이체|카드|계약서|견적서|명함|포트폴리오|링크|녹화|앱",
      "화분|조명|서랍|스트레칭|산책|운동|검진|소화기",
      "전화|문자|메시지|통화|연락|회의|사표",
      "규칙|기준|장치|상한선"].join("|"));
    if (!(e.ex || []).some(x => CONCRETE.test(x))) {
      console.log(`✗ 예시가 둘 다 추상적임: ${e.k} → ${(e.ex || [])[0] ? e.ex[0].slice(0, 60) : ""}`); ef++;
    }
  });

  /* 조언이 있는 항목에 예시가 붙는지 */
  const RE = /(세요|십시오|편이 (낫|맞|안전|유리|빠르)|쪽이 (낫|맞|유리|빠르|안전)|해야 (합니다|한다)|하셔야|야 합니다|구조가 맞|방식이 맞|로 가야|면 됩니다|것이 좋습니다|필요합니다|유리합니다|안전합니다)[.!]?$/;
  let tot = 0, cov = 0, plain = 0, gap = 0;
  let k = 0;
  for (let y = 1952; y <= 2008; y += 4)
  for (const mo of [2, 8])
  for (const gd of ["남", "여"]) {
    const saju = computeSaju({ year:y, month:mo, day:11, hour:(k % 4) * 6 + 3, minute:0, gender:gd,
      calendar:"양", city:"서울", trueSolarTime:true, dayBoundary:"23:00" });
    buildSimple(saju, { job: JOB_OPTIONS[k % JOB_OPTIONS.length].v }).cats.forEach(c => c.items.forEach(it => {
      tot++;
      const all = it.body.concat(it.action || [], it.evidence || []).join("\n").replace(/\*\*/g, "");
      const advice = all.split(/(?<=[.!?])\s+|\n/).map(x => x.trim()).filter(x => x.length > 8 && RE.test(x));
      if (it.examples && it.examples.length) {
        cov++;
        if (it.examples.length > 2) { console.log(`✗ 예시가 3개 이상: ${it.q}`); ef++; }
        it.examples.forEach(x => { if (/undefined|NaN|§/.test(x)) { console.log(`✗ 예시 내용 이상: ${it.q}`); ef++; } });
      }
      else if (!advice.length) plain++;
      else { gap++; if (gap <= 5) console.log(`· 예시 빠짐: ${it.q} — ${advice[0].slice(0, 60)}`); }
    }));
    k++;
  }
  const rate = cov / (cov + gap) * 100;
  console.log(`\n예시 검사: 항목 ${tot}개 · 예시 있음 ${cov} · 조언 없는 서술 항목 ${plain} · 빠짐 ${gap}`);
  console.log(`조언이 있는 항목 기준 적용률 ${rate.toFixed(0)}% · 사전 ${EXAMPLES.length}개 키 / 예시 ${EXAMPLES.reduce((a,e)=>a+e.ex.length,0)}문장 · 오류 ${ef}건`);
  if (rate < 90) { console.log("✗ 적용률이 90% 아래입니다"); }
}
