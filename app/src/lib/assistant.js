/* =========================================================
   비서 질의 계층 : 질문을 앱 데이터(고객·일정·기록)와 연결
   - 규칙 기반 의도 파악 → 실제 고객/일정을 찾아 답하고, 화면 이동 버튼을 함께 돌려줌
   - AI 서버가 있으면 같은 데이터 요약(context)을 붙여 보내 실제 이름으로 답하게 함
   반환: { text, customers: [customer], events: [event], actions: [{label, to}], intent }
   ========================================================= */
import { STAGES, addDays, daysBetween, fmtDate, stageIndex, today } from '../store'
import { STAGE_TIP, followupStatus, isAnniversaryToday, weeklyReport } from './coaching'
import { catLabel, searchLibrary } from './library'

const has = (q, re) => re.test(q)

function dayFrom(q) {
  if (has(q, /내일/)) return { date: addDays(today(), 1), label: '내일' }
  if (has(q, /모레/)) return { date: addDays(today(), 2), label: '모레' }
  if (has(q, /이번\s*주|주간|일주일/)) return { date: null, range: 7, label: '이번 주' }
  if (has(q, /어제/)) return { date: addDays(today(), -1), label: '어제' }
  return { date: today(), label: '오늘' }
}

function anniversaryOn(c, date) {
  if (!c.birthday) return false
  const d = new Date(date + 'T00:00:00')
  const m = d.getMonth() + 1, day = d.getDate()
  const norm = c.birthday.replace(/\s/g, '')
  return norm.includes(`${m}월${day}일`) || norm.includes(`${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`) || norm.includes(`${m}/${day}`)
}

/* 특정 날짜(또는 범위)의 관리 대상 : 일정 + 연락 예정 + 기념일 */
export function targetsFor(state, { date, range }) {
  const dates = range ? Array.from({ length: range }, (_, i) => addDays(today(), i)) : [date]
  const events = state.events.filter((e) => dates.includes(e.date)).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
  const due = state.customers
    .map((c) => ({ c, due: c.nextFollowup || today() }))
    .filter(({ due }) => (range ? due <= dates[dates.length - 1] : due <= date))
    .sort((a, b) => a.due.localeCompare(b.due))
  const anniv = state.customers.filter((c) => dates.some((d) => anniversaryOn(c, d)))
  return { events, due, anniv }
}

function customerSummary(c, state) {
  const meetings = state.meetings.filter((m) => m.customerId === c.id && m.done).sort((a, b) => (a.date < b.date ? 1 : -1))
  const last = meetings[0]
  const s = followupStatus(c)
  const lines = [
    `${c.name}님 · ${STAGES[stageIndex(c.stage)].label} 단계 · 관심도 ${'★'.repeat(c.interest || 0)}`,
    `만남·연락 ${meetings.length}회, 마지막 연락 ${c.lastContact ? fmtDate(c.lastContact) : '없음'}, 다음 연락 ${s.label}.`,
  ]
  if (c.family) lines.push(`기억할 것: ${c.family}`)
  if (last?.memo) lines.push(`최근 기록(${fmtDate(last.date)}): ${last.memo.slice(0, 80)}${last.memo.length > 80 ? '…' : ''}`)
  if (last?.nextAction) lines.push(`지난 약속: ${last.nextAction}`)
  lines.push(`코치: ${STAGE_TIP[c.stage || 'new']}`)
  return lines.join('\n')
}

export function findCustomer(q, state) {
  const sorted = [...state.customers].sort((a, b) => b.name.length - a.name.length)
  return sorted.find((c) => c.name.length >= 2 && q.includes(c.name))
}

