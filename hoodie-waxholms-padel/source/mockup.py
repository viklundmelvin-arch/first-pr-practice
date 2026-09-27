import numpy as np, sys
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import gaussian_filter, distance_transform_edt, map_coordinates
W,H=1400,1420

def bez(p0,p1,p2,p3,n=40):
    t=np.linspace(0,1,n)[:,None];p0,p1,p2,p3=map(np.array,(p0,p1,p2,p3))
    return ((1-t)**3*p0+3*(1-t)**2*t*p1+3*(1-t)*t**2*p2+t**3*p3).tolist()

def outline():
    b=[]
    b+=bez((820,170),(900,190),(1010,215),(1100,245))
    b+=bez((1100,245),(1190,330),(1280,450),(1325,570))
    b+=bez((1325,570),(1260,605),(1180,640),(1118,668))
    b+=bez((1118,668),(1090,610),(1070,560),(1055,525))
    b+=bez((1055,525),(1045,800),(1062,1050),(1068,1300))
    b+=bez((1068,1300),(860,1322),(540,1322),(332,1300))
    b+=bez((332,1300),(338,1050),(355,800),(345,525))
    b+=bez((345,525),(330,560),(310,610),(282,668))
    b+=bez((282,668),(220,640),(140,605),(75,570))
    b+=bez((75,570),(120,450),(210,330),(300,245))
    b+=bez((300,245),(390,215),(500,190),(580,170))
    b+=bez((580,170),(630,192),(770,192),(820,170))
    return b

def poly_mask(pts,ss=3):
    im=Image.new('L',(W*ss,H*ss),0);ImageDraw.Draw(im).polygon([(x*ss,y*ss) for x,y in pts],fill=255)
    return np.asarray(im.resize((W,H),Image.LANCZOS),dtype=np.float32)/255

def hexrgb(h): h=h.lstrip('#');return np.array([int(h[i:i+2],16) for i in (0,2,4)],np.float32)/255

