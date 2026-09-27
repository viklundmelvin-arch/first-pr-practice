import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, distance_transform_edt, map_coordinates
from mockup import bez, hexrgb
W,H=1400,1500
def pm(pts,ss=3,width=None):
    im=Image.new('L',(W*ss,H*ss),0);d=ImageDraw.Draw(im);P=[(x*ss,y*ss) for x,y in pts]
    if width: d.line(P,fill=255,width=int(width*ss),joint='curve')
    else: d.polygon(P,fill=255)
    return np.asarray(im.resize((W,H),Image.LANCZOS),np.float32)/255
def mirror(pts): return [(W-x,y) for x,y in reversed(pts)]
def body_pts():
    R=[]
    R+=bez((700,330),(820,320),(960,300),(1050,300),20)
    R+=bez((1050,300),(1170,420),(1260,800),(1295,1195),40)     # sleeve outer
    R+=bez((1295,1195),(1300,1240),(1305,1280),(1300,1310),10) # cuff
    R+=bez((1300,1310),(1250,1320),(1200,1320),(1155,1310),10)
    R+=bez((1155,1310),(1150,1260),(1150,1230),(1150,1195),10)
    R+=bez((1150,1195),(1120,950),(1080,760),(1045,620),30)     # sleeve inner
    R+=bez((1045,620),(1040,900),(1048,1150),(1050,1300),30)    # side
    R+=bez((1050,1300),(1055,1340),(1058,1380),(1055,1420),10)  # waistband
    R+=bez((1055,1420),(950,1430),(800,1432),(700,1432),30)
    return R+mirror(R)
def dashed_line(draw,pts,ss=2,dash=14,gap=8):
    pts=np.array(pts)*ss;seg=np.cumsum(np.r_[0,np.linalg.norm(np.diff(pts,axis=0),axis=1)]);t=0
    while t<seg[-1]:
        a=[np.interp(t,seg,pts[:,i]) for i in (0,1)];b=[np.interp(min(t+dash,seg[-1]),seg,pts[:,i]) for i in (0,1)]
        draw.line([tuple(a),tuple(b)],fill=255,width=3);t+=dash+gap
