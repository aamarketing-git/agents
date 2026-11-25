import cv2, numpy as np, sys, subprocess, json
sys.path.insert(0,'/home/user/agents/vm-project/tools')
import clean
SRC='/home/user/agents/vm-project/input/video.mp4'
SEGS=[(0.4,3.6,0),(3.9,10.7,1),(15.1,23.4,2),(26.0,34.0,3),(38.0,45.3,4),(51.6,60.2,5),(65.8,75.0,6)]
W,H=clean.CW,clean.CH
enc=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','bgr24','-s',f'{W}x{H}','-r','30','-i','-',
  '-vf','scale=1080:1920:flags=lanczos,unsharp=3:3:0.4','-c:v','libx264','-crf','12','-preset','medium','-pix_fmt','yuv420p','-r','30',
  '/home/user/agents/vm-project/work/base_clean.mp4'],stdin=subprocess.PIPE)
def song_geom(a,b):
    gs=[]
    for k in range(6):
        t=a+(b-a)*(0.1+0.16*k)
        raw=subprocess.run(['ffmpeg','-v','error','-ss',str(t),'-i',SRC,'-frames:v','1','-vf',f'crop={W}:{H}:{clean.CX}:{clean.CY}','-f','rawvideo','-pix_fmt','bgr24','-'],capture_output=True).stdout
        f=np.frombuffer(raw,np.uint8).reshape(H,W,3)
        g=clean.text_geom(f)
        if g: gs.append(g)
    a_=np.array(gs); med=np.median(a_,0).astype(int)
    return (int(med[0]),int(med[1]),int(med[2]))
def song_albref(a,b):
    x0,y0,x1,y1=clean.ALB
    fr=[]
    for k in range(20):
        t=a+(b-a)*(0.03+0.047*k)
        raw=subprocess.run(['ffmpeg','-v','error','-ss',str(t),'-i',SRC,'-frames:v','1','-vf',f'crop={W}:{H}:{clean.CX}:{clean.CY}','-f','rawvideo','-pix_fmt','bgr24','-'],capture_output=True).stdout
        f=np.frombuffer(raw,np.uint8).reshape(H,W,3)
        fr.append(f[y0:y1+6,x0:x1].astype(np.int16))
    return np.median(np.stack(fr),0).astype(np.int16)
meta=[];rng=np.random.RandomState(0);fi=0;segmeta=[]
for (a,b,idx) in SEGS:
    cmd=['ffmpeg','-v','error','-ss',str(a),'-t',str(round(b-a,3)),'-i',SRC,'-vf',f'fps=30,crop={W}:{H}:{clean.CX}:{clean.CY}','-f','rawvideo','-pix_fmt','bgr24','-']
    p=subprocess.Popen(cmd,stdout=subprocess.PIPE)
    n=0;last=None;start=fi
    while True:
        buf=p.stdout.read(W*H*3)
        if len(buf)<W*H*3: break
        f=np.frombuffer(buf,np.uint8).reshape(H,W,3).copy()
        if idx>0:
            if last is None: last=song_geom(a,b); clean.ALBREF=song_albref(a,b); print('geom',idx,last,flush=True)
            g=last
            f,_=clean.clean_frame(f,g,rng)
            meta.append({'f':fi,'song':idx,'ybot':int(g[2]) if g else None,'x0':int(g[0]) if g else None,'x1':int(g[1]) if g else None})
        enc.stdin.write(f.tobytes()); fi+=1; n+=1
    segmeta.append({'song':idx,'start':start,'frames':n,'src':[a,b]})
    print('seg',idx,n,flush=True)
enc.stdin.close(); enc.wait()
json.dump({'frames':fi,'segs':segmeta,'meta':meta},open('/home/user/agents/vm-project/work/process.json','w'))
print('done',fi)
