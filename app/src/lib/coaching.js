/* =========================================================
   규칙 기반 코칭 로직 (AI 서버 없이도 동작하는 기본 지능)
   - 팔로업 주기, 만남 단계별 가이드, 구조화 피드백, 오늘 브리핑, 주간 리포트, 성장 로드맵
   리서치 근거: docs/RESEARCH_MARKET.md
   ========================================================= */
import { STAGES, addDays, daysBetween, fmtDate, stageIndex, today } from '../store'

/* 관심도(1~5)에 따른 권장 연락 간격(일) : 2-2-2 / 3-7-30 팔로업 원칙 응용 */
export const FOLLOWUP_DAYS = { 1: 14, 2: 7, 3: 5, 4: 3, 5: 2 }

export function nextFollowup(customer) {
  const last = customer.lastContact || customer.createdAt || today()
  return addDays(last, FOLLOWUP_DAYS[customer.interest || 2] || 7)
}

export function followupStatus(customer) {
  const due = customer.nextFollowup || nextFollowup(customer)
  const diff = daysBetween(today(), due)
  if (diff < 0) return { key: 'overdue', label: `${-diff}일 지남`, tone: 'red', diff }
  if (diff === 0) return { key: 'today', label: '오늘 연락', tone: 'amber', diff }
  if (diff <= 2) return { key: 'soon', label: `${diff}일 후`, tone: 'navy', diff }
  return { key: 'ok', label: `${diff}일 후`, tone: '', diff }
}

/* 계약 직후 2-2-2 법칙 : D+2 사용 확인, D+14 습관 확인, D+60 소개 요청 */
export function twoTwoTwoEvents(customer) {
  const d = today()
  return [
    { date: addDays(d, 2), time: '10:00', customerId: customer.id, title: `${customer.name}님 사용 확인 전화 (계약 2일)`, memo: '2-2-2 · 잘 쓰고 계신지, 궁금한 점 없는지' },
    { date: addDays(d, 14), time: '10:00', customerId: customer.id, title: `${customer.name}님 습관 확인 (계약 2주)`, memo: '2-2-2 · 사용 습관 정착 확인, 작은 팁 하나' },
    { date: addDays(d, 60), time: '10:00', customerId: customer.id, title: `${customer.name}님 소개 요청 (계약 2개월)`, memo: '2-2-2 · 만족 확인 후 "한 분만" 소개 부탁' },
  ]
}

/* 단계별 코칭 문장 */
export const STAGE_TIP = {
  new: '아직 서로를 모릅니다. 상품 말고 사람을 알아가는 질문 3개를 준비하세요.',
  rapport: '신뢰를 쌓는 중입니다. 지난 대화의 개인 이야기를 먼저 꺼내고, 도움이 되는 정보를 한 가지 주세요.',
  proposal: '제안 단계입니다. 상대의 언어로, 기능 대신 변화를 말하세요. 30초·3분 설명을 준비하세요.',
  decision: '결정을 기다리는 중입니다. 망설임의 진짜 이유(가격·시기·가족)를 콕 집어 물어보세요. 작은 시작을 제안하세요.',
  closed: '계약했습니다. 2-2-2 법칙(2일·2주·2개월)으로 연락하면 이탈이 줄고 소개가 늘어납니다.',
  referral: '소개를 요청할 때입니다. "주변에 저처럼 ○○ 고민하시는 분 한 분만" 이 문장을 쓰세요.',
}

/* 몇 번째 만남인지에 따른 목표 */
export function meetingGoal(n) {
  if (n <= 1) return { title: '첫 만남 : 신뢰 만들기', tip: '팔지 마세요. 질문하고 들으세요. 상대의 관심사·고민 3가지를 알아오는 것이 오늘의 성공입니다.' }
  if (n === 2) return { title: '두 번째 : 필요 확인', tip: '지난 대화에서 들은 고민을 먼저 꺼내세요. "지난번에 말씀하신 ○○는 어떻게 되셨어요?" 한 마디가 신뢰를 두 배로 만듭니다.' }
  if (n === 3) return { title: '세 번째 : 해결책 제안', tip: '상대의 언어로 제안하세요. 기능 설명 대신 "이게 되면 ○○님께 어떤 점이 편해지는지"를 말하세요.' }
  if (n === 4) return { title: '네 번째 : 결정 돕기', tip: '망설임의 이유를 정확히 물으세요. 가격·시기·가족 의견 중 무엇인지 알면 답이 보입니다. 작은 결정(체험, 소량)부터 제안하세요.' }
  return { title: `${n}번째 : 관계 유지·소개 요청`, tip: '이미 신뢰가 있습니다. 감사 인사와 함께 "주변에 비슷한 고민을 가진 분이 계시면 소개해 주시겠어요?"라고 자연스럽게 요청하세요.' }
}

