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
  if (!res.ok) throw new Error('server ' + res.status)
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
    } catch {
      serverAvailable = false
    }
  }
  return { text: localFallback(), source: 'local' }
}

export const aiStatus = () => serverAvailable
