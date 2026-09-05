import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PROFESSIONS, useStore } from '../store'
import { aiStatus } from '../lib/ai'
import { currentSubscription, disablePush, enablePush, pushSupported } from '../lib/push'
import { Disclosure, TopBar, useToast } from '../components/ui'

/* 설정 : 비서 이름 · 내 이름 · 직종 · 글자 크기 · 요금제 · 데이터 */
const PLANS = [
  { id: 'free', name: '무료', price: '0원', desc: '고객 50명 · 일정·기록 · 규칙 기반 비서 · AI 코칭 하루 5회 · 콘텐츠 화면 광고' },
  { id: 'standard', name: '스탠다드', price: '월 9,900원', desc: '고객 무제한 · AI 코칭 하루 30회 · 광고 없음 · 7일 체험' },
  { id: 'pro', name: '프로', price: '월 19,900원', desc: 'AI 에이전트 무제한(말로 시키기·도구 실행) · 카톡/SNS 대량 생성 · 팀 기능' },
  { id: 'premier', name: '프리미어 · 먼저 움직이는 비서', price: '월 39,000원', desc: '아침 브리핑 푸시 · 연락 시점 자동 알림 · 만남 후 자동 정리 · 주간 리포트 발송 · 클라우드 백업·동기화 · 리더 파트너 리포트' },
]
export default function Settings() {
  const { state, dispatch, auth, signOut } = useStore()
  const nav = useNavigate()
  const p = state.profile
  const [aiName, setAiName] = useState(p.aiName)
  const [userName, setUserName] = useState(p.userName)
  const [toast, show] = useToast()
  const [pushOn, setPushOn] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  useEffect(() => { currentSubscription().then((s) => setPushOn(!!s)).catch(() => {}) }, [])
  const togglePush = async () => {
    setPushBusy(true)
    try { if (pushOn) { await disablePush(); setPushOn(false); show('알림을 껐습니다') } else { await enablePush(); setPushOn(true); show('알림을 켰습니다. 테스트 알림을 보냈어요') } } catch (e) { show(e.message) }
    setPushBusy(false)
  }

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
        <Disclosure icon="👤" title={auth.user ? `내 계정 · ${auth.user.email}` : auth.cloud ? '내 계정 · 로그인 안 됨' : '내 계정 · 이 기기 전용'} open>
          {auth.user && (
            <>
              <p className="small">플랜: <b>{{ free: '무료', standard: '스탠다드', pro: '프로', premier: '프리미어' }[auth.user.plan] || auth.user.plan}</b>{auth.user.beta && <span className="badge green" style={{ marginLeft: 8 }}>베타 전체 개방</span>}</p>
              <p className="small muted">{auth.syncing ? '☁️ 저장 중…' : auth.lastSaved ? `☁️ 마지막 저장 ${new Date(auth.lastSaved).toLocaleString('ko-KR')}` : '☁️ 클라우드 저장 켜짐'}{auth.error ? ` · ${auth.error}` : ''}</p>
              <p className="small muted">같은 이메일로 다른 기기에서 로그인하면 같은 기록을 봅니다.</p>
              {auth.health?.push && (
                <button className={'btn ' + (pushOn ? 'btn-outline' : 'btn-green')} onClick={togglePush} disabled={pushBusy || !pushSupported()}>{pushBusy ? '처리 중…' : pushOn ? '🔔 아침 브리핑 알림 켜짐 · 끄기' : '🔔 아침 브리핑 · 연락 알림 켜기'}</button>
              )}
              {auth.health?.push && !pushSupported() && <p className="small muted">아이폰은 사파리에서 "홈 화면에 추가"한 뒤 그 아이콘으로 열어야 알림을 켤 수 있습니다.</p>}
              <button className="btn btn-danger" onClick={async () => { if (window.confirm('로그아웃할까요? 이 기기의 화면 기록은 지워지고 계정에는 그대로 남습니다.')) { await signOut(); nav('/login', { replace: true }) } }}>로그아웃</button>
            </>
          )}
          {!auth.user && auth.cloud && (
            <>
              <p className="small muted">로그인하면 기록이 계정에 저장되어 어디서나 이어지고, 아침 브리핑 알림과 AI 에이전트를 쓸 수 있습니다.</p>
              <button className="btn btn-primary" onClick={() => nav('/login')}>로그인 · 가입</button>
            </>
          )}
          {!auth.cloud && <p className="small muted">이 배포에는 계정 서버가 없어 기록이 기기 안에만 저장됩니다. 아래 백업 기능을 이용하세요.</p>}
        </Disclosure>

        <Disclosure icon="🤖" title="AI 비서 · 내 정보">
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

        <Disclosure icon="⭐" title={p.plan && p.plan !== 'free' ? `요금제: ${PLANS.find((x) => x.id === p.plan)?.name}` : '요금제 · 무료 이용 중'}>
          <div className="list">
            {PLANS.map((pl) => (
              <div key={pl.id} className={'card ' + (p.plan === pl.id ? 'soft-green' : 'ivory')} style={{ padding: 14 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <b>{pl.name}</b><span className="badge navy">{pl.price}</span>
                </div>
                <p className="small">{pl.desc}</p>
                {p.plan !== pl.id && <button className="btn btn-outline btn-sm" onClick={() => { dispatch({ type: 'profile', data: { plan: pl.id, premium: pl.id !== 'free' } }); show(`${pl.name} 플랜으로 바꿨습니다 (데모)`) }}>이 플랜으로 (데모)</button>}
              </div>
            ))}
          </div>
          <p className="muted small">결제 연동 전 데모입니다. 실제 서비스에서는 웹 결제(PG) 우선, 앱 스토어 결제 병행을 권장합니다. 프리미어 플랜의 "먼저 움직이는 비서" 기능은 서버·알림 인프라가 준비되면 열립니다.</p>
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
