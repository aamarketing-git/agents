import * as THREE from 'three';
import { ROOMS, HALL_Z, SEATS } from './office.js';

export const ROSTER = [
  { id: 'ceo',      name: '하루',  role: 'CEO',        color: 0x5b3fa6 },
  { id: 'planner',  name: '나래',  role: '기획',        color: 0x2f8f5b },
  { id: 'dev',      name: '도윤',  role: '개발',        color: 0x3b82c4 },
  { id: 'qa',       name: '서연',  role: 'QA',         color: 0x14a3a3 },
  { id: 'marketer', name: '지호',  role: '마케팅',      color: 0xd4693a },
  { id: 'designer', name: '미소',  role: '디자인',      color: 0xc9a227 },
];

export class Agent {
  constructor(def, scene) {
    Object.assign(this, def);
    this.state = 'idle';           // idle | walking | working
    this.say = ''; this.sayKind = '';
    this.seat = SEATS[def.id];
    this.path = []; this.t = Math.random() * 6;
    this.group = new THREE.Group();
    const m = (c) => new THREE.MeshLambertMaterial({ color: c });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.8, 12), m(def.color)); body.position.y = 0.55;
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), m(0xf2cfa5)); this.head.position.y = 1.2;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), m(0x3a2f27)); hair.position.y = 1.24;
    this.group.add(body, this.head, hair);
    this.group.position.set(this.seat.x, 0, this.seat.z + 0.9); // 의자 앞
    this.target = null; this.resolve = null;
    scene.add(this.group);
    this.hint = 0;
  }
  get pos() { return this.group.position; }

  // 복도 경유 이동: 현재 방 문 → 복도 → 목적지 방 문 → 목적지
  goTo(x, z, roomKey) {
    const p = this.pos, pts = [];
    const cur = Object.values(ROOMS).find((r) => p.x >= r.x && p.x < r.x + r.w && p.z >= r.z && p.z < r.z + r.d);
    const dst = ROOMS[roomKey];
    if (cur && cur !== dst) {
      const front = cur.z === 0 ? cur.z + cur.d - 0.5 : cur.z + 0.5;
      pts.push([cur.door, front], [cur.door, HALL_Z]);
    }
    if (cur !== dst) {
      pts.push([dst.door, HALL_Z]);
      pts.push([dst.door, dst.z === 0 ? dst.z + dst.d - 0.5 : dst.z + 0.5]);
    }
    pts.push([x, z]);
    this.path = pts; this.state = 'walking';
    return new Promise((res) => (this.resolve = res));
  }

  update(dt) {
    this.t += dt;
    if (this.state === 'walking' && this.path.length) {
      const [tx, tz] = this.path[0], p = this.pos;
      const dx = tx - p.x, dz = tz - p.z, dist = Math.hypot(dx, dz), step = 3.2 * dt;
      if (dist <= step) { p.x = tx; p.z = tz; this.path.shift(); if (!this.path.length) { this.state = 'idle'; this.resolve?.(); } }
      else { p.x += (dx / dist) * step; p.z += (dz / dist) * step; this.group.rotation.y = Math.atan2(dx, dz); }
      p.y = Math.abs(Math.sin(this.t * 12)) * 0.08;
    } else {
      this.pos.y = 0;
      this.head.rotation.x = this.state === 'working' ? Math.sin(this.t * 9) * 0.18 : 0;
    }
  }
}
