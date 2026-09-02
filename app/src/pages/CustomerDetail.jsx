import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { INTEREST_LABEL, STAGES, addDays, fmtDate, stageIndex, today, useStore } from '../store'
import { FOLLOWUP_DAYS, STAGE_TIP, followupStatus, twoTwoTwoEvents } from '../lib/coaching'
import { Disclosure, Section, TopBar, notify } from '../components/ui'
import VoiceInput from '../components/VoiceInput'

/* 고객 상세 : 단계 · 연락 시점 · 관심도 · 팔로업 · 만남 기록 */
export default function CustomerDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { state, dispatch, customer, meetingsOf } = useStore()
  const c = customer(id)
  const [quick, setQuick] = useState('')
  if (!c) return <div className="page"><p>고객을 찾을 수 없습니다.</p></div>
  const meetings = meetingsOf(c.id).filter((m) => m.done)
  const s = followupStatus(c)
  const upcoming = state.events.filter((e) => e.customerId === c.id && e.date >= today()).sort((a, b) => (a.date < b.date ? -1 : 1))
  const si = stageIndex(c.stage)

  const setStage = (stageId) => {
    if (stageId === (c.stage || 'new')) return
    dispatch({ type: 'customer.update', id: c.id, data: { stage: stageId, stageChangedAt: today() } })
    if (stageId === 'closed') {
      twoTwoTwoEvents(c).forEach((e) => dispatch({ type: 'event.add', data: e }))
      notify('계약 축하합니다! 2일·2주·2개월 연락 일정을 만들었습니다')
    } else notify(`단계를 "${STAGES.find((x) => x.id === stageId).label}"로 바꿨습니다`)
  }

  const contacted = (channel) => {
    dispatch({ type: 'customer.update', id: c.id, data: { lastContact: today(), nextFollowup: addDays(today(), FOLLOWUP_DAYS[c.interest || 2] || 7) } })
    if (quick.trim()) {
      dispatch({ type: 'meeting.add', data: { customerId: c.id, date: today(), done: true, step: 7, memo: `[${channel}] ${quick.trim()}`, result: 'neutral' } })
      setQuick('')
    }
    notify(`${channel} 연락을 기록했습니다. 다음 연락은 ${fmtDate(addDays(today(), FOLLOWUP_DAYS[c.interest || 2] || 7))}`)
  }

  const remove = () => {
    if (!window.confirm(`${c.name}님 정보와 기록을 모두 삭제할까요? 되돌릴 수 없습니다.`)) return
    dispatch({ type: 'customer.remove', id: c.id })
    notify('삭제했습니다')
    nav('/customers', { replace: true })
  }

  return (
    <>
      <TopBar title={c.name} right={<button className="btn btn-outline btn-sm" onClick={() => nav(`/customers/${c.id}/edit`)}>수정</button>} />
      <div className="page">
        <div className="card">
          <div className="row" style={{ alignItems: 'center' }}>
            <div className="avatar" style={{ flex: 'none', width: 64, height: 64, fontSize: 28 }}>{c.name[0]}</div>
            <div className="grow">
              <h2>{c.name} <span className="muted">{c.title}</span></h2>
              <p className="muted">{c.phone || '연락처 없음'}{c.source ? ` · ${c.source}` : ''}</p>
            </div>
          </div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <span className="badge amber">관심도 {'★'.repeat(c.interest || 0)} {INTEREST_LABEL[c.interest || 0]}</span>
            <span className={'badge ' + s.tone}>다음 연락 {s.label}</span>
            <span className="badge navy">만남 {meetings.length}회</span>
          </div>
          {c.family && <p><b>👨‍👩‍👧 기억할 것:</b> {c.family}</p>}
          {c.birthday && <p><b>🎂 기념일:</b> {c.birthday}</p>}
          {c.memo && <p>{c.memo}</p>}
        </div>

        <div className="row">
          {c.phone && <a className="btn btn-green" href={`tel:${c.phone}`}>📞 전화</a>}
          {c.phone && <a className="btn btn-soft-green" href={`sms:${c.phone}`}>💬 문자</a>}
          <button className="btn btn-primary" onClick={() => nav(`/meeting/${c.id}`)}>🤝 만남 시작</button>
        </div>

        <Section eyebrow="Stage" title="고객 단계" aside={STAGES[si].label}>
          <div className="stage-row">
            {STAGES.map((st, i) => (
              <button key={st.id} type="button" className={i < si ? 'done' : i === si ? 'now' : ''} onClick={() => setStage(st.id)}>{st.short}</button>
            ))}
          </div>
          <p className="small muted">{STAGE_TIP[c.stage || 'new']}</p>
        </Section>

        <Section eyebrow="Contact" title="연락 기록 남기기" aside={c.lastContact ? `마지막 ${fmtDate(c.lastContact)}` : '아직 연락 전'}>
          <VoiceInput value={quick} onChange={setQuick} rows={3} placeholder="통화·카톡 내용 한두 줄 (비워도 연락일은 저장됩니다)" />
          <div className="row">
            <button className="btn btn-outline" onClick={() => contacted('전화')}>전화했음</button>
            <button className="btn btn-outline" onClick={() => contacted('카톡')}>카톡했음</button>
            <button className="btn btn-outline" onClick={() => contacted('만남')}>만났음</button>
          </div>
        </Section>

        {upcoming.length > 0 && (
          <Section eyebrow="Plan" title="예정된 일정" aside={`${upcoming.length}건`}>
            {upcoming.map((e) => (
              <div key={e.id} className="list-item" style={{ boxShadow: 'none', background: 'var(--ivory-dark)', cursor: 'default', minHeight: 56 }}>
                <div className="main"><div className="name small">{fmtDate(e.date)} {e.time}</div><div className="meta">{e.title}</div></div>
              </div>
            ))}
          </Section>
        )}

        <Section eyebrow="History" title="만남 · 연락 기록" aside={`${meetings.length}건`}>
          {meetings.length === 0 && <p className="muted">아직 기록이 없습니다. "만남 시작"으로 7단계 흐름을 진행하거나 위에서 연락 기록을 남겨 보세요.</p>}
          {meetings.map((m, i) => (
            <div key={m.id} className="card ivory" style={{ padding: 14 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <p className="muted small">{fmtDate(m.date)} · {meetings.length - i}번째 · {m.result === 'positive' ? '😊 좋았다' : m.result === 'negative' ? '😕 미지근' : '😐 보통'}</p>
                {m.score && <span className="badge green">{m.score}점</span>}
              </div>
              {m.plan && <p className="small"><b>목표:</b> {m.plan}</p>}
              <p>{m.memo}</p>
              {m.nextAction && <p className="small"><b>다음 행동:</b> {m.nextAction}</p>}
              {m.feedback && <details><summary className="small" style={{ cursor: 'pointer', color: 'var(--navy)' }}>{state.profile.aiName}의 피드백 보기</summary><div className="ai-bubble small mt">{m.feedback}</div></details>}
            </div>
          ))}
        </Section>

        <Section eyebrow="Ask" title={`${state.profile.aiName}에게 이 분에 대해 묻기`}>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-soft-green btn-sm" onClick={() => nav('/coach?q=' + encodeURIComponent(`${c.name}님 어떻게 관리할까?`))}>어떻게 관리할까?</button>
            <button className="btn btn-soft-green btn-sm" onClick={() => nav('/coach?q=' + encodeURIComponent(`${c.name}님 다음 만남에서 무엇을 이야기할까?`))}>다음 만남 준비</button>
          </div>
        </Section>

        <Section eyebrow="Message" title="이 분께 보낼 메시지">
          <div className="row">
            <button className="btn btn-soft" onClick={() => nav(`/content?kind=안부 카톡&to=${encodeURIComponent(c.name)}`)}>안부</button>
            <button className="btn btn-soft" onClick={() => nav(`/content?kind=감사 카톡&to=${encodeURIComponent(c.name)}`)}>감사</button>
            <button className="btn btn-soft" onClick={() => nav(`/content?kind=정보 제공 메시지&to=${encodeURIComponent(c.name)}`)}>정보</button>
          </div>
        </Section>

        <Disclosure icon="⚠️" title="고객 삭제">
          <button className="btn btn-danger" onClick={remove}>이 고객과 모든 기록 삭제</button>
        </Disclosure>
      </div>
    </>
  )
}
