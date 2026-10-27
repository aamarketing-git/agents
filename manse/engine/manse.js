/* ═══════════════════════════════════════════════════════════
 *  manse.js — 만세력 중심 구조
 *
 *  1) buildManse(saju)              전통 만세력 표 데이터
 *  2) buildSimple(saju, opts)       6개 카테고리 × 6항목 (기본·금전·연애·사업·직업·미래)
 *  3) buildTeamCompat(members, o)   2~5인 비즈니스 궁합 (관계사주)
 *
 *  report.js / saju.js 의 기존 내용을 그대로 재사용한다.
 * ═══════════════════════════════════════════════════════════ */

import { sipsin, seun, computeSaju } from "./saju.js";
import {
  analyzeStrength, johuYongsin, yongsinCompare, METHOD_NOTE,
  buildLifeReport, buildWealthReport, buildDestinyReport, buildYearReport,
  buildCompatReport, personaType, jobMatch, modernFit, workMode,
  leaderType, commStyle, dominantSipsin, exactAge, ageInYear,
  goodYears, yongsinYears, riskYears, yearLine,
  polish, fixJosa,
} from "./report.js";
import { buildSinsal } from "./sinsal.js";
import { GLOSS, plainOf } from "./glossary.js";
import { examplesFor } from "./examples.js";

/* ───────── 공통 소도구 ───────── */
function mHasJong(w) {
  const c = String(w || "").slice(-1).charCodeAt(0);
  if (isNaN(c) || c < 0xac00 || c > 0xd7a3) return false;
  return (c - 0xac00) % 28 !== 0;
}
const mIGA = (w) => w + (mHasJong(w) ? "이" : "가");
const mEUN = (w) => w + (mHasJong(w) ? "은" : "는");
const mEUL = (w) => w + (mHasJong(w) ? "을" : "를");
const mWA  = (w) => w + (mHasJong(w) ? "과" : "와");

const M_GEN    = { 목:"화", 화:"토", 토:"금", 금:"수", 수:"목" };
const M_CTL    = { 목:"토", 화:"금", 토:"수", 금:"목", 수:"화" };
const M_GEN_BY = { 목:"수", 화:"목", 토:"화", 금:"토", 수:"금" };
const M_CTL_BY = { 목:"금", 화:"수", 토:"목", 금:"화", 수:"토" };

const MGAN = ["갑","을","병","정","무","기","경","신","임","계"];
const MGAN_CN = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
const MJI = ["자","축","인","묘","진","사","오","미","신","유","술","해"];
const MJI_CN = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
const MGAN_EL = { 갑:"목",을:"목",병:"화",정:"화",무:"토",기:"토",경:"금",신:"금",임:"수",계:"수" };
const MJI_EL  = { 자:"수",축:"토",인:"목",묘:"목",진:"토",사:"화",오:"화",미:"토",신:"금",유:"금",술:"토",해:"수" };
const MGAN_YY = { 갑:"양",을:"음",병:"양",정:"음",무:"양",기:"음",경:"양",신:"음",임:"양",계:"음" };
const MJI_YY  = { 자:"양",축:"음",인:"양",묘:"음",진:"양",사:"음",오:"양",미:"음",신:"양",유:"음",술:"양",해:"음" };

const EL_COLOR = { 목:"#2E8B57", 화:"#D2544E", 토:"#B98A2E", 금:"#8A8F98", 수:"#2F6DB5" };
const EL_WORDS = { 목:"나무", 화:"불", 토:"흙", 금:"쇠", 수:"물" };
const LEVEL_PLAIN = {
  신강: "나를 돕는 기운이 넉넉한 편이라, 스스로 밀고 나가는 힘이 있습니다.",
  신약: "나를 돕는 기운이 여린 편이라, 주변과 때의 영향을 크게 받습니다.",
  중화: "어느 쪽으로도 크게 치우치지 않아 고른 편입니다.",
};
const EL_CN = { 목:"木", 화:"火", 토:"土", 금:"金", 수:"水" };

/* 십신 → 5역할 */
const ROLE_OF = {
  비견:"비겁", 겁재:"비겁", 식신:"식상", 상관:"식상",
  편재:"재성", 정재:"재성", 편관:"관성", 정관:"관성",
  편인:"인성", 정인:"인성", 일간:"비겁",
};

/* ═══════════════════════════════════════════════════════════
 *  1. buildManse — 생년월일시를 넣으면 만세력이 나온다
 * ═══════════════════════════════════════════════════════════ */

const PILLAR_MEAN = {
  hour:  { label:"시주", sub:"時", palace:"자녀·말년", mean:"태어난 시각의 기둥입니다. 말년의 자리이고, 겉으로 잘 드러나지 않는 속마음과 노후의 결을 봅니다." },
  day:   { label:"일주", sub:"日", palace:"나·배우자", mean:"나 자신의 기둥입니다. 천간이 '나'이고 지지가 배우자 자리라, 여덟 글자에서 가장 먼저 보는 곳입니다." },
  month: { label:"월주", sub:"月", palace:"부모·직업", mean:"태어난 달의 기둥입니다. 사주의 계절을 정하는 자리로, 사회에서 쓰는 힘과 직업의 결이 여기서 나옵니다." },
  year:  { label:"년주", sub:"年", palace:"조상·초년", mean:"태어난 해의 기둥입니다. 집안과 초년의 환경, 그리고 바깥에서 보이는 나의 모습을 봅니다." },
};

const EL_LACK = {
  목:"뻗어나가는 힘이 모자랍니다. 새로 시작하거나 넓히는 일에서 추진력이 떨어집니다.",
  화:"드러내는 힘이 모자랍니다. 좋은 것을 만들어도 알리는 데서 손해를 봅니다.",
  토:"버티는 힘이 모자랍니다. 중심을 잡고 쌓아두는 자리가 약합니다.",
  금:"끊는 힘이 모자랍니다. 결정과 마무리, 정리에서 늘 한발 늦습니다.",
  수:"받아들이는 힘이 모자랍니다. 융통성과 유연함이 필요한 자리에서 막힙니다.",
};
const EL_OVER = {
  목:"뻗어나가는 힘이 넘칩니다. 벌여놓는 속도가 거두는 속도보다 빠릅니다.",
  화:"드러내는 힘이 넘칩니다. 표현이 앞서 감정 소모가 큽니다.",
  토:"버티는 힘이 넘칩니다. 움직여야 할 때 움직이지 못합니다.",
  금:"끊는 힘이 넘칩니다. 기준이 세서 사람이 다가오기 어려워합니다.",
  수:"받아들이는 힘이 넘칩니다. 생각이 많아 결정이 늦습니다.",
};

const SINSAL_MEAN = {
  천을귀인:"어려울 때 도움이 들어오는 자리입니다. 사람 복으로 보는 가장 좋은 신살입니다.",
  도화:"사람을 끌어당기는 자리입니다. 매력과 인기로 쓰이되, 구설도 함께 따라옵니다.",
  역마:"움직임의 자리입니다. 이동·출장·이사·해외가 잦고, 한곳에 오래 머물기 어렵습니다.",
  화개:"안으로 파고드는 자리입니다. 예술과 종교, 공부에 인연이 있고 혼자 있는 시간이 필요합니다.",
  양인:"날이 선 자리입니다. 결단과 추진이 빠른 대신, 과하면 본인이 먼저 베입니다.",
};

