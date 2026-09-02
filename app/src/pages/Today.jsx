import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fmtDate, today, useStore } from '../store'
import { followupStatus, isAnniversaryToday, localBriefing, meetingGoal } from '../lib/coaching'
import { askAI } from '../lib/ai'
import { Disclosure, Empty, Section, TopBar } from '../components/ui'

/* =========================================================
   오늘 할 일 : "오늘 할 일 뭐야?"
   - 비서 브리핑 → 오늘 일정(7단계 진입) → 기념일 → 연락할 고객
   ========================================================= */
export default function Today() {
  const { state, eventsOn, customer, meetingsOf } = useStore()
  const nav = useNavigate()
  const events = eventsOn(today())
  const due = state.customers
    .map((c) => ({ c, s: followupStatus(c) }))
    .filter((x) => x.s.diff <= 2)
    .sort((a, b) => a.s.diff - b.s.diff)
  const anniversaries = state.customers.filter((c) => isAnniversaryToday(c.birthday))
  const [brief, setBrief] = useState('')

  useEffect(() => {
    let alive = true
    askAI('today', { events: events.map((e) => `${e.time || ''} ${e.title}`).join(', ') || '없음', due: due.map((x) => x.c.name).join(', ') || '없음' }, state.profile,
      () => localBriefing({ profile: state.profile, events, due, anniversaries }))
      .then((r) => alive && setBrief(r.text))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length, due.length])

  return (
    <>
      <TopBar title="오늘 할 일" back={false} right={<button className="btn btn-soft btn-sm" onClick={() => nav('/schedule')}>📅 일정 관리</button>} />
      <div className="page">
        <Section eyebrow="Briefing" title={`${state.profile.aiName}의 오늘 브리핑`} aside={fmtDate(today())}>
          <div className="ai-bubble">{brief || '정리 중…'}</div>
        </Section>

        <Section eyebrow="Schedule" title="오늘 일정" aside={`${events.length}건`}>
          {events.length === 0 && (
            <Empty icon="🗓️" text="오늘 등록된 일정이 없습니다." action={<button className="btn btn-primary btn-sm" onClick={() => nav('/schedule')}>일정 추가</button>} />
          )}
          {events.map((e) => {
            const c = e.customerId ? customer(e.customerId) : null
            const n = c ? meetingsOf(c.id).filter((m) => m.done).length + 1 : 0
            return (
              <Disclosure key={e.id} icon={c ? '🤝' : '📌'} title={`${e.time || ''} ${e.title}`.trim()} badge={c && <span className="badge navy">{n}번째 만남</span>}>
                {c ? (
                  <>
                    <p className="muted">{meetingGoal(n).title}</p>
                    <p>{meetingGoal(n).tip}</p>
                    {e.memo && <p className="small muted">{e.memo}</p>}
                    <button className="btn btn-primary" onClick={() => nav(`/meeting/${c.id}?event=${e.id}`)}>7단계 만남 준비 시작</button>
                    <button className="btn btn-outline" onClick={() => nav(`/customers/${c.id}`)}>고객 기록 보기</button>
                  </>
                ) : (
                  <>
                    {e.memo && <p>{e.memo}</p>}
                    <button className="btn btn-outline" onClick={() => nav('/schedule')}>일정 수정</button>
                  </>
                )}
              </Disclosure>
            )
          })}
        </Section>

        {anniversaries.length > 0 && (
          <Section eyebrow="Anniversary" title="오늘 기념일" aside={`${anniversaries.length}명`}>
            {anniversaries.map((c) => (
              <button key={c.id} className="list-item" onClick={() => nav(`/content?kind=안부 카톡&to=${encodeURIComponent(c.name)}`)}>
                <div className="avatar">🎂</div>
                <div className="main"><div className="name">{c.name}</div><div className="meta">{c.birthday} · 누르면 축하 메시지 만들기</div></div>
              </button>
            ))}
          </Section>
        )}

        <Section eyebrow="Follow-up" title="연락할 고객" aside={`${due.length}명`}>
          {due.length === 0 && <Empty icon="✅" text="오늘 연락 예정인 고객이 없습니다. 새 고객을 등록하거나 관심도를 올려 보세요." />}
          <div className="list">
            {due.map(({ c, s }) => (
              <button key={c.id} className="list-item" onClick={() => nav(`/customers/${c.id}`)}>
                <div className="avatar green">{c.name[0]}</div>
                <div className="main">
                  <div className="name">{c.name}</div>
                  <div className="meta">마지막 연락 {c.lastContact ? fmtDate(c.lastContact) : '없음'} · 관심도 {'★'.repeat(c.interest || 0)}</div>
                </div>
                <span className={'badge ' + s.tone}>{s.label}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section eyebrow="Tip" title={`${state.profile.aiName}의 한마디`}>
          <p className="muted">만남 직후 20분 안에 기록하면 기억의 58%를 지킬 수 있습니다. 만남이 끝나면 바로 "말로 기록"을 눌러 주세요.</p>
        </Section>
      </div>
    </>
  )
}
