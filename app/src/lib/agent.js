/* =========================================================
   1단계 에이전트 : 한국어 지시를 해석해 "실행 계획"을 만들고, 확인 후 실행
   - 서버 없이 동작 (규칙 기반)
   - 계획 = { intent, title, lines[], actions[], customer?, navigate? }
   - actions 는 store dispatch 로 실행 가능한 원자 동작
   ========================================================= */
import { STAGES, addDays, fmtDate, today, uid } from '../store'
import { FOLLOWUP_DAYS, nextFollowup, twoTwoTwoEvents } from './coaching'
import { findCustomer } from './assistant'

const WD = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 }
const pad = (n) => String(n).padStart(2, '0')

/* ---------- 날짜·시간 해석 ---------- */
export function parseDate(text) {
  const base = new Date(today() + 'T00:00:00')
  const dow = base.getDay()
  let m
  if (/오늘/.test(text)) return today()
  if (/내일/.test(text)) return addDays(today(), 1)
  if (/모레/.test(text)) return addDays(today(), 2)
  if (/글피/.test(text)) return addDays(today(), 3)
  if ((m = text.match(/(\d{1,2})\s*일\s*(후|뒤)/))) return addDays(today(), +m[1])
  if ((m = text.match(/(\d{1,2})\s*주\s*(후|뒤)/))) return addDays(today(), 7 * +m[1])
  if ((m = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/))) {
    let y = base.getFullYear()
    const d = `${y}-${pad(m[1])}-${pad(m[2])}`
    return d < today() ? `${y + 1}-${pad(m[1])}-${pad(m[2])}` : d
  }
  if ((m = text.match(/(다음\s*주|담주|이번\s*주|다다음\s*주)?\s*([월화수목금토일])요일/))) {
    const target = WD[m[2]]
    const thisMonday = addDays(today(), dow === 0 ? -6 : 1 - dow)
    const inThisWeek = addDays(thisMonday, (target + 6) % 7)
    if (/다다음/.test(m[1] || '')) return addDays(inThisWeek, 14)
    if (/다음|담주/.test(m[1] || '')) return addDays(inThisWeek, 7)
    if (/이번/.test(m[1] || '')) return inThisWeek
    return inThisWeek >= today() ? inThisWeek : addDays(inThisWeek, 7)
  }
  if ((m = text.match(/(?:^|[^\d월])(\d{1,2})\s*일(?!\s*(후|뒤|간))/))) {
    const d = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(m[1])}`
    if (d >= today()) return d
    const nm = new Date(base.getFullYear(), base.getMonth() + 1, +m[1])
    return `${nm.getFullYear()}-${pad(nm.getMonth() + 1)}-${pad(nm.getDate())}`
  }
  return null
}

export function parseTime(text) {
  let m
  const pm = /(오후|저녁|밤|낮)/.test(text)
  const am = /(오전|아침|새벽)/.test(text)
  if (/점심/.test(text) && !/\d\s*시/.test(text)) return '12:00'
  if (/아침/.test(text) && !/\d\s*시/.test(text)) return '09:00'
  if ((m = text.match(/(\d{1,2})\s*시\s*(반|(\d{1,2})\s*분)?/))) {
    let h = +m[1]
    const min = m[2] ? (m[2] === '반' ? 30 : +m[3]) : 0
    if (pm && h < 12) h += 12
    if (!pm && !am && h >= 1 && h <= 6) h += 12 // "3시"는 보통 오후
    return `${pad(h)}:${pad(min)}`
  }
  if ((m = text.match(/(\d{1,2}):(\d{2})/))) return `${pad(m[1])}:${m[2]}`
  return ''
}

/* ---------- 이름·전화 추출 ---------- */
const STOP = /^(오늘|내일|모레|다음|이번|새로|새|신규|고객|등록|추가|저장|일정|만남|약속|미팅|전화|카톡|문자|메모|기억|관심|단계|계약|제안|결정|관계|소개|안부|감사|메시지|비서|나는|저는|우리)/
export function extractNewName(text) {
  const t = text.replace(/01\d[-\s]?\d{3,4}[-\s]?\d{4}/g, ' ').replace(/\s+/g, ' ').trim()
  const cands = [
    t.match(/(?:새\s*고객|신규\s*고객|고객)\s*([가-힣]{2,4})(?:님|씨)?/),
    t.match(/([가-힣]{2,4})(?:님|씨)?\s*(?:을|를|이|가)?\s*(?:새로\s*)?(?:등록|추가|저장)/),
    t.match(/^([가-힣]{2,4})(?:님|씨)?(?:\s|$)/),
  ]
  for (const m of cands) { if (m && !STOP.test(m[1])) return m[1] }
  return null
}
export const extractPhone = (text) => (text.match(/01\d[-\s]?\d{3,4}[-\s]?\d{4}/) || [null])[0]?.replace(/\s/g, '')
const extractInterest = (text) => { const m = text.match(/관심도?\s*(\d)/) || text.match(/(\d)\s*점/); return m ? Math.min(5, Math.max(1, +m[1])) : null }
function extractStage(text) {
  if (/계약(했|됐|완료|성사)/.test(text) || /계약\s*(으로|단계)/.test(text)) return 'closed'
  if (/소개\s*(요청|단계|받)/.test(text)) return 'referral'
  if (/결정\s*(대기|단계|기다)/.test(text)) return 'decision'
  if (/제안(했|단계|으로)/.test(text)) return 'proposal'
  if (/관계\s*(형성|단계)/.test(text)) return 'rapport'
  if (/신규\s*(로|단계)/.test(text)) return 'new'
  return null
}
/* 따옴표 안 또는 "~라고/내용은" 뒤의 본문 */
function extractQuote(text) {
  const m = text.match(/["“'‘](.+?)["”'’]/) || text.match(/(?:내용은|메모는|라고|기억해\s*둬?:?)\s*(.+)$/)
  return m ? m[1].trim() : ''
}

/* ---------- 계획 수립 ---------- */
export function planCommand(text, state) {
  const q = text.replace(/\s+/g, ' ').trim()
  const ai = state.profile.aiName
  const known = findCustomer(q, state)
  const date = parseDate(q)
  const time = parseTime(q)

  // 1) 고객 등록
  const newName = !known && extractNewName(q)
  if (/등록|추가|저장/.test(q) && newName) {
    const phone = extractPhone(q)
    const interest = extractInterest(q) || 2
    const memo = q.replace(/01\d[-\s]?\d{3,4}[-\s]?\d{4}/, '').replace(/(새\s*고객|신규\s*고객|고객|등록해\s*줘|등록|추가해\s*줘|추가|저장해\s*줘|저장)/g, '').replace(newName, '').replace(/관심도?\s*\d/, '').replace(/[,.\s]+/g, ' ').trim()
    const base = { name: newName, phone: phone || '', interest, stage: 'new', memo, createdAt: today() }
    return {
      intent: 'add_customer', title: `새 고객 등록: ${newName}`,
      lines: [`이름 ${newName}${phone ? ` · 연락처 ${phone}` : ''} · 관심도 ${'★'.repeat(interest)}`, memo ? `메모: ${memo}` : '메모 없음', `첫 연락 권장일 ${fmtDate(nextFollowup(base))}`],
      actions: [{ type: 'customer.add', data: { ...base, nextFollowup: nextFollowup(base), stageChangedAt: today() } }],
      after: `${newName}님을 등록했습니다.`, navigate: '/customers',
    }
  }
  if (/등록|추가/.test(q) && !known && !newName && /고객/.test(q)) {
    return { intent: 'ask', title: '누구를 등록할까요?', lines: ['이름을 함께 말씀해 주세요. 예: "김철수 010-1234-5678 등록해 줘"'], actions: [] }
  }

  // 2) 일정 추가
  if (/일정|만남|약속|미팅|잡아|예약|세미나|교육|모임/.test(q) && (date || time) && !/했(어|다|음)/.test(q)) {
    const d = date || today()
    const title = known ? `${known.name}님 만남` : (q.match(/(세미나|교육|모임|미팅|회의|상담)/) || ['', '일정'])[1]
    const place = (q.match(/([가-힣A-Za-z0-9]+(?:역|카페|사무실|지점|센터|병원|식당|집))/) || [null])[0]
    return {
      intent: 'add_event', title: `일정 추가: ${title}`,
      lines: [`${fmtDate(d)}${time ? ` ${time}` : ' (시간 미정)'}${place ? ` · ${place}` : ''}`, known ? `${known.name}님과 연결됩니다. 당일 "오늘 할 일"에서 7단계 만남 준비로 바로 들어갈 수 있어요.` : '고객과 연결하려면 이름을 함께 말씀해 주세요.'],
      actions: [{ type: 'event.add', data: { date: d, time, title, customerId: known?.id || '', memo: place || '' } }],
      after: `${fmtDate(d)} ${time} ${title} 일정을 추가했습니다.`, navigate: '/schedule', customer: known,
    }
  }

  // 3) 연락 기록 (전화했어 / 카톡 보냈어 / 만났어)
  if (known && /(전화|통화|카톡|문자|메시지|만났|만남|방문)\s*(했|보냈|드렸|나눴|다녀)/.test(q)) {
    const channel = /전화|통화/.test(q) ? '전화' : /카톡|문자|메시지/.test(q) ? '카톡' : '만남'
    const note = extractQuote(q) || q.replace(known.name, '').replace(/(님|씨|한테|에게|랑|과|와|랑)/g, ' ').replace(/(전화|통화|카톡|문자|메시지|만났|만남|방문)\s*(했|보냈|드렸|나눴|다녀)\S*/g, '').replace(/[,.\s]+/g, ' ').trim()
    const interest = extractInterest(q)
    const stage = extractStage(q)
    const next = addDays(today(), FOLLOWUP_DAYS[interest || known.interest || 2] || 7)
    const actions = [
      { type: 'customer.update', id: known.id, data: { lastContact: today(), nextFollowup: next, ...(interest ? { interest } : {}), ...(stage ? { stage, stageChangedAt: today() } : {}) } },
      { type: 'meeting.add', data: { customerId: known.id, date: today(), done: true, step: 7, memo: `[${channel}] ${note || '연락함'}`, result: /좋|긍정|잘/.test(q) ? 'positive' : /미지근|별로|거절|부정/.test(q) ? 'negative' : 'neutral' } },
    ]
    if (stage === 'closed' && known.stage !== 'closed') twoTwoTwoEvents(known).forEach((e) => actions.push({ type: 'event.add', data: e }))
    return {
      intent: 'log_contact', title: `${known.name}님 ${channel} 기록`,
      lines: [`오늘 ${channel} · ${note || '내용 없음'}`, `다음 연락 권장일 ${fmtDate(next)}`, ...(interest ? [`관심도 ${'★'.repeat(interest)}로 변경`] : []), ...(stage ? [`단계 → ${STAGES.find((s) => s.id === stage).label}${stage === 'closed' ? ' (2일·2주·2개월 연락 일정 자동 생성)' : ''}`] : [])],
      actions, after: `${known.name}님 ${channel} 기록을 저장했습니다.`, navigate: `/customers/${known.id}`, customer: known,
    }
  }

  // 4) 단계 변경
  const stage = known && extractStage(q)
  if (known && stage) {
    const actions = [{ type: 'customer.update', id: known.id, data: { stage, stageChangedAt: today() } }]
    if (stage === 'closed' && known.stage !== 'closed') twoTwoTwoEvents(known).forEach((e) => actions.push({ type: 'event.add', data: e }))
    return {
      intent: 'set_stage', title: `${known.name}님 단계 변경`,
      lines: [`${STAGES.find((s) => s.id === (known.stage || 'new')).label} → ${STAGES.find((s) => s.id === stage).label}`, ...(stage === 'closed' ? ['계약 축하드려요. 2일·2주·2개월 연락 일정을 함께 만듭니다.'] : [])],
      actions, after: `${known.name}님 단계를 바꿨습니다.`, navigate: `/customers/${known.id}`, customer: known,
    }
  }

  // 5) 관심도
  const interest = known && extractInterest(q)
  if (known && interest && /관심|점/.test(q)) {
    const next = addDays(known.lastContact || today(), FOLLOWUP_DAYS[interest])
    return {
      intent: 'set_interest', title: `${known.name}님 관심도 변경`,
      lines: [`${'★'.repeat(known.interest || 0)} → ${'★'.repeat(interest)}`, `다음 연락 권장일 ${fmtDate(next)}`],
      actions: [{ type: 'customer.update', id: known.id, data: { interest, nextFollowup: next } }],
      after: `${known.name}님 관심도를 ${interest}점으로 바꿨습니다.`, navigate: `/customers/${known.id}`, customer: known,
    }
  }

  // 6) 메모·기억
  if (known && /기억|메모|적어|남겨|저장해/.test(q)) {
    const note = extractQuote(q) || q.replace(known.name, '').replace(/(님|씨|한테|에게|에 대해|은|는)/g, ' ').replace(/(기억해\s*둬?|기억해|메모해\s*둬?|메모|적어\s*둬?|남겨\s*둬?|저장해\s*줘?|줘)/g, '').replace(/[,.\s]+/g, ' ').trim()
    const personal = /(가족|자녀|아들|딸|남편|아내|부모|건강|취미|생일|기념일|여행|골프|등산)/.test(note)
    const field = personal ? 'family' : 'memo'
    const merged = [known[field], note].filter(Boolean).join(' / ')
    return {
      intent: 'add_note', title: `${known.name}님 ${personal ? '기억할 것' : '메모'} 추가`,
      lines: [note || '(내용을 찾지 못했어요)'],
      actions: note ? [{ type: 'customer.update', id: known.id, data: { [field]: merged } }] : [],
      after: `${known.name}님 정보에 적어 두었습니다.`, navigate: `/customers/${known.id}`, customer: known,
    }
  }

  // 7) 메시지·콘텐츠 → 콘텐츠 화면으로
  if (/카톡|메시지|문자|글|게시|콘텐츠|써\s*줘|작성|만들어\s*줘/.test(q) && /(써|만들|작성|보낼|초안)/.test(q)) {
    const kind = /감사/.test(q) ? '감사 카톡' : /안부/.test(q) ? '안부 카톡' : /초대|모임/.test(q) ? '모임 초대' : /SNS|게시|인스타|블로그/i.test(q) ? 'SNS 게시글' : /교육|자료/.test(q) ? '교육자료 개요' : known ? '안부 카톡' : '정보 제공 메시지'
    return { intent: 'content', title: `${kind} 만들기`, lines: [known ? `${known.name}님 정보(가족·최근 대화·약속)를 미리 채워 드릴게요.` : '콘텐츠 화면에서 주제를 확인하고 생성하세요.'], actions: [], navigate: `/content?kind=${encodeURIComponent(kind)}${known ? `&to=${encodeURIComponent(known.name)}` : ''}`, customer: known, direct: true }
  }

  // 8) 모르는 이름을 부르며 시킨 경우 → 등록 제안
  const unk = q.match(/([가-힣]{2,4})(?:님|씨)(?:한테|에게|께|은|는|이|가|을|를|\s)/)
  if (!known && unk && !STOP.test(unk[1]) && /기억|메모|전화|카톡|만났|계약|관심|일정|만남|약속/.test(q)) {
    const name = unk[1]
    const base = { name, phone: extractPhone(q) || '', interest: extractInterest(q) || 2, stage: 'new', memo: '', createdAt: today() }
    return {
      intent: 'unknown_customer', title: `${name}님이 아직 등록되어 있지 않아요`,
      lines: ['새 고객으로 먼저 등록할까요? 등록 후 같은 말을 다시 해 주시면 바로 처리합니다.'],
      actions: [{ type: 'customer.add', data: { ...base, nextFollowup: nextFollowup(base), stageChangedAt: today() } }],
      after: `${name}님을 등록했습니다. 이제 "${name}님 …" 하고 다시 말씀해 주세요.`, navigate: '/customers',
    }
  }

  return null
}

/* ---------- 실행 ---------- */
export function runPlan(plan, dispatch) {
  plan.actions.forEach((a) => dispatch({ ...a, data: a.data ? { ...a.data, ...(a.type === 'meeting.add' ? { id: uid() } : {}) } : undefined }))
}

/* 홈·비서 화면 예시 명령 */
export const COMMAND_EXAMPLES = [
  '오늘 연락할 고객 누구야?',
  '김철수 010-1234-5678 등록해 줘',
  '박미영님 다음 주 화요일 3시 만남 잡아 줘',
  '박미영님한테 전화했어, 아들 입시 걱정 많으심',
  '박미영님 계약했어',
  '박미영님 관심도 5점으로',
  '이철수님 골프 좋아하는 거 기억해 둬',
  '박미영님께 감사 카톡 써 줘',
]
