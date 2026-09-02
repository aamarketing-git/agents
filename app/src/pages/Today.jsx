import { useNavigate } from 'react-router-dom'
import { fmtDate, today, useStore } from '../store'
import { followupStatus, meetingGoal } from '../lib/coaching'
import { Disclosure, Empty, TopBar } from '../components/ui'

/* =========================================================
   오늘 할 일 : "오늘 할 일 뭐야?"
   - 오늘 일정(고객 만남) → 7단계 고객관리 흐름으로 진입
   - 연락할 고객 목록 (관심도 기반 자동 팔로업)
   ========================================================= */
export default function Today() {
  const { state, eventsOn, customer, meetingsOf } = useStore()
  const nav = useNavigate()
  const events = eventsOn(today())
  const due = state.customers
    .map((c) => ({ c, s: followupStatus(c) }))
    .filter((x) => x.s.diff <= 2)
    .sort((a, b) => a.s.diff - b.s.diff)

  return (
    <>
      <TopBar title="오늘 할 일" back={false} right={<button className="btn btn-soft btn-sm" onClick={() => nav('/schedule')}>📅 일정 관리</button>} />
      <div className="page">
        <div className="card soft">
          <p className="muted">{fmtDate(today())}</p>
          <h2>{state.profile.userName}님, 오늘은 {events.length}개의 만남과 {due.length}명의 연락이 있습니다.</h2>
          <p>{state.profile.aiName}가 만남마다 7단계로 준비를 도와드릴게요. 아래 항목을 누르면 열립니다.</p>
        </div>

        <h3>① 오늘 일정</h3>
        {events.length === 0 && (
          <Empty icon="🗓️" text="오늘 등록된 일정이 없습니다." action={<button className="btn btn-primary btn-sm" onClick={() => nav('/schedule')}>일정 추가</button>} />
        )}
        {events.map((e) => {
          const c = e.customerId ? customer(e.customerId) : null
          const n = c ? meetingsOf(c.id).length + 1 : 0
          return (
            <Disclosure key={e.id} icon={c ? '🤝' : '📌'} title={`${e.time || ''} ${e.title}`.trim()} badge={c && <span className="badge purple">{n}번째 만남</span>}>
              {c ? (
                <>
                  <p className="muted">{meetingGoal(n).title}</p>
                  <p>{meetingGoal(n).tip}</p>
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

        <h3 className="mt">② 연락할 고객</h3>
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

        <div className="card ivory">
          <h3>💡 {state.profile.aiName}의 한마디</h3>
          <p>만남 직후 20분 안에 기록하면 기억의 58%를 지킬 수 있습니다. 만남이 끝나면 바로 "말로 기록"을 눌러 주세요.</p>
        </div>
      </div>
    </>
  )
}
