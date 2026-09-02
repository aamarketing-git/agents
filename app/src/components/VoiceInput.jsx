import { useDictation, speechSupported } from '../lib/voice'

/* 타자 + 음성 받아쓰기 겸용 입력창 */
export default function VoiceInput({ value, onChange, placeholder, rows = 5, id }) {
  const { listening, interim, error, toggle } = useDictation({
    onText: (t) => onChange((value ? value.replace(/\s+$/, '') + ' ' : '') + t),
  })
  const supported = speechSupported()
  return (
    <div className="field">
      <div className="voice-wrap">
        <textarea
          id={id}
          className="textarea"
          rows={rows}
          value={value + (interim ? (value ? ' ' : '') + interim : '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        <div className="voice-bar">
          <button type="button" className={'mic' + (listening ? ' rec' : '')} onClick={toggle} disabled={!supported}>
            <span aria-hidden>{listening ? '⏹' : '🎤'}</span>
            {listening ? '녹음 중 · 누르면 멈춤' : '말로 기록'}
          </button>
          {value && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange('')}>지우기</button>
          )}
        </div>
      </div>
      {error && <p className="voice-hint" style={{ color: 'var(--danger)' }}>{error}</p>}
      {!error && !supported && <p className="voice-hint">음성 입력은 크롬 · 사파리 브라우저나 앱에서 사용할 수 있습니다.</p>}
      {!error && supported && listening && <p className="voice-hint">말씀하시면 글자로 바뀌어 아래에 쌓입니다. 잠시 쉬어도 계속 듣습니다.</p>}
    </div>
  )
}
