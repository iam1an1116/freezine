const { CanvasEngine } = require('../../utils/canvas-engine');
const api = require('../../utils/api');
const auth = require('../../utils/auth');

const RATIOS = {
  '1:1': { w: 1, h: 1 }, '5:4': { w: 5, h: 4 }, '3:2': { w: 3, h: 2 },
  '4:5': { w: 4, h: 5 }, '2:3': { w: 2, h: 3 }
};
const MAX_PAGE_W = 400;

Page({
  data: {
    bookTitle:'', pageCount:3, ratio:'1:1',
    editorVisible:false, curPage:0, canvasStyleW:0, canvasStyleH:0,
    fontScale:1, fontScaleText:'1.00x', fontColor:'#0f172a', bgColor:'#ffffff',
    borderIdx:0, borderOptions:['灰色边框','黑色边框','无边框'],
    fontFamilyIdx:0, fontFamilies:['无衬线','衬线','宋体','楷体','仿宋','等宽','圆体','手写风'],
    fontFamilyValues:['sans-serif','serif','"Songti SC", serif','"Kaiti SC", serif','"FangSong", serif','monospace','"Hiragino Maru Gothic ProN", sans-serif','cursive'],
    activeObj:false, activeObjScale:'1.00x', status:'', snapOn:true, gridSize:20,
    showColor:false, colorTarget:'', colorPalette:['#0f172a','#334155','#475569','#64748b','#94a3b8','#cbd5e1','#e2e8f0','#f1f5f9','#ffffff','#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#6366f1','#8b5cf6','#a855f7','#ec4899','#f43f5e','#78716c','#000000']
  },
  engine:null, pageStates:[], pageW:0, pageH:0, _zineId:null, _dragData:null, _lt:null,

  onLoad() { this._zineId = 'z'+Date.now()+Math.random().toString(36).slice(2,8); },

  async _initCanvas() {
    if (this.engine) return;
    const ratio = RATIOS[this.data.ratio];
    const w = MAX_PAGE_W, h = Math.round(w * ratio.h / ratio.w);
    this.pageW = w; this.pageH = h;
    const sys = wx.getSystemInfoSync();
    const maxW = sys.windowWidth - 32, maxH = sys.windowHeight - 380;
    const scale = Math.min(maxW / w, maxH / h);
    const dW = Math.round(w * scale), dH = Math.round(h * scale);
    this.setData({ canvasStyleW: dW, canvasStyleH: dH });

    return new Promise(resolve => {
      wx.createSelectorQuery().select('#zineCanvas').fields({node:true,size:true}).exec(res => {
        if (!res||!res[0]||!res[0].node) { setTimeout(()=>this._initCanvas().then(resolve),200); return; }
        const canvas = res[0].node, ctx = canvas.getContext('2d'), dpr = sys.pixelRatio||2;
        canvas.width = w * dpr; canvas.height = h * dpr;
        this.engine = new CanvasEngine(canvas, ctx, w, h, dpr);
        this.engine.showGuides = true; // 九宫格
        canvas.addEventListener('touchstart', this._onTS.bind(this));
        canvas.addEventListener('touchmove',  this._onTM.bind(this));
        canvas.addEventListener('touchend',   this._onTE.bind(this));
        resolve();
      });
    });
  },

  // ====== 触摸 ======
  _getRect(cb) {
    if (this.__rect) return cb(this.__rect);
    wx.createSelectorQuery().select('#zineCanvas').boundingClientRect().exec(r => {
      if (r&&r[0]&&r[0].width>0) this.__rect = r[0];
      cb(this.__rect||{left:0,top:0,width:this.data.canvasStyleW||300,height:this.data.canvasStyleH||300});
    });
  },

  _onTS(e) {
    if (!this.engine) return;
    const t = e.touches ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : null);
    if (!t) return;
    this._getRect(rect => {
      const sx = this.pageW / Math.max(1, rect.width);
      const sy = this.pageH / Math.max(1, rect.height);
      const cx = t.x * sx, cy = t.y * sy;
      const hitId = this.engine.hitTest(cx, cy);

      // 8个手柄检测 (4角 + 4边中点)
      let handle = -1;
      const sel = this.engine.activeId ? this.engine.objects.find(o => o.id === this.engine.activeId) : null;
      if (sel) {
        const ox = sel.left, oy = sel.top, sw = (sel.width||40)*(sel.scaleX||1), sh = (sel.height||40)*(sel.scaleY||1);
        const hs = 11; // 手柄检测半径
        const pts = [
          {x:ox, y:oy},           // 0:左上
          {x:ox+sw, y:oy},        // 1:右上
          {x:ox, y:oy+sh},        // 2:左下
          {x:ox+sw, y:oy+sh},     // 3:右下
          {x:ox+sw/2, y:oy},      // 4:上中 (纵向)
          {x:ox+sw/2, y:oy+sh},   // 5:下中 (纵向)
          {x:ox, y:oy+sh/2},      // 6:左中 (横向)
          {x:ox+sw, y:oy+sh/2}    // 7:右中 (横向)
        ];
        for (let hi = 0; hi < 8; hi++) {
          if (Math.abs(cx - pts[hi].x) <= hs && Math.abs(cy - pts[hi].y) <= hs) {
            handle = hi; break;
          }
        }
      }

      // 双击编辑文字
      const now = Date.now();
      if (handle < 0 && hitId && this._lt && this._lt.id === hitId && (now - this._lt.t) < 400) {
        const obj = this.engine.objects.find(o => o.id === hitId);
        if (obj && (obj.type==='textbox'||obj.type==='text')) {
          wx.showModal({
            title:'编辑文字', editable:true, placeholderText:'输入文字',
            content: obj.text||obj.t||'',
            success: res => {
              if (res.confirm && res.content !== undefined) {
                obj.text = res.content; obj.t = res.content;
                this.engine.dirty = true; this.engine.render(); this._saveCurrentPage();
              }
            }
          });
          this._lt = null; return;
        }
      }
      this._lt = (handle < 0 && hitId) ? {id:hitId, t:now} : null;

      if (handle >= 0) {
        this.engine.setActive(sel.id);
        const ol = sel.left, ot = sel.top, ow = sel.width||40, oh = sel.height||40;
        const sw = ow*(sel.scaleX||1), sh = oh*(sel.scaleY||1);
        const hx = [ol, ol+sw, ol, ol+sw, ol+sw/2, ol+sw/2, ol, ol+sw][handle];
        const hy = [ot, ot, ot+sh, ot+sh, ot, ot+sh, ot+sh/2, ot+sh/2][handle];
        this._dragData = { lx:t.x, ly:t.y, handle, ow, oh, ol, ot, sw, sh, hx, hy, rawX:0, rawY:0 };
      } else if (hitId) {
        this.engine.setActive(hitId);
        this._dragData = { lx:t.x, ly:t.y, rawX:sel.left, rawY:sel.top };
      } else {
        this.engine.setActive(null);
        this._dragData = null;
      }
      this._syncActive();
    });
  },

  _onTM(e) {
    if (!this.engine||!this._dragData) return;
    const t = e.touches?e.touches[0]:null;
    if (!t) return;
    const dx = t.x-this._dragData.lx, dy = t.y-this._dragData.ly;
    if (Math.abs(dx)<3 && Math.abs(dy)<3) return;

    if (this._dragData.handle >= 0) {
      const sel = this.engine.objects.find(o => o.id === this.engine.activeId);
      if (!sel) return;
      this._getRect(rect => {
        const sc = this.pageW / Math.max(1, rect.width);
        const h = this._dragData.handle;
        const d = this._dragData;
        const clampS = v => Math.max(0.02, Math.min(5, v));

        if (h === 4 || h === 5) {
          // 上下中点：纵向拉伸
          const ay = h === 4 ? d.ot + d.sh : d.ot; // 锚点Y
          const nhy = d.hy + dy * sc;
          sel.top = Math.min(nhy, ay);
          sel.scaleY = clampS(Math.abs(nhy - ay) / Math.max(1, d.oh));
        } else if (h === 6 || h === 7) {
          // 左右中点：横向拉伸
          const ax = h === 6 ? d.ol + d.sw : d.ol; // 锚点X
          const nhx = d.hx + dx * sc;
          sel.left = Math.min(nhx, ax);
          sel.scaleX = clampS(Math.abs(nhx - ax) / Math.max(1, d.ow));
        } else {
          // 四角
          const ax = (h === 0 || h === 2) ? d.ol + d.sw : d.ol;
          const ay = (h === 0 || h === 1) ? d.ot + d.sh : d.ot;
          const nhx = d.hx + dx * sc, nhy = d.hy + dy * sc;
          const rsx = Math.abs(nhx - ax) / Math.max(1, d.ow);
          const rsy = Math.abs(nhy - ay) / Math.max(1, d.oh);
          sel.left = Math.min(nhx, ax);
          sel.top = Math.min(nhy, ay);
          if (sel.type === 'textbox' || sel.type === 'text') {
            sel.scaleX = clampS(rsx);
            sel.scaleY = clampS(rsy);
          } else {
            const s = clampS(Math.max(rsx, rsy));
            sel.scaleX = sel.scaleY = s;
          }
        }
        this.engine.dirty = true; this.engine.render();
      });
    } else {
      // 普通拖拽：用 rawX/rawY 累加，吸附显示，不抖
      const gs = this.data.gridSize || 20;
      this._getRect(rect => {
        const s = this.pageW / Math.max(1, rect.width);
        this.engine.moveActive(dx*s, dy*s);
        // 吸附（不改变 lx/ly 基准，仅修正对象位置）
        const obj = this.engine.getActive();
        if (obj) {
          obj.left = Math.round(obj.left / gs) * gs;
          obj.top = Math.round(obj.top / gs) * gs;
        }
      });
      this._dragData.lx = t.x; this._dragData.ly = t.y;
    }
    this._saveCurrentPage();
  },

  _onTE() { this._dragData = null; },

  // WXML catch 事件入口
  onTS(e) { wx.showToast({title:'T',icon:'none',duration:300}); this._onTS(e); },
  onTM(e) { this._onTM(e); },
  onTE(e) { this._onTE(e); },

  _syncActive() {
    const obj = this.engine ? this.engine.getActive() : null;
    if (obj) {
      this.setData({
        activeObj:true,
        activeObjScale:(obj.scaleX||1).toFixed(2)+'x',
        fontScale: obj.type==='textbox' ? (obj.fontSize||28)/28 : this.data.fontScale,
        fontScaleText: obj.type==='textbox' ? ((obj.fontSize||28)/28).toFixed(2)+'x' : this.data.fontScaleText
      });
    } else {
      this.setData({activeObj:false, activeObjScale:'1.00x'});
    }
  },

  // ====== 页面 ======
  _saveCurrentPage() { if(this.engine) this.pageStates[this.data.curPage]=this.engine.toJSON(); },

  async _loadPage(idx) {
    if(!this.engine) await this._initCanvas();
    this._saveCurrentPage(); this.data.curPage = idx;
    const json = this.pageStates[idx]||null;
    this.engine.clear();
    if(json){ this.engine.loadFromJSON(json); await this.engine.loadAllImages(); }
    else this.engine.setBackground(this.data.bgColor);
    this.setData({curPage:idx, activeObj:false});
  },

  async onStart() {
    const n = Math.max(1, Math.min(36, Number(this.data.pageCount)||3));
    this.pageStates = new Array(n).fill(null);
    this.setData({pageCount:n, curPage:0, editorVisible:true});
    await this._initCanvas();
    this.engine.clear(); this.engine.setBackground(this.data.bgColor);
  },

  onPrevPage() { const i=this.data.curPage-1; if(i>=0) this._loadPage(i); },
  onNextPage() { const i=this.data.curPage+1; if(i<this.data.pageCount) this._loadPage(i); },

  // ====== 工具 ======
  onAddText() {
    if(!this.engine) return;
    const fs = Math.round(28*this.data.fontScale);
    const ff = this.data.fontFamilyValues[this.data.fontFamilyIdx];
    // 用 canvas 实际测量文字宽度
    const ctx = this.engine.ctx;
    ctx.save();
    ctx.font = `${fs}px ${ff}`;
    const tw = ctx.measureText('文字').width;
    ctx.restore();
    const w = Math.max(60, Math.ceil(tw + 12));
    const h = Math.ceil(fs * 1.3 + 8);
    this.engine.addText('文字', { fill:this.data.fontColor, fontSize:fs, fontFamily:ff, width:w, height:h });
    this._saveCurrentPage(); this._syncActive();
  },

  async onAddImage() {
    if(!this.engine) return;
    try {
      const r = await wx.chooseImage({count:1,sizeType:['compressed']});
      const info = await wx.getImageInfo({src:r.tempFilePaths[0]});
      const obj = this.engine.addImage(r.tempFilePaths[0], info.width, info.height);
      await this.engine.loadImageForObject(obj);
      this._saveCurrentPage(); this._syncActive();
    } catch(e) { if(!e.errMsg?.includes?.('cancel')) this.setData({status:'选择图片失败'}); }
  },

  onDelActive() { if(this.engine){this.engine.removeActive();this._saveCurrentPage();this._syncActive();} },

  onClearPage() {
    wx.showModal({ title:'确定清空本页？', success: res => {
      if(res.confirm&&this.engine){this.engine.clear();this.engine.setBackground(this.data.bgColor);this._saveCurrentPage();this._syncActive();this.setData({status:'已清空本页'});}
    }});
  },

  onScaleDown() { if(this.engine){this.engine.scaleActive(-0.1);this._saveCurrentPage();this._syncActive();} },
  onScaleUp()   { if(this.engine){this.engine.scaleActive(0.1);this._saveCurrentPage();this._syncActive();} },

  // ====== 样式 ======
  onFontScale(e) { const v=e.detail.value; this.setData({fontScale:v,fontScaleText:v.toFixed(2)+'x'}); const o=this.engine?.getActive(); if(o&&(o.type==='textbox'||o.type==='text')){this.engine.updateActive({fontSize:Math.round(28*v)});this._saveCurrentPage();} },
  onFontPick(e) { const i=Number(e.detail.value); this.setData({fontFamilyIdx:i}); const o=this.engine?.getActive(); if(o&&(o.type==='textbox'||o.type==='text')){this.engine.updateActive({fontFamily:this.data.fontFamilyValues[i]});this._saveCurrentPage();} },
  onFontColorTap() { wx.showToast({title:'color',icon:'none',duration:300}); this.setData({showColor:true, colorTarget:'font'}); },
  onBgColorTap() { wx.showToast({title:'color',icon:'none',duration:300}); this.setData({showColor:true, colorTarget:'bg'}); },
  onPickColor(e) {
    const c = e.currentTarget.dataset.color;
    if (this.data.colorTarget === 'font') {
      this.setData({fontColor:c});
      const o = this.engine?.getActive();
      if (o && (o.type==='textbox'||o.type==='text')) { this.engine.updateActive({fill:c}); this._saveCurrentPage(); }
    } else {
      this.setData({bgColor:c});
      if (this.engine) { this.engine.setBackground(c); this._saveCurrentPage(); }
    }
    this.setData({showColor:false});
  },
  onColorClose() { this.setData({showColor:false}); },
  noop() {},
  onBorderPick(e) { this.setData({borderIdx:Number(e.detail.value)}); },
  onTitleInput(e) { this.setData({bookTitle:e.detail.value}); },
  onPageCountInput(e) { this.setData({pageCount:e.detail.value}); },
  onRatioTap(e) { this.setData({ratio:e.currentTarget.dataset.v}); },

  // ====== 保存 ======
  async onFinish() {
    if(!this.engine) return;
    this._saveCurrentPage();
    const title = this.data.bookTitle||'自由ZINE', zid = this._zineId, ratio = RATIOS[this.data.ratio];
    this.setData({status:'正在生成图标…'});
    try {
      const iconDataURL = await this._generateIcon();
      let iconUrl = iconDataURL;
      if (iconDataURL&&iconDataURL.startsWith('data:')) {
        try { const u = await api.uploadImage(iconDataURL, zid, 'icon.png'); iconUrl = u.publicUrl||iconDataURL; } catch(_){}
      }
      await api.saveZine(zid, { id:zid, title, createdAt:Date.now(), pageCount:this.data.pageCount, aspect:ratio, iconDataURL:iconUrl, pageWidthPx:this.pageW, pageHeightPx:this.pageH, pageStates:this.pageStates, fontScaleForPage:[], editorCanvasBorder:['gray','black','none'][this.data.borderIdx], defaultFontFamily:this.data.fontFamilyValues[this.data.fontFamilyIdx], defaultBgColor:this.data.bgColor, defaultTextColor:this.data.fontColor });
      this.setData({status:'保存成功！'}); setTimeout(()=>wx.navigateBack(), 1000);
    } catch(e) { console.error(e); this.setData({status:'保存失败：'+(e.message||'网络错误')}); }
  },

  async _generateIcon() {
    const orig = this.data.curPage;
    await this._loadPage(0);
    const iconPath = await this.engine.toDataURL();
    await this._loadPage(orig);
    return new Promise(resolve => {
      try { const b64 = wx.getFileSystemManager().readFileSync(iconPath,'base64'); resolve('data:image/png;base64,'+b64); }
      catch(_) { resolve(iconPath); }
    });
  },

  onBackHome() { wx.navigateBack(); }
});
