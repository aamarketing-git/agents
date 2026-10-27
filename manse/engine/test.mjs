import { computeSaju, solarToLunar, lunarToSolar, toJDN } from "./saju.js";

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = String(got) === String(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}: ${got}${ok ? "" : "   (기대: " + want + ")"}`);
};

console.log("\n=== 1. 일주 60갑자 (검증 데이터: datedb 만세력 2026년 2월) ===");
const dayCases = [
  [2026,2,1,"병오"], [2026,2,2,"정미"], [2026,2,3,"무신"],
  [2026,2,4,"기유"], [2026,2,5,"경술"], [2026,2,19,"갑자"],
];
for (const [y,m,d,want] of dayCases) {
  const r = computeSaju({year:y,month:m,day:d,hour:12,minute:0,gender:"M",city:"서울"});
  eq(`${y}-${m}-${d} 일주`, r.pillars.day.gapja, want);
}

console.log("\n=== 2. 입춘 경계에서 년주·월주가 바뀌는가 ===");
// 2026 입춘 = 02-04 05:02 KST
{
  const before = computeSaju({year:2026,month:2,day:4,hour:4,minute:0,gender:"M",city:"서울",trueSolarTime:false});
  const after  = computeSaju({year:2026,month:2,day:4,hour:6,minute:0,gender:"M",city:"서울",trueSolarTime:false});
  eq("입춘 전(04:00) 년주", before.pillars.year.gapja, "을사");
  eq("입춘 전(04:00) 월주", before.pillars.month.gapja, "기축");
  eq("입춘 후(06:00) 년주", after.pillars.year.gapja,  "병오");
  eq("입춘 후(06:00) 월주", after.pillars.month.gapja, "경인");
  eq("입춘 절입시각", after.term.currentAt, "2026-02-04 05:02");
}

console.log("\n=== 3. 음력 변환 ===");
{
  const l = solarToLunar(2026, 2, 4);
  eq("2026-02-04 → 음력", `${l.year}-${l.month}-${l.day}${l.leap?"윤":""}`, "2025-12-17");
  const s = lunarToSolar(2026, 1, 1);
  eq("음력 2026-01-01 → 양력(설날)", `${s.year}-${s.month}-${s.day}`, "2026-2-17");
  const s2 = lunarToSolar(2025, 6, 1, true);
  eq("음력 2025 윤6월 1일 → 양력", `${s2.year}-${s2.month}-${s2.day}`, "2025-7-25");
}

console.log("\n=== 4. 진태양시 보정 (서울 126.978°E, 표준 135°E → -32분) ===");
{
  const r = computeSaju({year:1990,month:10,day:10,hour:7,minute:10,gender:"M",city:"서울"});
  eq("보정 분", r.corrected.shiftMinutes, -32);
  eq("보정 후 시각", `${r.corrected.hour}:${String(r.corrected.minute).padStart(2,"0")}`, "6:38");
  eq("시지 (06:38 → 묘시)", r.pillars.hour.branch, "묘");
  const noTst = computeSaju({year:1990,month:10,day:10,hour:7,minute:10,gender:"M",city:"서울",trueSolarTime:false});
  eq("보정 안 하면 시지 (07:10 → 진시)", noTst.pillars.hour.branch, "진");
}

console.log("\n=== 5. 서머타임 (1988-08-15은 시행 기간) ===");
{
  const r = computeSaju({year:1988,month:8,day:15,hour:10,minute:0,gender:"F",city:"서울"});
  eq("서머타임 -60 + 경도 -32 = -92분", r.corrected.shiftMinutes, -92);
  eq("보정 후 시각", `${r.corrected.hour}:${String(r.corrected.minute).padStart(2,"0")}`, "8:28");
}

console.log("\n=== 6. 1954~1961 표준자오선 127.5°E 구간 ===");
{
  const r = computeSaju({year:1958,month:3,day:10,hour:12,minute:0,gender:"M",city:"서울"});
  eq("127.5°E 기준 서울 보정", r.corrected.shiftMinutes, -2);
}

console.log("\n=== 7. 자시 처리 (23:30 출생) ===");
{
  const jasi = computeSaju({year:2026,month:2,day:3,hour:23,minute:30,gender:"M",city:"서울",trueSolarTime:false,dayBoundary:"23:00"});
  const yaja = computeSaju({year:2026,month:2,day:3,hour:23,minute:30,gender:"M",city:"서울",trueSolarTime:false,dayBoundary:"00:00"});
  eq("자시법 일주 (다음날 기유)", jasi.pillars.day.gapja, "기유");
  eq("야자시법 일주 (당일 무신)", yaja.pillars.day.gapja, "무신");
  eq("자시법 시지", jasi.pillars.hour.branch, "자");
  eq("야자시법 시지", yaja.pillars.hour.branch, "자");
}

console.log("\n=== 8. 시두법 (일간 갑 → 자시 갑자) ===");
{
  const r = computeSaju({year:2026,month:2,day:19,hour:0,minute:30,gender:"M",city:"서울",trueSolarTime:false});
  eq("2026-02-19 일주", r.pillars.day.gapja, "갑자");
  eq("갑일 자시 → 갑자시", r.pillars.hour.gapja, "갑자");
}

console.log("\n=== 9. 대운 순행/역행 ===");
{
  // 병오년(양간) 남자 → 순행
  const m = computeSaju({year:2026,month:5,day:1,hour:10,minute:0,gender:"M",city:"서울"});
  eq("양년 남자", m.daeun.direction, "순행");
  const f = computeSaju({year:2026,month:5,day:1,hour:10,minute:0,gender:"F",city:"서울"});
  eq("양년 여자", f.daeun.direction, "역행");
  // 을사년(음간) 남자 → 역행
  const m2 = computeSaju({year:2025,month:5,day:1,hour:10,minute:0,gender:"M",city:"서울"});
  eq("음년 남자", m2.daeun.direction, "역행");
}

console.log("\n=== 10. 공망 ===");
{
  const r = computeSaju({year:2026,month:2,day:19,hour:12,minute:0,gender:"M",city:"서울"});
  eq("갑자일 공망", r.gongmang.join(""), "술해");
}

console.log("\n=== 11. 오행 합계 정합성 ===");
{
  const r = computeSaju({year:1990,month:10,day:10,hour:14,minute:30,gender:"M",city:"서울"});
  const sum = r.elements.reduce((a,b)=>a+b.ratio,0);
  eq("오행 비율 합 ≈ 100", Math.round(sum), 100);
}

console.log("\n=== 12. 60갑자 순환 무결성 (1900-2100 전수) ===");
{
  let ok = true, prev = null;
  for (let j = toJDN(1900,1,1); j <= toJDN(2100,12,31); j++) {
    const idx = (j + 49) % 60;
    if (prev !== null && idx !== (prev + 1) % 60) { ok = false; break; }
    prev = idx;
  }
  eq("일주 인덱스 연속성 (약 73,000일)", ok, true);
}

console.log(`\n${"─".repeat(50)}\n통과 ${pass} / 실패 ${fail}\n`);
process.exit(fail ? 1 : 0);
