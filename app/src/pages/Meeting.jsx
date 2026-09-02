import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { STAGES, addDays, fmtDate, stageIndex, today, uid, useStore } from '../store'
import { FOLLOWUP_DAYS, PREP_QUESTIONS, STAGE_TIP, localFeedback, meetingGoal, parseFeedbackText, twoTwoTwoEvents } from '../lib/coaching'
import { askAI } from '../lib/ai'
import { Stars, TopBar, notify } from '../components/ui'
import VoiceInput from '../components/VoiceInput'

/* =========================================================
   7단계 고객관리 흐름 (손글씨 메모의 ①~⑦)
   ① 일정 확인  ② 고객 체크  ③ 몇 번째 만남  ④ 이전 대화 기억하기
   ⑤ 오늘 무엇을 풀어갈까  ⑥ 직접 만나기(기록)  ⑦ AI 피드백 체크
   - 단계 막대를 누르면 전 단계로 이동
   ========================================================= */
const STEP_TITLES = ['일정 확인', '고객 체크', '몇 번째 만남', '이전 대화 기억', '오늘 무엇을 풀어갈까', '직접 만나기 · 기록', 'AI 피드백 체크']

export default function Meeting() {
  const { customerId } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { state, dispatch, customer, meetingsOf } = useStore()
  const c = customer(customerId)
  const history = useMemo(() => (c ? meetingsOf(c.id).filter((m) => m.done) : []), [c, meetingsOf])
  const event = state.events.find((e) => e.id === params.get('event'))
  const count = history.length + 1
  const goal = meetingGoal(count)

  const [step, setStep] = useState(0)
  const [meetingId] = useState(() => uid())
  const [plan, setPlan] = useState('')
  const [memo, setMemo] = useState('')
  const [result, setResult] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [interest, setInterest] = useState(c?.interest || 2)
  const [stage, setStage] = useState(c?.stage || 'new')
  const [feedback, setFeedback] = useState(null) // { source, score, grade, rows, summary, text }
  const [prepAI, setPrepAI] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }) }, [step])

  if (!c) return <div className="page"><p>고객을 찾을 수 없습니다.</p><button className="btn btn-outline" onClick={() => nav('/customers')}>고객 목록</button></div>

  const historyText = history.slice(0, 3).map((m) => `${fmtDate(m.date)}: ${m.memo}`).join(' / ')
  const profile = { ...state.profile, professionLabel: state.profile.profession }

  const getPrep = async () => {
    setLoading(true)
    const r = await askAI('prep', { customer: c, count, history: historyText }, profile, () =>
      `${goal.title}\n\n${goal.tip}\n\n단계 조언: ${STAGE_TIP[c.stage || 'new']}\n\n첫 질문 제안: "${history[0] ? `지난번에 말씀하신 ${history[0].memo.slice(0, 20)}… 그 뒤로 어떻게 되셨어요?` : '요즘 가장 신경 쓰이는 일이 무엇이세요?'}"`,
    )
    setPrepAI(r.text)
    setLoading(false)
  }

  const finish = async () => {
    setLoading(true)
    const meeting = { id: meetingId, customerId: c.id, date: today(), step: 7, done: true, plan, memo, result, nextAction, interest, stage, eventId: event?.id }
    const local = localFeedback({ customer: { ...c, stage }, meeting, count, prevMeeting: history[0] })
    const r = await askAI('feedback', { customer: { ...c, stage }, count, history: historyText, meeting }, profile, () => local.summary)
    const fb = r.source === 'ai'
      ? { source: 'ai', score: local.score, grade: local.grade, rows: parseFeedbackText(r.text), summary: local.summary, text: r.text }
      : { source: 'local', ...local, text: local.rows.map((x) => `[${x.label}] ${x.text}`).join('\n') }
    setFeedback(fb)
    dispatch({ type: 'meeting.add', data: { ...meeting, feedback: fb.text, score: fb.score } })
    const stageChanged = stage !== (c.stage || 'new')
    dispatch({ type: 'customer.update', id: c.id, data: { interest, stage, lastContact: today(), nextFollowup: addDays(today(), FOLLOWUP_DAYS[interest] || 7), ...(stageChanged ? { stageChangedAt: today() } : {}) } })
    if (stageChanged && stage === 'closed') {
      twoTwoTwoEvents(c).forEach((e) => dispatch({ type: 'event.add', data: e }))
      notify('계약 축하합니다! 2일·2주·2개월 연락 일정을 만들었습니다')
    } else {
      notify('기록과 피드백을 저장했습니다')
    }
    setLoading(false)
    setStep(6)
  }

  const StepBar = () => (
    <div>
      <div className="steps" role="tablist" aria-label="단계">
        {STEP_TITLES.map((t, i) => (
          <span key={i} className={i < step ? 'done' : i === step ? 'now' : ''} role="tab" aria-label={`${i + 1}단계 ${t}`} onClick={() => i < step && step < 6 && setStep(i)} style={{ cursor: i < step && step < 6 ? 'pointer' : 'default' }} />
        ))}
      </div>
      <p className="muted mt">{step + 1} / 7 · {STEP_TITLES[step]} {step > 0 && step < 6 && <span className="small">(막대를 누르면 전 단계로)</span>}</p>
    </div>
  )

  const Nav = ({ next, nextLabel = '다음 단계', disabled }) => (
    <div className="row">
      {step > 0 && <button className="btn btn-outline" onClick={() => setStep(step - 1)}>← 전 단계</button>}
      {next && <button className="btn btn-primary" disabled={disabled} onClick={next}>{nextLabel} →</button>}
    </div>
  )

  return (
    <>
      <TopBar title={`${c.name}님 · 만남 준비`} />
      <div className="page">
        <StepBar />

        {step === 0 && (
          <div className="card">
            <div className="row"><span className="step-num">1</span><h3>일정 확인</h3></div>
            <p><b>{fmtDate(today())}</b>{event?.time ? ` ${event.time}` : ''}{event?.memo ? ` · ${event.memo}` : ''}</p>
            <p className="muted">{event ? '등록된 일정입니다.' : '일정에 없지만 바로 만남을 기록할 수 있습니다.'}</p>
            <Nav next={() => setStep(1)} />
          </div>
        )}

        {step === 1 && (
          <div className="card">
            <div className="row"><span className="step-num">2</span><h3>고객 체크</h3></div>
            <div className="list-item" style={{ boxShadow: 'none', background: 'var(--ivory)', cursor: 'default' }}>
              <div className="avatar">{c.name[0]}</div>
              <div className="main">
                <div className="name">{c.name} {c.title && <span className="muted">{c.title}</span>}</div>
                <div className="meta">{c.phone || '연락처 없음'}{c.source ? ` · ${c.source}` : ''}</div>
              </div>
            </div>
            <p><b>단계</b> {STAGES[stageIndex(c.stage)].label} · <b>관심도</b> {'★'.repeat(c.interest || 0)}{'☆'.repeat(5 - (c.interest || 0))}</p>
            {c.family && <p><b>가족·개인</b> {c.family}</p>}
            {c.birthday && <p><b>기념일</b> {c.birthday}</p>}
            {c.memo && <p><b>메모</b> {c.memo}</p>}
            <button className="btn btn-outline" onClick={() => nav(`/customers/${c.id}/edit`)}>정보 수정</button>
            <Nav next={() => setStep(2)} />
          </div>
        )}

        {step === 2 && (
          <div className="card">
            <div className="row"><span className="step-num">3</span><h3>몇 번째 만남</h3></div>
            <h1 style={{ color: 'var(--navy)' }}>{count}번째</h1>
            <p><b>{goal.title}</b></p>
            <p>{goal.tip}</p>
            <p className="muted small">단계 조언 · {STAGE_TIP[c.stage || 'new']}</p>
            <Nav next={() => setStep(3)} />
          </div>
        )}

        {step === 3 && (
          <div className="card">
            <div className="row"><span className="step-num">4</span><h3>이전 대화 기억하기</h3></div>
            {history.length === 0 && <p className="muted">첫 만남입니다. 오늘 들은 이야기가 다음 만남의 첫 인사가 됩니다.</p>}
            {history[0]?.nextAction && <div className="card soft-green" style={{ padding: 12 }}><b>지난 약속 확인</b><p>{history[0].nextAction}</p><p className="small muted">이 약속을 지켰는지 먼저 말하세요. 신뢰의 기본입니다.</p></div>}
            {history.map((m) => (
              <div key={m.id} className="card ivory" style={{ padding: 14 }}>
                <p className="muted small">{fmtDate(m.date)} · {m.result === 'positive' ? '반응 좋음' : m.result === 'negative' ? '미지근' : '보통'}</p>
                <p>{m.memo}</p>
              </div>
            ))}
            <Nav next={() => setStep(4)} />
          </div>
        )}

        {step === 4 && (
          <div className="card">
            <div className="row"><span className="step-num">5</span><h3>오늘 무엇을 풀어갈까?</h3></div>
            <ul style={{ margin: 0, paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {PREP_QUESTIONS.map((q) => <li key={q}>{q}</li>)}
            </ul>
            <button className="btn btn-soft-green" onClick={getPrep} disabled={loading}>{loading ? '생각 중…' : `🌱 ${state.profile.aiName}에게 준비 코칭 받기`}</button>
            {prepAI && <div className="ai-bubble green">{prepAI}</div>}
            <VoiceInput value={plan} onChange={setPlan} rows={3} placeholder="오늘 목표를 한 줄로. 예: 자녀 교육비 고민을 듣고 다음 주 자료 약속 잡기" />
            <Nav next={() => setStep(5)} />
          </div>
        )}

        {step === 5 && (
          <div className="card">
            <div className="row"><span className="step-num">6</span><h3>직접 만나기 · 기록</h3></div>
            <p className="muted">만남이 끝나면 바로, 20분 안에. 말로 하셔도 됩니다.</p>
            <VoiceInput value={memo} onChange={setMemo} rows={6} placeholder="오늘 나눈 이야기, 상대가 한 말 그대로, 가족·건강·취미 등 개인적인 이야기, 약속한 것" />
            <div className="field">
              <label>오늘 반응</label>
              <div className="chips">
                {[['positive', '😊 좋았다'], ['neutral', '😐 보통'], ['negative', '😕 미지근']].map(([k, l]) => (
                  <button key={k} type="button" className={'chip' + (result === k ? ' on' : '')} onClick={() => setResult(k)}>{l}</button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>지금 관심도</label>
              <Stars value={interest} onChange={setInterest} />
            </div>
            <div className="field">
              <label>고객 단계 (바뀌었다면 눌러서 바꾸기)</label>
              <div className="stage-row">
                {STAGES.map((s, i) => (
                  <button key={s.id} type="button" className={i < stageIndex(stage) ? 'done' : s.id === stage ? 'now' : ''} onClick={() => setStage(s.id)}>{s.short}</button>
                ))}
              </div>
              {stage === 'closed' && (c.stage || 'new') !== 'closed' && <p className="small" style={{ color: 'var(--green-dark)' }}>계약으로 바꾸면 2일·2주·2개월 연락 일정이 자동으로 만들어집니다.</p>}
            </div>
            <div className="field">
              <label>다음 행동 (언제 · 무엇을)</label>
              <input className="input" value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="예: 목요일에 자료 카톡으로 보내기" />
            </div>
            <Nav next={finish} nextLabel={loading ? '저장 중…' : '저장 · AI 피드백'} disabled={!memo.trim() || loading} />
          </div>
        )}

        {step === 6 && feedback && (
          <div className="card">
            <div className="row"><span className="step-num done">7</span><h3>AI 피드백 체크</h3></div>
            <div className="row" style={{ alignItems: 'center' }}>
              <div className="score"><b>{feedback.score}</b><span className="muted">/ 100 · {feedback.grade}</span></div>
              {feedback.source === 'local' && <span className="badge">기본 코칭</span>}
            </div>
            <div className="progress"><div style={{ width: `${feedback.score}%` }} /></div>
            <div className="fb">
              {feedback.rows.map((r, i) => (
                <div key={i} className={'fb-row ' + r.kind}><b>{r.label}</b><span>{r.text}</span></div>
              ))}
            </div>
            <p className="muted small">{feedback.summary}</p>
            <div className="divider" />
            <p className="muted">다음 연락 권장일: <b>{fmtDate(addDays(today(), FOLLOWUP_DAYS[interest] || 7))}</b> (관심도 {interest}점 기준)</p>
            <button className="btn btn-green" onClick={() => nav('/content?kind=감사 카톡&to=' + encodeURIComponent(c.name))}>💬 감사 카톡 만들기</button>
            <button className="btn btn-outline" onClick={() => nav(`/customers/${c.id}`)}>고객 기록 보기</button>
            <button className="btn btn-ghost" onClick={() => nav('/today')}>오늘 할 일로</button>
          </div>
        )}
      </div>
    </>
  )
}
