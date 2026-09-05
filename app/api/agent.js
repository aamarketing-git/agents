/* =========================================================
   2단계 에이전트 서버 함수 : Claude가 앱 기능을 "도구"로 호출
   - 데이터는 브라우저(기기)에 있으므로, 도구 실행은 클라이언트가 담당
   - 이 함수는 한 턴만 처리: 메시지 → 모델 → (텍스트 | 도구 호출 요청) 반환
   - 클라이언트가 도구를 실행(쓰기 도구는 확인 카드) 후 tool_result 를 붙여 다시 호출
   ========================================================= */
import Anthropic from '@anthropic-ai/sdk'
import { authEnabled, checkUsage, getUser } from './_lib/auth.js'
import { json, todayKST } from './_lib/http.js'

const client = new Anthropic()

const TOOLS = [
  {
    name: 'find_customers',
    description: '고객을 찾는다. 이름 일부로 검색하거나 filter 로 오늘/내일 연락 대상, 연락 시점 지난 고객, 관심 높은 고객, 계약 고객, 기념일 임박 고객을 조회한다. 결과에는 이름·단계·관심도·마지막 연락·다음 연락·기념일·기억할 것·최근 기록이 포함된다.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '이름 검색어. 없으면 빈 문자열' },
        filter: { type: 'string', enum: ['all', 'due_today', 'due_tomorrow', 'due_week', 'overdue', 'hot', 'closed', 'anniversary'], description: '조회 조건' },
      },
      required: ['query', 'filter'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_library',
    description: '주인이 저장한 업종 자료실(메모·링크·파일 요약)을 검색한다. 제품·건강·사업 질문이나 "자료 찾아줘", "고객에게 보낼 자료"에 사용. 결과에는 제목·요약·핵심 포인트·태그·고객 전달 문장·링크가 포함된다.',
    strict: true,
    input_schema: { type: 'object', properties: { query: { type: 'string', description: '검색어 (여러 단어 가능)' }, category: { type: 'string', enum: ['', 'product', 'health', 'business', 'customer', 'education', 'other'] } }, required: ['query', 'category'], additionalProperties: false },
  },
  {
    name: 'get_schedule',
    description: '기간 내 일정을 조회한다 (날짜 YYYY-MM-DD).',
    strict: true,
    input_schema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'], additionalProperties: false },
  },
  {
    name: 'add_customer',
    description: '새 고객을 등록한다. 사용자가 확인한 뒤 실행된다.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' }, phone: { type: 'string' }, interest: { type: 'integer', minimum: 1, maximum: 5 },
        memo: { type: 'string' }, family: { type: 'string', description: '가족·건강·취미 등 기억할 개인 정보' }, birthday: { type: 'string', description: '예: 3월 12일' },
      },
      required: ['name', 'phone', 'interest', 'memo', 'family', 'birthday'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_event',
    description: '일정을 추가한다. 고객 이름을 주면 그 고객과 연결된다. 사용자가 확인한 뒤 실행된다.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { date: { type: 'string', description: 'YYYY-MM-DD' }, time: { type: 'string', description: 'HH:MM, 모르면 빈 문자열' }, title: { type: 'string' }, customer_name: { type: 'string', description: '없으면 빈 문자열' }, memo: { type: 'string' } },
      required: ['date', 'time', 'title', 'customer_name', 'memo'],
      additionalProperties: false,
    },
  },
  {
    name: 'log_contact',
    description: '고객과의 전화·카톡·만남을 기록하고 마지막 연락일과 다음 연락 권장일을 갱신한다. 사용자가 확인한 뒤 실행된다.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        customer_name: { type: 'string' }, channel: { type: 'string', enum: ['전화', '카톡', '만남'] }, note: { type: 'string' },
        result: { type: 'string', enum: ['positive', 'neutral', 'negative'] }, interest: { type: 'integer', minimum: 0, maximum: 5, description: '바뀐 관심도, 유지면 0' },
      },
      required: ['customer_name', 'channel', 'note', 'result', 'interest'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_customer',
    description: '고객의 단계·관심도를 바꾸거나 메모/기억할 것을 덧붙인다. 단계를 closed(계약)로 바꾸면 2일·2주·2개월 연락 일정이 자동 생성된다. 사용자가 확인한 뒤 실행된다.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        customer_name: { type: 'string' },
        stage: { type: 'string', enum: ['', 'new', 'rapport', 'proposal', 'decision', 'closed', 'referral'], description: '유지면 빈 문자열' },
        interest: { type: 'integer', minimum: 0, maximum: 5, description: '유지면 0' },
        memo_append: { type: 'string' }, family_append: { type: 'string' },
      },
      required: ['customer_name', 'stage', 'interest', 'memo_append', 'family_append'],
      additionalProperties: false,
    },
  },
]

