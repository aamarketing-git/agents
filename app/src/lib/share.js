/* =========================================================
   공유 : 카톡·인스타·문자 등 기기 공유 시트(Web Share API) + 카카오 SDK(선택)
   - 이미지 파일 공유는 https + 모바일 브라우저에서 동작 (카톡·인스타 선택 가능)
   - 카카오 JS 키(VITE_KAKAO_JS_KEY)가 있으면 "카카오톡으로 보내기" 버튼이 카카오 공유를 사용
   ========================================================= */
const KAKAO_KEY = import.meta.env.VITE_KAKAO_JS_KEY

export const canShareFiles = (files) => typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files })
export const canShare = () => typeof navigator !== 'undefined' && !!navigator.share

export async function shareText(text, title = '') {
  if (canShare()) { try { await navigator.share({ text, title }); return 'shared' } catch (e) { if (e.name === 'AbortError') return 'cancel' } }
  try { await navigator.clipboard.writeText(text); return 'copied' } catch { return 'fail' }
}

export async function shareImage(blob, filename, text = '') {
  const file = new File([blob], filename, { type: 'image/png' })
  if (canShareFiles([file])) { try { await navigator.share({ files: [file], text }); return 'shared' } catch (e) { if (e.name === 'AbortError') return 'cancel' } }
  downloadBlob(blob, filename)
  return 'downloaded'
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

let kakaoLoading = null
export function kakaoReady() { return !!KAKAO_KEY }
async function loadKakao() {
  if (!KAKAO_KEY) return null
  if (window.Kakao?.isInitialized?.()) return window.Kakao
  if (!kakaoLoading) {
    kakaoLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js'
      s.crossOrigin = 'anonymous'
      s.onload = () => { try { window.Kakao.init(KAKAO_KEY); resolve(window.Kakao) } catch (e) { reject(e) } }
      s.onerror = reject
      document.head.appendChild(s)
    })
  }
  return kakaoLoading
}

/* 카카오톡 텍스트 공유 (카카오 SDK). 이미지 포함은 공개 URL 이 필요해 공유 시트로 대체 */
export async function kakaoSendText(text) {
  const K = await loadKakao().catch(() => null)
  if (!K) return shareText(text)
  K.Share.sendDefault({ objectType: 'text', text: text.slice(0, 200), link: { mobileWebUrl: location.origin, webUrl: location.origin } })
  return 'kakao'
}
