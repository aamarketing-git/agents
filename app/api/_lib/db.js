/* 데이터 저장소 : Upstash Redis (Vercel 마켓플레이스) — 환경변수 없으면 메모리(개발용) */
import { Redis } from '@upstash/redis'

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
export const cloudEnabled = !!(url && token)

const mem = globalThis.__memdb || (globalThis.__memdb = { kv: new Map(), sets: new Map() })
const memory = {
  async get(k) { const v = mem.kv.get(k); return v === undefined ? null : v },
  async set(k, v) { mem.kv.set(k, v); return 'OK' },
  async del(k) { mem.kv.delete(k); return 1 },
  async incr(k) { const v = (Number(mem.kv.get(k)) || 0) + 1; mem.kv.set(k, v); return v },
  async expire() { return 1 },
  async sadd(k, m) { if (!mem.sets.has(k)) mem.sets.set(k, new Set()); mem.sets.get(k).add(m); return 1 },
  async srem(k, m) { mem.sets.get(k)?.delete(m); return 1 },
  async smembers(k) { return [...(mem.sets.get(k) || [])] },
}
export const db = cloudEnabled ? new Redis({ url, token }) : memory

/* 키 규칙 */
export const K = {
  userByEmail: (e) => `user:email:${e.toLowerCase()}`,
  user: (id) => `user:${id}`,
  state: (id) => `state:${id}`,
  push: (id) => `push:${id}`,
  usage: (id, d) => `usage:${id}:${d}`,
  users: 'users',
}
/* Upstash 는 객체를 자동 직렬화하지만 메모리 모드와 맞추기 위해 JSON 문자열로 통일 */
export async function getJSON(key) { const v = await db.get(key); if (v === null || v === undefined) return null; return typeof v === 'string' ? JSON.parse(v) : v }
export async function setJSON(key, obj) { return db.set(key, JSON.stringify(obj)) }
