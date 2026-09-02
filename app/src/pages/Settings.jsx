import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PROFESSIONS, useStore } from '../store'
import { aiStatus } from '../lib/ai'
import { Disclosure, TopBar, useToast } from '../components/ui'

/* 설정 : 비서 이름 · 내 이름 · 직종 · 글자 크기 · 프리미엄 · 데이터 */
export default function Settings() {
  const { state, dispatch } = useStore()
  const nav = useNavigate()
  const p = state.profile
  const [aiName, setAiName] = useState(p.aiName)
  const [userName, setUserName] = useState(p.userName)
  const [toast, show] = useToast()

  const backup = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `ai비서_백업_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    show('백업 파일을 내려받았습니다')
  }
  const restore = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const r = new FileReader()
    r.onload = () => {
      try {
        const data = JSON.parse(r.result)
        localStorage.setItem('ai-secretary-v1', JSON.stringify(data))
        window.location.reload()
      } catch { show('백업 파일을 읽을 수 없습니다') }
    }
    r.readAsText(f)
  }

  return (
    <>
      <TopBar title="설정" />
      <div className="page">
        <Disclosure icon="🤖" title="AI 비서 · 내 정보" open>
          <div className="field"><label>AI 비서 이름</label><input className="input" value={aiName} onChange={(e) => setAiName(e.target.value)} /></div>
          <div className="field"><label>내 이름</label><input className="input" value={userName} onChange={(e) => setUserName(e.target.value)} /></div>
          <div className="field">
            <label>직종</label>
            <select className="select" value={p.profession} onChange={(e) => dispatch({ type: 'profile', data: { profession: e.target.value } })}>
              {PROFESSIONS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" disabled={!aiName.trim() || !userName.trim()} onClick={() => { dispatch({ type: 'profile', data: { aiName: aiName.trim(), userName: userName.trim() } }); show('저장했습니다') }}>저장</button>
        </Disclosure>

        <Disclosure icon="🔠" title="글자 크기" open>
          <div className="chips">
            {[['normal', '보통'], ['large', '크게'], ['xlarge', '아주 크게']].map(([k, l]) => (
              <button key={k} type="button" className={'chip' + (p.fontScale === k ? ' on' : '')} onClick={() => { dispatch({ type: 'profile', data: { fontScale: k } }); show(`글자 크기: ${l}`) }}>{l}</button>
            ))}
          </div>
          <p className="muted small">언제든 바꿀 수 있습니다. 화면 구성은 그대로 유지됩니다.</p>
        </Disclosure>

        <Disclosure icon="⭐" title={p.premium ? '프리미엄 이용 중' : '프리미엄 (광고 없음 · AI 무제한)'}>
          <p>무료: 고객 50명 · AI 코칭 하루 5회 · 콘텐츠 화면 광고<br />스탠다드 월 9,900원: 고객 무제한 · AI 하루 30회 · 광고 없음<br />프로 월 19,900원: AI 무제한 · 팀 기능</p>
          <p className="muted small">결제 연동 전 데모: 아래 버튼으로 프리미엄 상태를 켜고 끌 수 있습니다.</p>
          <button className={'btn ' + (p.premium ? 'btn-outline' : 'btn-green')} onClick={() => { dispatch({ type: 'profile', data: { premium: !p.premium } }); show(p.premium ? '무료 플랜으로 돌아갔습니다' : '프리미엄이 켜졌습니다. 광고가 사라집니다') }}>{p.premium ? '프리미엄 해제 (데모)' : '프리미엄 켜기 (데모)'}</button>
        </Disclosure>

        <Disclosure icon="🔌" title="AI 연결 상태">
          <p>{aiStatus() === true ? '✅ AI 서버에 연결되어 있습니다.' : aiStatus() === false ? '⚠️ AI 서버 미연결. 기본 템플릿과 규칙 기반 코칭으로 동작합니다.' : '아직 확인 전입니다. AI 기능을 한 번 사용하면 표시됩니다.'}</p>
          <p className="muted small">서버 함수(api/coach.js)에 API 키를 설정하면 실제 AI가 답합니다. 고객 정보는 답변 생성에만 쓰이며 저장되지 않습니다.</p>
        </Disclosure>

        <Disclosure icon="💾" title="내 데이터 (백업 · 복원 · 초기화)">
          <p className="muted small">모든 기록은 이 기기 안에만 저장됩니다. 기기를 바꾸기 전에 백업하세요.</p>
          <button className="btn btn-soft" onClick={backup}>📥 백업 파일 내려받기</button>
          <label className="btn btn-outline" style={{ cursor: 'pointer' }}>📤 백업 파일에서 복원<input type="file" accept="application/json" hidden onChange={restore} /></label>
          <button className="btn btn-danger" onClick={() => { if (window.confirm('모든 데이터를 지우고 처음부터 시작할까요?')) { dispatch({ type: 'reset' }); nav('/start', { replace: true }) } }}>모두 지우고 처음부터</button>
        </Disclosure>
        <p className="center muted small">나의 커스텀 AI 비서 v0.1 · 웹·앱 공용</p>
        {toast}
      </div>
    </>
  )
}