/**
 * 만세력 — 입력 하나로 나오는 메인 화면
 */
export function buildManse(saju) {
  const st = analyzeStrength(saju);
  const dm = saju.dayMaster;
  const order = ["hour", "day", "month", "year"];   // 만세력은 시→년 순으로 본다

  const cell = (key) => {
    const p = saju.pillars[key];
    if (!p) return null;
    return {
      key,
      label: PILLAR_MEAN[key].label,
      sub: PILLAR_MEAN[key].sub,
      palace: PILLAR_MEAN[key].palace,
      mean: PILLAR_MEAN[key].mean,
      stem:   { ko:p.stem,   cn:p.stemCn,   el:p.stemElement,   yy:MGAN_YY[p.stem] || "", color:EL_COLOR[p.stemElement] },
      branch: { ko:p.branch, cn:p.branchCn, el:p.branchElement, yy:MJI_YY[p.branch] || "", color:EL_COLOR[p.branchElement] },
      stemSipsin: p.stemSipsin,
      branchSipsin: p.branchSipsin,
      gapja: p.gapja, gapjaCn: p.gapjaCn,
      unseong: p.unseong,
      hidden: (p.hidden || []).map(h => ({ ko:h, cn:MGAN_CN[MGAN.indexOf(h)] || h, el:MGAN_EL[h], color:EL_COLOR[MGAN_EL[h]] })),
    };
  };

  const SS = buildSinsal(saju);

  const cols = order.map(k => {
    const c = cell(k);
    if (!c) return null;
    c.sinsal = (SS.byPillar[k] || []).filter(x => x.name !== "공망");
    c.twelve = SS.twelve[k] || null;
    c.gongmang = (saju.gongmang || []).includes(saju.pillars[k].branch);
    return c;
  }).filter(Boolean);

  /* 오행 분포 */
  const els = saju.elements.map(e => ({
    ...e, cn: EL_CN[e.name], color: EL_COLOR[e.name],
    tag: e.ratio >= 32 ? "과다" : e.ratio >= 15 ? "적정" : e.ratio > 0 ? "부족" : "없음",
  }));
  const lack = els.filter(e => e.ratio < 10).map(e => e.name);
  const over = els.filter(e => e.ratio >= 32).map(e => e.name);
  const elNotes = [];
  over.forEach(e => elNotes.push(`**${e}(${EL_CN[e]}) ${els.find(x=>x.name===e).ratio}%** — ${EL_OVER[e]}`));
  lack.forEach(e => elNotes.push(`**${e}(${EL_CN[e]}) ${els.find(x=>x.name===e).ratio}%** — ${EL_LACK[e]}`));
  if (!elNotes.length) elNotes.push("다섯 기운이 비교적 고르게 퍼져 있습니다. 한쪽으로 쏠린 사주보다 무난하게 흐르는 구조입니다.");

  /* 오행 역할 비율 (십신 5그룹) */
  const b = {}; saju.elements.forEach(e => b[e.name] = e.ratio);
  const me = dm.element;
  const groups = [
    { key:"비겁", name:"비겁", cn:"比", ratio:b[me],            mean:"나와 내 편의 힘. 주도성과 경쟁" },
    { key:"식상", name:"식상", cn:"食", ratio:b[M_GEN[me]],     mean:"만들고 표현하는 힘. 재능과 활동" },
    { key:"재성", name:"재성", cn:"財", ratio:b[M_CTL[me]],     mean:"돈과 결과를 담는 그릇" },
    { key:"관성", name:"관성", cn:"官", ratio:b[M_CTL_BY[me]],  mean:"책임과 자리. 조직과 규율" },
    { key:"인성", name:"인성", cn:"印", ratio:b[M_GEN_BY[me]],  mean:"배우고 받쳐주는 힘. 공부와 도움" },
  ];
  const dom = groups.slice().sort((x, y) => y.ratio - x.ratio)[0];

  /* 대운 — 현재 구간 표시 */
  const ageRaw = exactAge(saju);
  const age = Math.floor(ageRaw);
  const dlist = (saju.daeun.list || []).map(d => ({
    ...d,
    stemKo: MGAN[d.stem], branchKo: MJI[d.branch],
    stemEl: MGAN_EL[MGAN[d.stem]], branchEl: MJI_EL[MJI[d.branch]],
    stemColor: EL_COLOR[MGAN_EL[MGAN[d.stem]]], branchColor: EL_COLOR[MJI_EL[MJI[d.branch]]],
    endAge: Math.round((d.startAge + 10) * 10) / 10,
    active: ageRaw >= d.startAge && ageRaw < d.startAge + 10,
  }));
  const curDaeun = dlist.find(d => d.active) || null;

  /* 세운 10년 */
  const dsIdx = MGAN.indexOf(saju.pillars.day.stem);
  const nowYear = new Date().getFullYear();
  const slist = [];
  for (let y = nowYear; y < nowYear + 10; y++) {
    const s = seun(y);
    slist.push({
      year: y, age: ageInYear(saju, y),
      gapja: s.gapja, gapjaCn: s.gapjaCn,
      stemEl: MGAN_EL[s.stem], branchEl: MJI_EL[s.branch],
      stemColor: EL_COLOR[MGAN_EL[s.stem]], branchColor: EL_COLOR[MJI_EL[s.branch]],
      sipsin: sipsin(dsIdx, MGAN.indexOf(s.stem)),
      active: y === nowYear,
    });
  }

  const g = saju.input.gender === "M" ? "남자" : "여자";
  const li = saju.lunar;
  const cor = saju.corrected;

  return polish({
    head: {
      solar: `${saju.solar.year}년 ${saju.solar.month}월 ${saju.solar.day}일`,
      time: saju.input.timeUnknown ? "시간 모름" : `${String(saju.solar.hour).padStart(2,"0")}:${String(saju.solar.minute).padStart(2,"0")}`,
      lunar: `음력 ${li.year}년 ${li.leap ? "윤" : ""}${li.month}월 ${li.day}일`,
      calendar: saju.input.given.calendar === "음" ? "음력 입력" : "양력 입력",
      gender: g, city: saju.input.city || "서울",
      zodiac: `${saju.zodiac}띠`,
      age: `만 ${age}세`,
      ageNum: age,
    },
    correct: {
      shiftMinutes: cor.shiftMinutes,
      applied: cor.shiftMinutes !== 0,
      label: cor.shiftMinutes === 0 ? "보정 없음"
        : `${String(cor.hour).padStart(2,"0")}:${String(cor.minute).padStart(2,"0")} (${cor.shiftMinutes > 0 ? "+" : ""}${cor.shiftMinutes}분)`,
      notes: cor.notes || [],
      dayBoundary: saju.input.dayBoundary === "00:00" ? "야자시법 (자정 기준)" : "자시법 (23시 기준)",
    },
    term: {
      current: saju.term.current, currentAt: saju.term.currentAt,
      next: saju.term.next, nextAt: saju.term.nextAt,
      note: `${saju.term.current}(${saju.term.currentAt}) 이후에 태어나 월주가 ${saju.pillars.month.gapjaCn}으로 섭니다. 사주의 달은 양력 1일이 아니라 절기로 바뀝니다.`,
    },
    dayMaster: {
      ko: dm.stem, cn: dm.stemCn, el: dm.element, yy: dm.yinyang,
      color: EL_COLOR[dm.element],
      line: `일간 ${dm.stemCn}(${dm.element}·${dm.yinyang})`,
    },
    cols,
    elements: els, elementNotes: elNotes, lack, over,
    groups, dominant: dom,
    gongmang: saju.gongmang,
    gongmangNote: (saju.gongmang || []).length
      ? `공망은 ${saju.gongmang.map(x => MJI_CN[MJI.indexOf(x)] || x).join("·")}입니다. 명식에 이 글자가 있으면 그 자리의 힘이 한 겹 비어 있다고 봅니다.`
      : "",
    sinsal: SS,
    strength: {
      level: st.level, support: st.support, score: st.score,
      yongsin: st.yongsin, gisin: st.gisin,
      line: `${st.level} — 일간을 돕는 기운이 ${st.support}%입니다. 필요한 기운(용신)은 ${st.yongsin}, 과하면 해로운 기운은 ${st.gisin}입니다.`,
    },
    johu: johuYongsin(saju),
    compare: yongsinCompare(saju),
    daeun: (() => {
      const c = saju.daeun.calc || {};
      return {
        direction: saju.daeun.direction, startNumber: saju.daeun.startNumber,
        list: dlist, current: curDaeun, calc: c,
        plain: `칸의 숫자는 그 10년이 **시작되는 나이**입니다. 지금 지나고 있는 칸은 검게 칠해져 있고, 이미 지나온 칸은 흐리게 두었습니다.`,
        how:
          `10년 운이 몇 살에 시작하는지는 **태어난 날부터 계절이 바뀌는 날까지 며칠 남았는지**로 정합니다. 사흘을 한 살로 칩니다.\n`
          + `${saju.input.given.calendar === "음" ? "음력으로 넣으신 날짜를 양력으로 바꾼 뒤 계산했습니다. " : ""}`
          + `${saju.input.gender === "F" ? "여자" : "남자"}가 ${saju.pillars.year.stemCn}년(${MGAN_YY[saju.pillars.year.stem]}년)에 태어나 **${saju.daeun.direction}**입니다. `
          + (c.forward
              ? `그래서 태어난 날에서 **다음 절기(${c.fromTerm || "-"}, ${c.fromAt || "-"})까지** 셉니다. `
              : `그래서 **직전 절기(${c.fromTerm || "-"}, ${c.fromAt || "-"})에서** 태어난 날까지 거꾸로 셉니다. `)
          + `${c.spanDays}일이 나왔고, 사흘을 한 살로 쳐서 ${c.spanDays} ÷ 3 = **${saju.daeun.startNumber}살**입니다`
          + (c.remDays ? ` (${c.remDays}일 남는 것은 버립니다).` : `.`)
          + `\n만세력마다 남는 날을 올리기도 하고 버리기도 해서, 다른 곳에서 한 살 차이로 나오는 경우가 있습니다. 이 앱은 버리는 쪽을 씁니다.`,
        note: `대운은 ${saju.daeun.direction}으로 ${saju.daeun.startNumber}세부터 10년씩 바뀝니다.`,
      };
    })(),
    seun: slist,
    summary: `${dm.stemCn}${saju.pillars.day.branchCn}일주 · ${st.level} · 용신 ${st.yongsin} · 주도 ${dom.name}`,
    plainSummary:
      `쉽게 말하면 — 나를 나타내는 글자는 ${dm.stemCn}, ${EL_WORDS[dm.element]} 기운입니다. `
      + `${LEVEL_PLAIN[st.level]} 채워야 할 기운은 ${EL_WORDS[st.yongsin]}(${st.yongsin})이고, `
      + `${plainOf(dom.name) || dom.name} 쪽이 가장 두텁습니다.`,
    method: METHOD_NOTE,
  });
}

