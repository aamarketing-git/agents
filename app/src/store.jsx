import { createContext, useContext, useEffect, useMemo, useReducer } from 'react'

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
    createdAt: null,
  },
  customers: [],
  meetings: [],
  events: [],
  notes: [],
  contents: [],
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
    case 'education.done':
      return { ...state, progress: { ...state.progress, education: { ...state.progress.education, [action.id]: true } } }
    case 'coach.asked':
      return { ...state, progress: { ...state.progress, coachAsked: (state.progress.coachAsked || 0) + 1 } }
    case 'reset':
      return initial
    default:
      return state
  }
}

const Ctx = createContext(null)

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* 저장공간 부족 등 */ }
  }, [state])
  useEffect(() => {
    const s = state.profile.fontScale
    document.documentElement.dataset.font = s === 'normal' ? '' : s
  }, [state.profile.fontScale])

  const api = useMemo(() => ({
    state,
    dispatch,
    customer: (id) => state.customers.find((c) => c.id === id),
    meetingsOf: (id) => state.meetings.filter((m) => m.customerId === id).sort((a, b) => (a.date < b.date ? 1 : -1)),
    eventsOn: (d) => state.events.filter((e) => e.date === d).sort((a, b) => (a.time || '').localeCompare(b.time || '')),
  }), [state])

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
