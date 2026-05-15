const api = require('../../utils/api');

/* ---- 工具 ---- */
function genId() { return 'o' + Date.now() + Math.random().toString(36).slice(2,6); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function dist(x1,y1,x2,y2) { return Math.sqrt((x1-x2)**2 + (y1-y2)**2); }
function hexOk(s) { return /^#[0-9a-fA-F]{6}$/.test(s); }

const PALETTE = ['#0f172a','#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899','#ffffff','#94a3b8','#000000'];
const FONTS = ['sans-serif','serif','"Songti SC"','"Kaiti SC"','"FangSong"','monospace','"Hiragino Maru Gothic ProN"','cursive'];
const RATIOS = { '1:1':[1,1], '5:4':[5,4], '3:2':[3,2], '4:5':[4,5], '2:3':[2,3] };

Page({
  data: {
    pageInfo:'', gridOn:true, gridSize:20, gridColor:'#e2e8f0', snapOn:true, activeObj:false,
    showGridModal:false, showColor:false, showFonts:false,
    palette:PALETTE, fontList:FONTS, ratio:'1:1', pageCount:3, bookTitle:'',
  },

  /* ======== 初始化 ======== */
  onLoad() {
    const s = wx.getSystemInfoSync();
    this.W = s.windowWidth; this.H = s.windowHeight; this.DPR = s.pixelRatio||2;
    this.pageW = 400; this.pageH = 400;
    this.pages = []; this.cur = 0; this.zid = 'z'+Date.now();
    this.objs = []; this.activeId = null;
    this._drag = null; this._pinch = null;
    this._initCanvas();
  },

  _initCanvas() {
    const q = wx.createSelectorQuery();
    q.select('#ec').fields({node:true,size:true}).exec(r => {
      if (!r||!r[0]||!r[0].node) { setTimeout(()=>this._initCanvas(),200); return; }
      this.canvas = r[0].node;
      this.ctx = this.canvas.getContext('2d');
      this.canvas.width = this.W * this.DPR;
      this.canvas.height = this.H * this.DPR;

      // 获取 canvas 位置
      q.select('#ec').boundingClientRect().exec(r2 => {
        if (r2&&r2[0]) this._rect = r2[0];
      });

      // 初始化第一页
      this._newPage(0);
      this._render();
    });
  },

  _newPage(idx) {
    while (this.pages.length <= idx) this.pages.push(null);
    if (!this.pages[idx]) this.pages[idx] = { bg:'#ffffff', objs:[] };
    this.cur = idx;
    this.objs = this.pages[idx].objs;
    this.activeId = null;
    this.setData({ pageInfo: `第${idx+1}页`, activeObj:false });
  },

  /* ======== 渲染 ======== */
  _render() {
    const ctx = this.ctx, dpr = this.DPR, W=this.W, H=this.H;
    ctx.save(); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,W,H);

    // 背景
    const bg = this.pages[this.cur] ? this.pages[this.cur].bg : '#fff';
    ctx.fillStyle = bg; ctx.fillRect(0,0,W,H);

    // 网格
    if (this.data.gridOn) {
      const gs = this.data.gridSize;
      ctx.strokeStyle = this.data.gridColor;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let x = gs; x < W; x += gs) { ctx.moveTo(x,0); ctx.lineTo(x,H); }
      for (let y = gs; y < H; y += gs) { ctx.moveTo(0,y); ctx.lineTo(W,y); }
      ctx.stroke();
    }

    // 画布边界
    const cx = (W - this.pageW) / 2, cy = (H - this.pageH) / 2;
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2;
    ctx.strokeRect(cx, cy, this.pageW, this.pageH);
    ctx.fillStyle = '#fff'; ctx.fillRect(cx, cy, this.pageW, this.pageH);

    // 页面背景
    ctx.fillStyle = bg; ctx.fillRect(cx, cy, this.pageW, this.pageH);

    // 对象
    for (const o of this.objs) {
      const ox = cx + o.x, oy = cy + o.y;
      ctx.save();
      if (o.type === 'text') {
        const fs = o.fs * o.sx;
        ctx.font = `${fs}px ${o.ff||'sans-serif'}`;
        ctx.fillStyle = o.c||'#0f172a';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        const lines = this._wrap(ctx, o.t||'', o.w*o.sx);
        for (let i=0;i<lines.length;i++) ctx.fillText(lines[i], ox, oy + i*fs*1.4);
      } else if (o.type === 'img' && o._img) {
        ctx.drawImage(o._img, ox, oy, o.w*o.sx, o.h*o.sy);
      } else if (o.type === 'img') {
        ctx.fillStyle = 'rgba(0,0,0,.05)'; ctx.fillRect(ox,oy,o.w*o.sx,o.h*o.sy);
        ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth=1;
        ctx.strokeRect(ox,oy,o.w*o.sx,o.h*o.sy);
      }

      // 选中框
      if (o.id === this.activeId) {
        const sw = o.w*o.sx, sh = o.h*o.sy;
        ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 2; ctx.setLineDash([4,3]);
        ctx.strokeRect(ox-3,oy-3,sw+6,sh+6); ctx.setLineDash([]);
        // 手柄
        [[ox-5,oy-5],[ox+sw-5,oy-5],[ox-5,oy+sh-5],[ox+sw-5,oy+sh-5]].forEach(([hx,hy])=>{
          ctx.fillStyle='#fff'; ctx.fillRect(hx,hy,10,10);
          ctx.strokeStyle='#6366f1'; ctx.lineWidth=1.5; ctx.strokeRect(hx,hy,10,10);
        });
      }
      ctx.restore();
    }
    ctx.restore();
  },

  _wrap(ctx,t,mw) {
    if(!t)return[''];const ls=[];for(const p of t.split('\n')){let l='';for(const c of p){
      if(ctx.measureText(l+c).width>mw&&l.length){ls.push(l);l=c;}else l+=c;}ls.push(l);}
    return ls.length?ls:[''];
  },

  /* ======== 触摸 ======== */
  onTS(e) {
    if (!this.canvas) return;
    const t = e.touches[0];
    const rc = this._rect || {left:0,top:0,width:this.W,height:this.H};
    const cx = (this.W - this.pageW)/2, cy = (this.H - this.pageH)/2;

    if (e.touches.length === 2) {
      this._pinch = { d0: dist(e.touches[0].x,e.touches[0].y,e.touches[1].x,e.touches[1].y) };
      return;
    }

    this._drag = { sx:t.x, sy:t.y, lx:t.x, ly:t.y, moved:false };
    const mx = t.x - cx, my = t.y - cy;
    if (mx<0||my<0||mx>this.pageW||my>this.pageH) return;

    // 检测角落手柄
    const hs = 6;
    for (let i=this.objs.length-1;i>=0;i--) {
      const o=this.objs[i];
      if (o.id!==this.activeId) continue;
      const ox=cx+o.x, oy=cy+o.y, sw=o.w*o.sx, sh=o.h*o.sy;
      const corners = [[ox-6,oy-6],[ox+sw-6,oy-6],[ox-6,oy+sh-6],[ox+sw-6,oy+sh-6]];
      for (let c=0;c<4;c++) {
        if (t.x>=corners[c][0]&&t.x<=corners[c][0]+12 && t.y>=corners[c][1]&&t.y<=corners[c][1]+12) {
          this._drag = { sx:t.x, sy:t.y, lx:t.x, ly:t.y, moved:false, corner:c, obj:o, ox:o.x, oy:o.y, ow:o.w, oh:o.h, osx:o.sx, osy:o.sy };
          return;
        }
      }
    }

    // hit test objects
    for (let i=this.objs.length-1;i>=0;i--) {
      const o=this.objs[i], ox=cx+o.x, oy=cy+o.y;
      if (t.x>=ox&&t.x<=ox+o.w*o.sx && t.y>=oy&&t.y<=oy+o.h*o.sy) {
        this.activeId = o.id; this._drag.obj=o; this._drag.ox=o.x; this._drag.oy=o.y;
        this.setData({activeObj:true}); this._render(); return;
      }
    }
    // deselect
    this.activeId = null; this.setData({activeObj:false}); this._render();
  },

  onTM(e) {
    if (!this._drag || !this.canvas) return;

    // pinch
    if (e.touches.length===2 && this._pinch) {
      const d = dist(e.touches[0].x,e.touches[0].y,e.touches[1].x,e.touches[1].y);
      const s = d/this._pinch.d0;
      const ao = this.objs.find(o=>o.id===this.activeId);
      if (ao) { ao.sx = clamp(ao.sx*s,0.1,5); ao.sy = clamp(ao.sy*s,0.1,5); }
      this._pinch.d0 = d; this._render(); return;
    }

    const t = e.touches[0];
    const dx = t.x - this._drag.lx, dy = t.y - this._drag.ly;
    if (!this._drag.moved && (Math.abs(dx)>3||Math.abs(dy)>3)) this._drag.moved = true;
    if (!this._drag.moved) return;

    const ao = this.objs.find(o=>o.id===this.activeId);
    if (!ao) return;

    const gs = this.data.snapOn ? this.data.gridSize : 1;

    if (this._drag.corner !== undefined && ao.id===this._drag.obj?.id) {
      // 角落缩放
      const sdx = dx / this._drag.ow, sdy = dy / this._drag.oh;
      if (this._drag.corner===0) { ao.sx=clamp(Math.round((this._drag.osx-sdx)/gs)*gs,0.1,5); ao.sy=clamp(Math.round((this._drag.osy-sdy)/gs)*gs,0.1,5); }
      else if (this._drag.corner===1) { ao.sx=clamp(Math.round((this._drag.osx+sdx)/gs)*gs,0.1,5); ao.sy=clamp(Math.round((this._drag.osy-sdy)/gs)*gs,0.1,5); }
      else if (this._drag.corner===2) { ao.sx=clamp(Math.round((this._drag.osx-sdx)/gs)*gs,0.1,5); ao.sy=clamp(Math.round((this._drag.osy+sdy)/gs)*gs,0.1,5); }
      else { ao.sx=clamp(Math.round((this._drag.osx+sdx)/gs)*gs,0.1,5); ao.sy=clamp(Math.round((this._drag.osy+sdy)/gs)*gs,0.1,5); }
    } else {
      ao.x = clamp(Math.round((this._drag.ox + dx)/gs)*gs, -this.pageW, this.pageW*2);
      ao.y = clamp(Math.round((this._drag.oy + dy)/gs)*gs, -this.pageH, this.pageH*2);
    }
    this._drag.lx = t.x; this._drag.ly = t.y;
    this._render();
  },

  onTE() { this._drag = null; this._pinch = null; },
  onTap(e) {
    // cover-view tap 回退
    if (!this.canvas) return;
    const t = e.detail;
    const cx = (this.W-this.pageW)/2, cy = (this.H-this.pageH)/2;
    if (!t) return;
    const mx=(t.x||0)-cx, my=(t.y||0)-cy;
    if (mx<0||my<0||mx>this.pageW||my>this.pageH) return;
    for (let i=this.objs.length-1;i>=0;i--) {
      const o=this.objs[i], ox=cx+o.x, oy=cy+o.y;
      if (t.x>=ox&&t.x<=ox+o.w*o.sx && t.y>=oy&&t.y<=oy+o.h*o.sy) {
        this.activeId=o.id; this.setData({activeObj:true}); this._render(); return;
      }
    }
    this.activeId=null; this.setData({activeObj:false}); this._render();
  },

  /* ======== 按钮 ======== */
  onBack() { wx.navigateBack(); },
  onAddText() {
    const t = '文字';
    const o = { id:genId(), type:'text', x:50, y:50, w:200, h:60, sx:1, sy:1, fs:28, ff:'sans-serif', c:'#0f172a', t };
    this.objs.push(o); this.activeId=o.id; this.setData({activeObj:true}); this._render();
  },
  async onAddImg() {
    try {
      const r = await wx.chooseImage({count:1,sizeType:['compressed']});
      const info = await wx.getImageInfo({src:r.tempFilePaths[0]});
      const maxS = Math.min(this.pageW*0.6/info.width, this.pageH*0.6/info.height, 1);
      const o = { id:genId(), type:'img', x:20, y:20, w:info.width, h:info.height, sx:maxS, sy:maxS, src:r.tempFilePaths[0], _img:null };
      this.objs.push(o); this.activeId=o.id; this.setData({activeObj:true});
      // 加载图片
      if (this.canvas) {
        const img = this.canvas.createImage();
        img.onload = () => { o._img = img; this._render(); };
        img.src = o.src;
      }
      this._render();
    } catch(e) { if (!e.errMsg?.includes?.('cancel')) wx.showToast({title:'选图失败',icon:'none'}); }
  },
  onDel() {
    if (!this.activeId) return;
    this.objs = this.objs.filter(o=>o.id!==this.activeId);
    this.pages[this.cur].objs = this.objs;
    this.activeId=null; this.setData({activeObj:false}); this._render();
  },
  onUndo() { if (this.objs.length) { this.objs.pop(); this.activeId=null; this.setData({activeObj:false}); this._render(); } },

  onPrev() { if(this.cur>0){this.pages[this.cur].objs=this.objs;this._newPage(this.cur-1);this._render();} },
  onNext() {
    this.pages[this.cur].objs=this.objs;
    if (this.cur>=this.pages.length-1) this.pages.push({bg:'#ffffff',objs:[]});
    this._newPage(this.cur+1); this._render();
  },

  onGrid() { this.setData({gridOn:!this.data.gridOn}); this._render(); },
  onGridSizeUp() { this.setData({gridSize:Math.min(100,this.data.gridSize+5)}); this._render(); },
  onGridSizeDown() { this.setData({gridSize:Math.max(5,this.data.gridSize-5)}); this._render(); },
  onGridColor() { this.setData({showGridModal:true}); },
  onPickGridColor(e) { this.setData({gridColor:e.currentTarget.dataset.color,showGridModal:false}); this._render(); },
  onGridClose() { this.setData({showGridModal:false}); },

  onFontDown() { const o=this._ao();if(o&&o.type==='text'){o.fs=Math.max(8,o.fs-4);this._render();} },
  onFontUp() { const o=this._ao();if(o&&o.type==='text'){o.fs=Math.min(120,o.fs+4);this._render();} },
  onFontPick() { this.setData({showFonts:true}); },
  onPickFont(e) { const o=this._ao();if(o&&o.type==='text'){o.ff=e.currentTarget.dataset.font;this._render();} this.setData({showFonts:false}); },
  onFontClose() { this.setData({showFonts:false}); },

  onColorPick() { this.setData({showColor:true,_colorTarget:'text'}); },
  onBgPick() { this.setData({showColor:true,_colorTarget:'bg'}); },
  onPickColor(e) {
    const c = e.currentTarget.dataset.color;
    if (this.data._colorTarget==='text') { const o=this._ao();if(o){o.c=c;this._render();} }
    else if (this.data._colorTarget==='bg') { this.pages[this.cur].bg=c;this._render(); }
    else if (this.data._colorTarget==='grid') { this.setData({gridColor:c});this._render(); }
    this.setData({showColor:false});
  },
  onColorClose() { this.setData({showColor:false}); },

  onScaleDown() { const o=this._ao();if(o){o.sx=clamp(o.sx*0.85,0.1,5);o.sy=o.sx;this._render();} },
  onScaleUp() { const o=this._ao();if(o){o.sx=clamp(o.sx*1.15,0.1,5);o.sy=o.sx;this._render();} },

  _move(dx,dy) { const o=this._ao();if(o){o.x+=dx;o.y+=dy;this._render();} },
  onMoveUp(){this._move(0,-10);}, onMoveDown(){this._move(0,10);},
  onMoveLeft(){this._move(-10,0);}, onMoveRight(){this._move(10,0);},

  onSnapOn() { this.setData({snapOn:!this.data.snapOn}); },

  _ao() { return this.objs.find(o=>o.id===this.activeId)||null; },

  /* ======== 保存 ======== */
  async onSave() {
    this.pages[this.cur].objs = this.objs;
    wx.showLoading({title:'保存中…'});
    try {
      // 生成封面（第一页）
      const firstObjs = (this.pages[0]||{objs:[]}).objs;
      const iconB64 = await this._genIcon(firstObjs, (this.pages[0]||{}).bg||'#fff');
      // 上传到 storage
      let iconUrl = iconB64;
      if (iconB64.startsWith('data:')) {
        try { const u = await api.uploadImage(iconB64, this.zid, 'icon.png'); iconUrl = u.publicUrl||iconB64; }
        catch(e) { console.warn('upload icon fail', e); }
      }
      // 构建 pageStates
      const pageStates = this.pages.map(p => ({
        background: (p||{}).bg||'#ffffff',
        objects: (p||{}).objs.map(o => ({
          type: o.type==='img'?'image':'textbox', left:o.x, top:o.y, width:o.w, height:o.h,
          scaleX:o.sx, scaleY:o.sy, fontSize:o.fs, fontFamily:o.ff, fill:o.c, text:o.t, src:o.src||''
        }))
      }));
      await api.saveZine(this.zid, {
        id:this.zid, title:this.data.bookTitle||'自由ZINE', createdAt:Date.now(),
        pageCount:this.pages.length, aspect:{w:1,h:1}, iconDataURL:iconUrl,
        pageWidthPx:this.pageW, pageHeightPx:this.pageH, pageStates,
        defaultBgColor:(this.pages[0]||{}).bg||'#ffffff', defaultTextColor:'#0f172a'
      });
      wx.hideLoading(); wx.showToast({title:'保存成功'}); setTimeout(()=>wx.navigateBack(),1000);
    } catch(e) { wx.hideLoading(); wx.showToast({title:'保存失败',icon:'none'}); console.error(e); }
  },

  _genIcon(objs, bg) {
    return new Promise(resolve => {
      const sz=256, dpr=2;
      const c = wx.createOffscreenCanvas({type:'2d',width:sz*dpr,height:sz*dpr});
      if (!c) { resolve(''); return; }
      const ctx=c.getContext('2d'); ctx.scale(dpr,dpr);
      ctx.fillStyle=bg||'#fff'; ctx.fillRect(0,0,sz,sz);
      const tasks=[];
      for (const o of (objs||[])) {
        const sc = Math.min(sz/this.pageW, sz/this.pageH);
        if (o.type==='text') {
          const fs=o.fs*sc*o.sx; ctx.font=`${fs}px ${o.ff||'sans-serif'}`;
          ctx.fillStyle=o.c||'#0f172a'; ctx.fillText(o.t||'',o.x*sc,o.y*sc+fs);
        } else if (o.type==='img' && o.src) {
          tasks.push(new Promise(done=>{
            const img=c.createImage();
            img.onload=()=>{ctx.drawImage(img,o.x*sc,o.y*sc,o.w*o.sx*sc,o.h*o.sy*sc);done();};
            img.onerror=done; img.src=o.src;
          }));
        }
      }
      Promise.all(tasks).then(()=>{
        wx.canvasToTempFilePath({canvas:c,success:r=>{
          try{const b64=wx.getFileSystemManager().readFileSync(r.tempFilePath,'base64');resolve('data:image/png;base64,'+b64);}
          catch(_){resolve(r.tempFilePath);}
        },fail:()=>resolve('')});
      });
    });
  },
});
