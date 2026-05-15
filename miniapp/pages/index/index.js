const api = require('../../utils/api');
const auth = require('../../utils/auth');

const MAX_BODIES = 10;

Page({
  data: {
    admin: false,
    showLogin: false,
    loginUser: '',
    loginPass: '',
    status: '',
    showSearch: false,
    searchQuery: '',
    searchResults: [],
    searchDone: false
  },

  _bodies: [],
  _canvas: null,
  _ctx: null,
  _w: 0, _h: 0, _dpr: 2,
  _animId: 0,
  _loading: false,

  // Button hit areas (set in render)
  _btns: {},

  async onLoad() {
    this.setData({ admin: auth.isAdmin() });
    await this._initCanvas();
    this._load();
  },

  onShow() {
    this.setData({ admin: auth.isAdmin() });
    this._startLoop();
  },

  onHide() { this._stopLoop(); },
  onUnload() { this._stopLoop(); },

  // ---------- Canvas ----------
  _initCanvas() {
    const sys = wx.getSystemInfoSync();
    this._w = sys.windowWidth;
    this._h = sys.windowHeight;
    this._dpr = sys.pixelRatio || 2;
    return new Promise(resolve => {
      const query = wx.createSelectorQuery();
      query.select('#physicsCanvas').fields({ node: true, size: true }).exec(res => {
        if (!res || !res[0]) {
          setTimeout(() => this._initCanvas().then(resolve), 200);
          return;
        }
        this._canvas = res[0].node;
        this._canvas.width = this._w * this._dpr;
        this._canvas.height = this._h * this._dpr;
        this._ctx = this._canvas.getContext('2d');
        this._startLoop();
        resolve();
      });
    });
  },

  // ---------- Load ----------
  async _load() {
    if (this._loading) return;
    this._loading = true;
    try {
      const res = await api.listZines();
      this._buildBodies((res && res.items) || []);
    } catch (e) {
      this.setData({ status: '加载失败' });
    } finally {
      this._loading = false;
    }
  },


  _buildBodies(items, isSearch) {
    this._bodies = [];
    const limit = isSearch ? 36 : MAX_BODIES;
    const list = items.slice(0, limit);
    for (let i = 0; i < list.length; i++) {
      const z = list[i];
      const ar = z.aspect ? (z.aspect.w / Math.max(1, z.aspect.h)) : 1;
      const maxSide = 64;
      let bw = maxSide, bh = maxSide;
      if (ar >= 1) bh = Math.max(36, Math.round(maxSide / ar));
      else bw = Math.max(36, Math.round(maxSide * ar));

      const isHTTP = (z.iconDataURL || '').startsWith('http');
      const body = {
        id: z.id,
        title: z.title || '未命名',
        imgSrc: isHTTP ? z.iconDataURL : '',
        imgLoaded: false,
        img: null,
        x: 20 + Math.random() * (this._w - 120),
        y: 20 + Math.random() * (this._h - 160),
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        w: bw + 8,
        h: bh + 28
      };
      this._bodies.push(body);

      if (isHTTP) {
        // wx.getImageInfo 下载图片到本地，返回 path 可直接用于 canvas
        wx.getImageInfo({
          src: z.iconDataURL,
          success: res => {
            if (!this._canvas) return;
            const img = this._canvas.createImage();
            img.onload = () => { body.imgLoaded = true; body.img = img; };
            img.onerror = () => { console.warn('canvas img load fail', z.title); };
            img.src = res.path;
          },
          fail: err => { console.warn('getImageInfo fail', z.title, err.errMsg); }
        });
      }
    }
  },

  // ---------- Physics ----------
  _startLoop() {
    if (this._animId || !this._canvas) return;
    const loop = () => {
      this._step();
      this._render();
      this._animId = this._canvas.requestAnimationFrame(loop);
    };
    loop();
  },

  _stopLoop() {
    if (this._animId && this._canvas) {
      this._canvas.cancelAnimationFrame(this._animId);
      this._animId = 0;
    }
  },

  _step() {
    const bodies = this._bodies;
    const w = this._w, h = this._h;
    const repellers = [
      { x: w / 2, y: h / 2, r: 110 },
      { x: 24, y: h - 24, r: 50 },
      { x: w - 56, y: 44, r: 110 }   // top-right tools
    ];

    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
      a.vx += (Math.random() - 0.5) * 0.025;
      a.vy += (Math.random() - 0.5) * 0.025;
      a.vx *= 0.996;
      a.vy *= 0.996;

      for (const rp of repellers) {
        const dx = ax - rp.x, dy = ay - rp.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist < rp.r) {
          const f = (rp.r - dist) / rp.r * 0.4;
          a.vx += (dx / dist) * f;
          a.vy += (dy / dist) * f;
        }
      }

      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        const bx = b.x + b.w / 2, by = b.y + b.h / 2;
        const dx = ax - bx, dy = ay - by;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const minD = (a.w + b.w) / 2;
        if (dist < minD) {
          const f = (minD - dist) / minD * 0.25;
          a.vx += (dx / dist) * f;
          a.vy += (dy / dist) * f;
          b.vx -= (dx / dist) * f;
          b.vy -= (dy / dist) * f;
        }
      }

      if (a.x < 4) { a.x = 4; a.vx = Math.abs(a.vx) * 0.5; }
      if (a.y < 4) { a.y = 4; a.vy = Math.abs(a.vy) * 0.5; }
      if (a.x + a.w > w - 4) { a.x = w - 4 - a.w; a.vx = Math.abs(a.vx) * -0.5; }
      if (a.y + a.h > h - 4) { a.y = h - 4 - a.h; a.vy = Math.abs(a.vy) * -0.5; }

      const spd = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
      if (spd > 1) { a.vx *= 1 / spd; a.vy *= 1 / spd; }

      a.x += a.vx;
      a.y += a.vy;
    }
  },

  // ---------- Render ----------
  _render() {
    if (!this._ctx) return;
    const ctx = this._ctx;
    const dpr = this._dpr;
    const w = this._w, h = this._h;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // bg
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, w, h);

    // icons
    for (const b of this._bodies) {
      const bx = b.x, by = b.y;
      const bw = b.w, imgH = b.h - 20, r = 10;
      ctx.shadowColor = 'rgba(0,0,0,.10)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = '#ffffff';
      this._roundR(ctx, bx, by, bw, imgH, r);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.strokeStyle = 'rgba(0,0,0,.10)';
      ctx.lineWidth = 0.5;
      this._roundR(ctx, bx, by, bw, imgH, r);
      ctx.stroke();

      if (b.imgLoaded && b.img) {
        ctx.save();
        this._roundPath(ctx, bx, by, bw, imgH, r);
        ctx.clip();
        ctx.drawImage(b.img, bx, by, bw, imgH);
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(79,70,229,.08)';
        this._roundR(ctx, bx + 2, by + 2, bw - 4, imgH - 4, r - 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(79,70,229,.45)';
        ctx.font = `700 ${Math.min(bw * 0.24, 20)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.title.slice(0, 3), bx + bw / 2, by + imgH / 2);
      }

      ctx.fillStyle = '#111827';
      ctx.font = '600 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(this._clip(ctx, b.title, bw - 4), bx + bw / 2, by + imgH + 3);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }

    // ---- Canvas-drawn buttons ----
    this._btns = {};

    // 中央「制作」按钮
    if (!this.data.showSearch) {
      const cx = w / 2, cy = h / 2;
      const bw = 200, bh = 48;
      this._drawBtn(ctx, cx - bw / 2, cy - bh / 2, bw, bh, '#111827', '现在，设计你的ZINE', '#fff');
      this._btns.enter = { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh, action: 'enter' };
    } else {
      // 返回按钮
      const bx = w / 2, by = h / 2 + 30;
      const bw = 160, bh = 48;
      this._drawBtn(ctx, bx - bw / 2, by - bh / 2, bw, bh, '#111827', '← 返回主页', '#fff');
      this._btns.back = { x: bx - bw / 2, y: by - bh / 2, w: bw, h: bh, action: 'back' };
    }

    // 右上角 刷新 + 搜索
    const trx = w - 16, try_ = 16;
    this._drawBtn(ctx, trx - 64, try_, 60, 36, '#fff', '↻', '#111827');
    this._btns.refresh = { x: trx - 64, y: try_, w: 60, h: 36, action: 'refresh' };
    this._drawBtn(ctx, trx - 136, try_, 60, 36, '#fff', '🔍', '#111827');
    this._btns.search = { x: trx - 136, y: try_, w: 60, h: 36, action: 'search' };

    // 左下角管理员
    const lx = 14, ly = h - 28;
    ctx.fillStyle = this.data.admin ? 'rgba(15,23,42,.85)' : 'rgba(15,23,42,.18)';
    ctx.beginPath();
    ctx.arc(lx, ly, 10, 0, Math.PI * 2);
    ctx.fill();
    this._btns.login = { x: lx - 14, y: ly - 14, w: 28, h: 28, action: 'login' };

    ctx.restore();
  },

  _drawBtn(ctx, x, y, w, h, bg, text, color) {
    ctx.shadowColor = 'rgba(0,0,0,.08)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = bg;
    this._roundR(ctx, x, y, w, h, h / 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    if (bg === '#fff') {
      ctx.strokeStyle = 'rgba(0,0,0,.10)';
      ctx.lineWidth = 0.5;
      this._roundR(ctx, x, y, w, h, h / 2);
      ctx.stroke();
    }
    ctx.fillStyle = color;
    ctx.font = `600 ${bg === '#fff' ? 13 : 16}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  },

  _roundR(ctx, x, y, w, h, r) { this._roundPath(ctx, x, y, w, h, r); ctx.fill(); },
  _roundPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  },

  _clip(ctx, text, maxW) {
    if (!text) return '';
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  },

  // ---------- Tap ----------
  onCanvasTap(e) {
    const x = e.detail.x, y = e.detail.y;
    // 先检测按钮
    for (const key of Object.keys(this._btns)) {
      const b = this._btns[key];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        if (b.action === 'enter') this.onEnter();
        else if (b.action === 'back') this.onSearchCancel();
        else if (b.action === 'refresh') this.onRefresh();
        else if (b.action === 'search') this.onSearchTap();
        else if (b.action === 'login') this.onLoginTap();
        return;
      }
    }
    // 再检测图标
    for (const b of this._bodies) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        wx.navigateTo({ url: '/pages/book/book?zine=' + encodeURIComponent(b.id) });
        return;
      }
    }
  },

  onEnter() { wx.navigateTo({ url: '/pages/designer/designer' }); },
  onRefresh() {
    this._bodies = [];
    this._load();
  },
  onSearchTap() {
    this._stopLoop();
    this.setData({ showSearch: true, searchQuery: '', searchResults: [], searchDone: false });
  },
  onSearchInput(e) { this.setData({ searchQuery: e.detail.value }); },
  onSearch() {
    const q = (this.data.searchQuery || '').trim();
    if (!q) {
      wx.showToast({ title: '请输入搜索词', icon: 'none' });
      return;
    }
    this._doSearch(q);
  },
  async _doSearch(q) {
    this.setData({ status: '搜索中…', searchDone: false, searchResults: [] });
    try {
      const res = await api.searchZines(q);
      const items = (res && res.items) || [];
      this.setData({
        searchResults: items,
        searchDone: true,
        status: items.length > 0 ? '' : `未找到 "${q}"`
      });
    } catch (e) {
      console.error('search error', e);
      this.setData({
        searchDone: true,
        status: `搜索失败: ${e.message || '网络错误'}`
      });
    }
  },
  onSearchCancel() {
    this.setData({ showSearch: false, searchQuery: '', searchResults: [], searchDone: false, status: '' });
    this._canvas = null;
    this._ctx = null;
    this._initCanvas().then(() => this._load());
  },
  onSearchItemTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/book/book?zine=' + encodeURIComponent(id) });
  },
  onLoginTap() { this.setData({ showLogin: true, loginUser: '', loginPass: '' }); },
  onCancelLogin() { this.setData({ showLogin: false }); },
  onUserInput(e) { this.setData({ loginUser: e.detail.value }); },
  onPassInput(e) { this.setData({ loginPass: e.detail.value }); },
  onLoginSubmit() {
    if (auth.login(this.data.loginUser, this.data.loginPass)) {
      this.setData({ showLogin: false, admin: true, status: '管理员登录成功' });
      setTimeout(() => this.setData({ status: '' }), 2000);
    } else {
      this.setData({ loginPass: '', status: '登录失败' });
      setTimeout(() => this.setData({ status: '' }), 2000);
    }
  },
  stopProp() {},
  onPullDownRefresh() {
    this._load().then(() => wx.stopPullDownRefresh());
  }
});