/* ═══════════════════════════════════════════════════════════
 *  2. buildSimple — 6개 카테고리 × 6항목
 * ═══════════════════════════════════════════════════════════ */

export const CATS = [
  { key:"basic",  name:"기본",  cn:"基", icon:"🧭", sub:"나는 어떤 사람인가",     tint:"#FAF6ED" },
  { key:"money",  name:"금전",  cn:"財", icon:"💰", sub:"돈이 들어오고 나가는 길", tint:"#F7F3FC" },
  { key:"love",   name:"연애",  cn:"愛", icon:"💗", sub:"사랑과 인연",            tint:"#FFF5F7" },
  { key:"biz",    name:"사업",  cn:"業", icon:"🚀", sub:"창업·독립·동업",         tint:"#F2F8F5" },
  { key:"job",    name:"직업",  cn:"職", icon:"🎯", sub:"적성과 커리어",          tint:"#F3F6FC" },
  { key:"future", name:"미래",  cn:"運", icon:"🔮", sub:"올해와 앞으로",          tint:"#FFF8F0" },
];

/* 카테고리별로 기존 90문항에서 끌어올 번호 */
const PLAN = {
  basic:  [["life",1],["life",3],["life",4],["life",5],["life",9],["life",29]],
  money:  [["wealth",1],["wealth",3],["wealth",8],["wealth",13],["wealth",14],["wealth",28]],
  love:   [["destiny",1],["destiny",7],["destiny",2],["destiny",14],["destiny",16],["destiny",26]],
  biz:    [["wealth",4],["wealth",21],["wealth",17],["wealth",12],["wealth",23]],
  job:    [["life",19],["life",18],["life",20],["life",21],["life",22]],
  future: [["life",27],["wealth",15],["destiny",19],["life",30]],
};

function flat(rep) {
  const out = {};
  (rep.sections || []).forEach(sec => (sec.items || []).forEach(it => { out[it.no] = { ...it, section: sec.title }; }));
  return out;
}

/**
 * 간단 구조 — 여섯 카테고리, 카테고리마다 여섯 항목
 */
