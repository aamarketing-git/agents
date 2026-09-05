import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { Disclosure, TopBar, notify } from '../components/ui'
import AdSlot from '../components/AdSlot'

/* =========================================================
   교육센터 : 건강 · 제품 · AI · 사업 · 리더 교육
   (콘텐츠 화면이라 AdSense 정책상 광고 게재가 가능한 영역)
   ========================================================= */
const CATS = [
  { id: 'health', ico: '💚', title: '건강', lessons: [
    { id: 'h1', t: '고객과 건강 이야기 나누는 법', body: '단정적 효능 표현("낫는다", "치료된다")은 법적 위험이 있습니다. "저는 이렇게 도움을 받았어요"처럼 경험담으로, 의사 상담을 권하는 문장을 덧붙이세요.' },
    { id: 'h2', t: '40~60대 고객이 가장 묻는 건강 질문 5가지', body: '수면 · 관절 · 혈당 · 피로 · 체중. 각 질문에 1분 안에 답할 수 있는 나만의 문장을 미리 준비해 두세요.' },
    { id: 'h3', t: '내 건강이 곧 신뢰', body: '영업인의 활력은 최고의 증거입니다. 하루 20분 걷기, 물 8잔, 밤 11시 취침. 성장 노트에 실천을 기록하세요.' },
  ] },
  { id: 'product', ico: '📦', title: '제품', lessons: [
    { id: 'p1', t: '기능 말고 변화를 말하기', body: '"이 성분이 들어있어요" 대신 "아침에 일어날 때 덜 무거워요". 고객은 성분이 아니라 자기 삶의 변화를 삽니다.' },
    { id: 'p2', t: '제품 설명 30초 · 3분 · 10분 버전', body: '상황에 따라 길이를 조절할 수 있어야 합니다. 30초는 호기심, 3분은 이해, 10분은 결정용입니다. 각각 써 두세요.' },
    { id: 'p3', t: '가격 이의 대응 4단계', body: '인정 → 되묻기 → 기준 바꾸기(월/일 단위) → 작은 시작 제안. AI 코치에서 연습해 보세요.' },
  ] },
  { id: 'ai', ico: '🤖', title: 'AI 활용', lessons: [
    { id: 'a1', t: `내 AI 비서와 대화하는 법`, body: '질문은 구체적으로: "카톡 써 줘" 보다 "지난주 만난 박 원장님께 감사 카톡, 자녀 입시 이야기 언급". 배경을 한 줄 주면 결과가 두 배 좋아집니다.' },
    { id: 'a2', t: '음성 기록 잘하는 요령', body: '조용한 곳에서, 문장 단위로 끊어 말하기. 사람 이름은 또박또박. 끝난 뒤 텍스트를 한 번 훑어 오타를 고치세요.' },
    { id: 'a3', t: 'AI가 쓴 글을 내 글로 만들기', body: 'AI 초안에서 문장 하나를 내 경험으로 바꾸고, 내가 자주 쓰는 말투 한 단어를 넣으세요. 그러면 내 글이 됩니다.' },
  ] },
  { id: 'biz', ico: '📈', title: '사업', lessons: [
    { id: 'b1', t: '팔로업의 과학 : 5~7번의 접촉', body: '평균 계약은 5~7회 접촉 후 이뤄지지만 대부분 1~2회 후 포기합니다. 관심도별 연락 주기(2·3·5·7·14일)를 앱이 자동 계산합니다. 따라가기만 하세요.' },
    { id: 'b2', t: '2-2-2 법칙', body: '계약(구매) 후 2일 · 2주 · 2개월에 연락하세요. 사용 확인 → 습관 형성 → 소개 요청. 이탈이 15~25% 줄어듭니다.' },
    { id: 'b3', t: '만남 전 5분, 만남 후 20분', body: '전: 지난 기록 읽기 + 오늘 목표 한 줄. 후: 20분 안에 기록(기억의 42%가 그 안에 사라집니다). 이 두 습관이 실적을 가릅니다.' },
    { id: 'b4', t: '소개 요청 문장', body: '"주변에 저처럼 ○○ 고민하시는 분 한 분만 떠올려 주실 수 있을까요?" 구체적이고 작게 부탁하세요.' },
  ] },
  { id: 'leader', ico: '🏆', title: '리더', lessons: [
    { id: 'l1', t: '리더 후보를 알아보는 3가지 신호', body: '① 시키지 않아도 기록한다 ② 거절 뒤 다음 날 다시 나온다 ③ 남의 성공을 진심으로 기뻐한다. 리더 대시보드에 후보로 표시해 두세요.' },
    { id: 'l2', t: '팀 미팅 30분 구성', body: '5분 성과 축하 → 10분 한 가지 교육 → 10분 사례 나눔 → 5분 이번 주 약속. 길면 안 옵니다.' },
    { id: 'l3', t: '복제 가능한 시스템 만들기', body: '내가 잘하는 것을 "누구나 따라할 수 있는 순서"로 바꾸세요. 이 앱의 7단계가 바로 그 예시입니다. 팀원에게 같은 앱을 권하세요.' },
  ] },
]

export default function Education() {
  const { state, dispatch } = useStore()
  const nav = useNavigate()
  const done = state.progress.education || {}
  const [cat, setCat] = useState(CATS[0].id)
  const cur = CATS.find((c) => c.id === cat)
  const total = CATS.reduce((n, c) => n + c.lessons.length, 0)
  const doneN = Object.keys(done).length

  return (
    <>
      <TopBar title="교육센터" />
      <div className="page">
        <div className="card soft-green">
          <h3>🎓 배운 것을 바로 쓰는 교육</h3>
          <div className="progress"><div style={{ width: `${(doneN / total) * 100}%` }} /></div>
          <p className="muted">{doneN} / {total} 강의 완료 · 각 강의는 1분이면 읽습니다.</p>
        </div>
        <div className="chips">
          {CATS.map((c) => <button key={c.id} type="button" className={'chip' + (cat === c.id ? ' on-green' : '')} onClick={() => setCat(c.id)}>{c.ico} {c.title}</button>)}
        </div>
        {cur.lessons.map((l) => (
          <Disclosure key={l.id} icon={done[l.id] ? '✅' : cur.ico} title={l.t} done={!!done[l.id]}>
            <p>{l.body}</p>
            {!done[l.id] && <button className="btn btn-green" onClick={() => { dispatch({ type: 'education.done', id: l.id }); notify(`완료! ${doneN + 1} / ${total} 강의`) }}>읽었어요 · 완료</button>}
          </Disclosure>
        ))}
        <button className="btn btn-soft" onClick={() => nav('/library')}>📚 내 자료실 (업종 자료 저장·검색·학습)</button>
        <a className="btn btn-outline" href={import.meta.env.BASE_URL + 'tips/'} target="_blank" rel="noreferrer">📰 영업 노하우 읽기 (공개 페이지)</a>
        <AdSlot slot={import.meta.env.VITE_ADSENSE_SLOT_LIST} />
      </div>
    </>
  )
}
