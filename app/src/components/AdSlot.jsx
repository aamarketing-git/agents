import { useEffect, useRef } from 'react'
import { useStore } from '../store'

/* =========================================================
   광고 슬롯
   - 웹 : Google AdSense (VITE_ADSENSE_CLIENT 설정 시 실제 광고, 미설정 시 자리 표시)
   - 앱 : Capacitor 네이티브 환경이면 이 컴포넌트는 비우고 AdMob 배너를 네이티브로 붙임 (docs/ADS.md)
   - 프리미엄(유료) 사용자는 광고 없음
   ========================================================= */
const CLIENT = import.meta.env.VITE_ADSENSE_CLIENT
let scriptLoaded = false

function loadScript() {
  if (scriptLoaded || !CLIENT) return
  scriptLoaded = true
  const s = document.createElement('script')
  s.async = true
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`
  s.crossOrigin = 'anonymous'
  document.head.appendChild(s)
}

export default function AdSlot({ slot, format = 'auto', label = '광고' }) {
  const { state } = useStore()
  const ref = useRef(null)
  const isNative = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.()

  useEffect(() => {
    if (!CLIENT || state.profile.premium || isNative) return
    loadScript()
    try {
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch { /* 광고 차단기 등 */ }
  }, [state.profile.premium, isNative])

  if (state.profile.premium || isNative) return null

  if (!CLIENT) {
    return (
      <div className="ad-slot" aria-label="광고 영역">
        {label} 영역 · 프리미엄으로 광고 없이 사용하기
      </div>
    )
  }
  return (
    <div className="ad-slot">
      <ins
        ref={ref}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={CLIENT}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  )
}
