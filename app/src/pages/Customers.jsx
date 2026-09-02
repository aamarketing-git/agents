import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { INTEREST_LABEL, STAGES, fmtDate, stageIndex, useStore } from '../store'
import { followupStatus } from '../lib/coaching'
import { Empty, Section, TopBar, notify } from '../components/ui'

/* 고객 목록 : 연락시점 · 관심도 · 팔로업 */
const FILTERS = [['all', '전체'], ['due', '연락할 분'], ['hot', '관심 높음'], ['new', '최근 등록'], ['closed', '계약 고객']]

export default function Customers() {
  const { state } = useStore()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [f, setF] = useState('all')

  let list = state.customers.filter((c) => !q || c.name.includes(q) || (c.memo || '').includes(q) || (c.phone || '').includes(q))
  if (f === 'due') list = list.filter((c) => followupStatus(c).diff <= 0)
  if (f === 'hot') list = list.filter((c) => (c.interest || 0) >= 4)
  if (f === 'closed') list = list.filter((c) => c.stage === 'closed' || c.stage === 'referral')
  if (f === 'new') list = [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 10)
  if (f.startsWith('stage:')) list = list.filter((c) => (c.stage || 'new') === f.slice(6))
  if (f === 'all') list = [...list].sort((a, b) => followupStatus(a).diff - followupStatus(b).diff)

  const exportCsv = () => {
    const rows = [['이름', '연락처', '직함', '관심도', '마지막 연락', '다음 연락', '가족·개인', '메모']]
    state.customers.forEach((c) => rows.push([c.name, c.phone, c.title, c.interest, c.lastContact, c.nextFollowup, c.family, c.memo].map((v) => `"${(v ?? '').toString().replace(/"/g, '""')}"`)))
    const blob = new Blob(['﻿' + rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `고객목록_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    notify('고객 목록 CSV를 내려받았습니다')
  }

  return (
    <>
      <TopBar title={`고객 관리 · ${state.customers.length}명`} back={false} right={<button className="btn btn-green btn-sm" onClick={() => nav('/customers/new')}>＋ 등록</button>} />
      <div className="page">
        <Section eyebrow="Pipeline" title="단계별 현황">
          <div className="stage-row">
            {STAGES.map((st) => {
              const n = state.customers.filter((c) => (c.stage || 'new') === st.id).length
              return <button key={st.id} type="button" className={n ? 'done' : ''} onClick={() => { setQ(''); setF('stage:' + st.id) }}>{st.short}<br /><span style={{ fontSize: 16 }}>{n}</span></button>
            })}
          </div>
        </Section>
        <Section eyebrow="List" title="고객 목록" aside={`${list.length}명 표시`}>
        <input className="input" placeholder="이름 · 메모 · 전화번호 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips">
          {FILTERS.map(([k, l]) => <button key={k} type="button" className={'chip' + (f === k ? ' on' : '')} onClick={() => setF(k)}>{l}</button>)}
          {f.startsWith('stage:') && <button type="button" className="chip on-green" onClick={() => setF('all')}>{STAGES[stageIndex(f.slice(6))].label} ✕</button>}
        </div>

        {list.length === 0 && (
          <Empty icon="👥" text={state.customers.length === 0 ? '아직 등록된 고객이 없습니다. 이름만 적어도 시작할 수 있어요.' : '조건에 맞는 고객이 없습니다.'} action={<button className="btn btn-primary btn-sm" onClick={() => nav('/customers/new')}>첫 고객 등록</button>} />
        )}
        <div className="list">
          {list.map((c) => {
            const s = followupStatus(c)
            return (
              <button key={c.id} className="list-item" onClick={() => nav(`/customers/${c.id}`)}>
                <div className={'avatar' + ((c.interest || 0) >= 4 ? ' green' : '')}>{c.name[0]}</div>
                <div className="main">
                  <div className="name">{c.name} <span className="small" style={{ color: 'var(--amber)' }}>{'★'.repeat(c.interest || 0)}</span></div>
                  <div className="meta">{STAGES[stageIndex(c.stage)].label} · {INTEREST_LABEL[c.interest || 0] || ''}{c.lastContact ? ` · 마지막 ${fmtDate(c.lastContact)}` : ' · 아직 연락 전'}</div>
                </div>
                <span className={'badge ' + s.tone}>{s.label}</span>
              </button>
            )
          })}
        </div>

        {state.customers.length > 0 && (
          <button className="btn btn-ghost" onClick={exportCsv}>📤 엑셀(CSV)로 내보내기 · 내 고객 정보는 내 것</button>
        )}
        </Section>
      </div>
    </>
  )
}
