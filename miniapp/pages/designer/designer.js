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

          // canvas 节点原生事件（坐标是 canvas 相对坐标）
          canvas.addEventListener('touchstart', this._onTS.bind(this));
          canvas.addEventListener('touchmove',  this._onTM.bind(this));
          canvas.addEventListener('touchend',   this._onTE.bind(this));
          this._scaleX = this.pageW / Math.max(1, displayW);
          this._scaleY = this.pageH / Math.max(1, displayH);

          resolve();
        });
    });
  },

  // ---- 触摸 (canvas 节点原生事件, 坐标是 canvas 相对的) ----
  _onTS(e) {
    if (!this.engine) return;
    const t = e.touches ? e.touches[0] : null;
    if (!t) return;
    const cx = t.x * this._scaleX;
    const cy = t.y * this._scaleY;
    const hitId = this.engine.hitTest(cx, cy);

    // 双击检测（用于编辑文字）
    const now = Date.now();
    if (hitId) {
      const obj = this.engine.objects.find(o => o.id === hitId);
      if (obj && obj.type === 'text' && this._lastTap && this._lastTap.id === hitId && (now - this._lastTap.time) < 400) {
        // 双击文字 → 编辑
        this._editText(obj);
        this._lastTap = null;
        return;
      }
      this._lastTap = { id: hitId, time: now };
    } else {
      this._lastTap = null;
    }

    if (hitId) {
      this.engine.setActive(hitId);
      this._dragData = { lx: t.x, ly: t.y };
    } else {
      this.engine.setActive(null);
      this._dragData = null;
    }
    this._syncActive();
  },

  _onTM(e) {
    if (!this.engine || !this._dragData) return;
    const t = e.touches ? e.touches[0] : null;
    if (!t) return;
    const dx = t.x - this._dragData.lx;
    const dy = t.y - this._dragData.ly;
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    this.engine.moveActive(dx * this._scaleX, dy * this._scaleY);
    this._dragData.lx = t.x;
    this._dragData.ly = t.y;
    this._saveCurrentPage();
  },

  _onTE() { this._dragData = null; },

  _editText(obj) {
    wx.showModal({
      title: '编辑文字',
      editable: true,
      placeholderText: '输入文字',
      content: obj.t || '',
      success: res => {
        if (res.confirm && res.content !== undefined) {
          obj.t = res.content;
          this.engine.dirty = true;
          this.engine.render();
          this._saveCurrentPage();
        }
      }
    });
  },

  // WXML catch 回退
  onTouchStart(e) { this._onTS(e); },
  onTouchMove(e) { this._onTM(e); },
  onTouchEnd(e) { this._onTE(e); },

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
