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
    activeObj:false, activeObjScale:'1.00x', status:''
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
      const cx1 = (t.x - (rect.left||0)) * sx, cy1 = (t.y - (rect.top||0)) * sy;
      const cx2 = t.x * sx, cy2 = t.y * sy;
      let hitId = this.engine.hitTest(cx1, cy1);
      if (!hitId) hitId = this.engine.hitTest(cx2, cy2);

      // 双击编辑文字
      const now = Date.now();
      if (hitId && this._lt && this._lt.id === hitId && (now - this._lt.t) < 400) {
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
      this._lt = hitId ? {id:hitId, t:now} : null;

      wx.showToast({ title: hitId ? 'HIT!' : 'miss', icon:'none', duration:300 });
      if (hitId) {
        this.engine.setActive(hitId);
        this._dragData = { lx:t.x, ly:t.y };
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
    this._getRect(rect => {
      const s = this.pageW / Math.max(1, rect.width);
      this.engine.moveActive(dx*s, dy*s);
    });
    this._dragData.lx = t.x; this._dragData.ly = t.y;
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
    this.engine.addText('文字', { fill:this.data.fontColor, fontSize:Math.round(28*this.data.fontScale), fontFamily:this.data.fontFamilyValues[this.data.fontFamilyIdx] });
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
  onFontColorInput(e) { const v=e.detail.value; this.setData({fontColor:v}); const o=this.engine?.getActive(); if(o&&(o.type==='textbox'||o.type==='text')&&/^#[0-9a-fA-F]{6}$/.test(v)){this.engine.updateActive({fill:v});this._saveCurrentPage();} },
  onBgColorInput(e) { const v=e.detail.value; this.setData({bgColor:v}); if(/^#[0-9a-fA-F]{6}$/.test(v)&&this.engine){this.engine.setBackground(v);this._saveCurrentPage();} },
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
