/* 인증 : 이메일+비밀번호(scrypt) · 세션은 HS256 JWT 를 httpOnly 쿠키에 */
import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import { db, K, getJSON, setJSON } from './db.js'
import { cookies } from './http.js'

const SECRET = process.env.AUTH_SECRET
export const authEnabled = !!SECRET
const key = () => new TextEncoder().encode(SECRET)
const COOKIE = 'aisec_session'
const BETA_ALL = process.env.BETA_ALL_ACCESS !== '0' // 베타: 기본 전체 개방

export function hashPassword(pw) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(pw, salt, 64).toString('hex')}` }
export function verifyPassword(pw, stored) {
  const [salt, hash] = (stored || '').split(':'); if (!salt || !hash) return false
  const a = Buffer.from(hash, 'hex'), b = scryptSync(pw, salt, 64)
  return a.length === b.length && timingSafeEqual(a, b)
}
export async function createSession(res, uid) {
  const token = await new SignJWT({ sub: uid }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('30d').sign(key())
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 86400}`)
}
export function clearSession(res) { res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`) }

export async function getUser(req) {
  if (!authEnabled) return null
  const t = cookies(req)[COOKIE]; if (!t) return null
  try { const { payload } = await jwtVerify(t, key()); const u = await getJSON(K.user(payload.sub)); return u ? publicUser(u) : null } catch { return null }
}
export function publicUser(u) { return { id: u.id, email: u.email, plan: BETA_ALL ? 'premier' : (u.plan || 'free'), createdAt: u.createdAt, beta: BETA_ALL } }

export async function findUserByEmail(email) { const id = await db.get(K.userByEmail(email)); return id ? getJSON(K.user(id)) : null }
export async function createUser(email, password) {
  const id = randomUUID()
  const user = { id, email: email.toLowerCase(), pass: hashPassword(password), plan: 'free', createdAt: new Date().toISOString() }
  await setJSON(K.user(id), user); await db.set(K.userByEmail(email), id); await db.sadd(K.users, id)
  return user
}
export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '')

/* 플랜별 AI 하루 한도 */
const LIMITS = { free: 5, standard: 30, pro: 100000, premier: 100000 }
export async function checkUsage(user, date) {
  if (!user) return { ok: true, used: 0, limit: 0 }
  const k = K.usage(user.id, date)
  const used = await db.incr(k); await db.expire(k, 2 * 86400)
  const limit = LIMITS[user.plan] ?? 5
  return { ok: used <= limit, used, limit }
}