export function buildSimple(saju, opts = {}) {
  const year = opts.year || new Date().getFullYear();
  const src = {
    life:    flat(buildLifeReport(saju, opts)),
    wealth:  flat(buildWealthReport(saju, opts)),
    destiny: flat(buildDestinyReport(saju, opts)),
  };
  const yr = buildYearReport(saju, year, opts);
  const st = analyzeStrength(saju);
  const pt = personaType(saju);

  const cats = CATS.map(c => {
    const picks = (PLAN[c.key] || []).map(([which, no]) => {
      const it = src[which] && src[which][no];
      if (!it) return null;
      return {
        q: it.question,
        body: (it.body || []).filter(x => typeof x === "string" && x.trim()),
        evidence: it.evidence || null,
        action: it.action || null,
        from: it.section,
      };
    }).filter(Boolean);

    /* 미래 카테고리는 올해 총운을 머리에 얹고, 내년·내후년을 붙인다 */
    if (c.key === "future") {
      const tot = (yr.fields || []).find(f => f.key === "total");
      const nexts = [year + 1, year + 2].map(y => {
        const r = buildYearReport(saju, y, opts);
        const t = (r.fields || []).find(f => f.key === "total");
        return { y, r, t };
      });
      picks.push({
        q: "내년과 내후년은 어떤가요?",
        body: nexts.flatMap(({ y, r, t }) => {
          const fs = (r.fields || []).filter(f => f.key !== "total").slice().sort((a, b) => b.score - a.score);
          const up = fs[0], down = fs[fs.length - 1];
          return [
            `**${y}년 ${r.gapjaCn || ""} · ${t ? t.grade + " " + t.score + "점" : ""}** — ${r.lead || ""}`,
            up && down ? `가장 열리는 쪽은 **${up.name}**(${up.score}점), 가장 막히는 쪽은 **${down.name}**(${down.score}점)입니다.` : "",
            `좋은 달은 ${(r.best || []).join("·") || "-"}, 조심할 달은 ${(r.worst || []).join("·") || "-"}입니다.`,
            r.samjae && r.samjae.on ? `**삼재.** ${r.samjae.text}` : "",
          ];
        }).filter(Boolean),
        evidence: `${year + 1}년과 ${year + 2}년 세운을 명식에 대입했습니다. 연 단위 운은 대운이라는 10년의 큰 흐름 위에 얹히는 파도로 봅니다.`,
        action: null,
        from: "앞으로 2년",
      });
      picks.unshift({
        q: `${year}년, 올해는 어떤 해인가요?`,
        body: [
          `**${year}년 ${yr.gapjaCn || ""} · ${tot ? tot.grade + " " + tot.score + "점" : ""}**`,
          tot ? tot.text : "",
          yr.samjae && yr.samjae.on ? `**삼재.** ${yr.samjae.text}` : "올해는 삼재에 들지 않습니다.",
          yr.advice || "",
        ].filter(Boolean),
        evidence: `${year}년 세운 ${yr.gapjaCn || ""}을 명식에 대입했습니다. 좋은 달은 ${(yr.best || []).join("·") || "-"}, 조심할 달은 ${(yr.worst || []).join("·") || "-"}입니다.`,
        action: null,
        from: "올해의 운",
      });
    }

    /* 직업 카테고리 — 조직이 맞나, 혼자가 맞나 */
    if (c.key === "job") {
      const wm = workMode(saju);
      picks.unshift({
        q: "회사가 맞나요, 혼자가 맞나요?",
        body: [
          `**${wm.key}입니다.** ${wm.t}`,
          wm.b,
          ...(wm.do || []).map((x, i) => `${i + 1}. ${x}`),
          wm.warn ? `**다만.** ${wm.warn}` : "",
        ].filter(Boolean),
        evidence: `비겁 ${pt.nums.비겁}% · 관성 ${pt.nums.관성}% · 인성 ${pt.nums.인성}%를 견준 결과입니다. 비겁이 두터우면 독립, 관성이 두터우면 조직, 인성이 두터우면 조력 쪽으로 봅니다.`,
        action: null,
        from: "일하는 방식",
      });
    }

    /* 기본 카테고리 머리에 유형 요약 카드 */
    if (c.key === "basic") {
      picks.unshift({
        q: "한 줄로 요약하면 저는 어떤 유형인가요?",
        body: [
          `**${pt.code} · ${pt.name}**`,
          `${pt.tagline}.`,
          `일간은 ${saju.dayMaster.stemCn}(${saju.dayMaster.element}·${saju.dayMaster.yinyang}), 전체 구성은 ${st.level}입니다. 필요한 기운은 ${st.yongsin}입니다.`,
          `**잘 맞는 일.** ${pt.fit}`,
          `**잘 맞는 사람.** ${pt.good}`,
          `**가장 조심할 것.** ${pt.warns[1]}`,
        ],
        evidence: `네 축(${pt.letters.join("·")})으로 나눈 결과입니다. 비겁 ${pt.nums.비겁}% · 식상 ${pt.nums.식상}% · 재성 ${pt.nums.재성}% · 관성 ${pt.nums.관성}% · 인성 ${pt.nums.인성}%.`,
        action: null,
        from: "유형 요약",
      });
    }

    /* 사업 카테고리 — 창업 준비도 점검 */
    if (c.key === "biz") picks.unshift(bizReadiness(saju, pt, st, year));

    const items = picks.slice(0, 6).map((p, i) => {
      const body = [].concat(p.body || []).filter(x => typeof x === "string" && x.trim());
      return {
        no: i + 1, free: i < 2, ...p, body,
        /* 방향만 말하고 끝내면 읽는 사람은 무엇을 해야 할지 모른다. 예시를 붙인다 */
        examples: examplesFor(body.concat(p.action || [], p.evidence || []), 2),
      };
    });
    return { ...c, items, total: items.length, freeCount: items.filter(x => x.free).length };
  });

  return polish({
    cats,
    manse: buildManse(saju),
    persona: pt,
    strength: st,
    year: { n: year, report: yr },
    job: opts.job ? jobMatch(saju, opts.job) : null,
    fit: modernFit(saju),
    method: METHOD_NOTE,
    total: cats.reduce((a, c) => a + c.items.length, 0),
  });
}

/* 창업 준비도 — 명식이 받쳐주는지, 지금 시작해도 되는지 */
const READY_NOTE = {
  high: "지금 명식이 창업을 받쳐주는 상태입니다. 다만 받쳐준다는 말은 성공한다는 말이 아니라, 버틸 체력이 있다는 뜻입니다.",
  mid:  "창업을 못 할 구조는 아니지만, 혼자 전부 지는 형태는 무리입니다. 한 축을 반드시 밖에 맡기셔야 합니다.",
  low:  "지금 명식만으로는 전업 창업보다 부업으로 시작하는 쪽이 안전합니다. 수입선을 끊지 않고 1년을 먼저 보세요.",
};
const AXIS_FIX = {
  식상: "만드는 힘이 얇습니다. 내 상품이 없으면 남의 것을 파는 구조밖에 남지 않습니다. 시작 전에 팔 것 하나를 끝까지 만들어 두세요.",
  재성: "담는 그릇이 얇습니다. 매출이 생겨도 남기는 장치가 없으면 그대로 빠져나갑니다. 정산과 통장 분리를 첫 달에 세팅하세요.",
  관성: "버티는 힘이 얇습니다. 외부에서 오는 마감과 기준이 없으면 흐트러집니다. 클라이언트든 공개 약속이든 강제 장치를 거세요.",
  인성: "받쳐주는 힘이 얇습니다. 혼자 배우며 가느라 시간이 두 배로 듭니다. 돈을 내서라도 먼저 간 사람을 붙이세요.",
  비겁: "밀고 나가는 힘이 얇습니다. 결정이 미뤄지는 쪽이라 공동창업자나 멘토를 세워 결정선을 만드세요.",
};

