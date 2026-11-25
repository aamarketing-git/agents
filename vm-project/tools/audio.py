import numpy as np, subprocess, wave, json
SR=44100
SEGS=[(0.4,3.6,0),(3.9,10.7,1),(15.1,23.4,2),(26.0,34.0,3),(38.0,45.3,4),(51.6,60.2,5),(65.8,75.0,6)]
FPS=30
# output frame starts (frames counted by process.py)
def read_audio(a,b):
    raw=subprocess.run(['ffmpeg','-v','error','-ss',str(a),'-t',str(b-a),'-i','input/video.mp4','-vn','-f','f32le','-ac','2','-ar',str(SR),'-'],capture_output=True).stdout
    x=np.frombuffer(raw,np.float32).reshape(-1,2).copy()
    return x
rng=np.random.RandomState(3)
def env(n,a=0.005,r=0.2):
    t=np.arange(n)/SR; e=np.minimum(1,t/a)*np.exp(-t/r); return e
def whoosh(dur=0.7,rise=True):
    n=int(SR*dur); noise=rng.randn(n)
    # sweeping band-pass via time-varying one-pole filters (cheap): use cumulative smoothing with varying alpha
    out=np.zeros(n); y=0; y2=0
    for i in range(n):
        p=i/n; p=p if rise else 1-p
        a=0.02+0.5*p**2
        y+=a*(noise[i]-y); y2+=a*(y-y2)
        out[i]=y-y2
    shape=np.sin(np.pi*np.linspace(0,1,n))**1.5
    out=out/np.abs(out).max()*shape
    return out
def kick(dur=0.35):
    n=int(SR*dur); t=np.arange(n)/SR
    f=45+110*np.exp(-t*28); ph=2*np.pi*np.cumsum(f)/SR
    return np.sin(ph)*np.exp(-t*9)
def snare(dur=0.2):
    n=int(SR*dur); t=np.arange(n)/SR
    return (rng.randn(n)*0.7+np.sin(2*np.pi*190*t)*0.5)*np.exp(-t*24)
def hat(dur=0.06):
    n=int(SR*dur); t=np.arange(n)/SR
    x=rng.randn(n); x=np.diff(x,prepend=0)
    return x*np.exp(-t*70)
def tone(freq,dur,vol=1,kind='tri'):
    n=int(SR*dur); t=np.arange(n)/SR
    if kind=='tri': w=2/np.pi*np.arcsin(np.sin(2*np.pi*freq*t))
    else: w=np.sin(2*np.pi*freq*t)
    return w*vol*np.minimum(1,t/0.01)*np.exp(-t/(dur*0.6))
def impact():
    n=int(SR*0.9); t=np.arange(n)/SR
    return kick(0.9)*0.9+ (rng.randn(n)*np.exp(-t*18))*0.35
def ding(f=1318.5):
    n=int(SR*1.1); t=np.arange(n)/SR
    return (np.sin(2*np.pi*f*t)+0.5*np.sin(2*np.pi*f*2.01*t)+0.25*np.sin(2*np.pi*f*3.02*t))*np.exp(-t*4.5)*np.minimum(1,t/0.002)

def put(buf,x,t,gain=1.0,pan=0.0):
    i=int(t*SR)
    if i<0: x=x[-i:]; i=0
    n=min(len(x),len(buf)-i)
    if n<=0: return
    buf[i:i+n,0]+=x[:n]*gain*(1-max(0,pan)); buf[i:i+n,1]+=x[:n]*gain*(1+min(0,pan))

meta=json.load(open('work/process.json'))
total=meta['frames']/FPS
buf=np.zeros((int(SR*(total+0.5)),2),np.float32)
starts={s['song']:s['start']/FPS for s in meta['segs']}
durs={s['song']:s['frames']/FPS for s in meta['segs']}

# 1) real audio for songs 2..6 (hook and song 1 have none in the source)
for (a,b,idx) in SEGS:
    if idx<2: continue
    x=read_audio(a,a+durs[idx])
    fi=int(0.02*SR); fo=int(0.06*SR)
    x[:fi]*=np.linspace(0,1,fi)[:,None]; x[-fo:]*=np.linspace(1,0,fo)[:,None]
    put(buf,x[:,0],starts[idx],1.0,-0.0); buf[int(starts[idx]*SR):int(starts[idx]*SR)+len(x),1]+=0  # keep stereo simple below
    i=int(starts[idx]*SR); n=min(len(x),len(buf)-i)
    buf[i:i+n]=x[:n]*1.0 + 0  # overwrite with stereo (nothing else mixed yet)

music=np.zeros_like(buf)
# 2) hook riser -> hit
h0=starts[0]; hd=durs[0]
put(music,whoosh(hd,True),h0,0.55)
put(music,impact(),starts[1]-0.02,0.9)
for k in range(8):                       # ticking hats under the riser
    put(music,hat(),h0+0.1+k*0.38,0.25)
# 3) lo-fi bed for the silent song-1 visuals (96 bpm)
bpm=96; beat=60/bpm; t0=starts[1]; d1=durs[1]
chords=[[220.0,261.63,329.63],[174.61,220.0,261.63],[196.0,246.94,293.66],[164.81,207.65,246.94]]  # Am F G E
nb=int(d1/beat)+1
for i in range(nb):
    t=t0+i*beat
    if i%4 in (0,): put(music,kick(),t,0.8)
    if i%4==2: put(music,kick(),t,0.55)
    if i%2==1: put(music,snare(),t,0.55)
    put(music,hat(),t,0.30); put(music,hat(),t+beat/2,0.22)
    if i%4==0:
        for fr in chords[(i//4)%4]: put(music,tone(fr,beat*3.8,0.16,'tri'),t,1.0,0.1)
    a=chords[(i//4)%4]
    put(music,tone(a[i%3]*2,beat*0.9,0.18,'sin'),t+beat/2,1.0,-0.3)
    put(music,tone(a[0]/2,beat*0.9,0.22,'sin'),t,1.0)
# fade bed out in the last 0.5s of song 1
i0=int((t0+d1-0.5)*SR); i1=int((t0+d1)*SR)
music[i0:i1]*=np.linspace(1,0,i1-i0)[:,None]; music[i1:int((t0+d1+0.2)*SR)]*=0
# 4) transitions: whoosh + hit at each song start, ding at CTA
for s in range(2,7):
    put(music,whoosh(0.55,True),starts[s]-0.5,0.5)
    put(music,impact(),starts[s]-0.03,0.45)
cta=starts[6]+durs[6]-70/FPS
put(music,whoosh(0.5,True),cta-0.45,0.45); put(music,ding(),cta,0.5); put(music,ding(1568.0),cta+0.12,0.35)
buf=buf+music*0.9
buf=np.clip(buf,-1.2,1.2)
buf=buf[:int(total*SR)]
w=wave.open('work/audio_mix.wav','wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
w.writeframes((np.clip(buf,-1,1)*32767).astype(np.int16).tobytes()); w.close()
print('audio',total)
