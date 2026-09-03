/* =========================================================
   SNS 이미지 카드 생성 (브라우저 Canvas, 서버 불필요)
   - instagram : 1080×1080 정사각
   - story     : 1080×1920 세로
   - kakao     : 1200×630 가로 (카톡 미리보기 비율)
   ========================================================= */
const SIZES = { instagram: [1080, 1080], story: [1080, 1920], kakao: [1200, 630] }
const THEMES = {
  navy: { bg: '#1E3A5F', bg2: '#152B47', fg: '#FFFFFF', accent: '#BFF0D0', sub: 'rgba(255,255,255,.75)' },
  ivory: { bg: '#FBF8F1', bg2: '#F1ECDF', fg: '#2B2536', accent: '#1E3A5F', sub: '#6E6680' },
  green: { bg: '#2F8F5B', bg2: '#24704A', fg: '#FFFFFF', accent: '#FBF8F1', sub: 'rgba(255,255,255,.8)' },
}

function wrap(ctx, text, maxWidth) {
  const lines = []
  for (const para of text.split('\n')) {
    if (!para.trim()) { lines.push(''); continue }
    let line = ''
    for (const ch of para) {
      const test = line + ch
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = ch === ' ' ? '' : ch } else line = test
    }
    lines.push(line)
  }
  return lines
}

export function makeCardImage({ format = 'instagram', theme = 'navy', title = '', body = '', footer = '', hashtags = '' }) {
  const [W, H] = SIZES[format] || SIZES.instagram
  const t = THEMES[theme] || THEMES.navy
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, t.bg); g.addColorStop(1, t.bg2)
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  // 장식 원
  ctx.globalAlpha = 0.08; ctx.fillStyle = t.fg
  ctx.beginPath(); ctx.arc(W * 0.9, H * 0.1, W * 0.25, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(W * 0.1, H * 0.95, W * 0.18, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1
  const pad = Math.round(W * 0.09)
  const font = "'Pretendard','Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',sans-serif"
  let y = pad + (format === 'story' ? H * 0.12 : 0)
  // 제목
  if (title) {
    const fs = Math.round(W * (format === 'kakao' ? 0.06 : 0.075))
    ctx.font = `800 ${fs}px ${font}`; ctx.fillStyle = t.accent; ctx.textBaseline = 'top'
    for (const l of wrap(ctx, title, W - pad * 2)) { ctx.fillText(l, pad, y); y += fs * 1.3 }
    y += fs * 0.6
  }
  // 본문 (박스 높이에 맞춰 글자 크기 자동 조절)
  const maxY = H - pad - (footer ? W * 0.08 : 0) - (hashtags ? W * 0.06 : 0)
  let fs = Math.round(W * (format === 'kakao' ? 0.042 : 0.048))
  let lines
  for (;;) {
    ctx.font = `500 ${fs}px ${font}`
    lines = wrap(ctx, body, W - pad * 2)
    if (y + lines.length * fs * 1.5 <= maxY || fs <= 22) break
    fs -= 2
  }
  ctx.fillStyle = t.fg
  for (const l of lines) { ctx.fillText(l, pad, y); y += fs * 1.5 }
  // 해시태그
  if (hashtags) {
    const hs = Math.round(W * 0.032)
    ctx.font = `600 ${hs}px ${font}`; ctx.fillStyle = t.accent
    ctx.fillText(hashtags.slice(0, 80), pad, H - pad - (footer ? W * 0.07 : 0) - hs)
  }
  // 푸터 (이름)
  if (footer) {
    const fsz = Math.round(W * 0.034)
    ctx.font = `700 ${fsz}px ${font}`; ctx.fillStyle = t.sub
    ctx.fillText(footer, pad, H - pad - fsz)
    ctx.fillStyle = t.accent; ctx.fillRect(pad, H - pad - fsz - 14, W * 0.12, 4)
  }
  return new Promise((resolve) => c.toBlob((blob) => resolve({ blob, dataUrl: c.toDataURL('image/png'), width: W, height: H }), 'image/png'))
}
