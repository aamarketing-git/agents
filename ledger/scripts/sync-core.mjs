// core/core.js 를 PWA(pwa/core.js)와 Apps Script(apps-script/Core.gs)로 복사한다.
import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
copyFileSync(join(root, 'core/core.js'), join(root, 'pwa/core.js'));
copyFileSync(join(root, 'core/core.js'), join(root, 'apps-script/Core.gs'));
console.log('synced core.js -> pwa/core.js, apps-script/Core.gs');
