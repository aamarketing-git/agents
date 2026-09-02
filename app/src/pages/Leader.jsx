import { useState } from 'react'
import { useStore } from '../store'
import { Disclosure, Empty, TopBar, notify } from '../components/ui'
import VoiceInput from '../components/VoiceInput'

/* =========================================================
   리더 대시보드 : 그룹 활동 · 교육 · 리더 후보 관리
   팀원 = 고객 중 '파트너' 표시된 사람 (isPartner)
   ========================================================= */
export default function Leader() {
  const { state, dispatch, meetingsOf } = useStore()
  const partners = state.customers.filter((c) => c.isPartner)
  const candidates = state.customers.filter((c) => !c.isPartner && (c.interest || 0) >= 4)
  const [log, setLog] = useState('')
  const activity = state.notes.filter((n) => n.kind === 'group')
  const leaderMode = !!state.profile.leaderMode

  return (
    <>
      <TopBar title="리더 대시보드" />
      <div className="page">
        {!leaderMode && (
          <div className="card soft">
            <h3>🏆 리더의 길을 시작할까요?</h3>
            <p>팀(그룹)을 이끌거나 준비 중이라면 리더 모드를 켜세요. 그룹 활동 기록, 교육 진행, 리더 후보 관리가 열립니다.</p>
            <button className="btn btn-primary" onClick={() => { dispatch({ type: 'profile', data: { leaderMode: true } }); notify('리더 모드를 켰습니다') }}>리더 모드 켜기</button>
          </div>
        )}
        {leaderMode && (
          <>
            <div className="tile-grid">
              <div className="tile navy"><span className="ico">👥</span><span><span className="label" style={{ display: 'block' }}>{partners.length}명</span><span className="sub">우리 팀 (파트너)</span></span></div>
              <div className="tile green"><span className="ico">🌟</span><span><span className="label" style={{ display: 'block' }}>{candidates.length}명</span><span className="sub">리더 후보 (관심도 4+)</span></span></div>
            </div>

            <Disclosure icon="📣" title="그룹 활동 기록" open>
              <VoiceInput value={log} onChange={setLog} rows={3} placeholder="예: 화요일 팀 미팅 6명 참석, 신제품 교육 진행" />
              <button className="btn btn-soft" disabled={!log.trim()} onClick={() => { dispatch({ type: 'note.add', data: { text: log.trim(), kind: 'group' } }); setLog(''); notify('그룹 활동을 기록했습니다') }}>기록 저장</button>
              {activity.slice(0, 5).map((n) => <div key={n.id} className="card ivory" style={{ padding: 12 }}><p className="small muted">{n.date}</p><p>{n.text}</p></div>)}
            </Disclosure>

            <Disclosure icon="👥" title={`우리 팀 ${partners.length}명`} open={partners.length > 0}>
              {partners.length === 0 && <p className="muted">고객 목록에서 팀원을 "파트너"로 표시하면 여기에 나타납니다.</p>}
              {partners.map((p) => (
                <div key={p.id} className="list-item" style={{ boxShadow: 'none', background: 'var(--ivory)', cursor: 'default' }}>
                  <div className="avatar">{p.name[0]}</div>
                  <div className="main"><div className="name">{p.name}</div><div className="meta">만남 {meetingsOf(p.id).filter((m) => m.done).length}회 · {p.memo?.slice(0, 30)}</div></div>
                  <button className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: 'customer.update', id: p.id, data: { isPartner: false } })}>해제</button>
                </div>
              ))}
            </Disclosure>

            <Disclosure icon="🌟" title={`리더 후보 ${candidates.length}명`} open>
              {candidates.length === 0 && <Empty icon="🌱" text="관심도 4점 이상인 고객이 후보로 올라옵니다." />}
              {candidates.map((p) => (
                <div key={p.id} className="list-item" style={{ boxShadow: 'none', background: 'var(--ivory)', cursor: 'default' }}>
                  <div className="avatar green">{p.name[0]}</div>
                  <div className="main"><div className="name">{p.name}</div><div className="meta">{'★'.repeat(p.interest)} · {p.memo?.slice(0, 30) || '메모 없음'}</div></div>
                  <button className="btn btn-green btn-sm" onClick={() => { dispatch({ type: 'customer.update', id: p.id, data: { isPartner: true } }); notify(`${p.name}님을 파트너로 등록했습니다`) }}>파트너로</button>
                </div>
              ))}
            </Disclosure>

            <div className="card ivory">
              <h3>💡 리더 체크리스트</h3>
              <p>· 이번 주 팀 미팅 30분(축하 5 · 교육 10 · 사례 10 · 약속 5)<br />· 후보 1명과 1:1 만남 잡기<br />· 팀원에게 이 앱의 7단계 흐름 권하기</p>
            </div>
          </>
        )}
      </div>
    </>
  )
}
