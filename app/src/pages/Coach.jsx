import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import { askAI } from '../lib/ai'
import { roadmap, weeklyReport } from '../lib/coaching'
import { answerLocally, buildContext } from '../lib/assistant'
import { Disclosure, Section, TopBar, notify } from '../components/ui'
import VoiceInput from '../components/VoiceInput'

/* =========================================================
   AI 코치 : "성장하는 커스텀 AI 주인"을 위한 성장 로드맵 + 제품·사업·SNS 질문
   ========================================================= */
const QUICK = [
  '오늘 연락할 고객 누구야?',
  '내일 관리 대상 알려줘',
  '이번 주 일정과 챙길 사람 정리해줘',
  '연락 오래 안 한 고객은?',
  '결정에 가까운 고객은 누구야?',
  '고객이 가격이 비싸다고 할 때 어떻게 답하죠?',
  '오랫동안 연락 안 한 고객에게 첫 카톡 어떻게 보내죠?',
  'SNS에 매일 뭘 올려야 할지 모르겠어요',
  '소개를 자연스럽게 부탁하는 방법은?',
  '거절당한 뒤 마음 회복하는 법',
  '팀원에게 동기부여하는 말',
]

function localCoach(q, profile) {
  if (/가격|비싸/.test(q)) return '가격 이의는 "가치가 아직 안 보인다"는 뜻입니다.\n\n1) 먼저 인정하세요: "그렇게 느끼실 수 있어요."\n2) 되묻기: "어떤 부분이 부담되세요? 금액인지, 지금 시기인지."\n3) 비교 기준을 바꾸세요: 월 단위 금액이나 하루 커피 한 잔으로.\n4) 작은 시작을 제안: 체험 · 소량 · 1개월.\n\n오늘 할 일: 고객 1명에게 "어떤 점이 가장 고민되세요?"라고 물어보세요.'
  if (/연락|카톡|안부/.test(q)) return '오랜 공백 뒤 첫 연락은 "팔지 않는 메시지"여야 합니다.\n\n"○○님, 문득 생각나서요. 잘 지내시죠?" + 상대 관련 기억 한 줄(자녀, 건강, 취미) + 부담 없는 마무리.\n\n답장이 없어도 정상입니다. 2주 뒤 유용한 정보 하나를 보내세요. 콘텐츠 만들기에서 "안부 카톡"을 눌러 보세요.'
  if (/SNS|올려|게시/.test(q)) return 'SNS는 광고판이 아니라 신뢰 통장입니다. 주 3회, 이 순서로 돌리세요.\n\n월: 나의 일상·배움 (사람 냄새)\n수: 고객에게 도움이 되는 정보 1가지\n금: 제품·사업 이야기 (경험담 형식)\n\n오늘 할 일: 콘텐츠 만들기에서 "SNS 게시글" 하나를 만들어 올리세요.'
  if (/소개/.test(q)) return '소개는 만족한 직후에, 구체적으로 부탁하세요.\n\n"○○님 주변에 저처럼 ○○ 고민하는 분 한 분만 떠올려 주실 수 있을까요?"\n\n"아는 사람 있으면"은 0명, "한 분만"은 1명을 만듭니다. 소개해 주시면 결과를 꼭 알려 드리세요. 그것이 두 번째 소개를 만듭니다.'
  if (/거절|회복|힘들/.test(q)) return '거절은 나에 대한 평가가 아니라 타이밍의 문제입니다. 평균 계약은 5~7번 접촉 뒤에 옵니다.\n\n오늘 할 일: 이번 거절에서 배운 점 한 줄을 적고, 관심도 별점을 한 칸 낮춰 연락 간격을 늘리세요. 그리고 가장 반응이 좋았던 고객에게 안부 카톡을 보내세요. 기분은 행동 뒤에 따라옵니다.'
  if (/팀|동기/.test(q)) return '동기부여는 칭찬보다 "구체적 인정"입니다.\n\n"지난주 ○○님 기록 보니 3번이나 팔로업하셨더라. 그게 프로예요."\n\n숫자보다 행동을 인정하고, 다음 작은 목표를 함께 정하세요. 리더 대시보드에서 팀원의 활동을 기록해 두면 이런 말을 할 재료가 쌓입니다.'
  return `${profile.aiName}의 기본 답변입니다. (AI 서버 연결 시 더 정확한 답을 드립니다)\n\n질문을 세 가지로 나눠 보세요. ① 지금 상황은? ② 원하는 결과는? ③ 방해물은? 이 셋이 정리되면 답의 절반은 나옵니다.\n\n오늘 할 일: 이 질문과 관련된 고객 1명을 정하고 연락 시점을 확인하세요.`
}

