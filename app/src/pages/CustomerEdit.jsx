import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { INTEREST_LABEL, STAGES, today, useStore } from '../store'
import { nextFollowup } from '../lib/coaching'
import { Stars, TopBar, notify } from '../components/ui'
import VoiceInput from '../components/VoiceInput'

/* 고객 등록 · 수정 (타자 + 음성) */
export default function CustomerEdit() {
  const { id } = useParams()
  const nav = useNavigate()
  const { dispatch, customer } = useStore()
  const c = id ? customer(id) : null
  const [form, setForm] = useState({
    name: c?.name || '', phone: c?.phone || '', title: c?.title || '', source: c?.source || '',
    interest: c?.interest || 2, stage: c?.stage || 'new', family: c?.family || '', memo: c?.memo || '', lastContact: c?.lastContact || '', birthday: c?.birthday || '',
  })
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))

  const save = () => {
    const data = { ...form, name: form.name.trim() }
    if (c) {
      dispatch({ type: 'customer.update', id: c.id, data: { ...data, nextFollowup: nextFollowup({ ...c, ...data }), ...(data.stage !== (c.stage || 'new') ? { stageChangedAt: today() } : {}) } })
      notify('고객 정보를 저장했습니다')
      nav(`/customers/${c.id}`, { replace: true })
    } else {
      const base = { ...data, createdAt: today() }
      dispatch({ type: 'customer.add', data: { ...base, nextFollowup: nextFollowup(base), stageChangedAt: today() } })
      notify(`${data.name}님을 등록했습니다. 첫 연락 권장일은 ${nextFollowup(base).slice(5).replace('-', '월 ')}일입니다`)
      nav('/customers', { replace: true })
    }
  }

  return (
    <>
      <TopBar title={c ? '고객 정보 수정' : '새 고객 등록'} />
      <div className="page">
        <div className="field">
          <label htmlFor="name">이름 *</label>
          <input id="name" className="input" value={form.name} onChange={(e) => set('name')(e.target.value)} placeholder="예: 박미영" autoFocus />
        </div>
        <div className="row">
          <div className="field">
            <label>연락처</label>
            <input className="input" type="tel" value={form.phone} onChange={(e) => set('phone')(e.target.value)} placeholder="010-" />
          </div>
          <div className="field">
            <label>직함·관계</label>
            <input className="input" value={form.title} onChange={(e) => set('title')(e.target.value)} placeholder="예: 동창, 원장님" />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>알게 된 경로</label>
            <input className="input" value={form.source} onChange={(e) => set('source')(e.target.value)} placeholder="예: 소개, 모임" />
          </div>
          <div className="field">
            <label>생일·기념일</label>
            <input className="input" value={form.birthday} onChange={(e) => set('birthday')(e.target.value)} placeholder="예: 3월 12일" />
          </div>
        </div>
        <div className="field">
          <label>관심도 · {INTEREST_LABEL[form.interest]}</label>
          <Stars value={form.interest} onChange={set('interest')} />
          <p className="small muted">관심도에 따라 다음 연락 권장일이 자동으로 정해집니다. (5점 2일 · 4점 3일 · 3점 5일 · 2점 7일 · 1점 14일)</p>
        </div>
        <div className="field">
          <label>고객 단계</label>
          <div className="chips">
            {STAGES.map((st) => <button key={st.id} type="button" className={'chip' + (form.stage === st.id ? ' on' : '')} onClick={() => set('stage')(st.id)}>{st.label}</button>)}
          </div>
        </div>
        <div className="field">
          <label>마지막 연락일</label>
          <input type="date" className="input" value={form.lastContact} onChange={(e) => set('lastContact')(e.target.value)} />
        </div>
        <div className="field">
          <label>가족 · 건강 · 취미 등 기억할 개인 정보</label>
          <VoiceInput value={form.family} onChange={set('family')} rows={3} placeholder="예: 아들 대학생, 무릎이 안 좋음, 등산 좋아함" />
        </div>
        <div className="field">
          <label>메모</label>
          <VoiceInput value={form.memo} onChange={set('memo')} rows={4} placeholder="첫인상, 고민, 관심 상품 등" />
        </div>
        <button className="btn btn-primary" disabled={!form.name.trim()} onClick={save}>{c ? '저장' : '등록'}</button>
      </div>
    </>
  )
}
