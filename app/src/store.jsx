import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { LOCAL_ONLY_KEY, auth as authApi, cloud as cloudApi, getHealth } from './lib/api'

/* =========================================================
   앱 상태 저장소 (브라우저 localStorage 기반, 백엔드 없이 동작)
   - profile   : 사용자 · AI 비서 이름 · 직종 · 글자 크기
   - customers : 고객 목록
   - meetings  : 미팅(만남) 기록 - 7단계 진행 상태 + 메모 + AI 피드백
   - events    : 일정
   - notes     : 자기관리 / 성장 기록
   ========================================================= */
const KEY = 'ai-secretary-v1'

export const PROFESSIONS = [
  { id: 'insurance', label: '보험 설계사' },
  { id: 'network', label: '네트워크 마케팅 · 방문판매' },
  { id: 'realestate', label: '부동산 · 분양' },
  { id: 'car', label: '자동차 · 렌탈 딜러' },
  { id: 'beauty', label: '미용 · 에스테틱 · 건강식품' },
  { id: 'education', label: '학원 · 교육 상담' },
  { id: 'finance', label: '금융 · 자산관리' },
  { id: 'other', label: '기타 영업 · 자영업' },
]

export const INTEREST_LABEL = ['', '처음 알아가는 중', '조금 관심', '관심 있음', '적극적', '결정 직전']

const initial = {
  profile: {
    userName: '',
    aiName: '',
    profession: '',
    fontScale: 'normal',
    voiceOn: true,
    premium: false,
    plan: 'free',
    createdAt: null,
  },
  customers: [],
  meetings: [],
  events: [],
  notes: [],
  contents: [],
  chat: [],
  library: [],
  progress: { education: {}, coachAsked: 0 },
}

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return initial
    const data = JSON.parse(raw)
    return { ...initial, ...data, profile: { ...initial.profile, ...(data.profile || {}) } }
  } catch {
    return initial
  }
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
export const today = () => new Date().toISOString().slice(0, 10)
export const addDays = (d, n) => {
  const x = new Date(d + 'T00:00:00')
  x.setDate(x.getDate() + n)
  return x.toISOString().slice(0, 10)
}
export const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000)
export const fmtDate = (d) => {
  if (!d) return ''
  const x = new Date(d + 'T00:00:00')
  const w = ['일', '월', '화', '수', '목', '금', '토'][x.getDay()]
  return `${x.getMonth() + 1}월 ${x.getDate()}일 (${w})`
}

function reducer(state, action) {
  switch (action.type) {
    case 'profile':
      return { ...state, profile: { ...state.profile, ...action.data } }
    case 'customer.add':
      return { ...state, customers: [{ ...action.data, id: uid(), createdAt: today() }, ...state.customers] }
    case 'customer.update':
      return { ...state, customers: state.customers.map((c) => (c.id === action.id ? { ...c, ...action.data } : c)) }
    case 'customer.remove':
      return {
        ...state,
        customers: state.customers.filter((c) => c.id !== action.id),
        meetings: state.meetings.filter((m) => m.customerId !== action.id),
        events: state.events.filter((e) => e.customerId !== action.id),
      }
    case 'meeting.add':
      return { ...state, meetings: [{ ...action.data, id: action.data.id || uid() }, ...state.meetings] }
    case 'meeting.update':
      return { ...state, meetings: state.meetings.map((m) => (m.id === action.id ? { ...m, ...action.data } : m)) }
    case 'event.add':
      return { ...state, events: [...state.events, { ...action.data, id: uid() }] }
    case 'event.update':
      return { ...state, events: state.events.map((e) => (e.id === action.id ? { ...e, ...action.data } : e)) }
    case 'event.remove':
      return { ...state, events: state.events.filter((e) => e.id !== action.id) }
    case 'note.add':
      return { ...state, notes: [{ ...action.data, id: uid(), date: today() }, ...state.notes] }
    case 'content.add':
      return { ...state, contents: [{ ...action.data, id: uid(), date: today() }, ...state.contents].slice(0, 50) }
    case 'library.add':
      return { ...state, library: [{ ...action.data, id: action.data.id || uid(), createdAt: today(), updatedAt: new Date().toISOString(), useCount: 0 }, ...state.library] }
    case 'library.update':
      return { ...state, library: state.library.map((i) => (i.id === action.id ? { ...i, ...action.data, updatedAt: new Date().toISOString() } : i)) }
    case 'library.remove':
      return { ...state, library: state.library.filter((i) => i.id !== action.id) }
    case 'chat.add':
      return { ...state, chat: [...state.chat, { ...action.data, id: action.data.id || uid(), ts: Date.now() }].slice(-80) }
    case 'chat.update':
      return { ...state, chat: state.chat.map((m) => (m.id === action.id ? { ...m, ...action.data } : m)) }
    case 'chat.clear':
      return { ...state, chat: [] }
    case 'education.done':
      return { ...state, progress: { ...state.progress, education: { ...state.progress.education, [action.id]: true } } }
    case 'coach.asked':
      return { ...state, progress: { ...state.progress, coachAsked: (state.progress.coachAsked || 0) + 1 } }
    case 'hydrate':
      return { ...initial, ...action.data, profile: { ...initial.profile, ...(action.data?.profile || {}) } }
    case 'reset':
      return initial
    default:
      return state
  }
}

