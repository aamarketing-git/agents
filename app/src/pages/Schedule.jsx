import { useState } from 'react'
import { addDays, fmtDate, today, useStore } from '../store'
import { Disclosure, Empty, TopBar, useToast } from '../components/ui'

/* 일정 관리 : 날짜별 일정 추가·삭제, 고객 연결 */
export default function Schedule() {
  const { state, dispatch, eventsOn } = useStore()
  const [date, setDate] = useState(today())
  const [form, setForm] = useState({ title: '', time: '', customerId: '', memo: '' })
  const [toast, show] = useToast()
  const events = eventsOn(date)

  const add = () => {
    if (!form.title.trim() && !form.customerId) return
    const c = state.customers.find((x) => x.id === form.customerId)
    dispatch({ type: 'event.add', data: { ...form, title: form.title.trim() || `${c?.name}님 만남`, date } })
    setForm({ title: '', time: '', customerId: '', memo: '' })
    show('일정을 추가했습니다')
  }

  return (
    <>
      <TopBar title="일정 관리" />
      <div className="page">
        <div className="row">
          <button className="btn btn-outline btn-sm" onClick={() => setDate(addDays(date, -1))}>◀</button>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} style={{ textAlign: 'center' }} />
          <button className="btn btn-outline btn-sm" onClick={() => setDate(addDays(date, 1))}>▶</button>
        </div>
        <div className="row">
          <button className="btn btn-soft btn-sm" onClick={() => setDate(today())}>오늘</button>
          <button className="btn btn-soft btn-sm" onClick={() => setDate(addDays(today(), 1))}>내일</button>
          <button className="btn btn-soft btn-sm" onClick={() => setDate(addDays(today(), 7))}>다음 주</button>
        </div>

        <h3>{fmtDate(date)} 일정 {events.length}개</h3>
        {events.length === 0 && <Empty icon="🗓️" text="이 날 일정이 없습니다." />}
        <div className="list">
          {events.map((e) => (
            <div key={e.id} className="list-item" style={{ cursor: 'default' }}>
              <div className="avatar">{e.time ? e.time.slice(0, 2) : '·'}</div>
              <div className="main">
                <div className="name">{e.title}</div>
                <div className="meta">{e.time || '시간 미정'}{e.memo ? ' · ' + e.memo : ''}</div>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => dispatch({ type: 'event.remove', id: e.id })}>삭제</button>
            </div>
          ))}
        </div>

        <Disclosure icon="➕" title="일정 추가" open>
          <div className="field">
            <label>고객 (선택)</label>
            <select className="select" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
              <option value="">고객 없이 일반 일정</option>
              {state.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>제목</label>
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={form.customerId ? '비우면 "○○님 만남"으로 저장' : '예: 지점 교육, 세미나'} />
          </div>
          <div className="row">
            <div className="field">
              <label>시간</label>
              <input type="time" className="input" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </div>
            <div className="field">
              <label>장소·메모</label>
              <input className="input" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} placeholder="예: 강남역 카페" />
            </div>
          </div>
          <button className="btn btn-primary" onClick={add} disabled={!form.title.trim() && !form.customerId}>이 날에 추가</button>
        </Disclosure>
        {toast}
      </div>
    </>
  )
}
