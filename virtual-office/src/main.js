import * as THREE from 'three';
import { buildOffice, ROOMS } from './office.js';
import { Agent, ROSTER } from './agents.js';
import { Company } from './sim.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xdfe6dc);
scene.add(new THREE.HemisphereLight(0xffffff, 0xb8bfae, 1.0));
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(-8, 16, 6); scene.add(sun);
buildOffice(scene);

const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);
const center = new THREE.Vector3(12, 0, 8);
function fit() {
  const w = innerWidth, h = innerHeight, view = Math.max(15, 17 * Math.max(1, 1.4 / (w / h)) );
  const a = w / h; cam.left = -view * a / 1.15; cam.right = view * a / 1.15; cam.top = view / 1.15; cam.bottom = -view / 1.15;
  cam.position.copy(center).add(new THREE.Vector3(18, 20, 18)); cam.lookAt(center); cam.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
addEventListener('resize', fit); fit();

const agents = ROSTER.map((d) => new Agent(d, scene));
const labels = document.getElementById('labels');
const tags = agents.map((a) => { const el = document.createElement('div'); el.className = 'tag'; el.innerHTML = '<span class="b"></span><span class="n"></span>'; labels.appendChild(el); return el; });
for (const r of Object.values(ROOMS)) { const el = document.createElement('div'); el.className = 'room'; el.textContent = r.name; el._p = new THREE.Vector3(r.x + r.w / 2, 0.1, r.z + r.d - 0.7); labels.appendChild(el); r._el = el; }

const logEl = document.getElementById('log'), roster = document.getElementById('roster');
const log = (a, text) => {
  const li = document.createElement('li'), t = new Date().toLocaleTimeString('ko-KR', { hour12: false });
  li.innerHTML = `<time>${t}</time><b>${a.name}</b> ${text}`; logEl.prepend(li);
};
const stateKo = { idle: '대기', walking: '이동', working: '작업' };

const company = new Company(agents, log);
const form = document.getElementById('goalForm'), input = document.getElementById('goalInput');
form.onsubmit = async (e) => {
  e.preventDefault(); const g = input.value.trim(); if (!g || company.busy) return;
  input.value = ''; form.querySelector('button').disabled = true;
  await company.run(g); form.querySelector('button').disabled = false;
};

const v = new THREE.Vector3(), clock = new THREE.Clock(), clockEl = document.getElementById('clock');
function proj(p, el, lift = 0) { v.copy(p); v.y += lift; v.project(cam); el.style.left = (v.x * 0.5 + 0.5) * innerWidth + 'px'; el.style.top = (-v.y * 0.5 + 0.5) * innerHeight + 'px'; }
function loop() {
  const dt = Math.min(clock.getDelta(), 0.1);
  agents.forEach((a, i) => {
    a.update(dt); const el = tags[i];
    const b = el.firstChild; b.textContent = a.say; b.className = 'b ' + a.sayKind;
    el.lastChild.textContent = `${a.name} · ${a.role}`; proj(a.pos, el, 1.65);
  });
  Object.values(ROOMS).forEach((r) => proj(r._el._p, r._el));
  roster.innerHTML = agents.map((a) => `<div class="r"><i style="background:#${a.color.toString(16).padStart(6, '0')}"></i>${a.name} <small>${a.role}</small><span>${stateKo[a.state]}</span></div>`).join('');
  clockEl.textContent = new Date().toLocaleTimeString('ko-KR', { hour12: false });
  renderer.render(scene, cam); requestAnimationFrame(loop);
}
loop();
window.__company = company; // 디버그/데모용
