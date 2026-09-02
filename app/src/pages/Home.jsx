import { useNavigate } from 'react-router-dom'
import { fmtDate, josa, today, useStore } from '../store'
import { dailyQuote, followupStatus, roadmap, weeklyReport } from '../lib/coaching'
import { Section, TopBar } from '../components/ui'

/* =========================================================
   홈 : "당신의 커스텀 AI 비서 ○○ 입니다" + 오늘의 자신감 + 6개 큰 버튼
   ========================================================= */
export default function Home() {
  const { state, eventsOn } = useStore()
  const nav = useNavigate()
  const { profile } = state
  const todays = eventsOn(today())
  const due = state.customers.filter((c) => followupStatus(c).diff <= 0)
  const rm = roadmap(state)
  const wk = weeklyReport(state)
  const hour = new Date().getHours()
  const greet = hour < 11 ? '좋은 아침입니다' : hour < 17 ? '활기찬 오후입니다' : '수고 많으셨습니다'

  const tiles = [
    { to: '/today', ico: '📅', label: '오늘 할 일', sub: `${todays.length}개 일정 · ${due.length}명 연락`, cls: 'navy' },
    { to: '/customers', ico: '👥', label: '고객 관리', sub: `${state.customers.length}명 · 연락시점 · 관심도`, cls: 'green' },
    { to: '/content', ico: '✍️', label: '콘텐츠 만들기', sub: 'SNS · 카톡 · 교육자료', cls: 'soft' },
    { to: '/coach', ico: '🌱', label: 'AI 코치', sub: '제품 · 사업 · SNS 질문', cls: 'soft-green' },
    { to: '/education', ico: '🎓', label: '교육센터', sub: '건강·제품·AI·사업·리더', cls: '' },
    { to: '/leader', ico: '🏆', label: '리더 대시보드', sub: '그룹 활동 · 리더 후보', cls: '' },
  ]

  return (
    <>
      <TopBar
        title={`${profile.aiName} · AI 비서`}
        back={false}
        right={<button className="icon-btn" aria-label="설정" onClick={() => nav('/settings')}>⚙️</button>}
      />
      <div className="page">
        <section className="hero">
          <p className="eyebrow">{fmtDate(today())} · {greet}</p>
          <h1>당신의 커스텀 AI 비서<br /><span className="name">{profile.aiName}</span> 입니다.</h1>
          <p className="quote">{profile.userName}님, 오늘도 {josa(profile.aiName)} 함께라면 고객을 만나기 전 준비가 끝나 있습니다. {dailyQuote()}</p>
          <div className="stats">
            <span className="stat"><b>{todays.length}</b>오늘 일정</span>
            <span className="stat"><b>{due.length}</b>연락할 고객</span>
            <span className="stat"><b>{rm.current + 1}</b>/5 성장 단계</span>
          </div>
        </section>

        <Section eyebrow="Menu" title="무엇을 할까요?">
        <div className="tile-grid">
          {tiles.map((t) => (
            <button key={t.to} className={'tile ' + t.cls} onClick={() => nav(t.to)}>
              <span className="ico" aria-hidden>{t.ico}</span>
              <span>
                <span className="label" style={{ display: 'block' }}>{t.label}</span>
                <span className="sub">{t.sub}</span>
              </span>
            </button>
          ))}
          <button className="tile wide soft" onClick={() => nav('/customers/new')}>
            <span className="ico" aria-hidden>➕</span>
            <span>
              <span className="label" style={{ display: 'block' }}>새 고객 등록</span>
              <span className="sub">이름만 적어도 됩니다. 나머지는 만나면서 채워요.</span>
            </span>
          </button>
        </div>
        </Section>

        <Section eyebrow="This week" title="이번 주 활동" aside={`${wk.since.slice(5).replace('-', '/')} ~ 오늘`}>
          <div className="tile-grid">
            <div className="card ivory" style={{ padding: 14 }}><p className="muted small">만남</p><h2>{wk.meetings}<span className="muted small"> 회</span></h2></div>
            <div className="card ivory" style={{ padding: 14 }}><p className="muted small">연락</p><h2>{wk.contacts}<span className="muted small"> 회</span></h2></div>
            <div className="card ivory" style={{ padding: 14 }}><p className="muted small">새 고객</p><h2>{wk.newCustomers}<span className="muted small"> 명</span></h2></div>
            <div className="card ivory" style={{ padding: 14 }}><p className="muted small">계약</p><h2 style={{ color: 'var(--green-dark)' }}>{wk.closed}<span className="muted small"> 건</span></h2></div>
          </div>
          <p className="small muted">{wk.comment}</p>
        </Section>

        {due.length > 0 && (
          <Section eyebrow="Follow-up" title="오늘 연락하면 좋은 분" aside={`${due.length}명`}>
            {due.slice(0, 3).map((c) => (
              <button key={c.id} className="list-item" onClick={() => nav(`/customers/${c.id}`)}>
                <div className="avatar">{c.name[0]}</div>
                <div className="main">
                  <div className="name">{c.name}</div>
                  <div className="meta">{c.memo ? c.memo.slice(0, 40) : '기록을 남겨 보세요'}</div>
                </div>
                <span className={'badge ' + followupStatus(c).tone}>{followupStatus(c).label}</span>
              </button>
            ))}
          </Section>
        )}
      </div>
    </>
  )
}