function bizReadiness(saju, pt, st, year) {
  const n = pt.nums;
  const thin = Object.entries({ 비겁:n.비겁, 식상:n.식상, 재성:n.재성, 관성:n.관성, 인성:n.인성 })
    .sort((a, b) => a[1] - b[1])[0][0];
  const engine = n.식상 + n.재성;              // 만들어 파는 힘
  const spine  = n.비겁 + n.관성;              // 밀고 버티는 힘
  const score  = Math.max(12, Math.min(96, Math.round(engine * 0.9 + spine * 0.7 + (st.level === "신강" ? 8 : st.level === "중화" ? 4 : 0))));
  const key = score >= 68 ? "high" : score >= 48 ? "mid" : "low";
  const start = goodYears(saju, ["식신", "상관", "편재", "정재"], { from: year, span: 6 });

  return {
    q: "저는 창업 체질인가요? 지금 시작해도 되나요?",
    body: [
      `**창업 준비도 ${score}점.** ${READY_NOTE[key]}`,
      `**만들어 파는 힘 ${Math.round(engine)}%** — 식상 ${n.식상}%(만드는 힘) + 재성 ${n.재성}%(담는 그릇). 이 숫자가 낮으면 아이템보다 판매 구조를 먼저 손봐야 합니다.`,
      `**밀고 버티는 힘 ${Math.round(spine)}%** — 비겁 ${n.비겁}%(주도) + 관성 ${n.관성}%(책임). 이 숫자가 낮으면 혼자 끌고 가는 형태가 무리입니다.`,
      `**가장 얇은 자리는 ${thin}입니다.** ${AXIS_FIX[thin]}`,
      start.length
        ? `**시작하기 좋은 해.** ${yearLine(start, 3)}. 만들거나 파는 기운이 들어오는 해입니다.`
        : `**앞으로 6년 안에 시작을 받쳐주는 해가 뚜렷하지 않습니다.** 큰 판을 벌이기보다 작게 시험하며 버티는 구간으로 보시는 편이 맞습니다.`,
      `**처음 1년의 기준.** 고정비를 월 수입의 ${st.level === "신약" ? "20%" : "30%"} 아래로 묶고, 6개월 치 생활비를 따로 떼어두고 시작하세요. 이 사주는 돈이 줄기 시작하면 판단이 먼저 흐려집니다.`,
    ],
    evidence: `만들어 파는 힘(식상+재성)과 밀고 버티는 힘(비겁+관성)에 ${st.level} 가중을 더해 산출했습니다. 사주로 보는 적합도이고, 실제 성패는 아이템과 자본이 함께 정합니다.`,
    action: "이번 주에 하나만 해보세요. 팔 것 하나를 정하고, 그것을 사겠다는 사람 세 명을 직접 찾아보시는 겁니다. 세 명이 안 모이면 아이템이 아니라 대상을 바꿔야 할 때입니다.",
    from: "창업 준비도",
  };
}

/* ═══════════════════════════════════════════════════════════
 *  3. buildTeamCompat — 2~5인 비즈니스 궁합 (관계사주)
 * ═══════════════════════════════════════════════════════════ */

const T_CHEONHAP = { 갑:"기", 기:"갑", 을:"경", 경:"을", 병:"신", 신:"병", 정:"임", 임:"정", 무:"계", 계:"무" };
const T_YUKHAP = { 자:"축", 축:"자", 인:"해", 해:"인", 묘:"술", 술:"묘", 진:"유", 유:"진", 사:"신", 신:"사", 오:"미", 미:"오" };
const T_SAMHAP = { 신:"신자진", 자:"신자진", 진:"신자진", 해:"해묘미", 묘:"해묘미", 미:"해묘미",
                   인:"인오술", 오:"인오술", 술:"인오술", 사:"사유축", 유:"사유축", 축:"사유축" };
const T_CHUNG = { 자:"오", 오:"자", 축:"미", 미:"축", 인:"신", 신:"인", 묘:"유", 유:"묘", 진:"술", 술:"진", 사:"해", 해:"사" };
const T_HYEONG = { 인:"사", 사:"신", 신:"인", 축:"술", 술:"미", 미:"축", 자:"묘", 묘:"자" };

/* 팀에서 맡으면 좋은 자리 — 주도 십신 기준 */
const TEAM_ROLE = {
  비겁:{ role:"추진·대표", cn:"主",
    t:"앞에서 끌고 가는 자리입니다. 결정이 빠르고 책임을 지는 데 거리낌이 없습니다.",
    use:"대표, 영업 총괄, 신규 개척처럼 '내가 정한다'가 성립하는 자리에 두세요.",
    risk:"같은 비겁끼리 붙이면 반드시 주도권 싸움이 납니다. 영역을 칼같이 나눠야 합니다." },
  식상:{ role:"기획·제작", cn:"創",
    t:"만들고 표현하는 자리입니다. 아이디어와 결과물이 이 사람에게서 나옵니다.",
    use:"콘텐츠, 상품 기획, 제작, 마케팅 크리에이티브를 맡기세요.",
    risk:"벌여놓기만 하고 마무리가 흐려집니다. 마감을 쥐는 사람이 옆에 반드시 있어야 합니다." },
  재성:{ role:"영업·수익", cn:"財",
    t:"숫자로 판단하는 자리입니다. 돈이 어디서 들어오는지를 가장 먼저 봅니다.",
    use:"매출, 영업, 단가 협상, 정산을 맡기세요. 수익 구조 설계에 강합니다.",
    risk:"효율이 사람을 이기면 팀이 식습니다. 관계를 보는 사람과 짝지어야 합니다." },
  관성:{ role:"관리·운영", cn:"官",
    t:"기준과 책임의 자리입니다. 규칙을 세우고 지키게 만드는 힘이 있습니다.",
    use:"운영, 품질 관리, 계약과 법무, 일정 관리를 맡기세요.",
    risk:"속도를 늦추는 쪽으로 작동할 수 있습니다. 추진하는 사람과 충돌하기 쉽습니다." },
  인성:{ role:"설계·교육", cn:"印",
    t:"받아서 정리하는 자리입니다. 구조를 짜고 사람을 가르치는 데 능합니다.",
    use:"전략 설계, 문서화, 교육·온보딩, 리서치를 맡기세요.",
    risk:"준비가 길어집니다. 실행을 책임지는 사람이 뒤를 받쳐야 합니다." },
};

/* 이름에 조사를 자동으로 붙인다 — §A이가 / §A은는 / §A을를 / §A와과 / §A의 / §A
 * 이름을 먼저 끼운 뒤 조사를 맞추지 않으면 "혁주이", "윤주을" 같은 오류가 난다. */