def render(view,shirt_hex,prints,out,seed=1):
    rng=np.random.default_rng(seed);yy,xx=np.mgrid[0:H,0:W].astype(np.float32)
    base=hexrgb(shirt_hex)
    body=pm(body_pts())
    if view=='back':
        hood=pm(bez((455,380),(430,190),(560,60),(700,60),40)+bez((700,60),(840,60),(970,190),(945,380),40)+bez((945,380),(850,425),(550,425),(455,380),40))
    else:
        hood=pm(bez((440,360),(420,170),(560,50),(700,50),40)+bez((700,50),(840,50),(980,170),(960,360),40)+[(960,360),(440,360)])
    mask=np.maximum(body,hood)
    d=distance_transform_edt(mask>0.5)
    h=np.tanh(d/70)*8
    dh=distance_transform_edt(hood>0.5);h+=np.tanh(dh/40)*10*hood
    for _ in range(22):
        x0,y0=rng.uniform(380,1020),rng.uniform(420,1280);ang=rng.uniform(-.7,.7)+np.pi/2*rng.choice([0,1],p=[.3,.7])
        L=rng.uniform(140,380);w=rng.uniform(9,24);a=rng.uniform(-8,9)
        u=(xx-x0)*np.cos(ang)+(yy-y0)*np.sin(ang);v=-(xx-x0)*np.sin(ang)+(yy-y0)*np.cos(ang)
        h+=a*np.exp(-(v/w)**2)*np.exp(-(u/L)**4)
    for sx in (1,-1):   # sleeve bunching near cuffs and elbows
        for k in range(7):
            y0=rng.uniform(750,1180);x0=700+sx*(np.interp(y0,[620,1195],[1140,1225])-700)
            ang=rng.uniform(-.3,.3)+(0.25 if sx>0 else -0.25)
            u=(xx-x0)*np.cos(ang)+(yy-y0)*np.sin(ang);v=-(xx-x0)*np.sin(ang)+(yy-y0)*np.cos(ang)
            h+=rng.uniform(-7,7)*np.exp(-(v/12)**2)*np.exp(-(u/70)**4)
    h+=gaussian_filter(rng.normal(0,1,(H,W)),70)*240
    extras=[]
    if view=='front':
        pocket=pm([(470,1300)]+bez((470,1300),(500,1150),(510,1060),(525,1000),20)+bez((525,1000),(640,985),(760,985),(875,1000),20)+bez((875,1000),(890,1060),(900,1150),(930,1300),20))
        h+=gaussian_filter(pocket,6)*5
    h=gaussian_filter(h,3)*mask
    gy,gx=np.gradient(h)
    L=np.array([-.5,-.7,1.]);L/=np.linalg.norm(L)
    n=np.dstack([-gx*1.3,-gy*1.3,np.ones_like(h)]);n/=np.linalg.norm(n,axis=2,keepdims=True)
    shade=(0.72+0.36*np.clip((n*L).sum(2),0,1))*(1-0.12*np.exp(-d/20))
    # fleece: soft, fuzzier than jersey
    fib=1+gaussian_filter(rng.normal(0,1,(H,W)),1.1)*0.05+gaussian_filter(rng.normal(0,1,(H,W)),8)*0.07
    col=np.ones((H,W,3),np.float32)*base
    # prints
    for png,cx,top,pw in prints:
        des=Image.open(png).convert('RGBA');des=des.crop(des.getbbox());ph=int(des.height*pw/des.width)
        des=np.asarray(des.resize((pw,ph),Image.LANCZOS),np.float32)/255
        cv=np.zeros((H,W,4),np.float32);x0=int(cx-pw/2);cv[top:top+ph,x0:x0+pw]=des
        wp=np.dstack([map_coordinates(cv[...,c],[yy+gy*6,xx+gx*6],order=1) for c in range(4)])
        a=wp[...,3]*np.clip(.92+gaussian_filter(rng.normal(0,1,(H,W)),1.3)*.3,0,1)*mask
        col=col*(1-a[...,None])+wp[...,:3]*a[...,None]
    def over(m,c,alpha=1.0):
        nonlocal col; m=m[...,None]*alpha; col=col*(1-m)+c*m
    rib_tex=1+0.07*np.sin(xx*2*np.pi/7)
    wb=body*(yy>1300);cf=body*(yy>1195)*(np.abs(xx-700)>480)
    over(wb,col*rib_tex[...,None]*0.93);over(cf,col*rib_tex[...,None]*0.93)
    st=Image.new('L',(W*2,H*2),0);ds=ImageDraw.Draw(st)
    if view=='back':
        seam=pm([(700,68),(700,410)],width=3);over(seam,base*0.7,0.6)
        over(gaussian_filter(pm(bez((455,384),(550,429),(850,429),(945,384),40),width=14),6)*(1-hood)*mask,base*0.4,0.5)  # shadow under hood
    else:
        inner=pm(bez((560,330),(545,190),(620,120),(700,120),30)+bez((700,120),(780,120),(855,190),(840,330),30)+bez((840,330),(780,375),(620,375),(560,330),30))
        over(gaussian_filter(inner,2),base*0.45)
        rim=pm(bez((560,330),(545,190),(620,120),(700,120),30)+bez((700,120),(780,120),(855,190),(840,330),30),width=26)
        over(rim*mask,col*0.96)
        over(pm(bez((560,330),(620,395),(780,395),(840,330),30),width=10),base*0.55,0.45)  # neck shadow
        # drawstrings
        cord='#f2eee4' if base.mean()<0.5 else '#1b2640'
        for (x0,y0,x1,y1,cxp) in [(655,372,640,660,620),(745,372,765,640,790)]:
            c_pts=bez((x0,y0),(x0-6,y0+120),(cxp,y1-140),(x1,y1),40)
            over(pm(c_pts,width=12)*0+gaussian_filter(pm([(p[0]+5,p[1]+6) for p in c_pts],width=12),4),base*0.35,0.35)
            over(pm(c_pts,width=11),hexrgb(cord))
            over(pm([(x1,y1),(x1+1,y1+34)],width=13),np.array([.72,.70,.66]))
            over(pm(bez((x0-9,y0),(x0-9,y0-9),(x0+9,y0-9),(x0+9,y0),10)+bez((x0+9,y0),(x0+9,y0+9),(x0-9,y0+9),(x0-9,y0),10)),np.array([.75,.73,.68]))
        # pocket
        pk=bez((470,1300),(500,1150),(510,1060),(525,1000),20)+bez((525,1000),(640,985),(760,985),(875,1000),20)+bez((875,1000),(890,1060),(900,1150),(930,1300),20)
        over(pm(pk[:20],width=6),base*0.5,0.5);over(pm(pk[-20:],width=6),base*0.5,0.5)
        dashed_line(ds,[(x,y+10) for x,y in pk[20:40]]);dashed_line(ds,[(x+10,y) for x,y in pk[:20]]);dashed_line(ds,[(x-10,y) for x,y in pk[-20:]])
    dashed_line(ds,bez((350,1302),(500,1310),(900,1310),(1050,1302),60))
    for s in (1,-1): dashed_line(ds,[(700+s*(x-700),y) for x,y in bez((1152,1197),(1200,1203),(1250,1203),(1297,1197),20)])
    stitch=np.asarray(st.resize((W,H),Image.LANCZOS),np.float32)/255*mask
    over(stitch,col*0.72,0.45)
    for sx in (1,-1):
        edge=[(700+sx*(x-700),y) for x,y in bez((1150,1195),(1120,950),(1080,760),(1045,620),30)]
        over(gaussian_filter(pm(edge,width=6),3)*mask,base*0.45,0.6)
        side=[(700+sx*(x-700),y) for x,y in bez((1045,620),(1040,900),(1048,1150),(1050,1300),30)]
        over(gaussian_filter(pm(side,width=4),2)*mask,base*0.6,0.4)
    col=col*(shade*fib)[...,None]
    bg=np.ones((H,W,3),np.float32)*np.array([.905,.895,.875])
    bg*=(1+gaussian_filter(rng.normal(0,1,(H,W)),1)*.03+.012*np.sin(xx*2*np.pi/5)+.012*np.sin(yy*2*np.pi/5))[...,None]
    bg*=(1-.10*((xx-700)**2/700**2+(yy-750)**2/750**2))[...,None]
    bg*=(1-.38*np.roll(np.roll(gaussian_filter(mask,24),18,0),10,1))[...,None];bg*=(1-.25*gaussian_filter(mask,4))[...,None]
    img=np.clip(bg*(1-mask[...,None])+col*mask[...,None],0,1)
    Image.fromarray((img*255).astype(np.uint8)).save(out,quality=92)
if __name__=='__main__':
    for n,c in [('navy','#15233f'),('ecru','#e8e0cf')]:
        render('back',c,[(f'hout/back-{n}.png',700,440,440)],f'../h_back_{n}.jpg',seed=3)
        render('front',c,[(f'hout/chest-{n}.png',835,500,120)],f'../h_front_{n}.jpg',seed=4)