/* 미팅 전 준비 체크 문항 */
export const PREP_QUESTIONS = [
  '이 분의 최근 관심사·고민은 무엇이었나요?',
  '지난 만남에서 약속한 것(자료·답변)이 있나요?',
  '오늘 꼭 전달할 핵심 한 가지는?',
  '상대가 "예"라고 할 수 있는 작은 제안은?',
  '가족·기념일·건강 등 기억해 둔 개인 정보가 있나요?',
]

/* =========================================================
   미팅 후 구조화 피드백 (규칙 기반)
   반환: { score, rows: [{kind:'good'|'warn'|'plan'|'act', label, text}], summary }
   ========================================================= */
const PERSONAL = /(가족|자녀|아들|딸|남편|아내|부모|어머니|아버지|손주|건강|병원|수술|취미|여행|골프|등산|생일|기념일|이사|은퇴|직장|사업)/
const QUOTE = /["“”'‘’]/
const NEED = /(고민|걱정|필요|원하|바라|힘들|불편|문제|궁금)/
const OBJECTION = /(비싸|가격|부담|나중|생각해|남편|아내|상의|바빠|시간)/
const PROMISE = /(보내|약속|다음|연락|자료|전화|만나|카톡)/

export function localFeedback({ customer, meeting, count, prevMeeting }) {
  const memo = (meeting.memo || '').trim()
  const rows = []
  let score = 40

  // 잘한 점
  if (memo.length >= 60) { score += 15; rows.push({ kind: 'good', label: '기록', text: '충분히 자세하게 남겼습니다. 이 기록이 다음 만남의 첫 인사가 됩니다.' }) }
  if (PERSONAL.test(memo)) { score += 15; rows.push({ kind: 'good', label: '사람 기억', text: '가족·건강·취미 같은 개인 이야기를 잡아냈습니다. 고객은 상품보다 자기 이야기를 기억해 준 사람을 기억합니다.' }) }
  if (QUOTE.test(memo)) { score += 5; rows.push({ kind: 'good', label: '상대의 말', text: '상대가 한 말을 그대로 적었습니다. 다음에 그 문장을 되돌려 주면 신뢰가 두 배가 됩니다.' }) }
  if (NEED.test(memo)) { score += 10; rows.push({ kind: 'good', label: '필요 파악', text: '고객의 고민·필요가 기록에 보입니다. 제안은 여기서 출발해야 합니다.' }) }
  if (meeting.nextAction) { score += 15; rows.push({ kind: 'good', label: '다음 행동', text: `"${meeting.nextAction}" 이렇게 언제·무엇을 정해 두었으니 팔로업이 실행됩니다.` }) }
  if (meeting.plan && memo) { score += 5 }

  // 아쉬운 점
  if (memo.length < 30) rows.push({ kind: 'warn', label: '기록 부족', text: '기록이 짧습니다. 상대가 한 말 중 인상 깊은 문장 하나라도 그대로 적어 두세요. 24시간 뒤엔 3분의 2가 사라집니다.' })
  if (!PERSONAL.test(memo)) rows.push({ kind: 'warn', label: '개인 이야기', text: '가족·건강·취미 이야기가 없습니다. 다음 만남에서는 한 가지만 물어보세요. 관계는 그 질문에서 자랍니다.' })
  if (!meeting.nextAction) rows.push({ kind: 'warn', label: '다음 행동 없음', text: '"언제, 무엇을"이 비어 있습니다. 지금 고객 화면에서 한 줄만 적어 두세요. 그래야 오늘 할 일에 올라옵니다.' })
  if (OBJECTION.test(memo) && meeting.result !== 'positive') rows.push({ kind: 'warn', label: '이의 처리', text: '가격·시기·가족 상의 같은 망설임이 보입니다. 다음엔 "어떤 점이 가장 고민되세요?"로 진짜 이유를 하나로 좁히세요.' })
  if (prevMeeting?.nextAction && !PROMISE.test(memo)) rows.push({ kind: 'warn', label: '지난 약속', text: `지난번 약속 "${prevMeeting.nextAction}"을 이번에 언급했는지 기록에 보이지 않습니다. 약속 이행 확인은 신뢰의 기본입니다.` })

  // 다음 만남 전략
  const stage = customer.stage || 'new'
  rows.push({ kind: 'plan', label: '다음 전략', text: STAGE_TIP[stage] })
  if (count >= 3 && meeting.result !== 'positive' && stage !== 'closed') rows.push({ kind: 'plan', label: `${count}번째`, text: '세 번 이상 만났는데 진전이 없다면 만남의 목적을 바꿔 보세요. 판매 대화를 멈추고 순수하게 도움이 되는 정보 하나만 전달하는 만남을 한 번 가지세요.' })

  // 24시간 안에
  if (meeting.result === 'positive') rows.push({ kind: 'act', label: '24시간 안에', text: '반응이 좋았습니다. 오늘 안에 감사 카톡을 보내세요. 기억이 굳어지고 다음 약속이 쉬워집니다. 아래 "감사 카톡 만들기"를 누르세요.' })
  else if (meeting.result === 'negative') rows.push({ kind: 'act', label: '24시간 안에', text: '미지근했다고 낙담하지 마세요. 평균 계약은 5~7번 접촉 뒤에 옵니다. 오늘은 배운 점 한 줄을 성장 노트에 남기고, 연락 간격을 한 단계 늘리세요.' })
  else rows.push({ kind: 'act', label: '24시간 안에', text: '짧은 안부 카톡 하나면 충분합니다. "오늘 만나서 반가웠습니다" 한 줄이 다음 만남의 문을 열어 둡니다.' })

  score = Math.max(20, Math.min(100, score))
  const grade = score >= 85 ? '아주 잘하셨어요' : score >= 65 ? '좋습니다' : score >= 45 ? '조금만 더' : '기록부터 시작해요'
  return { score, grade, rows, summary: `${customer.name}님과의 ${count}번째 만남을 기록했습니다. 꾸준히 기록하는 사람이 결국 성과를 냅니다.` }
}

/* AI 서버 텍스트를 구조 블록으로 변환 (헤더 키워드 기준, 실패 시 한 블록) */
export function parseFeedbackText(text) {
  const map = [['잘한', 'good'], ['아쉬운', 'warn'], ['전략', 'plan'], ['24시간', 'act'], ['행동', 'act']]
  const parts = text.split(/\n(?=\s*(?:\d+[.)]|[-•*#]|\*\*|잘한|아쉬운|다음|24시간))/).map((s) => s.trim()).filter(Boolean)
  if (parts.length < 2) return [{ kind: 'plan', label: '피드백', text }]
  return parts.map((p) => {
    const hit = map.find(([k]) => p.slice(0, 20).includes(k))
    const label = p.match(/^[\d.)\-•*#\s]*\**([^:：\n*]{2,10})\**[:：]/)?.[1] || (hit ? { good: '잘한 점', warn: '아쉬운 점', plan: '다음 전략', act: '24시간 안에' }[hit[1]] : '코치')
    return { kind: hit ? hit[1] : 'plan', label, text: p.replace(/^[\d.)\-•*#\s]*\**[^:：\n*]{2,10}\**[:：]\s*/, '') }
  })
}

/* 오늘 브리핑 (규칙 기반) */
export function localBriefing({ profile, events, due, anniversaries }) {
  const lines = []
  if (events.length) lines.push(`오늘 만남 ${events.length}건. 첫 일정 ${events[0].time || ''} ${events[0].title}. 만나기 5분 전에 고객 기록을 한 번 읽으세요.`)
  else lines.push('오늘 만남 일정이 없습니다. 비어 있는 날이 팔로업하기 가장 좋은 날입니다.')
  if (due.length) lines.push(`연락할 고객 ${due.length}명. 가장 오래 기다린 ${due[0].c.name}님부터 전화 한 통 하세요.`)
  if (anniversaries.length) lines.push(`오늘 기념일: ${anniversaries.map((c) => c.name).join(', ')}님. 축하 메시지가 가장 자연스러운 연락입니다.`)
  lines.push(`${profile.aiName}의 우선순위: ① ${events.length ? '만남 준비' : '연락 전화'} ② ${due.length ? '연락 기록 남기기' : '새 고객 1명 등록'} ③ 저녁에 성장 노트 한 줄.`)
  return lines.join('\n\n')
}

/* 기념일 판정 : "3월 12일", "03-12", "0312" 등 느슨하게 */
export function isAnniversaryToday(text) {
  if (!text) return false
  const d = new Date()
  const m = d.getMonth() + 1, day = d.getDate()
  const norm = text.replace(/\s/g, '')
  return norm.includes(`${m}월${day}일`) || norm.includes(`${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`) || norm.includes(`${String(m).padStart(2, '0')}${String(day).padStart(2, '0')}`) || norm.includes(`${m}/${day}`)
}

/* 주간 리포트 : 최근 7일 활동 */
export function weeklyReport(state) {
  const since = addDays(today(), -6)
  const inWeek = (d) => d && d >= since && d <= today()
  const meetings = state.meetings.filter((m) => m.done && inWeek(m.date))
  const contacts = meetings.filter((m) => /^\[(전화|카톡|만남)\]/.test(m.memo || ''))
  const realMeetings = meetings.length - contacts.length
  const closed = state.customers.filter((c) => c.stage === 'closed' && inWeek(c.stageChangedAt)).length
  const contents = state.contents.filter((c) => inWeek(c.date)).length
  const notes = state.notes.filter((n) => inWeek(n.date)).length
  const newCustomers = state.customers.filter((c) => inWeek(c.createdAt)).length
  const positives = meetings.filter((m) => m.result === 'positive').length
  let comment
  if (meetings.length === 0) comment = '이번 주 기록이 없습니다. 기록이 없으면 코칭도 없습니다. 오늘 전화 한 통을 남겨 보세요.'
  else if (realMeetings >= 5) comment = `만남 ${realMeetings}회, 훌륭한 활동량입니다. 이제 질을 볼 때입니다. 반응 좋았던 ${positives}건에 감사 카톡을 보냈는지 확인하세요.`
  else if (contacts.length > realMeetings) comment = '연락은 많고 만남은 적습니다. 연락 중 한 건을 "차 한잔" 약속으로 바꾸는 것이 이번 주 과제입니다.'
  else comment = `만남 ${realMeetings}회, 연락 ${contacts.length}회. 꾸준합니다. 다음 주는 새 고객 ${Math.max(1, 3 - newCustomers)}명 등록을 목표로 하세요.`
  return { since, meetings: realMeetings, contacts: contacts.length, closed, contents, notes, newCustomers, positives, comment }
}

/* 오늘의 격려 메시지 (매일 다르게) */
const QUOTES = [
  '오늘 만나는 한 사람이 내일의 열 사람을 데려옵니다.',
  '거절은 나에 대한 평가가 아니라, 아직 때가 아니라는 신호입니다.',
  '준비된 5분이 어색한 50분을 이깁니다. 만나기 전에 기록을 한 번 읽으세요.',
  '고객은 상품을 기억하지 않습니다. 자기 이야기를 기억해 준 사람을 기억합니다.',
  '오늘 기록 한 줄이 한 달 뒤 계약 한 건이 됩니다.',
  '성장은 매일의 작은 반복에서 옵니다. 오늘도 한 걸음.',
  '가장 좋은 영업은 도움이 되는 사람이 되는 것입니다.',
]
export function dailyQuote() {
  const d = new Date()
  const idx = (d.getFullYear() * 366 + d.getMonth() * 31 + d.getDate()) % QUOTES.length
  return QUOTES[idx]
}

/* 성장 로드맵 : 일정관리 → 고객관리 → 자기관리 → 성장 → 성공 */
export function roadmap(state) {
  const c = state.customers.length
  const m = state.meetings.filter((x) => x.done).length
  const e = state.events.length
  const edu = Object.keys(state.progress.education || {}).length
  const notes = state.notes.length + (state.library || []).reduce((n, i) => n + (i.studyCount || 0), 0)
  const stages = [
    { key: 'schedule', title: '1단계 · 일정관리', desc: '매일 아침 앱을 열고 오늘 일정을 확인', goal: 3, value: e, unit: '개 일정' },
    { key: 'customer', title: '2단계 · 고객관리', desc: '고객 10명 등록, 만남마다 기록', goal: 10, value: c, unit: '명 등록' },
    { key: 'self', title: '3단계 · 자기관리', desc: '만남 후 AI 피드백 받고 배운 점 기록', goal: 5, value: m, unit: '회 피드백' },
    { key: 'growth', title: '4단계 · 성장', desc: '교육센터 강의 5개 완료, 성장 노트 작성', goal: 5, value: edu + notes, unit: '개 완료' },
    { key: 'success', title: '5단계 · 성공', desc: '리더 대시보드로 팀을 키우고 후보를 발굴', goal: 1, value: state.profile.leaderMode ? 1 : 0, unit: '' },
  ]
  let current = stages.findIndex((s) => s.value < s.goal)
  if (current === -1) current = stages.length - 1
  return { stages, current }
}

export { STAGES, stageIndex, fmtDate }
