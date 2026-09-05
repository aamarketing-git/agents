/* 서버용 브리핑 계산 (클라이언트 coaching.js 의 핵심만 순수 JS 로) */
const FOLLOWUP_DAYS = { 1: 14, 2: 7, 3: 5, 4: 3, 5: 2 }
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)
const fmt = (d) => { const x = new Date(d + 'T00:00:00Z'); return `${x.getUTCMonth() + 1}월 ${x.getUTCDate()}일` }
function anniversaryOn(text, date) {
  if (!text) return false
  const [, m, d] = date.match(/^\d{4}-(\d{2})-(\d{2})$/) || []
  const norm = text.replace(/\s/g, '')
  return norm.includes(`${+m}월${+d}일`) || norm.includes(`${m}-${d}`) || norm.includes(`${+m}/${+d}`)
}

export function morningBrief(state, today) {
  const cs = state.customers || [], ev = (state.events || []).filter((e) => e.date === today).sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  const due = cs.map((c) => ({ c, due: c.nextFollowup || addDays(c.lastContact || c.createdAt || today, FOLLOWUP_DAYS[c.interest || 2] || 7) })).filter((x) => x.due <= today).sort((a, b) => a.due.localeCompare(b.due))
  const overdue = due.filter((x) => x.due < today)
  const anniv = cs.filter((c) => anniversaryOn(c.birthday, today))
  const parts = []
  if (ev.length) parts.push(`오늘 만남 ${ev.length}건 · ${ev[0].time || ''} ${ev[0].title}`)
  if (due.length) parts.push(`연락할 고객 ${due.length}명 (${due.slice(0, 3).map((x) => x.c.name).join(', ')}${due.length > 3 ? ' 외' : ''})`)
  if (overdue.length) parts.push(`연락 시점 지난 분 ${overdue.length}명`)
  if (anniv.length) parts.push(`🎂 ${anniv.map((c) => c.name).join(', ')}님 기념일`)
  if (!parts.length) parts.push('오늘 일정·연락 예정이 없습니다. 새 고객 1명 등록이 오늘의 목표!')
  return { title: `${state.profile?.aiName || '비서'}의 아침 브리핑 · ${fmt(today)}`, body: parts.join('\n'), counts: { events: ev.length, due: due.length, overdue: overdue.length, anniv: anniv.length } }
}

export function weeklyBrief(state, today) {
  const since = addDays(today, -6)
  const inWeek = (d) => d && d >= since && d <= today
  const ms = (state.meetings || []).filter((m) => m.done && inWeek(m.date))
  const contacts = ms.filter((m) => /^\[(전화|카톡|만남)\]/.test(m.memo || '')).length
  const meetings = ms.length - contacts
  const newC = (state.customers || []).filter((c) => inWeek(c.createdAt)).length
  const closed = (state.customers || []).filter((c) => c.stage === 'closed' && inWeek(c.stageChangedAt)).length
  const comment = ms.length === 0 ? '이번 주 기록이 없었어요. 오늘 전화 한 통으로 시작해요.' : meetings >= 5 ? '활동량이 훌륭합니다. 이번 주는 질을 볼 때예요.' : '꾸준합니다. 이번 주는 새 고객 1명 더!'
  return { title: `${state.profile?.aiName || '비서'}의 주간 리포트`, body: `만남 ${meetings}회 · 연락 ${contacts}회 · 새 고객 ${newC}명 · 계약 ${closed}건\n${comment}`, daysBetween }
}