function nameJosa(text, nameA, nameB) {
  const pick = {
    "이가": mIGA, "은는": mEUN, "을를": mEUL, "와과": mWA,
    "이라": (w) => w + (mHasJong(w) ? "이라" : "라"),
    "으로": (w) => w + (mHasJong(w) ? "으로" : "로"),
  };
  return String(text == null ? "" : text)
    .replace(/§([AB])(이가|은는|을를|와과|이라|으로)/g, (_, w, j) => pick[j](w === "A" ? nameA : nameB))
    .replace(/§([AB])/g, (_, w) => (w === "A" ? nameA : nameB));
}

/** 다섯 역할을 비중 순으로 돌려준다 */
function roleRank(saju) {
  const me = saju.dayMaster.element;
  const b = {}; saju.elements.forEach(e => b[e.name] = e.ratio);
  const score = {
    비겁: b[me], 식상: b[M_GEN[me]], 재성: b[M_CTL[me]],
    관성: b[M_CTL_BY[me]], 인성: b[M_GEN_BY[me]],
  };
  const dom = ROLE_OF[dominantSipsin(saju)] || "비겁";
  score[dom] += 8;   // 명식에 또렷하게 드러난 역할에 가산
  return Object.entries(score).sort((x, y) => y[1] - x[1]).map(([k]) => k);
}

const PAIR_LABEL = (s) => s >= 80 ? "아주 좋음" : s >= 66 ? "좋음" : s >= 52 ? "무난" : s >= 40 ? "주의" : "충돌";

function pairScore(a, b) {
  const stA = analyzeStrength(a), stB = analyzeStrength(b);
  const elA = a.dayMaster.element, elB = b.dayMaster.element;
  const dsA = a.pillars.day.stem, dsB = b.pillars.day.stem;
  const dbA = a.pillars.day.branch, dbB = b.pillars.day.branch;
  let score = 50;
  const tags = [], lines = [];

  if (T_CHEONHAP[dsA] === dsB) { score += 14; tags.push("천간합");
    lines.push(`일간이 ${a.pillars.day.stemCn}·${b.pillars.day.stemCn} 천간합입니다. 설명하지 않아도 의도가 전달되는, 궁합에서 가장 좋게 보는 자리입니다.`); }
  else if (M_GEN[elA] === elB) { score += 11; tags.push("생(→)");
    lines.push(`§A의 ${mIGA(elA)} §B의 ${mEUL(elB)} 살립니다. 주는 쪽이 §A이라서, §A은는 계속 내주고 §B은는 받는 구도가 됩니다.`); }
  else if (M_GEN[elB] === elA) { score += 11; tags.push("생(←)");
    lines.push(`§B의 ${mIGA(elB)} §A의 ${mEUL(elA)} 살립니다. §B이가 뒤에서 받쳐주는 구도입니다.`); }
  else if (elA === elB) { score += 5; tags.push("동기");
    lines.push(`둘 다 ${elA} 일간입니다. 코드가 같아 편한 대신, 같은 약점을 공유해 위기에 함께 흔들립니다.`); }
  else if (M_CTL[elA] === elB) { score -= 7; tags.push("극(→)");
    lines.push(`§A의 ${mIGA(elA)} §B을를 누릅니다. 지시는 잘 전달되지만 §B이가 눌립니다. §A은는 말을 한 톤 낮추셔야 합니다.`); }
  else { score -= 7; tags.push("극(←)");
    lines.push(`§B의 ${mIGA(elB)} §A을를 누릅니다. §A이가 끌려가는 느낌을 받습니다. 결정 권한을 분명히 나눠두는 것이 답입니다.`); }

  if (T_YUKHAP[dbA] === dbB) { score += 15; tags.push("육합");
    lines.push("일지가 육합입니다. 오래 붙어 일해도 피로가 적은 조합입니다."); }
  else if (T_SAMHAP[dbA] === T_SAMHAP[dbB] && dbA !== dbB) { score += 12; tags.push("삼합");
    lines.push("일지가 삼합으로 묶입니다. 목표와 방향이 같아 같이 무언가를 만들기에 좋습니다."); }
  else if (T_CHUNG[dbA] === dbB) { score -= 15; tags.push("충");
    lines.push("일지가 충합니다. 끌림도 크고 부딪힘도 큽니다. 같은 업무를 같이 보게 하면 반드시 터집니다."); }
  else if (T_HYEONG[dbA] === dbB) { score -= 9; tags.push("형");
    lines.push("일지가 형을 이룹니다. 말로 상처를 주고받습니다. 중요한 얘기는 문서로 남기세요."); }
  else if (dbA === dbB) { score += 6; tags.push("동지");
    lines.push("일지가 같습니다. 일하는 리듬이 비슷해 호흡이 맞습니다."); }

  const rA = {}; a.elements.forEach(e => rA[e.name] = e.ratio);
  const rB = {}; b.elements.forEach(e => rB[e.name] = e.ratio);
  if (rB[stA.yongsin] >= 25) { score += 10; lines.push(`§A에게 필요한 ${stA.yongsin} 기운을 §B이가 ${rB[stA.yongsin]}%로 가지고 있습니다. 옆에 두면 §A의 부족한 자리가 채워집니다.`); }
  if (rA[stB.yongsin] >= 25) { score += 10; lines.push(`§B에게 필요한 ${stB.yongsin} 기운을 §A이가 ${rA[stB.yongsin]}%로 채워줍니다.`); }

  if (stA.level === "신강" && stB.level === "신강") { score -= 6; lines.push("둘 다 신강입니다. 양보가 안 되니 결정권을 영역별로 쪼개야 합니다."); }
  else if (stA.level === "신약" && stB.level === "신약") { score -= 4; lines.push("둘 다 신약입니다. 서로 기대려 해서 결정이 미뤄집니다. 바깥에 기준을 두세요."); }
  else if (stA.level === "신강" && stB.level === "신약") { lines.push(`§A이가 끌고 §B이가 따르는 구도입니다. 방향이 맞으면 빠르고, 어긋나면 §B이가 먼저 소모됩니다.`); }
  else if (stA.level === "신약" && stB.level === "신강") { lines.push(`§B이가 끌고 §A이가 받치는 구도입니다. §A에게는 편하지만 의존이 깊어지지 않게 선을 두세요.`); }

  score = Math.max(10, Math.min(97, Math.round(score)));
  return { score, label: PAIR_LABEL(score), tags, lines };
}

/**
 * 비즈니스 궁합 — 2~5명을 한 번에 본다
 * @param {Array} members [{ name, saju }] 또는 [{ name, ...입력값 }]
 */