export default function Coach() {
  const { state, dispatch } = useStore()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') || '')
  const [a, setA] = useState(null) // { text, customers, actions, source }
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState('')
  const rm = roadmap(state)
  const wk = weeklyReport(state)

  const ask = async (question) => {
    const text = (question || q).trim()
    if (!text) return
    setQ(text)
    setLoading(true)
    const local = answerLocally(text, state)
    const r = await askAI('coach', { question: text, context: buildContext(state) }, state.profile, () => local?.text || localCoach(text, state.profile))
    setA({ text: r.text, source: r.source, customers: local?.customers || [], actions: local?.actions || [], intent: local?.intent })
    setTimeout(() => document.getElementById('answer')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    dispatch({ type: 'coach.asked' })
    setLoading(false)
  }
  useEffect(() => { const init = params.get('q'); if (init) ask(init) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <TopBar title="AI 코치 · 성장 로드맵" back={false} />
      <div className="page">
        <div className="card soft">
          <p className="muted">성장하는 커스텀 AI 주인을 위한</p>
          <h2>일정관리 → 고객관리 → 자기관리 → 성장 → 성공</h2>
          <p>{state.profile.userName}님은 지금 <b>{rm.stages[rm.current].title}</b>에 있습니다.</p>
        </div>

        <button className="btn btn-primary" onClick={() => nav('/assistant')}>💬 {state.profile.aiName}에게 물어보기 · 시키기</button>

        <Section eyebrow="Weekly" title="이번 주 리포트" aside="최근 7일">
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <span className="badge navy">만남 {wk.meetings}</span>
            <span className="badge">연락 {wk.contacts}</span>
            <span className="badge">새 고객 {wk.newCustomers}</span>
            <span className="badge green">계약 {wk.closed}</span>
            <span className="badge amber">콘텐츠 {wk.contents}</span>
            <span className="badge">노트 {wk.notes}</span>
          </div>
          <div className="ai-bubble green">{wk.comment}</div>
        </Section>

        <Section eyebrow="Roadmap" title="나의 성장 로드맵" aside={`${rm.current + 1} / 5`}>
        <Disclosure icon="🗺️" title="단계별 진행 보기" open>
          <div className="roadmap">
            {rm.stages.map((s, i) => (
              <div key={s.key} className="node">
                <div className="rail">
                  <div className={'dot' + (i < rm.current ? ' done' : i === rm.current ? ' now' : '')} />
                  {i < rm.stages.length - 1 && <div className="bar" />}
                </div>
                <div className="txt grow">
                  <b>{s.title}</b>
                  <span className="small muted">{s.desc}</span>
                  {s.goal > 1 && (
                    <div className="progress mt"><div style={{ width: `${Math.min(100, (s.value / s.goal) * 100)}%` }} /></div>
                  )}
                  {s.goal > 1 && <span className="small muted">{Math.min(s.value, s.goal)} / {s.goal} {s.unit}</span>}
                </div>
              </div>
            ))}
          </div>
        </Disclosure>
        </Section>


        <Section eyebrow="Notes" title="성장 노트" aside={`${state.notes.length}개`}>
        <Disclosure icon="📓" title="오늘 배운 점 남기기">
          <p className="muted small">오늘 배운 점, 감사한 일, 내일 할 한 가지. 짧게 남기세요.</p>
          <VoiceInput value={note} onChange={setNote} rows={3} placeholder="예: 오늘 박 원장님과 대화에서 경청의 힘을 느꼈다" />
          <button className="btn btn-soft" disabled={!note.trim()} onClick={() => { dispatch({ type: 'note.add', data: { text: note.trim() } }); setNote(''); notify('성장 노트를 저장했습니다') }}>노트 저장</button>
          {state.notes.slice(0, 5).map((n) => <div key={n.id} className="card ivory" style={{ padding: 12 }}><p className="small muted">{n.date}</p><p>{n.text}</p></div>)}
        </Disclosure>
        </Section>

        <div className="row">
          <button className="btn btn-outline" onClick={() => nav('/education')}>🎓 교육센터</button>
          <button className="btn btn-outline" onClick={() => nav('/leader')}>🏆 리더 대시보드</button>
        </div>
      </div>
    </>
  )
}
