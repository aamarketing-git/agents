/* =========================================================
   2단계 에이전트 클라이언트 : 서버(Claude)와 도구 실행 루프
   - 읽기 도구(find_customers, get_schedule)는 즉시 로컬 실행
   - 쓰기 도구는 확인 카드(plan)를 만들어 사용자 승인 후 실행
   - 서버가 없으면 null 을 반환해 1단계(규칙 기반)로 넘어감
   ========================================================= */
import { STAGES, addDays, fmtDate, stageIndex, today } from '../store'
import { buildContext, targetsFor } from './assistant'
import { FOLLOWUP_DAYS, followupStatus, nextFollowup, twoTwoTwoEvents } from './coaching'

let available = null
export const agentStatus = () => available

function customerRow(c, state) {
  const last = state.meetings.filter((m) => m.customerId === c.id && m.done).sort((a, b) => (a.date < b.date ? 1 : -1))[0]
  return { name: c.name, stage: STAGES[stageIndex(c.stage)].label, interest: c.interest || 0, last_contact: c.lastContact || null, next_followup: c.nextFollowup || null, birthday: c.birthday || '', family: c.family || '', memo: c.memo || '', recent: last ? `${last.date} ${last.memo.slice(0, 80)}` : '' }
}

/* 읽기 도구 실행 */
function runReadTool(name, input, state) {
  if (name === 'find_customers') {
    let list = state.customers
    if (input.query) list = list.filter((c) => c.name.includes(input.query))
    const f = input.filter
    if (f === 'due_today') list = list.filter((c) => followupStatus(c).diff <= 0)
    if (f === 'due_tomorrow') list = targetsFor(state, { date: addDays(today(), 1) }).due.map((x) => x.c)
    if (f === 'due_week') list = targetsFor(state, { range: 7 }).due.map((x) => x.c)
    if (f === 'overdue') list = list.filter((c) => followupStatus(c).diff < 0)
    if (f === 'hot') list = list.filter((c) => (c.interest || 0) >= 4 || ['proposal', 'decision'].includes(c.stage))
    if (f === 'closed') list = list.filter((c) => ['closed', 'referral'].includes(c.stage))
    if (f === 'anniversary') list = targetsFor(state, { range: 30 }).anniv
    return { count: list.length, customers: list.slice(0, 30).map((c) => customerRow(c, state)) }
  }
  if (name === 'get_schedule') {
    const ev = state.events.filter((e) => e.date >= input.from && e.date <= input.to).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
    return { count: ev.length, events: ev.map((e) => ({ date: e.date, time: e.time || '', title: e.title, customer: state.customers.find((c) => c.id === e.customerId)?.name || '', memo: e.memo || '' })) }
  }
  return null
}

const byName = (state, name) => state.customers.find((c) => c.name === name) || state.customers.find((c) => name && c.name.includes(name))

