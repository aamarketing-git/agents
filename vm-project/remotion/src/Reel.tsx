import React, {useEffect, useState} from 'react';
import {
  AbsoluteFill, Easing, Img, OffthreadVideo, Sequence, continueRender, delayRender,
  interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig,
} from 'remotion';

export type Seg = {song: number; start: number; frames: number; src: number[]};
export type ReelProps = {frames: number; segs: Seg[]; baseY: Record<string, number>; baseVideo: string};

type Song = {
  lines: string[]; fs: number; artist: string; sub: string; c1: string; c2: string; chars: string;
};
const SONGS: Song[] = [
  null as any,
  {lines: ['小幸運'], fs: 225, artist: '田馥甄', sub: 'HEBE TIEN', c1: '#ff4d6d', c2: '#ffc2cf', chars: ''},
  {lines: ['如果可以'], fs: 196, artist: '韋禮安', sub: 'WEIBIRD', c1: '#27e0ea', c2: '#b4f6ff', chars: ''},
  {lines: ['那些年'], fs: 225, artist: '胡夏', sub: 'HU XIA', c1: '#ffcf3f', c2: '#fff1b5', chars: ''},
  {lines: ['刻在我', '心底的名字'], fs: 142, artist: '盧廣仲', sub: 'CROWD LU', c1: '#43c6f5', c2: '#bdeeff', chars: ''},
  {lines: ['愛情你比我想的', '閣較偉大'], fs: 120, artist: '茄子蛋', sub: 'EGGPLANTEGG', c1: '#ff6a3d', c2: '#ffcab3', chars: ''},
  {lines: ['有一種悲傷'], fs: 170, artist: 'A-Lin', sub: '', c1: '#b9a4ff', c2: '#e7deff', chars: ''},
];
const ZH = SONGS.slice(1).map((s) => s.lines.join('') + s.artist).join('') + 'NOW PLAYING';
const KO = '이 노래들 몇 개 알아요? 영화 OST 명곡 곡 알았어 댓글로 점수 남겨줘 저장하고 다시 듣기 👇 6SONGS';
const BEBAS = '"Noto Sans TC", "Noto Sans KR", "WenQuanYi Zen Hei", sans-serif';
const HAN = '"Black Han Sans", "Noto Sans KR", "Noto Sans TC", sans-serif';
const SCALE = 1920 / 1490;

const useFonts = () => {
  const [h] = useState(() => delayRender('fonts'));
  const [linked, setLinked] = useState(0);
  useEffect(() => {
    if (linked < 3) return;
    const run = async () => {
      try {
        await Promise.all([
          document.fonts.load('900 100px "Noto Sans TC"', ZH),
          document.fonts.load('900 100px "Noto Sans KR"', KO),
          document.fonts.load('400 100px "Black Han Sans"', KO),
        ]);
      } catch (e) { /* fall through */ }
      continueRender(h);
    };
    run();
  }, [linked, h]);
  return (
    <>
      {['fonts/tc/900.css', 'fonts/kr/900.css', 'fonts/han/400.css'].map((p) => (
        <link key={p} rel="stylesheet" href={staticFile(p)} onLoad={() => setLinked((x) => x + 1)} onError={() => setLinked((x) => x + 1)} />
      ))}
    </>
  );
};

const pop = (frame: number, delay: number, fps: number, cfg = {damping: 9, stiffness: 160, mass: 0.7}) =>
  spring({frame: frame - delay, fps, config: cfg});

