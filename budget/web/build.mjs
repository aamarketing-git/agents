// 구글 시트 판의 화면(Index.html)과 로직(Logic.gs)에 웹 어댑터를 붙여
// 바로 열어 쓰는 웹 판 한 파일(web/index.html)을 만듭니다.
// 실행: node budget/web/build.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const index = read('../apps-script/Index.html');
const logic = read('../apps-script/Logic.gs');
const adapter = read('./adapter.js');

const head = index.slice(index.indexOf('<head>') + 6, index.indexOf('</head>'))
  .replace(/<base[^>]*>\s*/, '')
  .replace(/<meta charset="utf-8">\s*/, '');
let body = index.slice(index.indexOf('<body>') + 6, index.indexOf('</body>'));

const kLine = 'var K = <?!= JSON.stringify(k) ?>;';
if (!body.includes(kLine)) throw new Error('Index.html의 토큰 줄을 찾지 못함');
body = body.replace(kLine, "var K = 'web';");
const mainScript = '<script>\nvar K';
if (!body.includes(mainScript)) throw new Error('Index.html의 본 스크립트를 찾지 못함');
body = body.replace(mainScript, `<script>\n/* Logic.gs */\n${logic}\n</script>\n<script>\n${adapter}\n</script>\n${mainScript}`);
if (body.includes('<?')) throw new Error('템플릿 구문이 남아 있음');

const out = `<title>찰칵 가계부</title>
<!-- 자동 생성 파일: budget/web/build.mjs 로 만듭니다. 고칠 때는 apps-script/Index.html · Logic.gs · web/adapter.js 를 고치세요. -->
${head.trim()}
${body.trim()}
`;
writeFileSync(new URL('./index.html', import.meta.url), out);
console.log(`web/index.html ${(out.length / 1024).toFixed(1)} KB`);