export function buildTeamCompat(members, opts = {}) {
  const ms = (members || []).slice(0, 5).map((m, i) => {
    const saju = m.saju || computeSaju(m);
    const st = analyzeStrength(saju);
    const pt = personaType(saju);
    const wm = workMode(saju);
    const rank = roleRank(saju);
    return {
      idx: i,
      name: m.name || `${i + 1}번`,
      role: m.role || "",
      saju,
      gapja: saju.pillars.day.gapja, gapjaCn: saju.pillars.day.gapjaCn,
      el: saju.dayMaster.element, elCn: EL_CN[saju.dayMaster.element],
      color: EL_COLOR[saju.dayMaster.element],
      level: st.level, yongsin: st.yongsin, gisin: st.gisin,
      support: st.support,
      type: pt.code, typeName: pt.name, tagline: pt.tagline,
      workMode: wm.key,
      rank,
      team: null,
      ratios: Object.fromEntries(saju.elements.map(e => [e.name, e.ratio])),
    };
  });

  /* 역할 배치 — 같은 자리가 겹치면 다음 비중 역할로 돌린다 */
  const taken = {};
  ms.forEach(mm => {
    const pickRole = mm.rank.find(r => !taken[r]) || mm.rank[0];
    taken[pickRole] = true;
    mm.domRole = pickRole;
    mm.team = TEAM_ROLE[pickRole];
    mm.firstRole = mm.rank[0];
  });

  if (ms.length < 2) {
    return { error: "두 사람 이상 넣어야 관계를 봅니다.", members: ms };
  }

  /* 쌍별 궁합 */
  const pairs = [];
  for (let i = 0; i < ms.length; i++) {
    for (let j = i + 1; j < ms.length; j++) {
      const p = pairScore(ms[i].saju, ms[j].saju);
      pairs.push({
        a: ms[i].name, b: ms[j].name, ai: i, bi: j,
        ...p,
        lines: p.lines.map(t => nameJosa(t, ms[i].name, ms[j].name)),
      });
    }
  }
  const avg = Math.round(pairs.reduce((s, p) => s + p.score, 0) / pairs.length);
  const best = pairs.slice().sort((x, y) => y.score - x.score)[0];
  const worst = pairs.slice().sort((x, y) => x.score - y.score)[0];

  /* 팀 오행 균형 */
  const sum = { 목:0, 화:0, 토:0, 금:0, 수:0 };
  ms.forEach(m => Object.entries(m.ratios).forEach(([k, v]) => sum[k] += v));
  const teamEls = Object.entries(sum).map(([name, v]) => ({
    name, cn: EL_CN[name], color: EL_COLOR[name],
    ratio: Math.round(v / ms.length * 10) / 10,
  }));
  const tLack = teamEls.filter(e => e.ratio < 12).map(e => e.name);
  const tOver = teamEls.filter(e => e.ratio >= 30).map(e => e.name);

  const BALANCE_FIX = {
    목:"새로 벌이고 넓히는 힘이 팀에 없습니다. 기획과 신규 개척을 맡을 사람을 밖에서 데려오거나, 분기마다 새 시도를 강제하는 규칙을 만드세요.",
    화:"알리는 힘이 팀에 없습니다. 좋은 것을 만들어도 팔리지 않습니다. 마케팅과 홍보를 외주로라도 반드시 붙이세요.",
    토:"중심을 잡고 버티는 힘이 없습니다. 일은 벌어지는데 쌓이지 않습니다. 운영과 정산을 전담할 사람이 필요합니다.",
    금:"끊고 마무리하는 힘이 없습니다. 결정이 미뤄지고 프로젝트가 끝나지 않습니다. 마감을 쥐는 사람을 세우세요.",
    수:"유연하게 받아들이는 힘이 없습니다. 한 방향으로만 밀어 변화에 늦습니다. 리서치와 외부 피드백 창구를 만드세요.",
  };
  const OVER_FIX = {
    목:"벌이는 힘이 넘칩니다. 동시에 굴리는 프로젝트 수에 상한을 두세요.",
    화:"드러내는 힘이 넘칩니다. 말과 약속이 앞서니 대외 발표 전 검수 절차를 넣으세요.",
    토:"버티는 힘이 넘칩니다. 변화를 미루는 쪽으로 작동합니다. 분기마다 버릴 것을 정하세요.",
    금:"끊는 힘이 넘칩니다. 기준이 세서 사람이 지칩니다. 평가 전에 듣는 자리를 먼저 두세요.",
    수:"생각이 넘칩니다. 회의가 길어지고 결정이 늦습니다. 회의마다 결론을 문서로 남기세요.",
  };

  /* 역할 배치 — 같은 역할이 겹치면 경고 */
  const roleCount = {};
  ms.forEach(m => roleCount[m.domRole] = (roleCount[m.domRole] || 0) + 1);
  const firstCount = {};
  ms.forEach(m => firstCount[m.firstRole] = (firstCount[m.firstRole] || 0) + 1);
  const dupRoles = Object.entries(firstCount).filter(([, c]) => c > 1).map(([k]) => k);
  const missRoles = Object.keys(TEAM_ROLE).filter(k => !roleCount[k]);

  /* 리스크 */
  const risks = [];
  pairs.filter(p => p.tags.includes("충")).forEach(p =>
    risks.push(`**${p.a} ↔ ${p.b} — 일지 충.** 둘을 같은 업무에 함께 두지 마세요. 역할을 완전히 분리하고, 보고선도 겹치지 않게 짜야 합니다.`));
  pairs.filter(p => p.tags.includes("형")).forEach(p =>
    risks.push(`**${p.a} ↔ ${p.b} — 일지 형.** 말로 상처가 쌓입니다. 둘 사이의 합의는 반드시 문서로 남기세요.`));
  pairs.filter(p => p.tags.includes("극(→)") || p.tags.includes("극(←)")).forEach(p =>
    risks.push(`**${p.a} ↔ ${p.b} — 일간 극.** 같은 말이 다르게 들립니다. 지시는 결론보다 이유를 먼저 말하는 쪽이 안전합니다.`));
  dupRoles.forEach(r => {
    const who = ms.filter(m => m.firstRole === r).map(m => m.name).join(", ");
    risks.push(`**${who} — ${r} 성향이 겹칩니다(${firstCount[r]}명).** ${TEAM_ROLE[r].risk} 배치표에서는 서로 다른 자리로 나눠뒀지만, 실제로는 같은 일에 손을 대려 합니다.`);
  });
  const strongs = ms.filter(m => m.level === "신강");
  if (strongs.length >= 3)
    risks.push(`**신강이 ${strongs.length}명입니다.** 모두 자기 방식이 분명해 회의가 길어집니다. 안건마다 최종 결정자를 미리 정해두고 들어가세요.`);
  if (ms.filter(m => m.level === "신약").length === ms.length)
    risks.push("**전원 신약입니다.** 서로 기다리느라 결정이 밀립니다. 마감일을 외부와 약속해 강제로 끌려가는 구조를 만드세요.");
  if (!risks.length) risks.push("명식 사이에 충이나 형처럼 강하게 부딪히는 자리는 없습니다. 구조보다 운영으로 관리할 수 있는 조합입니다.");

  /* 지분·의사결정 권고 */
  const leadCand = ms.slice().sort((a, b) =>
    (b.domRole === "비겁" ? 30 : 0) - (a.domRole === "비겁" ? 30 : 0) +
    (b.level === "신강" ? 10 : 0) - (a.level === "신강" ? 10 : 0) +
    (b.ratios[b.el] - a.ratios[a.el]))[0];

  const howTo = [
    `**최종 결정은 ${mIGA(leadCand.name)} 맡는 쪽이 맞습니다.** ${leadCand.workMode}이고 ${leadCand.level} 구성이라, 방향을 끌고 가는 자리에 두면 팀이 덜 흔들립니다.`,
    `**지분보다 역할을 먼저 나누세요.** 이 조합에서 같은 일을 둘이 같이 보면 ${mWA(worst.a)} ${worst.b} 자리에서 가장 먼저 터집니다.`,
    `**회의는 짧게, 결론은 글로.** ${ms.length}명이면 말로 합의한 것이 각자 다르게 기억됩니다. 한 줄이라도 결론을 남기는 습관이 이 팀의 수명을 가장 크게 늘립니다.`,
    `**역할 배치.** ` + ms.map(m => `${m.name} → ${m.team.role}(${m.team.cn})`).join(" / "),
    missRoles.length
      ? `**비어 있는 자리.** ${missRoles.map(r => `${r}(${TEAM_ROLE[r].role})`).join(", ")} 역할이 팀에 없습니다. 외주로라도 채워야 굴러갑니다.`
      : `**다섯 역할이 모두 채워져 있습니다.** 사람 수 대비 역할 분포가 좋은 팀입니다.`,
    `**돈 이야기는 시작할 때 끝내세요.** 정산 주기, 지분, 그만둘 때의 처리까지 문서로 남기는 것이 이 조합에서 가장 큰 보험입니다.`,
  ];

  const grade = avg >= 76 ? "아주 좋은 팀" : avg >= 64 ? "좋은 팀" : avg >= 52 ? "운영하면 되는 팀" : avg >= 40 ? "조심할 팀" : "구조를 바꿔야 하는 팀";

  /* 항목별 점수 */
  const sub = (plus) => Math.max(10, Math.min(97, Math.round(avg + plus)));
  const fields = [
    { key:"drive", name:"추진력", cn:"推",
      score: sub((roleCount["비겁"] || 0) * 6 + (roleCount["식상"] || 0) * 3 - 4),
      text: (roleCount["비겁"] || 0) >= 1 ? "끌고 가는 사람이 있어 일이 시작됩니다." : "끌고 가는 자리가 비어 있습니다. 시작이 늦는 팀입니다." },
    { key:"make", name:"만드는 힘", cn:"創",
      score: sub((roleCount["식상"] || 0) * 8 - 4),
      text: (roleCount["식상"] || 0) >= 1 ? "결과물을 뽑아내는 사람이 있습니다." : "만드는 자리가 약합니다. 기획과 제작은 외부에 맡기는 편이 빠릅니다." },
    { key:"money", name:"돈 만드는 힘", cn:"財",
      score: sub((roleCount["재성"] || 0) * 9 - 4),
      text: (roleCount["재성"] || 0) >= 1 ? "수익을 숫자로 보는 사람이 있습니다. 매출 설계를 이 사람에게 맡기세요." : "돈을 보는 자리가 비었습니다. 벌이보다 쓰임이 커지기 쉽습니다." },
    { key:"run", name:"버티는 힘", cn:"官",
      score: sub(((roleCount["관성"] || 0) + (roleCount["인성"] || 0)) * 6 - 4),
      text: ((roleCount["관성"] || 0) + (roleCount["인성"] || 0)) >= 1 ? "기준을 세우고 굴러가게 만드는 사람이 있습니다." : "관리하는 자리가 비었습니다. 1년을 넘기기 어려운 구조입니다." },
    { key:"talk", name:"호흡", cn:"和",
      score: sub(pairs.filter(p => p.tags.includes("충") || p.tags.includes("형")).length * -9 +
                 pairs.filter(p => p.tags.includes("육합") || p.tags.includes("삼합") || p.tags.includes("천간합")).length * 6),
      text: (() => {
        const hard = pairs.filter(p => p.score < 45);
        if (hard.length) return `${hard.map(p => `${p.a}–${p.b}`).join(", ")} 자리에서 부딪힙니다. 이 조합은 사람 문제가 아니라 배치 문제라, 역할과 보고선을 떼어놓으면 많이 풀립니다.`;
        if (pairs.some(p => p.score < 52)) return "서로 결이 다른 자리가 있어 운영 규칙이 필요합니다. 결정 방식을 문서로 정해두세요.";
        return "큰 충돌 없이 말이 통하는 조합입니다.";
      })() },
    { key:"long", name:"오래 갈 힘", cn:"久",
      score: sub(tLack.length * -6 + (missRoles.length ? -5 : 6)),
      text: tLack.length ? `팀에 ${tLack.join("·")} 기운이 비어 있어, 그 영역에서 반복해서 막힙니다.` : "오행이 비교적 고르게 모여 있어 길게 가기 좋은 조합입니다." },
  ].map(f => ({ ...f, label: PAIR_LABEL(f.score) }));

  return polish({
    count: ms.length,
    members: ms.map(m => ({
      name: m.name, role: m.role,
      gapja: m.gapja, gapjaCn: m.gapjaCn, el: m.el, elCn: m.elCn, color: m.color,
      level: m.level, yongsin: m.yongsin, support: m.support,
      type: m.type, typeName: m.typeName, tagline: m.tagline,
      workMode: m.workMode,
      teamRole: m.team.role, teamCn: m.team.cn, teamUse: m.team.use, teamRisk: m.team.risk, teamT: m.team.t,
      domRole: m.domRole,
    })),
    avg, grade, pairs, best, worst, fields,
    teamElements: teamEls, lack: tLack, over: tOver,
    balance: [
      ...tOver.map(e => `**${e}(${EL_CN[e]}) 과다.** ${OVER_FIX[e]}`),
      ...tLack.map(e => `**${e}(${EL_CN[e]}) 부족.** ${BALANCE_FIX[e]}`),
    ],
    balanceNote: (!tOver.length && !tLack.length)
      ? "팀 전체 오행이 고르게 모였습니다. 한 사람의 약점을 다른 사람이 메우는 구조라, 사람을 더 늘리기보다 지금 조합을 오래 유지하는 쪽이 유리합니다." : "",
    roleCount, dupRoles, missRoles,
    risks, howTo,
    lead: leadCand.name,
    closing: avg >= 64
      ? "함께 하기 좋은 조합입니다. 다만 궁합이 좋은 팀일수록 규칙 없이 시작해서 나중에 돈 문제로 갈라집니다. 잘 맞는 지금이 문서를 쓸 때입니다."
      : avg >= 52
      ? "운영으로 충분히 굴러가는 조합입니다. 사람을 바꾸는 것보다 역할을 정확히 나누는 쪽이 훨씬 효과가 큽니다."
      : "구조를 손봐야 하는 조합입니다. 사이가 나쁘다는 뜻이 아니라, 지금 배치로는 서로의 힘이 부딪힌다는 뜻입니다. 역할을 분리하고 결정선을 하나로 모으면 달라집니다.",
    method: METHOD_NOTE,
  });
}

/* 연인 궁합은 기존 2인 로직을 그대로 쓴다 */
export { buildCompatReport };
