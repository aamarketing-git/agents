/* =========================================================
   규칙 기반 코칭 로직 (AI 서버 없이도 동작하는 기본 지능)
   - 팔로업 주기, 만남 단계별 가이드, 성장 로드맵, 격려 메시지
   리서치 근거: docs/RESEARCH.md
   ========================================================= */
import { addDays, daysBetween, today } from '../store'

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
  if (diff <= 2) return { key: 'soon', label: `${diff}일 후`, tone: 'purple', diff }
  return { key: 'ok', label: `${diff}일 후`, tone: '', diff }
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

/* 미팅 후 AI 피드백 (규칙 기반 기본값) */
export function localFeedback({ customer, meeting, count }) {
  const out = []
  const memo = (meeting.memo || '').trim()
  if (memo.length < 20) out.push('기록이 짧습니다. 상대가 한 말 중 인상 깊은 문장 하나라도 그대로 적어 두면 다음 만남의 첫 인사가 됩니다.')
  if (!/(가족|자녀|아들|딸|남편|아내|부모|건강|취미|여행|생일)/.test(memo)) out.push('개인적인 이야기(가족·건강·취미)가 기록에 없습니다. 다음에는 한 가지만 물어보세요. 관계는 상품보다 사람 이야기에서 자랍니다.')
  if (!meeting.nextAction) out.push('다음 행동이 비어 있습니다. "언제, 무엇을" 한 줄로 정해 두어야 팔로업이 실행됩니다.')
  if (meeting.result === 'positive') out.push('반응이 좋았습니다. 24시간 안에 감사 메시지를 보내면 기억이 굳어집니다. 콘텐츠 만들기에서 "감사 카톡"을 생성해 보세요.')
  if (meeting.result === 'negative') out.push('반응이 미지근했다고 낙담하지 마세요. 평균 계약은 5~7번의 접촉 후에 이뤄집니다. 이번 만남의 배운 점 한 줄을 남기고, 연락 간격을 조금 늘려 부담을 줄이세요.')
  if (count >= 3 && meeting.result !== 'positive') out.push(`${count}번째 만남입니다. 결정을 미루는 진짜 이유를 확인했나요? 가격·시기·가족 의견 중 하나를 콕 집어 물어보세요.`)
  out.push(`총평: ${customer.name}님과의 ${count}번째 만남을 기록했습니다. 꾸준히 기록하는 사람이 결국 성과를 냅니다. 잘하셨어요.`)
  return out.join('\n\n')
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
  const m = state.meetings.filter((x) => x.step >= 7 || x.done).length
  const e = state.events.length
  const edu = Object.keys(state.progress.education || {}).length
  const notes = state.notes.length
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