const Ctx = createContext(null)

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)
  const [auth, setAuth] = useState(() => ({ user: null, cloud: null, health: null, syncing: false, lastSaved: null, error: '', localOnly: (() => { try { return localStorage.getItem(LOCAL_ONLY_KEY) === '1' } catch { return false } })() }))
  const versionRef = useRef(0)
  const skipSaveRef = useRef(true)
  const timerRef = useRef(null)

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* 저장공간 부족 등 */ }
  }, [state])
  useEffect(() => {
    const s = state.profile.fontScale
    document.documentElement.dataset.font = s === 'normal' ? '' : s
  }, [state.profile.fontScale])

  /* 서버에서 내 상태 불러오기 (로그인 직후·앱 시작) */
  const pullFromCloud = async (localState) => {
    const doc = await cloudApi.load()
    if (doc?.state) {
      skipSaveRef.current = true
      versionRef.current = doc.version || 0
      dispatch({ type: 'hydrate', data: doc.state })
      return 'loaded'
    }
    if (localState && (localState.customers.length || localState.profile.aiName)) {
      const r = await cloudApi.save(localState, 0)
      versionRef.current = r.version
      return 'uploaded'
    }
    return 'empty'
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      const h = await getHealth()
      if (!alive) return
      if (!h.cloud) { setAuth((a) => ({ ...a, cloud: false, health: h })); return }
      try {
        const me = await authApi.me()
        if (!alive) return
        if (me.user) { await pullFromCloud(state); if (alive) setAuth((a) => ({ ...a, cloud: true, health: h, user: me.user })) }
        else setAuth((a) => ({ ...a, cloud: true, health: h, user: null }))
      } catch { setAuth((a) => ({ ...a, cloud: true, health: h, user: null })) }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* 변경 시 1.5초 뒤 서버 저장 */
  useEffect(() => {
    if (!auth.user || !auth.cloud) return
    if (skipSaveRef.current) { skipSaveRef.current = false; return }
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setAuth((a) => ({ ...a, syncing: true }))
      try {
        const r = await cloudApi.save(state, versionRef.current)
        versionRef.current = r.version
        setAuth((a) => ({ ...a, syncing: false, lastSaved: r.updatedAt, error: '' }))
      } catch (e) {
        if (e.status === 409 && e.data?.server?.state) { skipSaveRef.current = true; versionRef.current = e.data.server.version; dispatch({ type: 'hydrate', data: e.data.server.state }) }
        setAuth((a) => ({ ...a, syncing: false, error: e.status === 409 ? '다른 기기의 최신 내용으로 맞췄습니다' : '저장 실패 · 다시 시도합니다' }))
      }
    }, 1500)
    return () => clearTimeout(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, auth.user, auth.cloud])

  const signIn = async (user) => { const how = await pullFromCloud(state); setAuth((a) => ({ ...a, user, error: '' })); return how }
  const signOut = async () => {
    try { await authApi.logout() } catch { /* ignore */ }
    clearTimeout(timerRef.current)
    skipSaveRef.current = true
    dispatch({ type: 'reset' })
    try { localStorage.removeItem(KEY) } catch { /* ignore */ }
    setAuth((a) => ({ ...a, user: null, lastSaved: null }))
  }
  const useLocalOnly = () => { try { localStorage.setItem(LOCAL_ONLY_KEY, '1') } catch { /* ignore */ } setAuth((a) => ({ ...a, localOnly: true })) }

  const api = useMemo(() => ({
    state,
    dispatch,
    auth, signIn, signOut, useLocalOnly,
    customer: (id) => state.customers.find((c) => c.id === id),
    meetingsOf: (id) => state.meetings.filter((m) => m.customerId === id).sort((a, b) => (a.date < b.date ? 1 : -1)),
    eventsOn: (d) => state.events.filter((e) => e.date === d).sort((a, b) => (a.time || '').localeCompare(b.time || '')),
  }), [state, auth]) // eslint-disable-line react-hooks/exhaustive-deps

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export const useStore = () => useContext(Ctx)

/* 한국어 조사 : 받침 유무에 따라 와/과, 이/가 등 선택 */
export function josa(word, pair = '와/과') {
  const [a, b] = pair.split('/')
  const ch = (word || '').trim().slice(-1)
  const code = ch.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return word + a // 한글이 아니면 앞쪽(와) 사용
  const hasFinal = (code - 0xac00) % 28 !== 0
  return word + (hasFinal ? b : a)
}

/* 고객 단계(파이프라인) : 신규 → 관계 형성 → 제안 → 결정 대기 → 계약 → 소개 요청 */
export const STAGES = [
  { id: 'new', label: '신규', short: '신규' },
  { id: 'rapport', label: '관계 형성', short: '관계' },
  { id: 'proposal', label: '제안', short: '제안' },
  { id: 'decision', label: '결정 대기', short: '결정' },
  { id: 'closed', label: '계약', short: '계약' },
  { id: 'referral', label: '소개 요청', short: '소개' },
]
export const stageIndex = (id) => Math.max(0, STAGES.findIndex((s) => s.id === (id || 'new')))
