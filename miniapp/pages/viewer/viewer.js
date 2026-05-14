const api = require('../../utils/api');
const auth = require('../../utils/auth');
const { CanvasEngine, normalizeFabricJSON } = require('../../utils/canvas-engine');

Page({
  data: {
    zineId: '',
    title: '',
    mode: 'seamless', // seamless | single
    modeLabel: '单张阅览',
    curPage: 0,
    pageImages: [],
    displayW: 0,
    isAdmin: false,
    status: ''
  },

  zineData: null,

  onLoad(opts) {
    const id = opts.id || '';
    this.setData({ zineId: id, isAdmin: auth.isAdmin() });
    this._loadZine(id);
  },

  async _loadZine(id) {
    this.setData({ status: '加载中…' });
    try {
      const z = await api.getZine(id);
      this.zineData = z;
      const sys = wx.getSystemInfoSync();
      const displayW = Math.round(sys.windowWidth - 32);

      this.setData({ title: z.title, displayW, status: '渲染页面…' });

      // 渲染每一页
      const pw = z.pageWidthPx || 720;
      const ph = z.pageHeightPx || 720;
      const images = [];
      const pageStates = z.pageStates || [];

      // 创建离屏 canvas 渲染每一页
      for (let i = 0; i < pageStates.length; i++) {
        const src = await this._renderPage(pw, ph, pageStates[i]);
        images.push(src);
      }

      this.setData({ pageImages: images, status: '' });
    } catch (e) {
      console.error(e);
      this.setData({ status: '加载失败' });
    }
  },

  _renderPage(pw, ph, json) {
    return new Promise(resolve => {
      // Use an offscreen canvas via createOffscreenCanvas or use a hidden canvas
      const query = wx.createSelectorQuery();
      // 使用 wx.createOffscreenCanvas 需要特定基础库版本
      // 这里用 Canvas 2D API 创建一个临时 canvas
      const canvas = wx.createOffscreenCanvas({
        type: '2d',
        width: pw * 2,
        height: ph * 2
      });
      const ctx = canvas.getContext('2d');
      ctx.scale(2, 2);

      // bg
      const n = normalizeFabricJSON(json);
      ctx.fillStyle = n.background || '#ffffff';
      ctx.fillRect(0, 0, pw, ph);

      // render objects
      for (const obj of n.objects) {
        ctx.save();
        if (obj.type === 'textbox' || obj.type === 'text') {
          const fs = (obj.fontSize || 28) * (obj.scaleX || 1);
          ctx.font = `${fs}px ${obj.fontFamily || 'sans-serif'}`;
          ctx.fillStyle = obj.fill || '#0f172a';
          ctx.textAlign = obj.textAlign || 'left';
          ctx.textBaseline = 'top';
          const maxW = (obj.width || 360) * (obj.scaleX || 1);
          const lines = this._wrap(ctx, obj.text || '', maxW);
          for (let j = 0; j < lines.length; j++) {
            const lx = obj.textAlign === 'center' ? obj.left + maxW / 2 :
                       obj.textAlign === 'right' ? obj.left + maxW : obj.left;
            ctx.fillText(lines[j], lx, obj.top + j * fs * 1.4);
          }
        } else if (obj.type === 'image' && obj.src) {
          // Load image
          const img = canvas.createImage();
          img.src = obj.src;
          // 同步绘制不现实，跳过图片
        }
        ctx.restore();
      }

      // Export
      wx.canvasToTempFilePath({
        canvas,
        success: res => resolve(res.tempFilePath),
        fail: () => resolve('')
      });
    });
  },

  _wrap(ctx, text, maxW) {
    if (!text) return [''];
    const lines = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (const ch of para) {
        if (ctx.measureText(line + ch).width > maxW && line.length > 0) {
          lines.push(line);
          line = ch;
        } else {
          line += ch;
        }
      }
      lines.push(line);
    }
    return lines.length ? lines : [''];
  },

  onToggleMode() {
    const next = this.data.mode === 'seamless' ? 'single' : 'seamless';
    this.setData({
      mode: next,
      modeLabel: next === 'seamless' ? '单张阅览' : '无缝阅览',
      curPage: 0
    });
  },

  onPrevPage() {
    const idx = this.data.curPage - 1;
    if (idx < 0) return;
    this.setData({ curPage: idx });
  },

  onNextPage() {
    const idx = this.data.curPage + 1;
    if (idx >= this.data.pageImages.length) return;
    this.setData({ curPage: idx });
  },

  onDelete() {
    wx.showModal({
      title: '删除电子书',
      content: '确定删除？此操作不可撤销。',
      success: async res => {
        if (!res.confirm) return;
        try {
          await api.deleteZine(this.data.zineId);
          wx.navigateBack();
        } catch (e) {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  },

  onClose() {
    wx.navigateBack();
  }
});
