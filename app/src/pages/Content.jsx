import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import { askAI } from '../lib/ai'
import { Disclosure, TopBar, useToast } from '../components/ui'
import VoiceInput from '../components/VoiceInput'
import AdSlot from '../components/AdSlot'

/* =========================================================
   콘텐츠 생성 : SNS 게시글 / 카톡 메시지 / 교육자료
   ========================================================= */
const KINDS = {
  'SNS 게시글': { ico: '📱', hint: '오늘의 일상 + 제품·사업 이야기를 자연스럽게', len: '5~8줄, 해시태그 5개' },
  '안부 카톡': { ico: '💬', hint: '오랫동안 연락 못 한 분께 부담 없이', len: '3~4줄' },
  '감사 카톡': { ico: '🙏', hint: '만남 후 24시간 안에 보내는 감사 인사', len: '3~4줄' },
  '정보 제공 메시지': { ico: '📰', hint: '건강·제품·생활 정보를 도움이 되게', len: '5~6줄' },
  '모임 초대': { ico: '🎉', hint: '세미나·설명회·소모임 초대', len: '5~6줄' },
  '교육자료 개요': { ico: '📚', hint: '팀·고객 대상 짧은 교육 자료 뼈대', len: '제목 + 5개 소제목 + 핵심 문장' },
}
const TONES = ['따뜻하고 신뢰감 있게', '밝고 에너지 있게', '차분하고 전문적으로', '친구처럼 편하게']

function localContent({ kind, topic, audience, tone, points, profile }) {
  const who = audience || '고객님'
  const me = profile.userName
  switch (kind) {
    case 'SNS 게시글':
      return `오늘도 ${topic || '좋은 분들'}과 함께한 하루였습니다.\n\n${points || '작은 습관 하나가 삶을 바꾼다는 걸 다시 느꼈어요.'}\n\n궁금한 점은 편하게 메시지 주세요. 함께 알아가요 😊\n\n#일상 #건강한하루 #${(topic || '성장').replace(/\s/g, '')} #소통 #감사`
    case '안부 카톡':
      return `${who}, 안녕하세요. ${me}입니다.\n요즘 날씨가 많이 바뀌었는데 건강히 잘 지내시죠?\n${points || '문득 생각이 나서 안부 전해 드려요.'}\n시간 되실 때 차 한잔 하면 좋겠습니다 😊`
    case '감사 카톡':
      return `${who}, 오늘 시간 내주셔서 정말 감사했습니다.\n${points || '말씀 나누면서 많이 배웠어요.'}\n${topic ? `말씀하신 ${topic}은 정리해서 곧 보내 드릴게요.` : '다음에 또 편하게 이야기 나누고 싶습니다.'}\n편안한 저녁 보내세요. ${me} 드림`
    case '정보 제공 메시지':
      return `${who}, 도움이 될 것 같아 공유드려요.\n\n[${topic || '오늘의 정보'}]\n${points || '• 핵심 내용 1\n• 핵심 내용 2\n• 핵심 내용 3'}\n\n궁금한 점 있으시면 편하게 물어보세요 😊 ${me}`
    case '모임 초대':
      return `${who}, 안녕하세요 ${me}입니다.\n${topic || '작은 모임'}에 초대드리고 싶어요.\n${points || '일시 · 장소 · 내용을 여기에'}\n부담 없이 오셔서 차 한잔 하시면 좋겠습니다. 참석 가능하시면 답장 부탁드려요 😊`
    case '교육자료 개요':
      return `제목: ${topic || '교육 주제'}\n\n1. 왜 지금 이 주제인가\n2. 핵심 개념 3가지\n3. 실제 사례 · 이야기\n4. 오늘 바로 해볼 것 1가지\n5. 질문과 나눔\n\n핵심 문장: "${points || '아는 것보다 하는 것이 성장을 만듭니다.'}"`
    default:
      return topic
  }
}

