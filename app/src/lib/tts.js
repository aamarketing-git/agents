/* 비서가 소리 내어 읽어주기 (Web Speech Synthesis, ko-KR) */
export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window
export function speak(text) {
  if (!ttsSupported() || !text) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text.replace(/[📅📞🎂🔥✅👤→·]/g, ' ').slice(0, 600))
  u.lang = 'ko-KR'; u.rate = 0.95
  const ko = window.speechSynthesis.getVoices().find((v) => v.lang?.startsWith('ko'))
  if (ko) u.voice = ko
  window.speechSynthesis.speak(u)
}
export const stopSpeaking = () => ttsSupported() && window.speechSynthesis.cancel()