const SYSTEM = (profile, context) => `당신은 "${profile?.aiName || '비서'}"라는 이름의 개인 AI 비서이자 영업 코치입니다. 주인은 ${profile?.userName || '사용자'}님(${profile?.professionLabel || '개인 영업'}, 40~60대)입니다.

역할: 주인의 지시를 이해해 고객·일정·기록을 직접 관리하고, 질문에는 실제 데이터로 답하며, 필요하면 카톡·SNS 글을 써 줍니다.
원칙:
- 한국어 존댓말, 짧고 따뜻하게. 한 번에 한 가지를 분명히.
- 고객·일정·관리 대상 질문은 반드시 도구로 조회해 실제 이름·날짜로 답합니다. 없는 사실은 만들지 않습니다.
- 등록·일정·기록·변경 같은 쓰기 도구는 사용자가 확인 카드로 승인한 뒤 실행됩니다. 호출 전에 무엇을 할지 한 줄로 말하세요. 사용자가 취소하면 존중하고 대안을 묻습니다.
- 날짜는 오늘(${context?.today})을 기준으로 계산합니다. "다음 주 화요일"처럼 상대 표현은 정확한 날짜로 바꿔서 도구에 넘깁니다.
- 제품·건강·사업 지식 질문이나 고객에게 줄 자료 요청은 먼저 search_library 로 주인의 자료를 찾아 근거로 답하고, 없으면 일반 지식으로 답하되 그 사실을 밝힙니다.
- 메시지·글을 써 달라고 하면 도구 없이 바로 본문을 써 줍니다. 상품 효능 단정·과장·허위 소득 약속은 하지 않습니다.
- 답 끝에는 가능하면 "오늘 바로 할 행동 1가지"를 붙입니다.

현재 데이터 요약:
${context?.summary || '(없음)'}`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'no-key' })
  const user = await getUser(req)
  if (authEnabled && !user) return json(res, 401, { error: 'login' })
  const usage = await checkUsage(user, todayKST())
  if (!usage.ok) return json(res, 429, { error: 'limit', used: usage.used, limit: usage.limit })
  try {
    const { messages, profile, context } = req.body || {}
    if (!Array.isArray(messages) || messages.length === 0) return res.status(400).json({ error: 'messages' })

    const response = await client.beta.messages.create({
      model: 'claude-opus-5',
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: [{ type: 'text', text: SYSTEM(profile, context), cache_control: { type: 'ephemeral' } }],
      tools: TOOLS,
      messages,
    })

    if (response.stop_reason === 'refusal') {
      return res.status(200).json({ stop_reason: 'end_turn', content: [{ type: 'text', text: '이 요청에는 답변을 드리기 어렵습니다. 다르게 말씀해 주시겠어요?' }] })
    }
    return res.status(200).json({ stop_reason: response.stop_reason, content: response.content })
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'rate' })
    if (err instanceof Anthropic.AuthenticationError) return res.status(503).json({ error: 'auth' })
    return res.status(500).json({ error: 'server' })
  }
}
