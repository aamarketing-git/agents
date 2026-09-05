import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth as authApi } from '../lib/api'
import { useStore } from '../store'
import { notify } from '../components/ui'

/* =========================================================
   로그인 · 가입 : 이메일 + 비밀번호. 기록은 내 계정(서버)에 저장되어 어느 기기에서나 이어집니다.
   ========================================================= */
export default function Login() {
  const { signIn, useLocalOnly, auth } = useStore()
  const nav = useNavigate()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    if (mode === 'signup' && pw !== pw2) return setErr('비밀번호 확인이 일치하지 않습니다.')
    setBusy(true)
    try {
      const r = mode === 'signup' ? await authApi.signup(email.trim(), pw) : await authApi.login(email.trim(), pw)
      const how = await signIn(r.user)
      notify(mode === 'signup' ? '가입을 환영합니다!' : how === 'uploaded' ? '이 기기의 기록을 계정에 저장했습니다' : '로그인했습니다')
      nav('/', { replace: true })
    } catch (ex) {
      setErr(ex.message || '잠시 후 다시 시도해 주세요.')
    } finally { setBusy(false) }
  }

  return (
    <div className="page" style={{ paddingTop: 40, justifyContent: 'center' }}>
      <div className="hero">
        <p className="eyebrow">나의 커스텀 AI 비서 · 베타</p>
        <h1>{mode === 'login' ? '다시 만나서 반가워요' : '계정을 만들면\n어디서나 이어집니다'}</h1>
        <p className="quote">고객·일정·기록이 내 계정에 안전하게 저장되어 휴대폰과 PC 어디서나 같은 내용을 봅니다. 베타 기간에는 아침 브리핑 알림, AI 에이전트 등 모든 기능이 열려 있습니다.</p>
      </div>

      <div className="chips">
        <button type="button" className={'chip' + (mode === 'login' ? ' on' : '')} onClick={() => setMode('login')}>로그인</button>
        <button type="button" className={'chip' + (mode === 'signup' ? ' on' : '')} onClick={() => setMode('signup')}>처음이에요 · 가입</button>
      </div>

      <form className="card" onSubmit={submit}>
        <div className="field">
          <label htmlFor="email">이메일</label>
          <input id="email" className="input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" required />
        </div>
        <div className="field">
          <label htmlFor="pw">비밀번호 {mode === 'signup' && <span className="muted small">(6자 이상)</span>}</label>
          <input id="pw" className="input" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={pw} onChange={(e) => setPw(e.target.value)} minLength={6} required />
        </div>
        {mode === 'signup' && (
          <div className="field">
            <label htmlFor="pw2">비밀번호 확인</label>
            <input id="pw2" className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} minLength={6} required />
          </div>
        )}
        {err && <p style={{ color: 'var(--danger)', fontWeight: 600 }}>{err}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? '확인 중…' : mode === 'login' ? '로그인' : '가입하고 시작하기'}</button>
        {mode === 'login' && <p className="small muted center">비밀번호를 잊으셨다면 베타 기간에는 운영자에게 문의해 주세요.</p>}
      </form>

      <button className="btn btn-ghost" onClick={() => { useLocalOnly(); nav('/start', { replace: true }) }}>로그인 없이 이 기기에서만 사용하기</button>
      <p className="small muted center">이 기기에서만 사용하면 기록이 기기 안에만 저장되고 알림·동기화는 쓸 수 없습니다. 나중에 설정에서 로그인할 수 있습니다.</p>
      {auth.health?.beta && <p className="small muted center">베타 · 모든 기능 무료 개방 중</p>}
    </div>
  )
}
