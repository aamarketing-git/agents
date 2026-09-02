import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PROFESSIONS, josa, today, useStore } from '../store'

/* =========================================================
   첫 실행 : "너는 누구야?" → 사용자가 직접 비서 이름을 지어 줍니다.
   ========================================================= */
const NAME_IDEAS = ['아이린', '지니', '소라', '하늘', '미소', '든든', '보라', '초록']

export default function Onboarding() {
  const { state, dispatch } = useStore()
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [userName, setUserName] = useState(state.profile.userName || '')
  const [aiName, setAiName] = useState(state.profile.aiName || '')
  const [profession, setProfession] = useState(state.profile.profession || '')

  const finish = () => {
    dispatch({ type: 'profile', data: { userName: userName.trim(), aiName: aiName.trim(), profession, createdAt: state.profile.createdAt || today() } })
    nav('/', { replace: true })
  }

  return (
    <div className="page" style={{ paddingTop: 40, justifyContent: 'center' }}>
      <div className="steps"><span className={step >= 0 ? 'now' : ''} /><span className={step >= 1 ? 'now' : ''} /><span className={step >= 2 ? 'now' : ''} /></div>

      {step === 0 && (
        <>
          <div className="hero">
            <p className="eyebrow">처음 뵙겠습니다</p>
            <h1>저는 당신의<br />커스텀 AI 비서입니다.</h1>
            <p className="quote">고객과 만나기 전 준비를 돕고, 만남을 기억하고, 매일 성장하는 길을 함께 그려 드릴게요. 먼저, 주인님 이름을 알려 주세요.</p>
          </div>
          <div className="field">
            <label htmlFor="uname">내 이름 (또는 불리고 싶은 호칭)</label>
            <input id="uname" className="input" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="예: 김영희, 영희 팀장" autoFocus />
          </div>
          <button className="btn btn-primary" disabled={!userName.trim()} onClick={() => setStep(1)}>다음</button>
        </>
      )}

      {step === 1 && (
        <>
          <div className="hero">
            <p className="eyebrow">{userName}님, 반갑습니다</p>
            <h1>"너는 누구야?"<br />제 이름을 지어 주세요.</h1>
            <p className="quote">매일 아침 이 이름으로 인사드릴게요. 부르기 편한 이름이면 무엇이든 좋습니다.</p>
          </div>
          <div className="field">
            <label htmlFor="ainame">AI 비서 이름</label>
            <input id="ainame" className="input" value={aiName} onChange={(e) => setAiName(e.target.value)} placeholder="예: 아이린, 지니, 든든이" autoFocus />
          </div>
          <div className="chips">
            {NAME_IDEAS.map((n) => (
              <button key={n} type="button" className={'chip' + (aiName === n ? ' on' : '')} onClick={() => setAiName(n)}>{n}</button>
            ))}
          </div>
          {aiName.trim() && (
            <div className="ai-bubble">저는 {userName}님의 커스텀 AI 비서 <b>{aiName.trim()}</b>입니다. 콘텐츠 제작, 고객관리, 업무 지원을 맡을게요.</div>
          )}
          <div className="row">
            <button className="btn btn-outline" onClick={() => setStep(0)}>이전</button>
            <button className="btn btn-primary" disabled={!aiName.trim()} onClick={() => setStep(2)}>다음</button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="hero">
            <p className="eyebrow">{aiName}가 더 잘 돕기 위해</p>
            <h1>어떤 일을 하시나요?</h1>
            <p className="quote">직종에 맞춰 연락 주기, 콘텐츠 예시, 교육 내용을 준비합니다. 나중에 설정에서 바꿀 수 있어요.</p>
          </div>
          <div className="chips">
            {PROFESSIONS.map((p) => (
              <button key={p.id} type="button" className={'chip' + (profession === p.id ? ' on-green' : '')} onClick={() => setProfession(p.id)}>{p.label}</button>
            ))}
          </div>
          <div className="row">
            <button className="btn btn-outline" onClick={() => setStep(1)}>이전</button>
            <button className="btn btn-green" disabled={!profession} onClick={finish}>{josa(aiName.trim())} 시작하기</button>
          </div>
        </>
      )}
    </div>
  )
}
