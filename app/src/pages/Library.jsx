import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fmtDate, today, uid, useStore } from '../store'
import { LIB_CATEGORIES, aiExtract, catIco, catLabel, customerText, fmtSize, loadFileBlob, removeFile, searchLibrary, storeFile, todayStudyItem } from '../lib/library'
import { downloadBlob, kakaoSendText, shareImage, shareText } from '../lib/share'
import { Disclosure, Empty, Section, TopBar, notify } from '../components/ui'
import VoiceInput from '../components/VoiceInput'

/* =========================================================
   자료실 : 업종 자료 저장 · 검색 · AI 정리 · 학습 · 고객 전달
   ========================================================= */
export default function Library() {
  const { state, dispatch, auth } = useStore()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const items = state.library || []
  const [q, setQ] = useState(params.get('q') || '')
  const [cat, setCat] = useState('')
  const [openId, setOpenId] = useState(params.get('id') || '')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ type: 'note', title: '', content: '', url: '', category: 'product', tags: '' })
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState('')
  const [preview, setPreview] = useState(null)
  const fileRef = useRef(null)
  const list = searchLibrary(items, q, { category: cat })
  const study = todayStudyItem(items)
  const open = items.find((i) => i.id === openId)
  const aiOn = auth.health?.ai

  useEffect(() => { setPreview(null); if (open?.type === 'file' && /^image\//.test(open.mime || '')) loadFileBlob(open).then((b) => b && setPreview(URL.createObjectURL(b))).catch(() => {}) }, [openId]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!form.title.trim() && !file && !form.url.trim()) return notify('제목, 링크, 파일 중 하나는 필요합니다')
    setBusy('save')
    const id = uid()
    const item = { id, type: form.type, title: form.title.trim() || file?.name || form.url.trim(), content: form.content.trim(), url: form.url.trim(), category: form.category, tags: form.tags.split(/[,#\s]+/).filter(Boolean), summary: '', keyPoints: [] }
    try {
      if (form.type === 'file' && file) {
        const r = await storeFile(id, file)
        Object.assign(item, { where: r.where, url: r.url, fileName: file.name, mime: file.type, size: file.size })
      }
      dispatch({ type: 'library.add', data: item })
      notify(item.where === 'local' ? '이 기기에 저장했습니다 (서버 파일 저장소 미연결)' : '자료를 저장했습니다')
      setAdding(false); setForm({ type: 'note', title: '', content: '', url: '', category: 'product', tags: '' }); setFile(null)
      if (aiOn && (form.type !== 'note' || item.content.length > 200)) runExtract(item, file)
      else setOpenId(id)
    } catch (e) { notify(e.message || '저장에 실패했습니다') }
    setBusy('')
  }

  const runExtract = async (item, f) => {
    setBusy('ai:' + item.id)
    try {
      const r = await aiExtract({ item, file: f })
      if (r) {
        dispatch({ type: 'library.update', id: item.id, data: { title: item.title || r.title, summary: r.summary, keyPoints: r.keyPoints, tags: [...new Set([...(item.tags || []), ...(r.tags || [])])], category: item.category === 'other' ? r.category : item.category, customerMessage: r.customerMessage, studyQuestion: r.studyQuestion, aiAt: new Date().toISOString() } })
        notify('AI가 요약·핵심·태그를 정리했습니다')
      } else notify('AI 정리를 사용할 수 없습니다 (서버 미연결 또는 지원하지 않는 형식)')
    } catch (e) { notify(e.message) }
    setBusy(''); setOpenId(item.id)
  }

  const sendToCustomer = async (item, customer) => {
    const text = customerText(item, state.profile.userName)
    let r
    if (item.type === 'file') { const b = await loadFileBlob(item); r = b ? await shareImage(b, item.fileName || 'file', text) : await shareText(text) }
    else r = await kakaoSendText(text)
    dispatch({ type: 'library.update', id: item.id, data: { useCount: (item.useCount || 0) + 1, lastSent: today() } })
    if (customer) dispatch({ type: 'meeting.add', data: { customerId: customer.id, date: today(), done: true, step: 7, memo: `[자료] "${item.title}" 전달`, result: 'neutral' } })
    notify(customer ? `${customer.name}님께 전달 기록을 남겼습니다` : r === 'copied' ? '복사했습니다. 카톡에 붙여 넣으세요' : '공유 창을 열었습니다')
  }

  const remove = async (item) => {
    if (!window.confirm(`"${item.title}" 자료를 삭제할까요?`)) return
    if (item.type === 'file') await removeFile(item)
    dispatch({ type: 'library.remove', id: item.id }); setOpenId(''); notify('삭제했습니다')
  }

  return (
    <>
      <TopBar title={`자료실 · ${items.length}개`} right={<button className="btn btn-green btn-sm" onClick={() => { setAdding(true); setOpenId('') }}>＋ 자료 추가</button>} />
      <div className="page">
        {!adding && !open && study && (
          <Section eyebrow="Study" title="오늘 복습할 자료">
            <button className="card soft-green" style={{ textAlign: 'left', border: 'none', cursor: 'pointer' }} onClick={() => setOpenId(study.id)}>
              <b>{catIco(study.category)} {study.title}</b>
              <p className="small">{study.studyQuestion ? `Q. ${study.studyQuestion}` : study.summary || (study.content || '').slice(0, 100) || '눌러서 내용 보기'}</p>
              <p className="small muted">{study.lastStudied ? `마지막 복습 ${fmtDate(study.lastStudied)}` : '아직 복습 안 함'} · 누르면 열립니다</p>
            </button>
          </Section>
        )}

        {adding && (
          <Section eyebrow="Add" title="자료 추가">
            <div className="chips">
              {[['note', '📝 메모·글'], ['link', '🔗 링크'], ['file', '📎 파일(PDF·이미지)']].map(([k, l]) => <button key={k} type="button" className={'chip' + (form.type === k ? ' on' : '')} onClick={() => setForm({ ...form, type: k })}>{l}</button>)}
            </div>
            <div className="field"><label>제목</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="예: 오메가3 제품 설명서, 환절기 건강 정보" /></div>
            {form.type === 'link' && <div className="field"><label>링크 주소</label><input className="input" type="url" inputMode="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" /></div>}
            {form.type === 'file' && (
              <div className="field">
                <label>파일 (4MB 이하 · PDF, 이미지, 문서)</label>
                <input ref={fileRef} type="file" accept=".pdf,image/*,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.hwp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); if (!form.title) setForm((x) => ({ ...x, title: f.name.replace(/\.[^.]+$/, '') })) } }} />
                <button className="btn btn-outline" onClick={() => fileRef.current?.click()}>{file ? `📎 ${file.name} (${fmtSize(file.size)})` : '파일 선택 · 사진 촬영'}</button>
              </div>
            )}
            <div className="field"><label>{form.type === 'note' ? '내용 (말로 해도 됩니다)' : '메모 (선택)'}</label><VoiceInput value={form.content} onChange={(v) => setForm({ ...form, content: v })} rows={form.type === 'note' ? 6 : 3} placeholder={form.type === 'note' ? '자료 내용을 붙여 넣거나 말로 남기세요' : '이 자료를 어디에 쓰는지, 누구에게 좋은지'} /></div>
            <div className="field"><label>분류</label><div className="chips">{LIB_CATEGORIES.map((c) => <button key={c.id} type="button" className={'chip' + (form.category === c.id ? ' on-green' : '')} onClick={() => setForm({ ...form, category: c.id })}>{c.ico} {c.label}</button>)}</div></div>
            <div className="field"><label>태그 (쉼표로 구분)</label><input className="input" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="예: 오메가3, 혈행, 50대" /></div>
            {aiOn && <p className="small muted">저장하면 AI가 요약·핵심 포인트·태그·고객 전달 문장을 자동으로 만듭니다.</p>}
            <div className="row">
              <button className="btn btn-outline" onClick={() => { setAdding(false); setFile(null) }}>취소</button>
              <button className="btn btn-primary" onClick={save} disabled={!!busy}>{busy === 'save' ? '저장 중…' : '저장'}</button>
            </div>
          </Section>
        )}

        {open && !adding && (
          <Section eyebrow={catLabel(open.category)} title={open.title} aside={fmtDate(open.createdAt)}>
            {busy === 'ai:' + open.id && <div className="ai-bubble">AI가 자료를 읽고 정리하는 중…</div>}
            {preview && <img src={preview} alt={open.title} style={{ width: '100%', borderRadius: 6 }} />}
            {open.type === 'link' && open.url && <a className="btn btn-outline" href={open.url} target="_blank" rel="noreferrer">🔗 링크 열기</a>}
            {open.type === 'file' && <button className="btn btn-outline" onClick={async () => { const b = await loadFileBlob(open); if (b) { if (open.where === 'cloud') window.open(open.url, '_blank'); else downloadBlob(b, open.fileName || 'file') } else notify('파일을 찾을 수 없습니다') }}>📎 {open.fileName || '파일'} {open.size ? `(${fmtSize(open.size)})` : ''} {open.where === 'local' ? '· 이 기기' : ''}</button>}
            {open.summary && <div className="card soft-green" style={{ padding: 12 }}><b>요약</b><p>{open.summary}</p></div>}
            {open.keyPoints?.length > 0 && <div className="card ivory" style={{ padding: 12 }}><b>핵심 포인트</b><ul style={{ margin: 0, paddingLeft: 20 }}>{open.keyPoints.map((k, i) => <li key={i}>{k}</li>)}</ul></div>}
            {open.content && <div className="card" style={{ padding: 12, whiteSpace: 'pre-wrap' }}>{open.content}</div>}
            {open.tags?.length > 0 && <div className="chips">{open.tags.map((t) => <button key={t} type="button" className="chip" onClick={() => { setQ(t); setOpenId('') }}>#{t}</button>)}</div>}

            <div className="divider" />
            <Section eyebrow="Study" title="학습">
              {open.studyQuestion && <p><b>Q.</b> {open.studyQuestion}</p>}
              <button className="btn btn-soft-green" onClick={() => { dispatch({ type: 'library.update', id: open.id, data: { lastStudied: today(), studyCount: (open.studyCount || 0) + 1 } }); dispatch({ type: 'note.add', data: { text: `자료 복습: ${open.title}` } }); notify('복습 완료! 성장 노트에 기록했습니다') }}>✅ 오늘 복습했어요 {open.studyCount ? `(${open.studyCount}회)` : ''}</button>
              {aiOn && <button className="btn btn-outline" onClick={() => runExtract(open)} disabled={!!busy}>✨ AI 다시 정리</button>}
            </Section>
            <Section eyebrow="Send" title="고객에게 전달" aside={open.useCount ? `${open.useCount}회 전달` : ''}>
              {open.customerMessage && <div className="ai-bubble small">{open.customerMessage}</div>}
              <div className="field">
                <label>누구에게 보낼까요? (기록 남김)</label>
                <select className="select" defaultValue="" onChange={(e) => { const c = state.customers.find((x) => x.id === e.target.value); if (c) sendToCustomer(open, c); e.target.value = '' }}>
                  <option value="">고객 선택 후 바로 공유 창 열기</option>
                  {state.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="row">
                <button className="btn btn-green" onClick={() => sendToCustomer(open, null)}>💛 카톡으로 보내기</button>
                <button className="btn btn-soft" onClick={() => nav(`/content?kind=${encodeURIComponent('정보 제공 메시지')}&topic=${encodeURIComponent(open.title)}&points=${encodeURIComponent(open.summary || open.content || '')}`)}>✍️ 메시지 다듬기</button>
              </div>
            </Section>
            <div className="row">
              <button className="btn btn-ghost" onClick={() => setOpenId('')}>← 목록</button>
              <button className="btn btn-danger btn-sm" onClick={() => remove(open)}>삭제</button>
            </div>
          </Section>
        )}

        {!open && !adding && (
          <Section eyebrow="Library" title="내 자료" aside={`${list.length}개`}>
            <input className="input" placeholder="제목 · 내용 · 태그 검색" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="chips">
              <button type="button" className={'chip' + (!cat ? ' on' : '')} onClick={() => setCat('')}>전체</button>
              {LIB_CATEGORIES.map((c) => <button key={c.id} type="button" className={'chip' + (cat === c.id ? ' on' : '')} onClick={() => setCat(c.id)}>{c.ico} {c.label} {items.filter((i) => i.category === c.id).length || ''}</button>)}
            </div>
            {items.length === 0 && <Empty icon="📚" text="아직 자료가 없습니다. 제품 설명서, 건강 정보, 성공 사례, 교육 자료를 넣어 두면 검색하고 고객에게 바로 보낼 수 있어요." action={<button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>첫 자료 추가</button>} />}
            {items.length > 0 && list.length === 0 && <Empty icon="🔍" text="검색 결과가 없습니다." />}
            <div className="list">
              {list.map((i) => (
                <button key={i.id} className="list-item" onClick={() => setOpenId(i.id)}>
                  <div className="avatar">{i.type === 'file' ? '📎' : i.type === 'link' ? '🔗' : catIco(i.category)}</div>
                  <div className="main">
                    <div className="name">{i.title}</div>
                    <div className="meta">{catLabel(i.category)} · {i.summary ? i.summary.slice(0, 40) + '…' : (i.content || i.url || '').slice(0, 40)}{i.tags?.length ? ` · #${i.tags.slice(0, 2).join(' #')}` : ''}</div>
                  </div>
                  {i.useCount > 0 && <span className="badge green">{i.useCount}회 전달</span>}
                </button>
              ))}
            </div>
          </Section>
        )}

        {!open && !adding && (
          <Disclosure icon="💡" title="자료실 활용법">
            <p className="small">· 회사 제품 설명서, 성분표, 가격표를 PDF로 올려 두고 "오메가3 자료 찾아줘"라고 비서에게 말하세요.<br />· 고객에게 보낼 건강 정보·성공 사례는 "고객용"으로 분류해 두면 만남 후 바로 보낼 수 있어요.<br />· 오늘 복습할 자료를 매일 하나씩 읽으면 성장 로드맵 4단계가 채워집니다.<br />· AI 정리가 켜져 있으면 링크·PDF·사진도 요약해 검색과 답변에 씁니다.</p>
          </Disclosure>
        )}
      </div>
    </>
  )
}
