import * as THREE from 'three';

// 바닥 24 x 16. 복도(z 7~9)를 사이에 두고 위·아래 3개씩 방.
export const ROOMS = {
  ceo:       { name: 'CEO실',   x: 0,  z: 0, w: 8, d: 7, color: 0xe9dfc8, door: 4 },
  planning:  { name: '기획실',  x: 8,  z: 0, w: 8, d: 7, color: 0xdce8d6, door: 12 },
  dev:       { name: '개발실',  x: 16, z: 0, w: 8, d: 7, color: 0xd5e2ea, door: 20 },
  marketing: { name: '마케팅실', x: 0,  z: 9, w: 8, d: 7, color: 0xefd9d6, door: 4 },
  meeting:   { name: '회의실',  x: 8,  z: 9, w: 8, d: 7, color: 0xe6e0ee, door: 12 },
  design:    { name: '디자인실', x: 16, z: 9, w: 8, d: 7, color: 0xf0e6c9, door: 20 },
};
export const HALL_Z = 8;

const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
const box = (w, h, d, c, x, y, z, parent) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
  m.position.set(x, y + h / 2, z); parent.add(m); return m;
};

export function buildOffice(scene) {
  const g = new THREE.Group(); scene.add(g);
  box(24.6, 0.2, 16.6, 0xc9cfc0, 12, -0.2, 8, g); // 바닥판
  box(24, 0.05, 2, 0xb7bdae, 12, 0, HALL_Z, g);   // 복도

  for (const r of Object.values(ROOMS)) {
    box(r.w - 0.1, 0.06, r.d - 0.1, r.color, r.x + r.w / 2, 0, r.z + r.d / 2, g);
    const top = r.z === 0, wallZ = top ? r.z : r.z + r.d, front = top ? r.z + r.d : r.z;
    const wc = 0xf4f1e8, h = 1.4;
    box(r.w, h, 0.15, wc, r.x + r.w / 2, 0, wallZ, g);                       // 뒷벽
    box(0.15, h, r.d, wc, r.x, 0, r.z + r.d / 2, g);                          // 좌벽
    box(0.15, h, r.d, wc, r.x + r.w, 0, r.z + r.d / 2, g);                    // 우벽
    const L = r.door - 1 - r.x, R = r.x + r.w - (r.door + 1);                 // 문 틈이 있는 앞벽
    box(L, 0.5, 0.12, wc, r.x + L / 2, 0, front, g);
    box(R, 0.5, 0.12, wc, r.door + 1 + R / 2, 0, front, g);
  }

  const desk = (x, z, parent = g, ry = 0) => {
    const d = new THREE.Group(); d.position.set(x, 0, z); d.rotation.y = ry; parent.add(d);
    box(1.8, 0.1, 0.9, 0x9b7b56, 0, 0.7, 0, d);
    box(0.1, 0.7, 0.1, 0x6e5a40, -0.8, 0, -0.35, d); box(0.1, 0.7, 0.1, 0x6e5a40, 0.8, 0, -0.35, d);
    box(0.1, 0.7, 0.1, 0x6e5a40, -0.8, 0, 0.35, d); box(0.1, 0.7, 0.1, 0x6e5a40, 0.8, 0, 0.35, d);
    box(0.7, 0.45, 0.06, 0x2b2f27, 0, 0.85, -0.2, d);
    box(0.62, 0.37, 0.02, 0x7fc4e8, 0, 0.89, -0.17, d);
  };
  const table = (x, z) => { box(3.6, 0.12, 1.6, 0x8b6b49, x, 0.7, z, g); box(0.2, 0.7, 0.2, 0x6e5a40, x, 0, z, g); };
  const plant = (x, z) => { box(0.3, 0.3, 0.3, 0xb5836a, x, 0, z, g); box(0.5, 0.5, 0.5, 0x5b9a56, x, 0.3, z, g); };

  // 책상 배치: 책상은 의자 위치(seat) 바로 뒤에 둔다
  desk(4, 1.4); desk(12, 1.4); desk(18, 1.4); desk(22, 1.4);
  desk(4, 14.6, g, Math.PI); desk(20, 14.6, g, Math.PI);
  table(12, 12.5);
  for (const [x, z] of [[0.7,0.7],[15.3,0.7],[23.3,0.7],[0.7,15.3],[8.7,15.3],[15.3,15.3],[23.3,15.3]]) plant(x, z);
  return g;
}

// 방별 좌석(앉는 위치)과 회의실 자리
export const SEATS = {
  ceo: { room: 'ceo', x: 4, z: 2.5 },
  planner: { room: 'planning', x: 12, z: 2.5 },
  dev: { room: 'dev', x: 18, z: 2.5 },
  qa: { room: 'dev', x: 22, z: 2.5 },
  marketer: { room: 'marketing', x: 4, z: 13.5 },
  designer: { room: 'design', x: 20, z: 13.5 },
};
export const MEETING = [[10.2, 10.6], [12, 10.4], [13.8, 10.6], [10.2, 14.2], [12, 14.4], [13.8, 14.2]];
