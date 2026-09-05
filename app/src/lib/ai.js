/* =========================================================
   AI 호출 계층
   - 서버 함수(/api/coach)가 있으면 실제 Claude 모델 사용
   - 없으면(오프라인 · 데모) 규칙 기반 로컬 응답으로 대체
   API 키는 브라우저에 절대 노출하지 않고 서버 함수에서만 사용합니다.
   ========================================================= */

let serverAvailable = null

async function callServer(task, payload, profile) {
  const res = await fetch('/api/coach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, payload, profile }),
  })
  if (!res.ok) { const e = new Error('server ' + res.status); e.status = res.status; throw e }
  const data = await res.json()
  if (!data.text) throw new Error('empty')
  return data.text
}

export async function askAI(task, payload, profile, localFallback) {
  if (serverAvailable !== false) {
    try {
      const text = await callServer(task, payload, profile)
      serverAvailable = true
      return { text, source: 'ai' }
    } catch (e) {
      if (e.status === 429) return { text: '오늘 AI 사용 한도에 도달했습니다. 내일 다시 이용하거나 요금제를 올려 주세요. 지금은 기본 코칭으로 답합니다.\n\n' + localFallback(), source: 'limit' }
      if (e.status === 401) return { text: localFallback(), source: 'local' }
      if (e.status === 404 || e.status === 503) serverAvailable = false
      else return { text: localFallback(), source: 'local' }
    }
  }
  return { text: localFallback(), source: 'local' }
}

export const aiStatus = () => serverAvailable