/* -------- Song card: album + giant title + artist bar, sitting right above the head -------- */
const SongCard: React.FC<{idx: number; len: number; baseY: number}> = ({idx, len, baseY}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = SONGS[idx];
  const barH = 100;
  const titleH = s.lines.length * s.fs * 1.02;
  const titleBottom = baseY - 92 - 10;
  const titleTop = titleBottom - titleH;
  const albumH = Math.max(210, Math.min(300, titleTop - 18 - 150));
  const albumTop = titleTop - 16 - albumH;

  // entrance / exit
  const drop = pop(f, 0, fps, {damping: 10, stiffness: 140, mass: 0.9});
  const enterY = interpolate(drop, [0, 1], [-700, 0]);
  const enterRot = interpolate(drop, [0, 1], [-9, 0]);
  const exit = interpolate(f, [len - 7, len - 1], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic)});
  const alpha = 1 - exit;
  const float = Math.sin(f / 14) * 7;
  const tilt = Math.sin(f / 22) * 1.6;
  const beat = 1 + 0.035 * Math.pow(Math.max(0, Math.cos((f / fps) * Math.PI * 2 * 1.6)), 6);
  const shake = f < 8 ? (random(`sh${idx}${f}`) - 0.5) * (8 - f) * 3 : 0;

  const ring = interpolate(f, [8, 30], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const glitch = f < 9;

  return (
    <AbsoluteFill style={{opacity: alpha, transform: `translateY(${exit * -60}px) scale(${1 - exit * 0.06})`, transformOrigin: `540px ${baseY}px`}}>
      {/* colour glow behind the group */}
      <div style={{position: 'absolute', left: 90, top: albumTop - 40, width: 900, height: baseY - albumTop + 20,
        background: `radial-gradient(ellipse at 50% 45%, ${s.c1}66 0%, ${s.c1}00 68%)`, filter: 'blur(10px)', opacity: 0.9 * drop}} />

      <div style={{position: 'absolute', inset: 0, transform: `translate(${shake}px, ${enterY}px) rotate(${enterRot}deg)`, transformOrigin: `540px ${baseY}px`}}>
        {/* shock ring */}
        <div style={{position: 'absolute', left: 540 - albumH / 2, top: albumTop, width: albumH, height: albumH, borderRadius: 40,
          border: `6px solid ${s.c2}`, opacity: (1 - ring) * 0.9, transform: `scale(${1 + ring * 1.1})`}} />

        {/* vinyl peeking from behind the album */}
        <div style={{position: 'absolute', left: 540 - albumH * 0.34 + albumH * 0.42, top: albumTop + albumH * 0.08 + float * 0.3,
          width: albumH * 0.86, height: albumH * 0.86, borderRadius: '50%',
          background: `radial-gradient(circle, ${s.c1} 0 17%, #0b0b10 18% 22%, transparent 23%), repeating-radial-gradient(circle, #15151d 0 3px, #0c0c12 3px 6px)`,
          boxShadow: `0 10px 30px #0008, inset 0 0 0 4px #222`, transform: `rotate(${f * 4}deg)`}} />

        {/* album */}
        <div style={{position: 'absolute', left: 540 - albumH / 2, top: albumTop + float, width: albumH, height: albumH,
          transform: `rotate(${tilt}deg) scale(${beat})`, filter: `drop-shadow(0 18px 28px #000a) drop-shadow(0 0 26px ${s.c1}aa)`}}>
          <Img src={staticFile(`albums/album${idx}.png`)} style={{width: '100%', height: '100%', objectFit: 'cover', borderRadius: 30, border: '6px solid #fff'}} />
          <div style={{position: 'absolute', inset: 0, borderRadius: 30, background: 'linear-gradient(135deg, #ffffff55 0%, #ffffff00 38%)'}} />
          {/* rank badge */}
          <div style={{position: 'absolute', left: -34, top: -34, width: 92, height: 92, borderRadius: '50%',
            background: `linear-gradient(145deg, ${s.c2}, ${s.c1})`, border: '5px solid #fff', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontFamily: HAN, fontSize: 56, color: '#14141c', transform: `scale(${pop(f, 10, fps)})`}}>{idx}</div>
        </div>

        {/* floating notes */}
        {Array.from({length: 7}).map((_, i) => {
          const life = (f * 1.0 + i * 17) % 90;
          const side = i % 2 ? 1 : -1;
          const x = 540 + side * (albumH * 0.62 + random(`nx${i}`) * 70) + Math.sin(life / 9 + i) * 16;
          const y = albumTop + albumH * 0.7 - life * 3.1;
          return (
            <div key={i} style={{position: 'absolute', left: x, top: y, fontSize: 44 + random(`ns${i}`) * 22, color: i % 3 ? s.c2 : '#fff',
              opacity: interpolate(life, [0, 12, 70, 90], [0, 0.95, 0.7, 0]) * drop, fontFamily: BEBAS, fontWeight: 900,
              textShadow: `0 0 14px ${s.c1}`}}>{i % 2 ? '♪' : '♫'}</div>
          );
        })}

        {/* GIANT TITLE */}
        <div style={{position: 'absolute', left: 0, width: 1080, top: titleTop, height: titleH, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center'}}>
          {s.lines.map((line, li) => (
            <div key={li} style={{display: 'flex', height: s.fs * 1.02, alignItems: 'center'}}>
              {line.split('').map((ch, ci) => {
                const d = li * 5 + ci * 2 + 4;
                const p = pop(f, d, fps, {damping: 8, stiffness: 190, mass: 0.6});
                const wob = Math.sin(f / 9 + ci * 0.9) * 4;
                return (
                  <span key={ci} style={{
                    display: 'inline-block', fontFamily: BEBAS, fontWeight: 900, fontSize: s.fs, lineHeight: 1, color: '#fff',
                    transform: `translateY(${interpolate(p, [0, 1], [90, 0]) + wob}px) scale(${interpolate(p, [0, 1], [0.2, 1]) * beat}) rotate(${interpolate(p, [0, 1], [-12, 0])}deg)`,
                    opacity: Math.min(1, p * 1.6),
                    WebkitTextStroke: `${Math.round(s.fs * 0.075)}px #0e0e16`, paintOrder: 'stroke fill',
                    textShadow: `${Math.round(s.fs * 0.035)}px ${Math.round(s.fs * 0.045)}px 0 ${s.c1}, 0 0 ${Math.round(s.fs * 0.3)}px ${s.c1}99`,
                  } as React.CSSProperties}>
                    {glitch && ci % 2 === 0 ? <span style={{position: 'absolute', left: 6, color: '#ff2d55', mixBlendMode: 'screen', WebkitTextStroke: 0}}>{ch}</span> : null}
                    {ch}
                  </span>
                );
              })}
            </div>
          ))}
        </div>

        {/* artist bar (also sits on the hair line) */}
        <div style={{position: 'absolute', left: 540 - 330, width: 660, top: baseY - 92, height: barH, borderRadius: 50,
          background: 'linear-gradient(180deg, #1b1b27f2, #0b0b12f5)', border: `4px solid ${s.c1}`, boxShadow: `0 0 30px ${s.c1}88, 0 10px 24px #0009`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22, transform: `scale(${pop(f, 14, fps)})`, transformOrigin: '50% 100%'}}>
          <div style={{display: 'flex', alignItems: 'flex-end', gap: 6, height: 42}}>
            {[0, 1, 2, 3, 4].map((b) => (
              <div key={b} style={{width: 9, borderRadius: 5, background: s.c1, height: 10 + (Math.abs(Math.sin(f / 4 + b * 1.7)) * 32)}} />
            ))}
          </div>
          <div style={{fontFamily: BEBAS, fontWeight: 900, fontSize: 54, color: '#fff', letterSpacing: 2}}>{s.artist}</div>
          {s.sub ? <div style={{fontFamily: BEBAS, fontWeight: 900, fontSize: 28, color: s.c2, opacity: 0.9, letterSpacing: 3}}>{s.sub}</div> : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* artist bar only: stays on the head line during the end card */
const BarOnly: React.FC<{idx: number; baseY: number}> = ({idx, baseY}) => {
  const f = useCurrentFrame();
  const s = SONGS[idx];
  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', left: 540 - 330, width: 660, top: baseY - 92, height: 100, borderRadius: 50,
        background: 'linear-gradient(180deg, #1b1b27f2, #0b0b12f5)', border: `4px solid ${s.c1}`, boxShadow: `0 0 30px ${s.c1}88, 0 10px 24px #0009`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22}}>
        <div style={{display: 'flex', alignItems: 'flex-end', gap: 6, height: 42}}>
          {[0, 1, 2, 3, 4].map((b) => (
            <div key={b} style={{width: 9, borderRadius: 5, background: s.c1, height: 10 + (Math.abs(Math.sin(f / 4 + b * 1.7)) * 32)}} />
          ))}
        </div>
        <div style={{fontFamily: BEBAS, fontWeight: 900, fontSize: 54, color: '#fff', letterSpacing: 2}}>{s.artist}</div>
        {s.sub ? <div style={{fontFamily: BEBAS, fontWeight: 900, fontSize: 28, color: s.c2, opacity: 0.9, letterSpacing: 3}}>{s.sub}</div> : null}
      </div>
    </AbsoluteFill>
  );
};

/* -------- Hook (first 3 seconds) -------- */
const Hook: React.FC<{len: number}> = ({len}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const exit = interpolate(f, [len - 8, len - 1], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const l1 = '영화 OST';
  const l2 = '명곡 6곡';
  const row = (txt: string, base: number, size: number, color: string, y: number) => (
    <div style={{position: 'absolute', left: 0, width: 1080, top: y, display: 'flex', justifyContent: 'center'}}>
      {txt.split('').map((ch, i) => {
        const p = pop(f, base + i * 2, fps, {damping: 8, stiffness: 200, mass: 0.6});
        return (
          <span key={i} style={{fontFamily: HAN, fontSize: size, lineHeight: 1.05, color, display: 'inline-block', whiteSpace: 'pre',
            transform: `translateY(${interpolate(p, [0, 1], [-160, 0]) + Math.sin(f / 8 + i) * 4}px) scale(${interpolate(p, [0, 1], [0.3, 1])}) rotate(${interpolate(p, [0, 1], [10, 0])}deg)`,
            opacity: Math.min(1, p * 1.5), WebkitTextStroke: `${Math.round(size * 0.09)}px #0e0e16`, paintOrder: 'stroke fill',
            textShadow: `8px 10px 0 ${color === '#fff' ? '#ff4d6d' : '#27e0ea'}, 0 0 40px #ff4d6d88`} as React.CSSProperties}>{ch}</span>
        );
      })}
    </div>
  );
  const badge = pop(f, 22, fps);
  return (
    <AbsoluteFill style={{opacity: exit}}>
      {row(l1, 2, 150, '#fff', 70)}
      {row(l2, 8, 150, '#ffe14d', 230)}
      <div style={{position: 'absolute', left: 540 - 270, top: 410, width: 540, height: 84, borderRadius: 42, background: '#0e0e16ee',
        border: '4px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: BEBAS, fontWeight: 900,
        fontSize: 44, color: '#fff', transform: `scale(${badge}) rotate(${-2 + Math.sin(f / 7) * 1.5}deg)`, boxShadow: '0 0 30px #ff4d6dcc'}}>
        👀 몇 개나 알고 있어요?
      </div>
    </AbsoluteFill>
  );
};

/* -------- End card CTA -------- */
const EndCard: React.FC<{len: number}> = ({len}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const p1 = pop(f, 0, fps, {damping: 9, stiffness: 150, mass: 0.8});
  const chip = (txt: string, d: number, y: number, c: string) => (
    <div style={{position: 'absolute', left: 540 - 330, top: y, width: 660, height: 96, borderRadius: 48, background: '#0e0e16ee',
      border: `4px solid ${c}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: BEBAS, fontWeight: 900,
      fontSize: 46, color: '#fff', transform: `scale(${pop(f, d, fps)})`, boxShadow: `0 0 28px ${c}99`}}>{txt}</div>
  );
  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', left: 0, width: 1080, top: 80, display: 'flex', justifyContent: 'center', transform: `scale(${interpolate(p1, [0, 1], [0.4, 1])}) rotate(${interpolate(p1, [0, 1], [-8, 0])}deg)`, opacity: Math.min(1, p1 * 1.4)}}>
        {'몇 곡 알았어요?'.split('').map((ch, i) => (
          <span key={i} style={{fontFamily: HAN, fontSize: 138, color: i % 2 ? '#ffe14d' : '#fff', whiteSpace: 'pre', display: 'inline-block',
            transform: `translateY(${Math.sin(f / 6 + i * 0.7) * 8}px)`, WebkitTextStroke: '13px #0e0e16', paintOrder: 'stroke fill',
            textShadow: '8px 10px 0 #ff4d6d, 0 0 40px #ff4d6d88'} as React.CSSProperties}>{ch}</span>
        ))}
      </div>
      {chip('💬 댓글로 점수 남겨줘', 14, 300, '#27e0ea')}
      {chip('🔖 저장하고 다시 듣기', 22, 420, '#ffe14d')}
    </AbsoluteFill>
  );
};

const Flash: React.FC<{len?: number}> = ({len = 7}) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{background: '#fff', opacity: interpolate(f, [0, len], [0.7, 0], {extrapolateRight: 'clamp'}), mixBlendMode: 'screen'}} />;
};

export const Reel: React.FC<ReelProps> = ({frames, segs, baseY, baseVideo}) => {
  const f = useCurrentFrame();
  const fonts = useFonts();
  const cur = segs.find((s) => f >= s.start && f < s.start + s.frames);
  const accent = cur && cur.song > 0 ? SONGS[cur.song].c1 : '#ff4d6d';
  const lastSong = segs[segs.length - 1];
  return (
    <AbsoluteFill style={{background: '#000'}}>
      {fonts}
      <OffthreadVideo src={staticFile(baseVideo)} muted style={{width: 1080, height: 1920}} />

      {segs.map((s, i) => {
        const isLast = i === segs.length - 1;
        const by = (baseY[String(s.song)] ?? 780);
        if (s.song === 0) {
          return <Sequence key={i} from={s.start} durationInFrames={s.frames}><Hook len={s.frames} /></Sequence>;
        }
        const cardLen = isLast ? s.frames - 70 : s.frames;
        return (
          <React.Fragment key={i}>
            <Sequence from={s.start} durationInFrames={cardLen}><SongCard idx={s.song} len={cardLen} baseY={by} /></Sequence>
            <Sequence from={s.start} durationInFrames={8}><Flash /></Sequence>
            {isLast ? <Sequence from={s.start + cardLen} durationInFrames={70}><EndCard len={70} /><BarOnly idx={s.song} baseY={by} /></Sequence> : null}
          </React.Fragment>
        );
      })}

      {/* top HUD: story-style progress + NOW PLAYING pill */}
      <AbsoluteFill style={{pointerEvents: 'none'}}>
        <div style={{position: 'absolute', left: 36, right: 36, top: 26, display: 'flex', gap: 8}}>
          {segs.filter((s) => s.song > 0).map((s) => {
            const p = interpolate(f, [s.start, s.start + s.frames], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
            return (
              <div key={s.song} style={{flex: 1, height: 9, borderRadius: 5, background: '#ffffff44', overflow: 'hidden', boxShadow: '0 0 6px #0006'}}>
                <div style={{width: `${p * 100}%`, height: '100%', background: SONGS[s.song].c1, boxShadow: `0 0 12px ${SONGS[s.song].c1}`}} />
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
