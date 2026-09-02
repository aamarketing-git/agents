import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { INTEREST_LABEL, addDays, fmtDate, today, useStore } from '../store'
import { FOLLOWUP_DAYS, followupStatus } from '../lib/coaching'
import { Disclosure, TopBar, useToast } from '../components/ui'
import VoiceInput from '../components/VoiceInput'

/* 고객 상세 : 연락 시점 · 관심도 · 팔로업 · 만남 기록 */
export default function CustomerDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { state, dispatch, customer, meetingsOf } = useStore()
  const c = customer(id)
  const [quick, setQuick] = useState('')
  const [toast, show] = useToast()
  if (!c) return <div className="page"><p>고객을 찾을 수 없습니다.</p></div>
  const meetings = meetingsOf(c.id).filter((m) => m.done)
  const s = followupStatus(c)

  const contacted = (channel) => {
    dispatch({ type: 'customer.update', id: c.id, data: { lastContact: today(), nextFollowup: addDays(today(), FOLLOWUP_DAYS[c.interest || 2] || 7) } })
    if (quick.trim()) {
      dispatch({ type: 'meeting.add', data: { customerId: c.id, date: today(), done: true, step: 7, memo: `[${channel}] ${quick.trim()}`, result: 'neutral' } })
      setQuick('')
    }
    show(`${channel} 연락을 기록했습니다`)
  }

  const remove = () => {
    if (!window.confirm(`${c.name}님 정보와 기록을 모두 삭제할까요? 되돌릴 수 없습니다.`)) return
    dispatch({ type: 'customer.remove', id: c.id })
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
            <span className="badge purple">만남 {meetings.length}회</span>
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

        <Disclosure icon="✅" title="연락했어요 (간단 기록)">
          <VoiceInput value={quick} onChange={setQuick} rows={3} placeholder="통화·카톡 내용 한두 줄 (비워도 연락일은 저장됩니다)" />
          <div className="row">
            <button className="btn btn-outline" onClick={() => contacted('전화')}>전화했음</button>
            <button className="btn btn-outline" onClick={() => contacted('카톡')}>카톡했음</button>
            <button className="btn btn-outline" onClick={() => contacted('만남')}>만났음</button>
          </div>
        </Disclosure>

        <Disclosure icon="📝" title={`만남 · 연락 기록 ${meetings.length}건`} open={meetings.length > 0}>
          {meetings.length === 0 && <p className="muted">아직 기록이 없습니다. "만남 시작"으로 7단계 흐름을 진행하거나 위에서 간단 기록을 남겨 보세요.</p>}
          {meetings.map((m, i) => (
            <div key={m.id} className="card ivory" style={{ padding: 14 }}>
              <p className="muted small">{fmtDate(m.date)} · {meetings.length - i}번째 · {m.result === 'positive' ? '😊 좋았다' : m.result === 'negative' ? '😕 미지근' : '😐 보통'}</p>
              {m.plan && <p className="small"><b>목표:</b> {m.plan}</p>}
              <p>{m.memo}</p>
              {m.nextAction && <p className="small"><b>다음 행동:</b> {m.nextAction}</p>}
              {m.feedback && <details><summary className="small" style={{ cursor: 'pointer', color: 'var(--purple)' }}>{state.profile.aiName}의 피드백 보기</summary><div className="ai-bubble small mt">{m.feedback}</div></details>}
            </div>
          ))}
        </Disclosure>

        <Disclosure icon="✍️" title="이 분께 보낼 메시지 만들기">
          <button className="btn btn-soft" onClick={() => nav(`/content?kind=안부 카톡&to=${encodeURIComponent(c.name)}`)}>안부 카톡</button>
          <button className="btn btn-soft" onClick={() => nav(`/content?kind=감사 카톡&to=${encodeURIComponent(c.name)}`)}>감사 카톡</button>
          <button className="btn btn-soft" onClick={() => nav(`/content?kind=정보 제공 메시지&to=${encodeURIComponent(c.name)}`)}>유용한 정보 전달</button>
        </Disclosure>

        <button className="btn btn-danger" onClick={remove}>고객 삭제</button>
        {toast}
      </div>
    </>
  )
}