export default function Content() {
  const { state, dispatch } = useStore()
  const [params] = useSearchParams()
  const [kind, setKind] = useState(params.get('kind') && KINDS[params.get('kind')] ? params.get('kind') : 'SNS 게시글')
  const [audience, setAudience] = useState(params.get('to') || '')
  const [topic, setTopic] = useState('')
  const matched = state.customers.find((c) => c.name === (params.get('to') || ''))
  const lastMemo = matched ? state.meetings.filter((m) => m.customerId === matched.id && m.done).sort((a, b) => (a.date < b.date ? 1 : -1))[0] : null
  const [points, setPoints] = useState(matched ? [matched.family && `기억할 것: ${matched.family}`, lastMemo?.memo && `최근 대화: ${lastMemo.memo.slice(0, 60)}`, lastMemo?.nextAction && `약속: ${lastMemo.nextAction}`].filter(Boolean).join('\n') : '')
  const [tone, setTone] = useState(TONES[0])
  const [out, setOut] = useState('')
  const [source, setSource] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, show] = useToast()

  const generate = async () => {
    setLoading(true)
    const payload = { kind, topic, audience, tone, points, length: KINDS[kind].len }
    const r = await askAI('content', payload, state.profile, () => localContent({ ...payload, profile: state.profile }))
    setOut(r.text)
    setSource(r.source)
    dispatch({ type: 'content.add', data: { kind, topic, text: r.text } })
    setLoading(false)
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(out); show('복사했습니다. 카톡·SNS에 붙여 넣으세요') } catch { show('길게 눌러 복사해 주세요') }
  }
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ text: out }) } catch { /* 취소 */ } } else copy()
  }

  return (
    <>
      <TopBar title="콘텐츠 만들기" back={false} />
      <div className="page">
        <div className="field">
          <label>무엇을 만들까요?</label>
          <div className="chips">
            {Object.entries(KINDS).map(([k, v]) => (
              <button key={k} type="button" className={'chip' + (kind === k ? ' on' : '')} onClick={() => { setKind(k); setOut('') }}>{v.ico} {k}</button>
            ))}
          </div>
          <p className="small muted">{KINDS[kind].hint}</p>
        </div>

        {matched && <div className="card soft-green" style={{ padding: 12 }}><p className="small"><b>{matched.name}님 정보를 연결했습니다.</b> 가족·최근 대화·약속을 "꼭 넣을 내용"에 미리 채웠어요. 필요 없는 줄은 지우세요.</p></div>}
        <div className="field">
          <label>받는 사람 (선택)</label>
          <input className="input" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="예: 박미영 원장님, 우리 팀, 팔로워" />
        </div>
        <div className="field">
          <label>주제 · 목적</label>
          <VoiceInput value={topic} onChange={setTopic} rows={2} placeholder="예: 환절기 건강관리, 지난 만남 감사, 이번 주 세미나" />
        </div>
        <Disclosure icon="🎛️" title="말투 · 꼭 넣을 내용 (선택)">
          <div className="chips">
            {TONES.map((t) => <button key={t} type="button" className={'chip' + (tone === t ? ' on-green' : '')} onClick={() => setTone(t)}>{t}</button>)}
          </div>
          <VoiceInput value={points} onChange={setPoints} rows={3} placeholder="예: 다음 주 화요일 자료 보내기로 약속함" />
        </Disclosure>

        <button className="btn btn-primary" onClick={generate} disabled={loading}>{loading ? `${state.profile.aiName}가 쓰는 중…` : `✍️ ${state.profile.aiName}에게 써 달라고 하기`}</button>

        {out && (
          <div className="card">
            <div className="card-title"><h3>{KINDS[kind].ico} {kind}</h3>{source === 'local' && <span className="badge">기본 템플릿</span>}</div>
            <textarea className="textarea" rows={8} value={out} onChange={(e) => setOut(e.target.value)} />
            <div className="row">
              <button className="btn btn-green" onClick={copy}>📋 복사</button>
              <button className="btn btn-soft-green" onClick={share}>📤 공유 (카톡)</button>
            </div>
            <button className="btn btn-ghost" onClick={generate}>다시 쓰기</button>
          </div>
        )}

        {state.contents.length > 0 && (
          <Disclosure icon="🕘" title={`최근 만든 글 ${state.contents.length}개`}>
            {state.contents.slice(0, 5).map((c) => (
              <button key={c.id} className="card ivory" style={{ textAlign: 'left', border: 'none', cursor: 'pointer', padding: 12 }} onClick={() => { setKind(c.kind); setOut(c.text) }}>
                <p className="small muted">{c.date} · {c.kind}</p>
                <p className="small">{c.text.slice(0, 60)}…</p>
              </button>
            ))}
          </Disclosure>
        )}
        <AdSlot slot={import.meta.env.VITE_ADSENSE_SLOT_LIST} />
        {toast}
      </div>
    </>
  )
}
