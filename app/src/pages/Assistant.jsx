import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { josa, useStore } from '../store'
import { COMMAND_EXAMPLES, planCommand, runPlan } from '../lib/agent'
import { answerLocally } from '../lib/assistant'
import { runAgentTurn, agentStatus } from '../lib/agentClient'
import { STAGE_TIP } from '../lib/coaching'
import { TopBar, notify } from '../components/ui'
import { useDictation, speechSupported } from '../lib/voice'
import { speak, stopSpeaking, ttsSupported } from '../lib/tts'

/* =========================================================
   비서 대화 화면 (에이전틱)
   - 말/글로 지시 → 계획 카드(확인) → 실행 → 결과·이동 버튼
   - AI 서버가 있으면 Claude 도구 호출 루프, 없으면 규칙 기반 해석
   ========================================================= */
function localCoachAnswer(q, profile) {
  if (/가격|비싸/.test(q)) return '가격 이의는 "가치가 아직 안 보인다"는 뜻입니다. ① 인정 ② "어떤 부분이 부담되세요?" 되묻기 ③ 월 단위·하루 커피값으로 기준 바꾸기 ④ 체험·소량 같은 작은 시작 제안.\n\n오늘 할 일: 고객 1명에게 "어떤 점이 가장 고민되세요?"라고 물어보세요.'
  if (/소개/.test(q)) return '소개는 만족한 직후에, 구체적으로. "주변에 저처럼 ○○ 고민하는 분 한 분만 떠올려 주실 수 있을까요?" "아는 사람 있으면"은 0명, "한 분만"은 1명을 만듭니다.'
  if (/거절|힘들|회복/.test(q)) return '거절은 타이밍의 문제입니다. 평균 계약은 5~7번 접촉 뒤에 옵니다. 오늘은 배운 점 한 줄을 성장 노트에 남기고, 가장 반응 좋았던 고객에게 안부 카톡을 보내세요.'
  if (/SNS|게시|올려/i.test(q)) return 'SNS는 신뢰 통장입니다. 월: 일상·배움 / 수: 도움 되는 정보 / 금: 제품·사업 경험담. 주 3회면 충분합니다. "SNS 게시글 써 줘"라고 하시면 초안을 만들어 드려요.'
  return `${josa(profile.aiName, '이/가')} 이해한 대로 도와드릴게요. 이렇게 말씀해 보세요.\n\n· "오늘 연락할 고객 누구야?"\n· "김철수 010-1234-5678 등록해 줘"\n· "박미영님 다음 주 화요일 3시 만남 잡아 줘"\n· "박미영님한테 전화했어, 아들 입시 걱정"\n· "박미영님 계약했어"\n· "박미영님께 감사 카톡 써 줘"`
}

