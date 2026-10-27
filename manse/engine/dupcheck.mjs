/* 카테고리 사이에 같은 문장이 두 번 나오는지 본다 */
import { computeSaju } from "./saju.js";
import { JOB_OPTIONS } from "./report.js";
import { buildSimple } from "./manse.js";
const tally = new Map();
let charts = 0;
for (let y = 1962; y <= 2006; y += 6)
for (const mo of [2, 5, 8, 11])
for (const d of [7, 21])
for (const gd of ["남", "여"]) {
  const saju = computeSaju({ year:y, month:mo, day:d, hour:9, minute:0, gender:gd,
    calendar:"양", city:"서울", trueSolarTime:true, dayBoundary:"23:00" });
  const sp = buildSimple(saju, { job: JOB_OPTIONS[charts % JOB_OPTIONS.length].v });
  const where = new Map();
  sp.cats.forEach(c => c.items.forEach(it => it.body.forEach(b => {
    const key = String(b).replace(/[\d.%]/g, "").replace(/\s+/g," ").trim();
    if (key.length < 45) return;
    if (!where.has(key)) where.set(key, new Set());
    where.get(key).add(c.name + "#" + it.no);
  })));
  where.forEach((spots, key) => {
    if (spots.size > 1) {
      const sig = [...spots].sort().join(" ↔ ");
      if (!tally.has(sig)) tally.set(sig, { n:0, ex:key });
      tally.get(sig).n++;
    }
  });
  charts++;
}
const rows = [...tally.entries()].sort((a,b)=>b[1].n-a[1].n);
console.log(`명식 ${charts}개 검사`);
if (!rows.length) console.log("카테고리 사이 중복 문장: 없음");
else rows.slice(0,15).forEach(([sig,v]) => console.log(`(${v.n}/${charts}) ${sig}\n    ${v.ex.slice(0,120)}`));
