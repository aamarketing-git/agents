// pwa/og-image.png (1200x630) 생성. Playwright 필요.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = join(dirname(fileURLToPath(import.meta.url)), '../pwa/og-image.png');
const html = `<style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:linear-gradient(135deg,#1f5f50 0%,#2f7d6b 60%,#3f9a84 100%);font-family:"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#fff;position:relative;overflow:hidden}
.l{position:absolute;left:84px;top:96px;width:620px}
.tag{display:inline-block;background:rgba(255,255,255,.16);border-radius:0;padding:10px 22px;font-size:26px;font-weight:500;letter-spacing:.02em}
h1{font-size:92px;line-height:1.12;font-weight:900;letter-spacing:-.03em;margin:34px 0 26px}
h1 b{color:#ffe08a}
p{font-size:34px;line-height:1.5;color:#d8efe8;font-weight:400}
.card{position:absolute;right:84px;top:70px;width:340px;height:490px;background:#fff;border-radius:0;box-shadow:0 30px 60px rgba(0,0,0,.28);color:#1b2420;padding:34px 30px;transform:rotate(4deg)}
.card small{color:#6b7873;font-size:20px}
.card .big{font-size:44px;font-weight:900;color:#d4475b;margin:4px 0 22px;letter-spacing:-.02em}
.row{display:flex;align-items:center;gap:14px;padding:13px 0;border-top:1px solid #e3e9e6;font-size:22px}
.ic{width:44px;height:44px;border-radius:0;background:#e3f1ed;display:grid;place-items:center;font-size:24px}
.row span{flex:1;font-weight:700}.row i{font-style:normal;font-weight:800}
.bar{height:14px;border-radius:0;background:#e3f1ed;margin-top:20px;overflow:hidden}.bar u{display:block;height:100%;width:62%;background:#2f7d6b}
</style>
<div class="l"><span class="tag">영수증 · 결제 문자 · 구글 시트 정산</span>
<h1>나의 <b>MONEY</b><br>다이어리</h1>
<p>찍거나 붙여넣으면 자동 분류,<br>주간·월간 정산은 시트로</p></div>
<div class="card"><small>이번 달 지출</small><div class="big">1,284,600원</div>
<div class="row"><div class="ic">☕</div><span>스타벅스</span><i>-5,600</i></div>
<div class="row"><div class="ic">🛒</div><span>이마트</span><i>-53,200</i></div>
<div class="row"><div class="ic">🚌</div><span>카카오택시</span><i>-12,400</i></div>
<div class="row"><div class="ic">🔁</div><span>월급</span><i style="color:#2f6fde">+3,200,000</i></div>
<div class="bar"><u></u></div></div>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.setContent(html);
await p.screenshot({ path: out });
await b.close();
console.log('written', out);
