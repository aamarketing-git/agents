/* 자료 AI 정리 : PDF·이미지(base64 또는 URL)·링크·텍스트 → 요약·핵심 포인트·태그·대상 */
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { json, body, methodGuard, todayKST } from '../_lib/http.js'
import { authEnabled, checkUsage, getUser } from '../_lib/auth.js'

const client = new Anthropic()
const Summary = z.object({
  title: z.string().describe('자료 제목 (없으면 내용으로 지어서)'),
  summary: z.string().describe('3~5문장 요약, 존댓말'),
  keyPoints: z.array(z.string()).describe('핵심 포인트 3~7개, 각 한 줄'),
  tags: z.array(z.string()).describe('검색용 태그 3~6개'),
  category: z.enum(['product', 'health', 'business', 'customer', 'education', 'other']).describe('분류'),
  customerMessage: z.string().describe('고객에게 이 자료를 전달할 때 쓸 카톡 문장 2~3줄'),
  studyQuestion: z.string().describe('내가 이 자료를 복습할 때 스스로 답해 볼 질문 1개'),
})
const SYSTEM = '당신은 개인 영업인의 자료를 정리하는 비서입니다. 한국어, 존댓말. 자료에 없는 사실은 만들지 마세요. 의학적 효능 단정이나 과장은 피하고, 필요하면 "개인차가 있을 수 있음" 같은 주의를 덧붙입니다.'

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['POST'])) return
  if (!process.env.ANTHROPIC_API_KEY) return json(res, 503, { error: 'no-key' })
  const user = await getUser(req)
  if (authEnabled && !user) return json(res, 401, { error: 'login' })
  const usage = await checkUsage(user, todayKST())
  if (!usage.ok) return json(res, 429, { error: 'limit', used: usage.used, limit: usage.limit })
  const { kind, mime, data, url, text, title } = body(req)
  try {
    const content = []
    if (kind === 'file' && data && /^application\/pdf$/.test(mime || '')) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } })
    else if (kind === 'file' && data && /^image\//.test(mime || '')) content.push({ type: 'image', source: { type: 'base64', media_type: mime, data } })
    else if (kind === 'file' && url && /\.pdf(\?|$)/i.test(url)) content.push({ type: 'document', source: { type: 'url', url } })
    else if (kind === 'file' && url) content.push({ type: 'image', source: { type: 'url', url } })
    content.push({ type: 'text', text: `${title ? `제목 힌트: ${title}\n` : ''}${kind === 'link' ? `다음 링크의 내용을 읽고 정리하세요: ${url}` : kind === 'text' ? `다음 자료를 정리하세요:\n${(text || '').slice(0, 20000)}` : '첨부한 자료를 정리하세요.'}` })

    const params = {
      model: 'claude-opus-5', max_tokens: 2000,
      output_config: { effort: 'low', format: zodOutputFormat(Summary) },
      system: SYSTEM,
      messages: [{ role: 'user', content }],
    }
    if (kind === 'link') params.tools = [{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 2 }]
    const r = await client.messages.parse(params)
    if (!r.parsed_output) return json(res, 200, { ok: false })
    json(res, 200, { ok: true, ...r.parsed_output })
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json(res, 429, { error: 'rate' })
    json(res, 500, { error: 'extract-failed', detail: String(e.message || e).slice(0, 200) })
  }
}
