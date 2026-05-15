const api = require('../../utils/api');
const auth = require('../../utils/auth');
const { normalizeFabricJSON } = require('../../utils/canvas-engine');

Page({
  data: {
    zineId: '', title: '', mode: 'seamless', modeLabel: '单张阅览',
    curPage: 0, pageImages: [], displayW: 0, isAdmin: false, status: '',
    renderW: 0, renderH: 0
  },

  _renderCanvas: null,
  _renderCtx: null,
  _pw: 0, _ph: 0,

  onLoad(opts) {
    const id = opts.id || '';
    this.setData({ zineId: id, isAdmin: auth.isAdmin() });
    this._loadZine(id);
  },

  async _loadZine(id) {
    this.setData({ status: '加载中…' });
    try {
      const z = await api.getZine(id);
      const sys = wx.getSystemInfoSync();
      const displayW = Math.round(sys.windowWidth - 32);
      const pw = z.pageWidthPx || 400;
      const ph = z.pageHeightPx || 400;

      this._pw = pw; this._ph = ph;
      this.setData({ title: z.title, displayW, status: '渲染页面…', renderW: pw, renderH: ph });

      // 初始化隐藏 canvas
      await this._initRenderCanvas();

      // 渲染每一页
      const pageStates = z.pageStates || [];
      const images = [];
      for (let i = 0; i < pageStates.length; i++) {
        const src = await this._renderPage(pageStates[i]);
        images.push(src);
      }

      this.setData({ pageImages: images, status: '' });
    } catch (e) {
      console.error('viewer load error', e);
      this.setData({ status: '加载失败' });
    }
  },

  _initRenderCanvas() {
    return new Promise(resolve => {
      const query = wx.createSelectorQuery();
      query.select('#renderCanvas').fields({ node: true, size: true }).exec(res => {
        if (!res || !res[0] || !res[0].node) {
          setTimeout(() => this._initRenderCanvas().then(resolve), 200);
          return;
        }
        const canvas = res[0].node;
        const dpr = wx.getSystemInfoSync().pixelRatio || 2;
        canvas.width = this._pw * dpr;
        canvas.height = this._ph * dpr;
        this._renderCanvas = canvas;
        this._renderCtx = canvas.getContext('2d');
        resolve();
      });
    });
  },

  _renderPage(json) {
    return new Promise(resolve => {
      const canvas = this._renderCanvas;
      const ctx = this._renderCtx;
      if (!canvas || !ctx) return resolve('');

      const dpr = wx.getSystemInfoSync().pixelRatio || 2;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, this._pw, this._ph);

      const n = normalizeFabricJSON(json);
      ctx.fillStyle = n.background || '#ffffff';
      ctx.fillRect(0, 0, this._pw, this._ph);

      // 收集图片加载任务
      const imgTasks = [];
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
          const lineH = fs * 1.4;
          for (let j = 0; j < lines.length; j++) {
            const lx = obj.textAlign === 'center' ? obj.left + maxW / 2 :
                       obj.textAlign === 'right' ? obj.left + maxW : obj.left;
            ctx.fillText(lines[j], lx, obj.top + j * lineH);
          }
        } else if (obj.type === 'image' && obj.src) {
          imgTasks.push(new Promise(done => {
            const img = canvas.createImage();
            img.onload = () => {
              try {
                const sw = (obj.width || 100) * (obj.scaleX || 1);
                const sh = (obj.height || 100) * (obj.scaleY || 1);
                ctx.drawImage(img, obj.left, obj.top, sw, sh);
              } catch (_) {}
              done();
            };
            img.onerror = () => done();
            img.src = obj.src;
          }));
        }
        ctx.restore();
      }

      const finish = () => {
        ctx.restore();
        wx.canvasToTempFilePath({
          canvas,
          success: r => resolve(r.tempFilePath),
          fail: () => resolve('')
        });
      };

      if (imgTasks.length) Promise.all(imgTasks).then(finish);
      else finish();
    });
  },

  _wrap(ctx, text, maxW) {
    if (!text) return [''];
    const lines = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (const ch of para) {
        if (ctx.measureText(line + ch).width > maxW && line.length) {
          lines.push(line); line = ch;
        } else line += ch;
      }
      lines.push(line);
    }
    return lines.length ? lines : [''];
  },

  onToggleMode() {
    const n = this.data.mode === 'seamless' ? 'single' : 'seamless';
    this.setData({ mode: n, modeLabel: n === 'seamless' ? '单张阅览' : '无缝阅览', curPage: 0 });
  },
  onPrevPage() { if (this.data.curPage > 0) this.setData({ curPage: this.data.curPage - 1 }); },
  onNextPage() { if (this.data.curPage < this.data.pageImages.length - 1) this.setData({ curPage: this.data.curPage + 1 }); },

  onDelete() {
    wx.showModal({
      title: '删除电子书', content: '确定删除？此操作不可撤销。',
      success: async res => {
        if (!res.confirm) return;
        try { await api.deleteZine(this.data.zineId); wx.navigateBack(); }
        catch (e) { wx.showToast({ title: '删除失败', icon: 'none' }); }
      }
    });
  },

  onClose() { wx.navigateBack(); }
});
