/* =========================================================
   서버 함수 : AI 코칭 · 콘텐츠 생성 (Vercel / Netlify 호환 형태)
   - 환경변수 ANTHROPIC_API_KEY 필요
   - 요청 : { task, payload, profile }
   - 응답 : { text }
   ========================================================= */
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

const SYSTEM_BASE = (profile) => `당신은 "${profile?.aiName || '비서'}"라는 이름의 개인 AI 비서이자 영업 코치입니다.
주인은 ${profile?.userName || '사용자'}님이고 직종은 ${profile?.professionLabel || '개인 영업'}입니다. 40~60대 사용자입니다.
원칙:
- 한국어, 존댓말, 따뜻하지만 군더더기 없는 말투. 짧은 문단, 어려운 용어 금지.
- 고객관리(연락 시점·관심도·팔로업), 만남 준비·복기, SNS/카톡 콘텐츠, 제품·사업·SNS 질문에 실질적으로 답합니다.
- 항상 "오늘 바로 할 수 있는 행동 1가지"로 마무리합니다.
- 의학적 효능 단정, 과장 광고, 허위 소득 약속은 하지 않으며 필요하면 주의를 덧붙입니다.`

const TASKS = {
  feedback: (p) => `아래는 고객 만남 기록입니다. 잘한 점 1~2개, 아쉬운 점 1~2개, 다음 만남 전략, 24시간 내 할 행동을 알려 주세요. 300자 내외.
고객: ${p.customer?.name} (관심도 ${p.customer?.interest}/5, ${p.count}번째 만남)
이전 기록 요약: ${p.history || '없음'}
오늘 만남 기록: ${p.meeting?.memo}
오늘 결과: ${p.meeting?.result || '미표시'} / 다음 행동: ${p.meeting?.nextAction || '없음'}`,
  prep: (p) => `오늘 이 고객을 만나기 전 준비 코칭을 해 주세요. 열어야 할 첫 질문 1개, 오늘 목표 1개, 주의할 점 1개. 250자 내외.
고객: ${p.customer?.name} (관심도 ${p.customer?.interest}/5, ${p.count}번째 만남, 메모: ${p.customer?.memo || '없음'})
이전 대화: ${p.history || '없음'}`,
  content: (p) => `다음 조건으로 ${p.kind}을(를) 작성해 주세요. 결과물만 출력하세요.
종류: ${p.kind}
주제/목적: ${p.topic}
받는 사람: ${p.audience || '고객'}
톤: ${p.tone || '따뜻하고 신뢰감 있게'}
길이: ${p.length || '적당히'}
포함할 내용: ${p.points || '없음'}`,
  coach: (p) => `질문: ${p.question}\n(제품·사업·SNS·자기관리 관련 질문에 성장 코치로서 답하세요. 300자 내외.)`,
  today: (p) => `오늘 일정과 고객 현황을 보고 오늘의 우선순위 3가지와 한 줄 응원을 써 주세요. 200자 내외.
일정: ${p.events}
연락할 고객: ${p.due}`,
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'no-key' })
  try {
    const { task, payload, profile } = req.body || {}
    const build = TASKS[task]
    if (!build) return res.status(400).json({ error: 'task' })

    const response = await client.beta.messages.create({
      model: 'claude-opus-5',
      max_tokens: 1200,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: [{ type: 'text', text: SYSTEM_BASE(profile), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: build(payload || {}) }],
    })

    if (response.stop_reason === 'refusal') {
      return res.status(200).json({ text: '이 요청에는 답변을 드리기 어렵습니다. 질문을 조금 바꿔서 다시 물어봐 주세요.' })
    }
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
    return res.status(200).json({ text })
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'rate' })
    if (err instanceof Anthropic.AuthenticationError) return res.status(503).json({ error: 'auth' })
    return res.status(500).json({ error: 'server' })
  }
}
