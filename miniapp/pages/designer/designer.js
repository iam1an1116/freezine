const { CanvasEngine } = require('../../utils/canvas-engine');
const api = require('../../utils/api');
const auth = require('../../utils/auth');

const RATIOS = {
  '1:1': { w: 1, h: 1 },
  '5:4': { w: 5, h: 4 },
  '3:2': { w: 3, h: 2 },
  '4:5': { w: 4, h: 5 },
  '2:3': { w: 2, h: 3 }
};

const MAX_PAGE_W = 400; // 逻辑 canvas 宽度

Page({
  data: {
    // Setup
    bookTitle: '',
    pageCount: 3,
    ratio: '1:1',
    // Editor
    editorVisible: false,
    curPage: 0,
    canvasStyleW: 0,
    canvasStyleH: 0,
    // Style
    fontScale: 1,
    fontScaleText: '1.00x',
    fontColor: '#0f172a',
    bgColor: '#ffffff',
    borderIdx: 0,
    borderOptions: ['灰色边框', '黑色边框', '无边框'],
    fontFamilyIdx: 0,
    fontFamilies: ['无衬线', '衬线', '宋体', '楷体', '仿宋', '等宽', '圆体', '手写风'],
    fontFamilyValues: [
      'sans-serif', 'serif', '"Songti SC", serif', '"Kaiti SC", serif',
      '"FangSong", serif', 'monospace', '"Hiragino Maru Gothic ProN", sans-serif', 'cursive'
    ],
    // Active
    activeObj: false,
    activeObjScale: '1.00x',
    // Status
    status: ''
  },

  engine: null,
  pageStates: [],
  pageW: 0,
  pageH: 0,
  _touchData: null,
  _zineId: null,

  onLoad() {
    this._zineId = `zine-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  },

  // ---------- Canvas Init ----------
  async _initCanvas() {
    if (this.engine) return;

    const ratio = RATIOS[this.data.ratio];
    const w = MAX_PAGE_W;
    const h = Math.round(w * ratio.h / ratio.w);
    this.pageW = w;
    this.pageH = h;

    // 获取屏幕可用宽度
    const sys = wx.getSystemInfoSync();
    const maxDisplayW = sys.windowWidth - 32;
    const maxDisplayH = sys.windowHeight - 380;
    const scale = Math.min(maxDisplayW / w, maxDisplayH / h);
    const displayW = Math.round(w * scale);
    const displayH = Math.round(h * scale);

    this.setData({ canvasStyleW: displayW, canvasStyleH: displayH });

    return new Promise(resolve => {
      const query = wx.createSelectorQuery();
      query.select('#zineCanvas')
        .fields({ node: true, size: true })
        .exec(res => {
          if (!res || !res[0] || !res[0].node) {
            setTimeout(() => { this._initCanvas().then(resolve); }, 200);
            return;
          }
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const dpr = sys.pixelRatio || 2;
          canvas.width = w * dpr;
          canvas.height = h * dpr;

          this.engine = new CanvasEngine(canvas, ctx, w, h, dpr);

          // 用 canvas 节点原生事件（比 WXML bind 更可靠）
          canvas.addEventListener('touchstart', this._onTS.bind(this));
          canvas.addEventListener('touchmove',  this._onTM.bind(this));
          canvas.addEventListener('touchend',   this._onTE.bind(this));

          resolve();
        });
    });
  },

  // ---- 触摸 (canvas node 原生事件 + WXML catch 回退) ----
  _getRect(cb) {
    if (this.__rect) return cb(this.__rect);
    wx.createSelectorQuery().select('#zineCanvas').boundingClientRect().exec(r => {
      if (r && r[0] && r[0].width > 0) this.__rect = r[0];
      cb(this.__rect || { left:0, top:0, width:this.data.canvasStyleW||300, height:this.data.canvasStyleH||300 });
    });
  },

  _onTS(e) {
    if (!this.engine) return;
    const t = e.touches ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : null);
    if (!t) return;
    this._getRect(rect => {
      // 尝试两种坐标转换，看哪个能命中
      const sx = this.pageW / Math.max(1, rect.width);
      const sy = this.pageH / Math.max(1, rect.height);

      // 方式1：touch coords - rect offset（viewport 相对坐标）
      const cx1 = (t.x - (rect.left || 0)) * sx;
      const cy1 = (t.y - (rect.top || 0)) * sy;
      // 方式2：touch coords 直接缩放（canvas 相对坐标）
      const cx2 = t.x * sx;
      const cy2 = t.y * sy;

      let hitId = this.engine.hitTest(cx1, cy1);
      if (!hitId) hitId = this.engine.hitTest(cx2, cy2);

      // 日志
      const objs = this.engine.objects;
      let info = `touch:(${t.x},${t.y}) rect:(${rect.left},${rect.top},${rect.width},${rect.height})`;
      info += ` => (${cx1.toFixed(0)},${cy1.toFixed(0)}) or (${cx2.toFixed(0)},${cy2.toFixed(0)})`;
      if (objs.length) {
        const o = objs[0];
        info += ` | obj:(${o.left},${o.top},${o.width*o.scaleX},${o.height*o.scaleY})`;
      }
      console.log(info);
      wx.showToast({ title: hitId ? 'HIT!' : `(${cx2.toFixed(0)},${cy2.toFixed(0)})`, icon: 'none', duration: 800 });

      if (hitId) {
        this.engine.setActive(hitId);
        this._dragData = { lx: t.x, ly: t.y, active: hitId };
      } else {
        this.engine.setActive(null);
        this._dragData = null;
      }
      this._syncActive();
    });
  },

  _onTM(e) {
    if (!this.engine || !this._dragData) return;
    const t = e.touches ? e.touches[0] : null;
    if (!t) return;
    const dx = t.x - this._dragData.lx;
    const dy = t.y - this._dragData.ly;
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    this._getRect(rect => {
      const s = this.pageW / rect.width;
      this.engine.moveActive(dx * s, dy * s);
      this._dragData.lx = t.x;
      this._dragData.ly = t.y;
      this._saveCurrentPage();
    });
  },

  _onTE() { this._dragData = null; },

  // WXML catch 回退
  onTouchStart(e) { this._onTS(e); },
  onTouchMove(e) { this._onTM(e); },
  onTouchEnd(e) { this._onTE(e); },
  onCanvasTap(e) {
    wx.showToast({ title: 'TAP!', icon: 'none', duration: 500 });
    if (!this.engine) return;
    const t = e.detail;
    const cw = Math.max(1, this.data.canvasStyleW || 300);
    const ch = Math.max(1, this.data.canvasStyleH || 300);
    const cx = (t.x || 0) * (this.pageW / cw);
    const cy = (t.y || 0) * (this.pageH / ch);
    const hitId = this.engine.hitTest(cx, cy);
    this.engine.setActive(hitId || null);
    this._syncActive();
  },

  _syncActive() {
    const obj = this.engine ? this.engine.getActive() : null;
    if (obj) {
      this.setData({
        activeObj: true,
        activeObjScale: (obj.scaleX || 1).toFixed(2) + 'x',
        fontScale: obj.type === 'textbox' ? (obj.fontSize || 28) / 28 : this.data.fontScale,
        fontScaleText: obj.type === 'textbox' ? ((obj.fontSize || 28) / 28).toFixed(2) + 'x' : this.data.fontScaleText
      });
    } else {
      this.setData({ activeObj: false, activeObjScale: '1.00x' });
    }
  },

  // ---------- 页面管理 ----------
  _saveCurrentPage() {
    if (!this.engine) return;
    this.pageStates[this.data.curPage] = this.engine.toJSON();
  },

  async _loadPage(idx) {
    if (!this.engine) await this._initCanvas();
    this._saveCurrentPage();
    this.data.curPage = idx;
    const json = this.pageStates[idx] || null;
    this.engine.clear();
    if (json) {
      this.engine.loadFromJSON(json);
      await this.engine.loadAllImages();
    } else {
      this.engine.setBackground(this.data.bgColor);
    }
    this.setData({ curPage: idx, activeObj: false });
  },

  // ---------- Setup -> Editor ----------
  async onStart() {
    const n = Math.max(1, Math.min(36, Number(this.data.pageCount) || 3));
    this.pageStates = new Array(n).fill(null);
    this.setData({ pageCount: n, curPage: 0, editorVisible: true });

    await this._initCanvas();
    this.engine.clear();
    this.engine.setBackground(this.data.bgColor);
  },

  onPrevPage() {
    const idx = this.data.curPage - 1;
    if (idx < 0) return;
    this._loadPage(idx);
  },

  onNextPage() {
    const idx = this.data.curPage + 1;
    if (idx >= this.data.pageCount) return;
    this._loadPage(idx);
  },

  // ---------- 工具栏 ----------
  onAddText() {
    if (!this.engine) return;
    this.engine.addText('双击编辑文字', {
      fill: this.data.fontColor,
      fontSize: Math.round(28 * this.data.fontScale),
      fontFamily: this.data.fontFamilyValues[this.data.fontFamilyIdx]
    });
    this._saveCurrentPage();
    this._syncActive();
  },

  async onAddImage() {
    if (!this.engine) return;
    try {
      const res = await wx.chooseImage({ count: 1, sizeType: ['compressed'] });
      const path = res.tempFilePaths[0];
      const info = await wx.getImageInfo({ src: path });
      const obj = this.engine.addImage(path, info.width, info.height);
      // 关键：把图片加载进 canvas 才能渲染
      await this.engine.loadImageForObject(obj);
      this._saveCurrentPage();
      this._syncActive();
    } catch (e) {
      if (e.errMsg && e.errMsg.includes('cancel')) return;
      this.setData({ status: '选择图片失败' });
    }
  },

  onDelActive() {
    if (!this.engine) return;
    this.engine.removeActive();
    this._saveCurrentPage();
    this._syncActive();
  },

  onClearPage() {
    wx.showModal({
      title: '确定清空本页？',
      success: res => {
        if (res.confirm && this.engine) {
          this.engine.clear();
          this.engine.setBackground(this.data.bgColor);
          this._saveCurrentPage();
          this._syncActive();
          this.setData({ status: '已清空本页' });
        }
      }
    });
  },

  onScaleDown() {
    if (!this.engine) return;
    this.engine.scaleActive(-0.1);
    this._saveCurrentPage();
    this._syncActive();
  },

  onScaleUp() {
    if (!this.engine) return;
    this.engine.scaleActive(0.1);
    this._saveCurrentPage();
    this._syncActive();
  },

  // ---------- 样式控制 ----------
  onFontScale(e) {
    const v = e.detail.value;
    this.setData({ fontScale: v, fontScaleText: v.toFixed(2) + 'x' });
    const obj = this.engine ? this.engine.getActive() : null;
    if (obj && (obj.type === 'textbox' || obj.type === 'text')) {
      this.engine.updateActive({ fontSize: Math.round(28 * v) });
      this._saveCurrentPage();
    }
  },

  onFontPick(e) {
    const idx = Number(e.detail.value);
    this.setData({ fontFamilyIdx: idx });
    const obj = this.engine ? this.engine.getActive() : null;
    if (obj && (obj.type === 'textbox' || obj.type === 'text')) {
      this.engine.updateActive({ fontFamily: this.data.fontFamilyValues[idx] });
      this._saveCurrentPage();
    }
  },

  onFontColorInput(e) {
    const v = e.detail.value;
    this.setData({ fontColor: v });
    const obj = this.engine ? this.engine.getActive() : null;
    if (obj && (obj.type === 'textbox' || obj.type === 'text')) {
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        this.engine.updateActive({ fill: v });
        this._saveCurrentPage();
      }
    }
  },

  onBgColorInput(e) {
    const v = e.detail.value;
    this.setData({ bgColor: v });
    if (/^#[0-9a-fA-F]{6}$/.test(v) && this.engine) {
      this.engine.setBackground(v);
      this._saveCurrentPage();
    }
  },

  onBorderPick(e) {
    this.setData({ borderIdx: Number(e.detail.value) });
  },

  // ---------- 其他输入 ----------
  onTitleInput(e) { this.setData({ bookTitle: e.detail.value }); },
  onPageCountInput(e) { this.setData({ pageCount: e.detail.value }); },
  onRatioTap(e) { this.setData({ ratio: e.currentTarget.dataset.v }); },

  // ---------- 完成 ----------
  async onFinish() {
    if (!this.engine) return;
    this._saveCurrentPage();

    const title = this.data.bookTitle || '自由ZINE';
    const zid = this._zineId;
    const ratio = RATIOS[this.data.ratio];

    this.setData({ status: '正在生成图标…' });

    try {
      // 1. 生成图标 data URL
      const iconDataURL = await this._generateIcon();

      // 2. 上传到 Supabase Storage 获取持久化 URL
      let iconPublicUrl = iconDataURL;
      if (iconDataURL && iconDataURL.startsWith('data:')) {
        try {
          const uploadRes = await api.uploadImage(iconDataURL, zid, 'icon.png');
          iconPublicUrl = uploadRes.publicUrl || iconDataURL;
        } catch (uploadErr) {
          console.warn('图标上传失败，使用 data URL 回退', uploadErr);
        }
      }

      const payload = {
        id: zid,
        title,
        createdAt: Date.now(),
        pageCount: this.data.pageCount,
        aspect: ratio,
        iconDataURL: iconPublicUrl,
        pageWidthPx: this.pageW,
        pageHeightPx: this.pageH,
        pageStates: this.pageStates,
        fontScaleForPage: [],
        editorCanvasBorder: ['gray', 'black', 'none'][this.data.borderIdx],
        defaultFontFamily: this.data.fontFamilyValues[this.data.fontFamilyIdx],
        defaultBgColor: this.data.bgColor,
        defaultTextColor: this.data.fontColor
      };

      await api.saveZine(zid, payload);
      this.setData({ status: '保存成功！' });
      setTimeout(() => wx.navigateBack(), 1000);
    } catch (e) {
      console.error(e);
      this.setData({ status: '保存失败：' + (e.message || '网络错误') });
    }
  },

  async _generateIcon() {
    // 直接用第一页作为封面
    const originalIdx = this.data.curPage;
    await this._loadPage(0); // 切到第一页
    const iconPath = await this.engine.toDataURL();
    await this._loadPage(originalIdx); // 恢复当前页

    // 转为 data URL 以便上传
    return new Promise(resolve => {
      const fs = wx.getFileSystemManager();
      try {
        const b64 = fs.readFileSync(iconPath, 'base64');
        resolve('data:image/png;base64,' + b64);
      } catch (_) {
        resolve(iconPath);
      }
    });
  },

  onBackHome() {
    wx.navigateBack();
  }
});
