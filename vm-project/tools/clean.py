import cv2, numpy as np
# crop window in source coords
CX,CY,CW,CH=121,200,838,1490
# album box (source) -> crop coords
ALB=(374-CX-10, 398-CY-10, 706-CX+10, 732-CY+10)   # x0,y0,x1,y1
STRIP_Y=(735-CY-6, 806-CY)                           # rows of old title

def text_geom(frame):
    """x-range and bottom row of the old title text (white fill pixels)"""
    y0,y1=STRIP_Y
    g=cv2.cvtColor(frame[y0-6:y1+30],cv2.COLOR_BGR2GRAY)
    white=(g>238)
    cols=np.where(white.sum(0)>=2)[0]
    if len(cols)==0: return None
    rows=np.where(white[:, :].sum(1)>=3)[0]
    return (max(0,cols.min()-16), min(frame.shape[1],cols.max()+16), (y0-6)+int(rows.max()))

def text_xrange(frame):
    """x-range of the old title text in strip rows (white fill pixels)"""
    y0,y1=STRIP_Y
    g=cv2.cvtColor(frame[y0:y1],cv2.COLOR_BGR2GRAY)
    cols=np.where((g>238).sum(0)>=2)[0]
    if len(cols)==0: return None
    return max(0,cols.min()-16), min(frame.shape[1],cols.max()+16)

def fit_plate(frame,mask_hole,ring):
    H,W=frame.shape[:2]
    ys,xs=np.where(ring)
    if len(ys)>5000:
        idx=np.random.RandomState(1).choice(len(ys),5000,replace=False); ys,xs=ys[idx],xs[idx]
    def basis(X,Y,deg=3):
        return np.stack([X**i*Y**j for i in range(deg+1) for j in range(deg+1-i)],1)
    A=basis(xs/W*2-1,ys/H*2-1)
    hy,hx=np.where(mask_hole>0)
    G=basis(hx/W*2-1,hy/H*2-1)
    plate=np.zeros_like(frame,dtype=np.float32)
    for c in range(3):
        v=frame[ys,xs,c].astype(np.float32)
        wk=np.ones(len(ys),np.float32)
        for _ in range(3):
            coef=np.linalg.lstsq(A*wk[:,None],v*wk,rcond=None)[0]
            wk=(np.abs(v-A@coef)<10).astype(np.float32)+1e-3
        plate[hy,hx,c]=G@coef
    return plate

ALBREF=None
def clean_frame(frame,geom,rng):
    txr=(geom[0],geom[1]) if geom else None
    ybot=geom[2]+22 if geom else STRIP_Y[1]
    H,W=frame.shape[:2]
    x0,y0,x1,y1=ALB
    hole=np.zeros((H,W),np.uint8)
    hole[y0:y1+6,x0:x1]=1
    if txr:
        hole[STRIP_Y[0]:ybot,txr[0]:txr[1]]=1
    # ring of wall pixels: band above, left and right of the hole, rows up to strip
    ring=np.zeros((H,W),bool)
    ring[20:y0-4,0:W]=True                      # above album
    ring[y0:ybot,0:max(1,x0-6)]=True        # left of album
    ring[y0:STRIP_Y[0],x1+6:W]=True              # right of album
    if txr:
        ring[STRIP_Y[0]:ybot,0:max(1,txr[0]-6)]=True
        ring[STRIP_Y[0]:ybot,txr[1]+6:W]=True
    g=cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY)
    ring&=(g>95)                                   # drop hair / dark things
    ring&=cv2.erode((hole==0).astype(np.uint8),np.ones((9,9),np.uint8)).astype(bool)
    plate=fit_plate(frame,hole,ring)
    plate+=rng.normal(0,1.6,plate.shape[:2])[:,:,None]*(hole[:,:,None]>0)
    # person guard: dark blobs that continue down into the head below the title strip
    dark=(g<135).astype(np.uint8)
    dark=cv2.morphologyEx(dark,cv2.MORPH_OPEN,np.ones((9,9),np.uint8))
    band=np.zeros_like(dark)
    r0=ybot-82; r1=ybot+90
    band[r0:r1]=dark[r0:r1]
    n,lab=cv2.connectedComponents(band)
    guard=np.zeros_like(dark)
    probe=min(H-1,ybot+40)
    for k in range(1,n):
        if (lab[probe]==k).any(): guard[lab==k]=1
    guard=cv2.morphologyEx(guard,cv2.MORPH_CLOSE,np.ones((15,15),np.uint8))
    guard=cv2.dilate(guard,np.ones((7,7),np.uint8))
    dark=guard
    m=hole.astype(np.float32)
    glyph=((g>212)|(g<95)).astype(np.uint8)
    glyph=cv2.dilate(glyph,np.ones((9,9),np.uint8))
    lowrows=np.zeros((H,W),bool); lowrows[ybot-18:ybot+8,:]=True
    m[lowrows&(glyph==0)]=0
    if ALBREF is not None:
        x0_,y0_,x1_,y1_=ALB
        diff=np.abs(frame[y0_:y1_+6,x0_:x1_].astype(np.int16)-ALBREF).sum(2)
        stat=cv2.dilate((diff<50).astype(np.uint8),np.ones((5,5),np.uint8))
        mask_alb=np.zeros((H,W),np.float32); mask_alb[y0_:y1_+6,x0_:x1_]=1-stat
        m[(mask_alb>0)&(np.arange(H)[:,None]<ybot-82)]=0
    m[dark>0]=0
    m=cv2.GaussianBlur(m,(0,0),2.2)
    m=np.clip(m*1.15,0,1)*hole.astype(np.float32).clip(0,1)  # keep inside hole
    out=frame.astype(np.float32)*(1-m[:,:,None])+plate*m[:,:,None]
    out=np.clip(out,0,255).astype(np.uint8)
    return out,hole
