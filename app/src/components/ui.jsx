import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

/* 상단 바 : 뒤로가기 + 제목 (+우측 액션) */
export function TopBar({ title, back = true, right }) {
  const nav = useNavigate()
  return (
    <div className="topbar">
      {back && (
        <button className="icon-btn" aria-label="뒤로" onClick={() => nav(-1)}>←</button>
      )}
      <h2>{title}</h2>
      {right}
    </div>
  )
}

/* 하단 탭 (5개) */
const TABS = [
  { to: '/', ico: '🏠', label: '홈' },
  { to: '/today', ico: '📅', label: '오늘' },
  { to: '/customers', ico: '👥', label: '고객' },
  { to: '/content', ico: '✍️', label: '콘텐츠' },
  { to: '/coach', ico: '🌱', label: '코치' },
]
export function BottomNav() {
  const { pathname } = useLocation()
  return (
    <nav className="bottomnav" aria-label="주 메뉴">
      {TABS.map((t) => {
        const active = t.to === '/' ? pathname === '/' : pathname.startsWith(t.to)
        return (
          <Link key={t.to} to={t.to} className={active ? 'active' : ''}>
            <span className="ico" aria-hidden>{t.ico}</span>
            <span>{t.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

/* 접기/펼치기 : 클릭하면 기능이 나타나는 버튼형 섹션 */
export function Disclosure({ icon, title, badge, children, open, done, onToggle }) {
  return (
    <details className={'disclosure' + (done ? ' done' : '')} open={open} onToggle={(e) => onToggle?.(e.target.open)}>
      <summary>
        {icon && <span style={{ fontSize: 24 }} aria-hidden>{icon}</span>}
        <span className="grow">{title}</span>
        {badge}
        <span className="chev" aria-hidden>▾</span>
      </summary>
      <div className="body">{children}</div>
    </details>
  )
}

/* 관심도 별점 */
export function Stars({ value = 0, onChange, size }) {
  return (
    <div className="stars" role="radiogroup" aria-label="관심도">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={n <= value ? 'on' : ''}
          style={size ? { fontSize: size } : undefined}
          aria-label={`${n}점`}
          onClick={() => onChange?.(n)}
        >★</button>
      ))}
    </div>
  )
}

/* 토스트 */
export function useToast() {
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(''), 2200)
    return () => clearTimeout(t)
  }, [msg])
  return [msg ? <div className="toast" role="status">{msg}</div> : null, setMsg]
}

/* 빈 상태 */
export function Empty({ icon = '📭', text, action }) {
  return (
    <div className="empty">
      <div className="ico" aria-hidden>{icon}</div>
      <p>{text}</p>
      {action}
    </div>
  )
}
