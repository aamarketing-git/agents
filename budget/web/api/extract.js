// 찰칵 가계부 — 영수증·캡처·주문 글 읽기 서버 함수 (Vercel Node 함수)
// POST /api/extract  {image?: {data: base64, mime}, text?: string, today: 'YYYY-MM-DD', rules?: [...]}
//   → 200 {ext: {...}}  |  4xx/5xx {error: code}
// 환경 변수: ANTHROPIC_API_KEY (필수), APP_PASSCODE (권장: 정하면 앱에서 같은 값을 넣어야 씀)
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5-5';
const EXPENSE_CATS = ['고정비', '식비', '생활·쇼핑', '육아·교육', '교통', '건강', '경조사', '사업경비', '기타'];
const INCOME_CATS = ['사업소득', '근로소득', '기타수입'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE_B64 = 7_000_000; // 약 5MB 이미지
const MAX_TEXT = 20_000;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_transaction', 'type', 'date', 'time', 'merchant', 'payment_method', 'total', 'items', 'business_likely'],
  properties: {
    is_transaction: { type: 'boolean', description: '결제·입금 내역이 맞으면 true' },
    type: { type: 'string', enum: ['지출', '수입'] },
    date: { type: 'string', description: 'YYYY-MM-DD, 알 수 없으면 빈 문자열' },
    time: { type: 'string', description: 'HH:mm (24시간), 알 수 없으면 빈 문자열' },
    merchant: { type: 'string', description: '가게·판매처·보낸 사람 이름' },
    payment_method: { type: 'string', description: '카드사·결제수단, 모르면 빈 문자열' },
    total: { type: 'integer', description: '실제로 결제한 최종 금액(원)' },
    business_likely: { type: 'boolean', description: '프리랜서 일에 쓴 것으로 보이면 true' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'amount', 'category', 'sub'],
        properties: {
          name: { type: 'string' },
          amount: { type: 'integer' },
          category: { type: 'string', enum: [...EXPENSE_CATS, ...INCOME_CATS] },
          sub: { type: 'string', description: '소분류. 예: 장보기, 배달, 카페, 육아, 구독' }
        }
      }
    }
  }
};

function systemPrompt(today, rules) {
  const ruleText = rules.map((r) => `- "${r.keyword}" → ${r.cat}${r.sub ? '/' + r.sub : ''}${r.biz ? ` (${r.biz})` : ''}`).join('\n');
  return [
    '당신은 한국 가계부 앱의 영수증·결제내역 읽기 담당입니다. 프리랜서와 일하는 주부가 올린 영수증 사진, 쇼핑앱 주문내역 캡처, 붙여 넣은 주문확인 메일에서 결제 정보를 정확히 뽑아 JSON으로 돌려줍니다.',
    `오늘 날짜는 ${today} 입니다. 연도가 안 보이면 오늘에 가장 가까운 과거 날짜로 판단하세요.`,
    '',
    '규칙:',
    '- total은 실제로 결제된 최종 금액입니다. 할인·쿠폰·포인트 사용 후 금액, 배송비 포함.',
    '- items의 amount 합이 total과 같도록 나누세요. 할인을 품목에 나누기 어려우면 그대로 두세요(앱이 차액을 조정합니다).',
    '- 한 결제에 성격이 다른 물건이 섞여 있으면 품목마다 category를 따로 정하세요. 예: 기저귀는 육아·교육, 과자는 식비, 세제는 생활·쇼핑.',
    '- 지출 대분류: 고정비(월세·관리비·통신·보험·구독), 식비(장보기·외식·카페·배달·편의점), 생활·쇼핑, 육아·교육, 교통, 건강, 경조사, 사업경비(일에 쓴 비용), 기타.',
    '- 수입 대분류: 사업소득(거래처 입금·원고료·용역비), 근로소득(급여), 기타수입(환급·이자·중고판매).',
    '- 결제·입금 내역이 아니면 is_transaction을 false로 하고 나머지는 빈 값·0으로 채우세요.',
    '- 안 보이거나 확실하지 않은 칸은 지어내지 말고 빈 문자열이나 0으로 두세요.',
    ruleText ? `\n이 사용자가 직접 고친 분류 규칙입니다. 해당하면 따르세요:\n${ruleText}` : ''
  ].join('\n');
}

// 앱이 보낸 규칙은 사용자 데이터라 길이·개수만 제한
function cleanRules(rules) {
  if (!Array.isArray(rules)) return [];
  return rules.slice(0, 60).filter((r) => r && typeof r === 'object').map((r) => ({
    keyword: String(r.keyword || '').slice(0, 40),
    cat: String(r.cat || '').slice(0, 20),
    sub: String(r.sub || '').slice(0, 20),
    biz: String(r.biz || '').slice(0, 10)
  })).filter((r) => r.keyword && r.cat);
}

const client = new Anthropic(); // ANTHROPIC_API_KEY 환경 변수 사용

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const pass = process.env.APP_PASSCODE;
  if (pass && req.headers['x-app-passcode'] !== pass) return res.status(401).json({ error: 'passcode' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'no_key' });

  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
  const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : new Date().toISOString().slice(0, 10);
  let content;
  if (body.image) {
    const { data, mime } = body.image;
    if (typeof data !== 'string' || !IMAGE_TYPES.includes(mime) || data.length > MAX_IMAGE_B64) return res.status(400).json({ error: 'bad_request' });
    content = [
      { type: 'image', source: { type: 'base64', media_type: mime, data } },
      { type: 'text', text: '이 이미지의 결제 정보를 뽑아 주세요.' }
    ];
  } else if (typeof body.text === 'string' && body.text.trim()) {
    if (body.text.length > MAX_TEXT) return res.status(400).json({ error: 'too_long' });
    content = [{ type: 'text', text: '다음 결제·주문 내용에서 결제 정보를 뽑아 주세요.\n\n' + body.text }];
  } else {
    return res.status(400).json({ error: 'bad_request' });
  }

  try {
    const msg = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default', // 안전 분류기가 거절하면 서버가 추천 모델로 다시 시도
      system: systemPrompt(today, cleanRules(body.rules)),
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content }]
    });
    if (msg.stop_reason === 'refusal') return res.status(422).json({ error: 'refused' });
    if (msg.stop_reason === 'max_tokens') return res.status(422).json({ error: 'too_long' });
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    return res.status(200).json({ ext: JSON.parse(text) });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return res.status(500).json({ error: 'bad_key' });
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'rate_limited' });
    if (e instanceof Anthropic.BadRequestError) return res.status(400).json({ error: 'bad_request' });
    if (e instanceof Anthropic.APIError) return res.status(502).json({ error: 'upstream' });
    console.error(e);
    return res.status(500).json({ error: 'server' });
  }
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
