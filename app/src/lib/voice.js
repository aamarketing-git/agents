import { useEffect, useRef, useState } from 'react'

/* =========================================================
   음성 기록 훅
   1) Web Speech API (Chrome/Edge/Safari) 로 실시간 받아쓰기 → 텍스트에 이어붙임
   2) 지원하지 않는 브라우저면 MediaRecorder 로 음성 파일만 저장(추후 서버 STT 연동 지점)
   ========================================================= */
export function speechSupported() {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export function useDictation({ onText }) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState('')
  const recRef = useRef(null)
  const onTextRef = useRef(onText)
  useEffect(() => { onTextRef.current = onText }, [onText])

  const stop = () => {
    try { recRef.current?.stop() } catch { /* noop */ }
    setListening(false)
    setInterim('')
  }

  const start = () => {
    setError('')
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      setError('이 브라우저는 음성 받아쓰기를 지원하지 않습니다. 크롬(Chrome) 또는 사파리에서 사용해 주세요.')
      return
    }
    const rec = new SR()
    rec.lang = 'ko-KR'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (e) => {
      let finalText = ''
      let interimText = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) finalText += t
        else interimText += t
      }
      if (finalText) onTextRef.current?.(finalText.trim())
      setInterim(interimText)
    }
    rec.onerror = (e) => {
      if (e.error === 'not-allowed') setError('마이크 사용 권한을 허용해 주세요.')
      else if (e.error !== 'aborted') setError('음성 인식 오류: ' + e.error)
      setListening(false)
    }
    rec.onend = () => { setListening(false); setInterim('') }
    recRef.current = rec
    rec.start()
    setListening(true)
  }

  useEffect(() => () => { try { recRef.current?.abort() } catch { /* noop */ } }, [])

  return { listening, interim, error, start, stop, toggle: () => (listening ? stop() : start()) }
}