export function answerLocally(question, state) {
  const q = question.replace(/\s+/g, ' ').trim()
  const ai = state.profile.aiName
  const actions = []

  // 0) 자료실 검색
  if (/자료|설명서|파일|문서|정보\s*(찾|보내|줘)|찾아\s*줘/.test(q) && !/고객\s*(등록|추가)/.test(q)) {
    const kw = q.replace(/(자료실|자료|설명서|파일|문서|정보|찾아\s*줘|찾아|보내\s*줘|보내|줘|좀|있어|있나|뭐|무엇|알려)/g, ' ').replace(/[?？.!]/g, ' ').trim()
    const found = searchLibrary(state.library || [], kw, { limit: 5 })
    if (!(state.library || []).length) return { intent: 'library', text: '자료실이 비어 있습니다. 제품 설명서·건강 정보·성공 사례를 넣어 두면 찾아 드리고 고객에게 바로 보낼 수 있어요.', customers: [], events: [], actions: [{ label: '자료실 열기', to: '/library' }] }
    return {
      intent: 'library',
      text: found.length ? `"${kw || '전체'}" 관련 자료 ${found.length}개를 찾았습니다.\n\n` + found.map((i, n) => `${n + 1}. [${catLabel(i.category)}] ${i.title}${i.summary ? ' — ' + i.summary.slice(0, 80) : ''}`).join('\n') + '\n\n아래 버튼으로 열어 고객에게 바로 보낼 수 있어요.' : `"${kw}" 관련 자료를 찾지 못했습니다. 다른 말로 검색하거나 자료실에 추가해 주세요.`,
      customers: [], events: [], actions: [...found.slice(0, 3).map((i) => ({ label: `📚 ${i.title.slice(0, 14)}`, to: `/library?id=${i.id}` })), { label: '자료실', to: `/library?q=${encodeURIComponent(kw)}` }],
    }
  }

  // 1) 특정 고객 질문
  const c = findCustomer(q, state)
  if (c) {
    actions.push({ label: `${c.name}님 기록 보기`, to: `/customers/${c.id}` }, { label: '만남 시작', to: `/meeting/${c.id}` }, { label: '메시지 만들기', to: `/content?kind=안부 카톡&to=${encodeURIComponent(c.name)}` })
    return { intent: 'customer', text: customerSummary(c, state), customers: [c], events: [], actions }
  }

  // 2) 오늘/내일/이번 주 관리 대상
  if (has(q, /(오늘|내일|모레|이번\s*주|주간|일주일).*(관리|연락|챙|만나|일정|할\s*일|대상|누구|뭐)|(관리|연락|챙|만나|일정|할\s*일|대상).*(오늘|내일|모레|이번\s*주)/) || has(q, /^(오늘|내일|이번\s*주)/)) {
    const d = dayFrom(q)
    const { events, due, anniv } = targetsFor(state, d)
    const parts = []
    if (events.length) parts.push(`📅 ${d.label} 일정 ${events.length}건: ` + events.map((e) => `${d.range ? fmtDate(e.date) + ' ' : ''}${e.time || ''} ${e.title}`.trim()).join(' / '))
    else parts.push(`📅 ${d.label} 등록된 일정은 없습니다.`)
    if (due.length) parts.push(`📞 연락할 고객 ${due.length}명: ` + due.slice(0, 6).map(({ c, due }) => `${c.name}(${due < today() ? `${daysBetween(due, today())}일 지남` : due === today() ? '오늘' : fmtDate(due)})`).join(', ') + (due.length > 6 ? ` 외 ${due.length - 6}명` : ''))
    else parts.push(`📞 ${d.label} 연락 예정 고객은 없습니다.`)
    if (anniv.length) parts.push(`🎂 기념일: ${anniv.map((x) => `${x.name}(${x.birthday})`).join(', ')}`)
    const first = due[0]?.c || events.find((e) => e.customerId) && state.customers.find((x) => x.id === events.find((e) => e.customerId).customerId)
    parts.push(first ? `${ai}의 제안: ${first.name}님부터 시작하세요. ${STAGE_TIP[first.stage || 'new']}` : `${ai}의 제안: 비어 있는 날입니다. 새 고객 1명을 등록하거나 관심도 높은 분께 안부 카톡을 보내세요.`)
    actions.push({ label: `${d.label} 할 일 화면`, to: '/today' }, { label: '일정 관리', to: '/schedule' })
    return { intent: 'targets', text: parts.join('\n\n'), customers: [...due.map((x) => x.c), ...anniv].filter((v, i, a) => a.indexOf(v) === i).slice(0, 8), events, actions }
  }

  // 3) 기념일·생일
  if (has(q, /생일|기념일/)) {
    const soon = state.customers.filter((x) => x.birthday && (isAnniversaryToday(x.birthday) || Array.from({ length: 30 }, (_, i) => addDays(today(), i)).some((d) => anniversaryOn(x, d))))
    return {
      intent: 'anniv',
      text: soon.length ? `앞으로 30일 안에 기념일이 있는 고객 ${soon.length}명: ${soon.map((x) => `${x.name}(${x.birthday})`).join(', ')}.\n\n축하 메시지는 가장 자연스러운 연락 기회입니다. 아래에서 바로 만들 수 있어요.` : '앞으로 30일 안에 기념일이 등록된 고객이 없습니다. 고객 정보에 "생일·기념일"을 채워 두면 제가 미리 알려 드릴게요.',
      customers: soon, events: [], actions: [{ label: '고객 목록', to: '/customers' }],
    }
  }

  // 4) 식어가는·오래 연락 안 한 고객
  if (has(q, /식|미지근|오래|안\s*한|끊|잊|방치|놓친|지난/)) {
    const cold = state.customers.map((x) => ({ x, s: followupStatus(x) })).filter(({ s }) => s.diff < 0).sort((a, b) => a.s.diff - b.s.diff)
    return {
      intent: 'cold',
      text: cold.length ? `연락 시점을 지난 고객 ${cold.length}명입니다. 가장 오래된 순: ${cold.slice(0, 6).map(({ x, s }) => `${x.name}(${s.label})`).join(', ')}.\n\n${ai}의 제안: 팔지 않는 안부 한 줄부터. "문득 생각나서요, 잘 지내시죠?" 뒤에 그분 관련 기억 한 가지를 붙이세요.` : '연락 시점을 지난 고객이 없습니다. 잘 관리하고 계십니다.',
      customers: cold.map(({ x }) => x).slice(0, 8), events: [], actions: [{ label: '연락할 분 보기', to: '/customers' }],
    }
  }

  // 5) 관심 높은 · 결정 임박 · 계약 · 소개
  if (has(q, /관심\s*높|뜨거|가능성|결정|임박|계약|소개|추천/)) {
    const hot = state.customers.filter((x) => (x.interest || 0) >= 4 || ['decision', 'proposal'].includes(x.stage))
    const closed = state.customers.filter((x) => ['closed', 'referral'].includes(x.stage))
    const parts = []
    if (hot.length) parts.push(`🔥 결정에 가까운 고객 ${hot.length}명: ${hot.map((x) => `${x.name}(${STAGES[stageIndex(x.stage)].label}, ${'★'.repeat(x.interest || 0)})`).join(', ')}.\n망설임의 진짜 이유를 하나로 좁히는 질문을 준비하세요.`)
    if (closed.length) parts.push(`✅ 계약 고객 ${closed.length}명: ${closed.map((x) => x.name).join(', ')}. 계약 2개월이 지난 분께는 "한 분만" 소개를 부탁할 때입니다.`)
    if (!parts.length) parts.push('아직 관심도 4점 이상이거나 제안·결정 단계인 고객이 없습니다. 만남 기록에서 관심도와 단계를 갱신해 주세요.')
    return { intent: 'hot', text: parts.join('\n\n'), customers: [...hot, ...closed].slice(0, 8), events: [], actions: [{ label: '고객 목록', to: '/customers' }] }
  }

  // 6) 현황·통계
  if (has(q, /몇\s*명|현황|통계|실적|리포트|정리|요약|얼마나/)) {
    const wk = weeklyReport(state)
    const byStage = STAGES.map((s) => `${s.short} ${state.customers.filter((x) => (x.stage || 'new') === s.id).length}`).join(' · ')
    return {
      intent: 'stats',
      text: `고객 ${state.customers.length}명 (${byStage}).\n이번 주: 만남 ${wk.meetings}회, 연락 ${wk.contacts}회, 새 고객 ${wk.newCustomers}명, 계약 ${wk.closed}건.\n\n${wk.comment}`,
      customers: [], events: [], actions: [{ label: '주간 리포트', to: '/coach' }, { label: '고객 목록', to: '/customers' }],
    }
  }

  // 7) 콘텐츠·메시지 요청
  if (has(q, /카톡|메시지|문자|글|게시|콘텐츠|써\s*줘|작성/)) {
    const kind = has(q, /감사/) ? '감사 카톡' : has(q, /안부/) ? '안부 카톡' : has(q, /초대|모임/) ? '모임 초대' : has(q, /SNS|게시|인스타|블로그/i) ? 'SNS 게시글' : has(q, /교육|자료/) ? '교육자료 개요' : '정보 제공 메시지'
    return { intent: 'content', text: `"${kind}"을(를) 만들어 드릴게요. 콘텐츠 만들기 화면에서 받는 사람과 주제를 확인하고 생성 버튼을 누르세요.`, customers: [], events: [], actions: [{ label: `${kind} 만들기`, to: `/content?kind=${encodeURIComponent(kind)}` }] }
  }

  return null // 데이터 질문이 아니면 코칭 Q&A로
}

/* AI 서버용 데이터 요약 (개인정보 최소화: 이름·단계·관심도·연락일·기념일·최근 기록 요약) */
export function buildContext(state) {
  const cs = state.customers.slice(0, 60).map((c) => {
    const last = state.meetings.filter((m) => m.customerId === c.id && m.done).sort((a, b) => (a.date < b.date ? 1 : -1))[0]
    return `- ${c.name} | ${STAGES[stageIndex(c.stage)].label} | 관심${c.interest || 0} | 마지막연락 ${c.lastContact || '없음'} | 다음연락 ${c.nextFollowup || '미정'}${c.birthday ? ` | 기념일 ${c.birthday}` : ''}${c.family ? ` | 개인 ${c.family.slice(0, 40)}` : ''}${last ? ` | 최근기록(${last.date}) ${last.memo.slice(0, 60)}` : ''}`
  })
  const ev = state.events.filter((e) => e.date >= today() && e.date <= addDays(today(), 14)).map((e) => `- ${e.date} ${e.time || ''} ${e.title}`)
  return `오늘 ${today()}\n[고객 ${state.customers.length}명]\n${cs.join('\n') || '없음'}\n[앞으로 14일 일정]\n${ev.join('\n') || '없음'}`
}