export default function Assistant() {
  const { state, dispatch } = useStore()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState([]) // 2단계 서버용 원본 메시지
  const endRef = useRef(null)
  const bufRef = useRef('')
  const readAloud = state.profile.readAloud !== false
  const dict = useDictation({ onText: (t) => { bufRef.current = (bufRef.current ? bufRef.current + ' ' : '') + t; setInput(bufRef.current) } })
  const talk = () => {
    if (dict.listening) { dict.stop(); const t = bufRef.current.trim(); bufRef.current = ''; if (t) setTimeout(() => handle(t), 50) }
    else { stopSpeaking(); bufRef.current = input; dict.start() }
  }
  const chat = state.chat
  const ai = state.profile.aiName

  const add = (m) => { const id = Math.random().toString(36).slice(2); dispatch({ type: 'chat.add', data: { ...m, id } }); if (m.role === 'assistant' && readAloud && (m.text || m.plan)) speak(m.text || `${m.plan.title}. ${m.plan.lines.join('. ')}. 실행할까요?`); return id }
  const update = (id, data) => dispatch({ type: 'chat.update', id, data })

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [chat.length, busy])
  useEffect(() => {
    const q = params.get('q')
    if (q) { setInput(q); if (!/,\s*$/.test(q)) handle(q) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* 계획 확인 카드 : 사용자가 실행/취소를 누를 때까지 대기 */
  const confirmPlan = (plan) => new Promise((resolve) => {
    const id = add({ role: 'assistant', kind: 'plan', plan, status: 'pending' })
    window.__planResolvers = window.__planResolvers || {}
    window.__planResolvers[id] = resolve
  })
  const decide = (msg, ok) => {
    update(msg.id, { status: ok ? 'done' : 'cancelled' })
    if (ok) { runPlan(msg.plan, dispatch); notify(msg.plan.after || '실행했습니다') }
    const r = window.__planResolvers?.[msg.id]
    if (r) { delete window.__planResolvers[msg.id]; r(ok) }
    else if (ok) add({ role: 'assistant', text: msg.plan.after })
  }

  const handle = async (raw) => {
    const text = (raw || input).trim()
    if (!text || busy) return
    setInput('')
    add({ role: 'user', text })
    setBusy(true)

    // 2단계: AI 에이전트 (서버가 있을 때)
    if (agentStatus() !== false) {
      const r = await runAgentTurn({
        history, userText: text, state,
        runPlan: (plan) => runPlan(plan, dispatch),
        confirm: confirmPlan,
        onText: (t) => add({ role: 'assistant', text: t, source: 'ai' }),
      })
      if (r) { setHistory(r.messages); setBusy(false); return }
    }

    // 1단계: 규칙 기반
    const plan = planCommand(text, state)
    if (plan) {
      if (plan.direct) { add({ role: 'assistant', text: plan.lines.join(' '), actions: [{ label: plan.title, to: plan.navigate }] }); setBusy(false); return }
      if (plan.actions.length === 0) { add({ role: 'assistant', text: `${plan.title}\n${plan.lines.join('\n')}` }); setBusy(false); return }
      add({ role: 'assistant', kind: 'plan', plan, status: 'pending' })
      setBusy(false); return
    }
    const ans = answerLocally(text, state)
    if (ans) { add({ role: 'assistant', text: ans.text, customers: ans.customers?.map((c) => ({ id: c.id, name: c.name })), actions: ans.actions }); setBusy(false); return }
    add({ role: 'assistant', text: localCoachAnswer(text, state.profile) })
    setBusy(false)
  }

  return (
    <>
      <TopBar title={`${ai} · 비서`} back={false} right={chat.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm('대화 기록을 지울까요? 고객·일정 데이터는 그대로입니다.')) dispatch({ type: 'chat.clear' }) }}>지우기</button>} />
      <div className="page" style={{ paddingBottom: 'calc(230px + env(safe-area-inset-bottom))' }}>
        {chat.length === 0 && (
          <div className="card soft">
            <h3>💬 {ai}에게 말로 시키세요</h3>
            <p className="muted">질문하면 내 고객·일정에서 찾아 답하고, 시키면 확인 카드를 보여 준 뒤 실행합니다.</p>
            <div className="chips">
              {COMMAND_EXAMPLES.map((t) => <button key={t} type="button" className="chip" onClick={() => handle(t)}>{t}</button>)}
            </div>
            <p className="small muted">{agentStatus() === true ? '✅ AI 에이전트 연결됨' : agentStatus() === false ? '규칙 기반 비서로 동작 중 (AI 서버 미연결)' : 'AI 서버 연결 여부는 첫 질문 때 확인됩니다.'}</p>
          </div>
        )}

        <div className="chat">
          {chat.map((m) => (
            <div key={m.id} className={'msg ' + m.role}>
              {m.role === 'user' && <div className="bubble user">{m.text}</div>}
              {m.role === 'assistant' && m.kind === 'plan' && (
                <div className={'plan-card ' + m.status}>
                  <div className="plan-head"><span className="badge navy">{m.status === 'pending' ? '확인 필요' : m.status === 'done' ? '실행 완료' : '취소됨'}</span><b>{m.plan.title}</b></div>
                  <ul>{m.plan.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
                  {m.status === 'pending' && (
                    <div className="row">
                      <button className="btn btn-outline" onClick={() => decide(m, false)}>취소</button>
                      <button className="btn btn-green" onClick={() => decide(m, true)}>✅ 이대로 실행</button>
                    </div>
                  )}
                  {m.status === 'done' && m.plan.navigate && <button className="btn btn-soft btn-sm" onClick={() => nav(m.plan.navigate)}>확인하러 가기 →</button>}
                </div>
              )}
              {m.role === 'assistant' && !m.kind && (
                <div className="bubble ai">
                  <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
                  {m.customers?.length > 0 && <div className="chips mt">{m.customers.map((c) => <button key={c.id} type="button" className="chip on-green" onClick={() => nav(`/customers/${c.id}`)}>👤 {c.name}</button>)}</div>}
                  {m.actions?.length > 0 && <div className="row mt" style={{ flexWrap: 'wrap' }}>{m.actions.map((a) => <button key={a.to} className="btn btn-soft btn-sm" onClick={() => nav(a.to)}>{a.label} →</button>)}</div>}
                </div>
              )}
            </div>
          ))}
          {busy && <div className="msg assistant"><div className="bubble ai muted">{josa(ai, '이/가')} 생각 중…</div></div>}
          <div ref={endRef} />
        </div>
      </div>

      <div className="composer">
        <textarea className="textarea" rows={2} value={input + (dict.interim ? ' ' + dict.interim : '')} onChange={(e) => { setInput(e.target.value); bufRef.current = e.target.value }} placeholder={`${ai}에게 말하거나 적으세요`} />
        {dict.error && <p className="small" style={{ color: 'var(--danger)' }}>{dict.error}</p>}
        <div className="row">
          <button className={'btn ' + (dict.listening ? 'btn-danger' : 'btn-green')} onClick={talk} disabled={!speechSupported() || busy} style={{ flex: 2 }}>
            {dict.listening ? '⏹ 말 끝났어요 (보내기)' : '🎤 말하기'}
          </button>
          <button className="btn btn-primary" disabled={!input.trim() || busy} onClick={() => handle()}>보내기</button>
        </div>
        <div className="row">
          <button className="btn btn-ghost btn-sm" onClick={() => nav('/coach')}>🌱 성장 코치</button>
          {ttsSupported() && <button className="btn btn-ghost btn-sm" onClick={() => { dispatch({ type: 'profile', data: { readAloud: !readAloud } }); if (readAloud) stopSpeaking() }}>{readAloud ? '🔊 읽어주기 켜짐' : '🔇 읽어주기 꺼짐'}</button>}
        </div>
      </div>
    </>
  )
}
