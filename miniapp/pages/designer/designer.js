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
          if (!res || !res[0]) {
            // retry
            setTimeout(() => {
              this._initCanvas().then(resolve);
            }, 200);
            return;
          }
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const dpr = sys.pixelRatio || 2;
          canvas.width = w * dpr;
          canvas.height = h * dpr;

          this.engine = new CanvasEngine(canvas, ctx, w, h, dpr);
          this._touchData = { lastX: 0, lastY: 0, dragging: false };
          resolve();
        });
    });
  },

  // ---------- Touch ----------
  onTouchStart(e) {
    if (!this.engine) return;
    const t = e.touches[0];
    const rect = this._getCanvasRect();
    const x = (t.x - rect.left) * (this.pageW / rect.width);
    const y = (t.y - rect.top) * (this.pageH / rect.height);

    const hitId = this.engine.hitTest(x, y);
    if (hitId) {
      this.engine.setActive(hitId);
      this._touchData = { lastX: t.x, lastY: t.y, dragging: true, id: hitId };
    } else {
      this.engine.setActive(null);
      this._touchData = { lastX: 0, lastY: 0, dragging: false };
    }
    this._syncActive();
  },

  onTouchMove(e) {
    if (!this._touchData || !this._touchData.dragging || !this.engine) return;
    const t = e.touches[0];
    const rect = this._getCanvasRect();
    const dx = (t.x - this._touchData.lastX) * (this.pageW / rect.width);
    const dy = (t.y - this._touchData.lastY) * (this.pageH / rect.height);
    this._touchData.lastX = t.x;
    this._touchData.lastY = t.y;
    this.engine.moveActive(dx, dy);
    this._saveCurrentPage();
  },

  onTouchEnd() {
    if (!this._touchData) return;
    this._touchData.dragging = false;
  },

  _getCanvasRect() {
    const query = wx.createSelectorQuery();
    // 同步获取不可行，用固定值估算
    const sys = wx.getSystemInfoSync();
    const maxDisplayW = sys.windowWidth - 32;
    const maxDisplayH = sys.windowHeight - 380;
    const scale = Math.min(maxDisplayW / this.pageW, maxDisplayH / this.pageH);
    const displayW = Math.round(this.pageW * scale);
    const displayH = Math.round(this.pageH * scale);
    const left = (sys.windowWidth - displayW) / 2;
    // approximate top offset (topbar + nav + toolbar ~ 200rpx = 100px)
    const top = 200 * sys.pixelRatio / 2;
    return { left, top, width: displayW, height: displayH };
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
      // 获取图片信息
      const info = await wx.getImageInfo({ src: path });
      this.engine.addImage(path, info.width, info.height);
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
      // 生成图标
      const iconDataURL = await this._generateIcon();

      const payload = {
        id: zid,
        title,
        createdAt: Date.now(),
        pageCount: this.data.pageCount,
        aspect: ratio,
        iconDataURL,
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
      setTimeout(() => {
        wx.navigateBack();
      }, 1000);
    } catch (e) {
      console.error(e);
      this.setData({ status: '保存失败：' + (e.message || '网络错误') });
    }
  },

  async _generateIcon() {
    // Render 4 thumbnails + compose icon
    const pages = this.pageStates;
    const originalIdx = this.data.curPage;
    const last = pages.length - 1;
    const idxs = [...new Set([0, Math.min(1, last), Math.min(2, last), last])];

    const thumbs = [];
    for (const idx of idxs) {
      await this._loadPage(idx);
      const dataUrl = await this.engine.toDataURL();
      thumbs.push(dataUrl);
    }

    // Restore original page
    await this._loadPage(originalIdx);

    // Compose icon using offscreen canvas
    const size = 512;
    const query = wx.createSelectorQuery();
    return new Promise(resolve => {
      // Use a temp canvas approach: draw thumbs into main canvas, export
      const canvas = this.engine.canvas;
      const ctx = this.engine.ctx;
      const dpr = this.engine.dpr;

      // Resize canvas temporarily for icon
      const origW = this.pageW;
      const origH = this.pageH;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // bg
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);

      // border
      ctx.lineWidth = 8;
      ctx.strokeStyle = 'rgba(124,92,255,.55)';
      this._roundRect(ctx, 18, 18, size - 36, size - 36, 44);
      ctx.stroke();

      // 2x2 grid
      const pad = 28;
      const areaTop = 112;
      const areaBottom = size - pad;
      const gap = 18;
      const cell = Math.floor((areaBottom - areaTop - gap) / 2);
      const positions = [
        { x: pad, y: areaTop },
        { x: pad + cell + gap, y: areaTop },
        { x: pad, y: areaTop + cell + gap },
        { x: pad + cell + gap, y: areaTop + cell + gap }
      ];

      const imgs = [];
      let loaded = 0;

      thumbs.forEach((src, i) => {
        const img = canvas.createImage();
        img.onload = () => {
          const pos = positions[i];
          ctx.save();
          ctx.fillStyle = 'rgba(124,92,255,.08)';
          this._roundRect(ctx, pos.x - 10, pos.y - 10, cell + 20, cell + 20, 22);
          ctx.fill();
          ctx.beginPath();
          this._roundRectPath(ctx, pos.x, pos.y, cell, cell, 20);
          ctx.clip();
          ctx.drawImage(img, pos.x, pos.y, cell, cell);
          ctx.restore();

          loaded++;
          if (loaded === thumbs.length) this._finishIcon(canvas, ctx, size, dpr, origW, origH, resolve);
        };
        img.onerror = () => {
          loaded++;
          if (loaded === thumbs.length) this._finishIcon(canvas, ctx, size, dpr, origW, origH, resolve);
        };
        img.src = src;
      });
    });
  },

  _roundRect(ctx, x, y, w, h, r) {
    this._roundRectPath(ctx, x, y, w, h, r);
    ctx.fill();
  },

  _roundRectPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  },

  _finishIcon(canvas, ctx, size, dpr, origW, origH, resolve) {
    // Title
    ctx.fillStyle = '#111827';
    ctx.font = '700 22px sans-serif';
    ctx.fillText('自由ZINE', 48, 68);
    ctx.fillStyle = 'rgba(17,24,39,.72)';
    ctx.font = '600 16px sans-serif';
    ctx.fillText(`共 ${this.data.pageCount} 页`, 48, 96);
    // corner mark
    ctx.fillStyle = 'rgba(124,92,255,.95)';
    ctx.beginPath();
    ctx.arc(size - 54, 58, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '700 15px sans-serif';
    ctx.fillText('Z', size - 58, 64);

    wx.canvasToTempFilePath({
      canvas,
      success: res => {
        // Convert temp file to base64 data URL so it persists after session
        const fs = wx.getFileSystemManager();
        try {
          const b64 = fs.readFileSync(res.tempFilePath, 'base64');
          const dataURL = 'data:image/png;base64,' + b64;
          canvas.width = origW * dpr;
          canvas.height = origH * dpr;
          resolve(dataURL);
        } catch (e) {
          canvas.width = origW * dpr;
          canvas.height = origH * dpr;
          resolve(res.tempFilePath); // fallback
        }
      },
      fail: () => {
        canvas.width = origW * dpr;
        canvas.height = origH * dpr;
        resolve('');
      }
    });
  },

  onBackHome() {
    wx.navigateBack();
  }
});
