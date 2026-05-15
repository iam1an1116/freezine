const api = require('../../utils/api');
const auth = require('../../utils/auth');
const MAX = 10;

Page({
  data: {
    admin: false, showLogin: false, loginUser: '', loginPass: '', status: '',
    showSearch: false, searchQuery: '', searchResults: [], searchDone: false
  },

  _bodies: [], _canvas: null, _ctx: null, _w: 0, _h: 0, _dpr: 2, _anim: 0, _loading: false, _btns: {},

  async onLoad() {
    this.setData({ admin: auth.isAdmin() });
    await this._initCanvas();
    this._load();
  },
  onShow() { this.setData({ admin: auth.isAdmin() }); this._startLoop(); },
  onHide() { this._stopLoop(); },
  onUnload() { this._stopLoop(); },

  // ---- Canvas ----
  _initCanvas() {
    const sys = wx.getSystemInfoSync();
    this._w = sys.windowWidth; this._h = sys.windowHeight; this._dpr = sys.pixelRatio || 2;
    return new Promise(resolve => {
      const q = wx.createSelectorQuery();
      q.select('#physicsCanvas').fields({ node: true, size: true }).exec(r => {
        if (!r || !r[0]) { setTimeout(() => this._initCanvas().then(resolve), 200); return; }
        this._canvas = r[0].node;
        this._canvas.width = this._w * this._dpr;
        this._canvas.height = this._h * this._dpr;
        this._ctx = this._canvas.getContext('2d');
        this._startLoop();
        resolve();
      });
    });
  },

  // ---- Load ----
  async _load() {
    if (this._loading) return;
    this._loading = true;
    try {
      const res = await api.listZines();
      this._build((res && res.items) || []);
    } catch (e) { this.setData({ status: '加载失败' }); }
    finally { this._loading = false; }
  },

  _build(items) {
    this._bodies = [];
    const list = items.slice(0, MAX);
    for (let i = 0; i < list.length; i++) {
      const z = list[i];
      const ar = z.aspect ? (z.aspect.w / Math.max(1, z.aspect.h)) : 1;
      const maxSide = 64;
      let bw = maxSide, bh = maxSide;
      if (ar >= 1) bh = Math.max(36, Math.round(maxSide / ar));
      else bw = Math.max(36, Math.round(maxSide * ar));

      const isHTTP = (z.iconDataURL || '').startsWith('http');
      const body = {
        id: z.id, title: z.title || '未命名',
        imgLoaded: false, img: null,
        x: 20 + Math.random() * (this._w - 120),
        y: 20 + Math.random() * (this._h - 160),
        vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
        w: bw + 8, h: bh + 28
      };
      this._bodies.push(body);

      if (isHTTP) this._loadImg(z.iconDataURL, body);
    }
  },

  _loadImg(url, body) {
    // wx.request 能通外部 URL，下载后转 base64 给 canvas
    wx.request({
      url,
      responseType: 'arraybuffer',
      success: res => {
        if (res.statusCode !== 200 || !res.data) return;
        try {
          const b64 = wx.arrayBufferToBase64(res.data);
          const ext = (url.split('.').pop() || 'png').split('?')[0];
          const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
          const dataURL = `data:${mime};base64,${b64}`;
          if (!this._canvas) return;
          const img = this._canvas.createImage();
          img.onload = () => { body.imgLoaded = true; body.img = img; };
          img.onerror = () => {};
          img.src = dataURL;
        } catch (_) {}
      },
      fail: () => {}
    });
  },

  // ---- Physics ----
  _startLoop() { if (this._anim || !this._canvas) return;
    const loop = () => { this._step(); this._render(); this._anim = this._canvas.requestAnimationFrame(loop); };
    loop();
  },
  _stopLoop() { if (this._anim && this._canvas) { this._canvas.cancelAnimationFrame(this._anim); this._anim = 0; } },

  _step() {
    const bs = this._bodies, w = this._w, h = this._h;
    const rz = [
      { x: w/2, y: h/2, r: 100 },
      { x: 24, y: h-24, r: 44 },
      { x: w-60, y: 40, r: 100 }
    ];
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i], ax = a.x + a.w/2, ay = a.y + a.h/2;
      a.vx += (Math.random()-0.5)*0.025; a.vy += (Math.random()-0.5)*0.025;
      a.vx *= 0.996; a.vy *= 0.996;
      for (const rp of rz) {
        const dx = ax-rp.x, dy = ay-rp.y, d = Math.sqrt(dx*dx+dy*dy)||1;
        if (d < rp.r) { const f = (rp.r-d)/rp.r*0.4; a.vx += dx/d*f; a.vy += dy/d*f; }
      }
      for (let j = i+1; j < bs.length; j++) {
        const b = bs[j], bx = b.x+b.w/2, by = b.y+b.h/2;
        const dx = ax-bx, dy = ay-by, d = Math.sqrt(dx*dx+dy*dy)||1, md = (a.w+b.w)/2;
        if (d < md) { const f = (md-d)/md*0.25; a.vx += dx/d*f; a.vy += dy/d*f; b.vx -= dx/d*f; b.vy -= dy/d*f; }
      }
      if (a.x<4){a.x=4;a.vx=Math.abs(a.vx)*.5;} if (a.y<4){a.y=4;a.vy=Math.abs(a.vy)*.5;}
      if (a.x+a.w>w-4){a.x=w-4-a.w;a.vx=-Math.abs(a.vx)*.5;} if(a.y+a.h>h-4){a.y=h-4-a.h;a.vy=-Math.abs(a.vy)*.5;}
      const s = Math.sqrt(a.vx*a.vx+a.vy*a.vy); if(s>1){a.vx*=1/s;a.vy*=1/s;}
      a.x += a.vx; a.y += a.vy;
    }
  },

  _render() {
    if (!this._ctx) return;
    const ctx = this._ctx, dpr = this._dpr, w = this._w, h = this._h;
    ctx.save(); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
    ctx.fillStyle = '#f1f5f9'; ctx.fillRect(0,0,w,h);

    // icons
    for (const b of this._bodies) {
      const bx=b.x, by=b.y, bw=b.w, ih=b.h-20, r=10;
      ctx.shadowColor='rgba(0,0,0,.10)'; ctx.shadowBlur=6; ctx.shadowOffsetY=2;
      ctx.fillStyle='#fff'; this._rr(ctx,bx,by,bw,ih,r); ctx.fill();
      ctx.shadowColor='transparent'; ctx.shadowBlur=0; ctx.shadowOffsetY=0;
      ctx.strokeStyle='rgba(0,0,0,.10)'; ctx.lineWidth=0.5; this._rr(ctx,bx,by,bw,ih,r); ctx.stroke();

      if (b.imgLoaded && b.img) {
        ctx.save(); this._rp(ctx,bx,by,bw,ih,r); ctx.clip(); ctx.drawImage(b.img,bx,by,bw,ih); ctx.restore();
      } else {
        ctx.fillStyle='rgba(79,70,229,.08)'; this._rr(ctx,bx+2,by+2,bw-4,ih-4,r-2); ctx.fill();
        ctx.fillStyle='rgba(79,70,229,.45)'; ctx.font=`700 ${Math.min(bw*.24,20)}px sans-serif`;
        ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(b.title.slice(0,3),bx+bw/2,by+ih/2);
      }
      ctx.fillStyle='#111827'; ctx.font='600 10px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='top';
      ctx.fillText(this._clip(ctx,b.title,bw-4),bx+bw/2,by+ih+3);
      ctx.textAlign='start'; ctx.textBaseline='alphabetic';
    }

    // buttons drawn on canvas
    this._btns = {};
    if (!this.data.showSearch) {
      const cx=w/2,cy=h/2,bw2=200,bh2=48;
      this._btn(ctx,cx-bw2/2,cy-bh2/2,bw2,bh2,'#111827','现在，设计你的ZINE','#fff');
      this._btns.enter = {x:cx-bw2/2,y:cy-bh2/2,w:bw2,h:bh2,a:'enter'};
    }
    const rx=w-16,ry=16;
    this._btn(ctx,rx-64,ry,60,36,'#fff','↻','#111827'); this._btns.refresh={x:rx-64,y:ry,w:60,h:36,a:'refresh'};
    this._btn(ctx,rx-136,ry,60,36,'#fff','🔍','#111827'); this._btns.search={x:rx-136,y:ry,w:60,h:36,a:'search'};
    const lx=14,ly=h-28;
    ctx.fillStyle=this.data.admin?'rgba(15,23,42,.85)':'rgba(15,23,42,.18)';
    ctx.beginPath(); ctx.arc(lx,ly,10,0,Math.PI*2); ctx.fill();
    this._btns.login={x:lx-14,y:ly-14,w:28,h:28,a:'login'};
    ctx.restore();
  },

  _btn(ctx,x,y,w,h,bg,text,color) {
    ctx.shadowColor='rgba(0,0,0,.08)'; ctx.shadowBlur=4; ctx.shadowOffsetY=1;
    ctx.fillStyle=bg; this._rr(ctx,x,y,w,h,h/2); ctx.fill();
    ctx.shadowColor='transparent'; ctx.shadowBlur=0; ctx.shadowOffsetY=0;
    if(bg==='#fff'){ctx.strokeStyle='rgba(0,0,0,.10)';ctx.lineWidth=0.5;this._rr(ctx,x,y,w,h,h/2);ctx.stroke();}
    ctx.fillStyle=color; ctx.font=`600 ${bg==='#fff'?13:16}px sans-serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(text,x+w/2,y+h/2);
    ctx.textAlign='start'; ctx.textBaseline='alphabetic';
  },
  _rr(ctx,x,y,w,h,r){this._rp(ctx,x,y,w,h,r);ctx.fill();},
  _rp(ctx,x,y,w,h,r){const rr=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath();},
  _clip(ctx,t,m){if(!t)return'';if(ctx.measureText(t).width<=m)return t;let s=t;while(s.length>1&&ctx.measureText(s+'…').width>m)s=s.slice(0,-1);return s+'…';},

  // ---- Tap ----
  onCanvasTap(e) {
    const x=e.detail.x,y=e.detail.y;
    for(const k of Object.keys(this._btns)){
      const b=this._btns[k];
      if(x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h){
        if(b.a==='enter')this.onEnter(); else if(b.a==='refresh')this.onRefresh();
        else if(b.a==='search')this.onSearchTap(); else if(b.a==='login')this.onLoginTap();
        return;
      }
    }
    for(const b of this._bodies){if(x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h){wx.navigateTo({url:'/pages/book/book?zine='+encodeURIComponent(b.id)});return;}}
  },

  // ---- Events ----
  onEnter(){wx.navigateTo({url:'/pages/designer/designer'});},
  onRefresh(){this._bodies=[];this._load();},
  onSearchTap(){this._stopLoop();this.setData({showSearch:true,searchQuery:'',searchResults:[],searchDone:false});},
  onSearchInput(e){this.setData({searchQuery:e.detail.value});},
  onSearch(){
    const q=(this.data.searchQuery||'').trim();if(!q)return;
    this.setData({searchDone:false,searchResults:[]});
    api.searchZines(q).then(res=>{this.setData({searchResults:(res&&res.items)||[],searchDone:true});}).catch(()=>{this.setData({searchDone:true,status:'搜索失败'});});
  },
  onSearchCancel(){
    this.setData({showSearch:false,searchQuery:'',searchResults:[],searchDone:false});
    this._canvas=null;this._ctx=null;this._initCanvas().then(()=>this._load());
  },
  onSearchItemTap(e){wx.navigateTo({url:'/pages/book/book?zine='+encodeURIComponent(e.currentTarget.dataset.id)});},
  onLoginTap(){this.setData({showLogin:true,loginUser:'',loginPass:''});},
  onCancelLogin(){this.setData({showLogin:false});},
  onUserInput(e){this.setData({loginUser:e.detail.value});},
  onPassInput(e){this.setData({loginPass:e.detail.value});},
  onLoginSubmit(){
    if(auth.login(this.data.loginUser,this.data.loginPass)){
      this.setData({showLogin:false,admin:true,status:'管理员登录成功'});setTimeout(()=>this.setData({status:''}),2000);
    }else{this.setData({loginPass:'',status:'登录失败'});setTimeout(()=>this.setData({status:''}),2000);}
  },
  stopProp(){},
  onPullDownRefresh(){this._load().then(()=>wx.stopPullDownRefresh());}
});
