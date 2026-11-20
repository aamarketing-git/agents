// icon.svg 에서 PNG 아이콘 생성 (Playwright 필요: 개발 환경에서만 한 번 실행)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const pwa = join(dirname(fileURLToPath(import.meta.url)), '../pwa');
const svg = readFileSync(join(pwa, 'icon.svg'), 'utf8');
const b = await chromium.launch();
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await p.screenshot({ path: join(pwa, name) });
}
await b.close();
console.log('icons written');