def make(design_png, shirt_hex, out, seed=1, print_w=500, print_top=330):
    rng=np.random.default_rng(seed)
    body=outline(); mask=poly_mask(body)
    neck_front=bez((580,170),(622,272),(778,272),(820,170),60)
    neck_back=bez((820,170),(770,192),(630,192),(580,170),60)
    opening=poly_mask(neck_front+neck_back)             # the hole showing inside back
    # ---- height map: pillow + folds + low freq
    d=distance_transform_edt(mask>0.5)
    h=np.tanh(d/60.0)*6
    yy,xx=np.mgrid[0:H,0:W].astype(np.float32)
    for _ in range(18):
        x0,y0=rng.uniform(380,1020),rng.uniform(300,1280);ang=rng.uniform(-0.6,0.6)+np.pi/2*rng.choice([0,1],p=[.35,.65])
        L=rng.uniform(150,420);wdt=rng.uniform(8,22);amp=rng.uniform(-7,8)
        dx,dy=np.cos(ang),np.sin(ang);u=(xx-x0)*dx+(yy-y0)*dy;v=-(xx-x0)*dy+(yy-y0)*dx
        h+=amp*np.exp(-(v/wdt)**2)*np.exp(-(u/L)**4)
    # sleeve creases
    for x0,y0,ang in [(360,500,2.2),(1040,500,0.95),(300,590,2.4),(1100,590,0.75),(700,1250,0.1)]:
        u=(xx-x0)*np.cos(ang)+(yy-y0)*np.sin(ang);v=-(xx-x0)*np.sin(ang)+(yy-y0)*np.cos(ang)
        h+=-3*np.exp(-(v/10)**2)*np.exp(-(u/110)**4)
    h+=gaussian_filter(rng.normal(0,1,(H,W)),70)*220
    h=gaussian_filter(h,3)*mask
    gy,gx=np.gradient(h)
    light=np.array([-0.5,-0.7,1.0]);light/=np.linalg.norm(light)
    n=np.dstack([-gx*1.4,-gy*1.4,np.ones_like(h)]);n/=np.linalg.norm(n,axis=2,keepdims=True)
    shade=0.74+0.34*np.clip((n*light).sum(2),0,1)
    shade*= 1-0.10*np.exp(-d/18)                        # soft edge falloff
    # ---- fabric: jersey knit + fibre noise
    knit=1+0.018*np.sin(xx*2*np.pi/3.1)*np.sin(yy*2*np.pi/4.3+np.sin(xx*0.9))
    fib=1+gaussian_filter(rng.normal(0,1,(H,W)),0.8)*0.045+gaussian_filter(rng.normal(0,1,(H,W)),6)*0.06
    tex=knit*fib
    base=hexrgb(shirt_hex)
    lum=base.mean()
    col=np.ones((H,W,3),np.float32)*base
    # ---- print
    des=Image.open(design_png).convert('RGBA');bb=des.getbbox();des=des.crop(bb)
    pw=print_w;ph=int(des.height*pw/des.width)
    if ph>600: ph=600;pw=int(des.width*ph/des.height)
    des=np.asarray(des.resize((pw,ph),Image.LANCZOS),np.float32)/255
    canvas=np.zeros((H,W,4),np.float32);x0=700-pw//2;y0=print_top
    canvas[y0:y0+ph,x0:x0+pw]=des
    disp=5.0
    coords=[yy+gy*disp,xx+gx*disp]
    warped=np.dstack([map_coordinates(canvas[...,c],coords,order=1) for c in range(4)])
    ink_a=warped[...,3]*np.clip(0.93+gaussian_filter(rng.normal(0,1,(H,W)),1.2)*0.25,0,1)*mask
    col=col*(1-ink_a[...,None])+warped[...,:3]*ink_a[...,None]
    # ---- inside of back neck, collar rib
    inner=base*0.62
    col=col*(1-opening[...,None])+inner*opening[...,None]
    rib=Image.new('L',(W*3,H*3),0);dr=ImageDraw.Draw(rib)
    dr.line([(x*3,y*3) for x,y in neck_front],fill=255,width=3*26,joint='curve')
    rib=np.asarray(rib.resize((W,H),Image.LANCZOS),np.float32)/255*mask
    ribtex=1+0.06*np.sin(np.arctan2(yy-170,xx-700)*260)
    col=col*(1-rib[...,None])+(col*ribtex[...,None]*0.97)*rib[...,None]
    # neck label
    lab=np.zeros((H,W),np.float32);lab[194:216,672:728]=1;lab*=opening
    col=col*(1-lab[...,None])+np.array([.12,.14,.2])*lab[...,None]
    # ---- stitching
    st=Image.new('L',(W*2,H*2),0);ds=ImageDraw.Draw(st)
    def dashed(pts,off=0):
        pts=np.array(pts)*2;seg=np.cumsum(np.r_[0,np.linalg.norm(np.diff(pts,axis=0),axis=1)])
        tot=seg[-1];t=0
        while t<tot:
            a=np.array([np.interp(t,seg,pts[:,0]),np.interp(t,seg,pts[:,1])]);b=np.array([np.interp(min(t+14,tot),seg,pts[:,0]),np.interp(min(t+14,tot),seg,pts[:,1])])
            ds.line([tuple(a),tuple(b)],fill=255,width=3);t+=22
    dashed(bez((336,1272),(540,1294),(860,1294),(1064,1272),80))
    dashed(bez((95,545),(160,578),(230,610),(292,640),30));dashed(bez((1305,545),(1240,578),(1170,610),(1108,640),30))
    dashed(bez((566,170),(610,292),(790,292),(834,170),80))
    stitch=np.asarray(st.resize((W,H),Image.LANCZOS),np.float32)/255*mask
    col=col*(1-0.35*stitch[...,None])+ (col*0.7)*0.35*stitch[...,None]
    # hem shadow lines
    col*= (1-0.06*np.exp(-((yy-1262)/6)**2)*mask)[...,None]
    col=col*shade[...,None]*tex[...,None]
    # ---- background: linen table + shadow
    bg=np.ones((H,W,3),np.float32)*np.array([.905,.895,.875])
    bg*= (1+gaussian_filter(rng.normal(0,1,(H,W)),1.0)*0.03+0.012*np.sin(xx*2*np.pi/5)+0.012*np.sin(yy*2*np.pi/5))[...,None]
    bg*= (1-0.10*((xx-700)**2/700**2+(yy-710)**2/710**2))[...,None]  # vignette
    sh=np.roll(np.roll(gaussian_filter(mask,22),18,0),10,1)
    bg*= (1-0.38*sh)[...,None]
    sh2=gaussian_filter(mask,4);bg*=(1-0.25*sh2)[...,None]
    m=mask[...,None]
    img=np.clip(bg*(1-m)+col*m,0,1)
    Image.fromarray((img*255).astype(np.uint8)).save(out,quality=92)

if __name__=='__main__':
    make(sys.argv[1],sys.argv[2],sys.argv[3],int(sys.argv[4]) if len(sys.argv)>4 else 1)