/* 쓰기 도구 → 확인 카드(plan) */
function planForTool(name, input, state) {
  if (name === 'add_customer') {
    const base = { name: input.name, phone: input.phone || '', interest: input.interest || 2, memo: input.memo || '', family: input.family || '', birthday: input.birthday || '', stage: 'new', createdAt: today() }
    return { intent: 'add_customer', title: `새 고객 등록: ${input.name}`, lines: [`${input.phone || '연락처 없음'} · 관심도 ${'★'.repeat(base.interest)}`, input.memo, input.family && `기억할 것: ${input.family}`].filter(Boolean), actions: [{ type: 'customer.add', data: { ...base, nextFollowup: nextFollowup(base), stageChangedAt: today() } }], after: `${input.name}님을 등록했습니다.`, navigate: '/customers' }
  }
  if (name === 'add_event') {
    const c = byName(state, input.customer_name)
    return { intent: 'add_event', title: `일정 추가: ${input.title}`, lines: [`${fmtDate(input.date)} ${input.time || '(시간 미정)'}${input.memo ? ' · ' + input.memo : ''}`, c ? `${c.name}님과 연결` : ''].filter(Boolean), actions: [{ type: 'event.add', data: { date: input.date, time: input.time || '', title: input.title, customerId: c?.id || '', memo: input.memo || '' } }], after: '일정을 추가했습니다.', navigate: '/schedule', customer: c }
  }
  if (name === 'log_contact') {
    const c = byName(state, input.customer_name)
    if (!c) return { intent: 'error', title: '고객을 찾지 못했습니다', lines: [`"${input.customer_name}" 이름의 고객이 없습니다.`], actions: [] }
    const interest = input.interest || c.interest || 2
    const next = addDays(today(), FOLLOWUP_DAYS[interest] || 7)
    return { intent: 'log_contact', title: `${c.name}님 ${input.channel} 기록`, lines: [input.note || '내용 없음', `다음 연락 ${fmtDate(next)}`, input.interest ? `관심도 ${'★'.repeat(input.interest)}` : ''].filter(Boolean), actions: [
      { type: 'customer.update', id: c.id, data: { lastContact: today(), nextFollowup: next, ...(input.interest ? { interest: input.interest } : {}) } },
      { type: 'meeting.add', data: { customerId: c.id, date: today(), done: true, step: 7, memo: `[${input.channel}] ${input.note || '연락함'}`, result: input.result || 'neutral' } },
    ], after: `${c.name}님 ${input.channel} 기록을 저장했습니다.`, navigate: `/customers/${c.id}`, customer: c }
  }
  if (name === 'update_customer') {
    const c = byName(state, input.customer_name)
    if (!c) return { intent: 'error', title: '고객을 찾지 못했습니다', lines: [`"${input.customer_name}" 이름의 고객이 없습니다.`], actions: [] }
    const data = {}
    const lines = []
    if (input.stage) { data.stage = input.stage; data.stageChangedAt = today(); lines.push(`단계 → ${STAGES.find((s) => s.id === input.stage).label}`) }
    if (input.interest) { data.interest = input.interest; data.nextFollowup = addDays(c.lastContact || today(), FOLLOWUP_DAYS[input.interest]); lines.push(`관심도 ${'★'.repeat(input.interest)}`) }
    if (input.memo_append) { data.memo = [c.memo, input.memo_append].filter(Boolean).join(' / '); lines.push(`메모: ${input.memo_append}`) }
    if (input.family_append) { data.family = [c.family, input.family_append].filter(Boolean).join(' / '); lines.push(`기억할 것: ${input.family_append}`) }
    const actions = [{ type: 'customer.update', id: c.id, data }]
    if (input.stage === 'closed' && c.stage !== 'closed') { twoTwoTwoEvents(c).forEach((e) => actions.push({ type: 'event.add', data: e })); lines.push('2일·2주·2개월 연락 일정 자동 생성') }
    return { intent: 'update_customer', title: `${c.name}님 정보 변경`, lines, actions, after: `${c.name}님 정보를 바꿨습니다.`, navigate: `/customers/${c.id}`, customer: c }
  }
  return null
}

async function callServer(messages, state) {
  const res = await fetch('/api/agent', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, profile: { ...state.profile, professionLabel: state.profile.profession }, context: { today: today(), summary: buildContext(state) } }),
  })
  if (!res.ok) throw new Error('server ' + res.status)
  return res.json()
}

/* 에이전트 한 턴 실행. confirm(plan) 은 Promise<boolean> (확인 카드) */
export async function runAgentTurn({ history, userText, state, runPlan, confirm, onText }) {
  if (available === false) return null
  const messages = [...history, { role: 'user', content: userText }]
  let steps = 0
  try {
    while (steps++ < 6) {
      const r = await callServer(messages, state)
      available = true
      messages.push({ role: 'assistant', content: r.content })
      const text = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
      if (text) onText?.(text)
      if (r.stop_reason !== 'tool_use') return { messages, text }
      const results = []
      for (const b of r.content.filter((x) => x.type === 'tool_use')) {
        const read = runReadTool(b.name, b.input, state)
        if (read) { results.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(read) }); continue }
        const plan = planForTool(b.name, b.input, state)
        if (!plan || plan.intent === 'error') { results.push({ type: 'tool_result', tool_use_id: b.id, content: plan ? plan.lines.join(' ') : '알 수 없는 도구', is_error: true }); continue }
        const ok = await confirm(plan)
        if (ok) { runPlan(plan); results.push({ type: 'tool_result', tool_use_id: b.id, content: `실행 완료: ${plan.after}` }) }
        else results.push({ type: 'tool_result', tool_use_id: b.id, content: '사용자가 취소했습니다.' })
      }
      messages.push({ role: 'user', content: results })
    }
    return { messages, text: '' }
  } catch (e) {
    if (available === null) available = false
    return null
  }
}
