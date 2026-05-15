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
    searchQuery: ''
  },

  _bodies: [],
  _canvas: null,
  _ctx: null,
  _w: 0, _h: 0, _dpr: 2,
  _animId: 0,
  _loading: false,

  onLoad() {
    this.setData({ admin: auth.isAdmin() });
    this._initCanvas();
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
    const query = wx.createSelectorQuery();
    query.select('#physicsCanvas').fields({ node: true, size: true }).exec(res => {
      if (!res || !res[0]) return setTimeout(() => this._initCanvas(), 200);
      this._canvas = res[0].node;
      this._canvas.width = this._w * this._dpr;
      this._canvas.height = this._h * this._dpr;
      this._ctx = this._canvas.getContext('2d');
      this._startLoop();
    });
  },

  // ---------- Load ----------
  async _load() {
    if (this._loading) return;
    this._loading = true;
    try {
      const res = await api.listZines();
      this._buildBodies((res && res.items) || []);
      const n = this._bodies.length;
      this.setData({ status: n > 0 ? `${n} 个图标` : '暂无作品' });
      setTimeout(() => this.setData({ status: '' }), 2500);
    } catch (e) {
      this.setData({ status: '加载失败：' + (e.message || '网络错误') });
    } finally {
      this._loading = false;
    }
  },

  async _search(query) {
    if (!query.trim()) return;
    this.setData({ status: '搜索中…' });
    try {
      const res = await api.searchZines(query.trim());
      this._buildBodies((res && res.items) || []);
      const n = this._bodies.length;
      this.setData({ status: n > 0 ? `找到 ${n} 个` : `无匹配 "${query}"` });
    } catch (e) {
      this.setData({ status: '搜索失败' });
    }
  },

  _buildBodies(items) {
    this._bodies = [];
    const list = items.slice(0, MAX_BODIES);
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

      // 异步加载图片
      if (isHTTP && this._canvas) {
        const img = this._canvas.createImage();
        img.onload = () => { body.imgLoaded = true; body.img = img; };
        img.onerror = () => { body.imgLoaded = false; };
        img.src = z.iconDataURL;
      }
    }
  },

  // ---------- Physics Loop ----------
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

    // 排斥区域
    const repellers = [
      { x: w / 2, y: h / 2, r: 100 },
      { x: 20, y: h - 20, r: 45 }
    ];

    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      const ax = a.x + a.w / 2;
      const ay = a.y + a.h / 2;

      a.vx += (Math.random() - 0.5) * 0.03;
      a.vy += (Math.random() - 0.5) * 0.03;
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
        const minDist = (a.w + b.w) / 2;
        if (dist < minDist) {
          const f = (minDist - dist) / minDist * 0.3;
          a.vx += (dx / dist) * f;
          a.vy += (dy / dist) * f;
          b.vx -= (dx / dist) * f;
          b.vy -= (dy / dist) * f;
        }
      }

      // 边界
      if (a.x < 4) { a.x = 4; a.vx = Math.abs(a.vx) * 0.5; }
      if (a.y < 4) { a.y = 4; a.vy = Math.abs(a.vy) * 0.5; }
      if (a.x + a.w > w - 4) { a.x = w - 4 - a.w; a.vx = -Math.abs(a.vx) * 0.5; }
      if (a.y + a.h > h - 4) { a.y = h - 4 - a.h; a.vy = -Math.abs(a.vy) * 0.5; }

      const spd = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
      if (spd > 1.2) { a.vx *= 1.2 / spd; a.vy *= 1.2 / spd; }

      a.x += a.vx;
      a.y += a.vy;
    }
  },

  _render() {
    if (!this._ctx) return;
    const ctx = this._ctx;
    const dpr = this._dpr;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this._w, this._h);

    for (const b of this._bodies) {
      const bx = b.x, by = b.y;
      const bw = b.w, imgH = b.h - 20;
      const r = 12;

      // 卡片背景
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(15,23,42,.08)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 3;
      this._roundR(ctx, bx, by, bw, imgH, r);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      // 边框
      ctx.strokeStyle = 'rgba(15,23,42,.06)';
      ctx.lineWidth = 1;
      this._roundR(ctx, bx, by, bw, imgH, r);
      ctx.stroke();

      // 图片 / 占位
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
        ctx.font = `700 ${Math.min(bw * 0.24, 22)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.title.slice(0, 3), bx + bw / 2, by + imgH / 2);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
      }

      // 标题文字
      ctx.fillStyle = '#111827';
      ctx.font = '600 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const titleText = this._clip(ctx, b.title, bw - 4);
      ctx.fillText(titleText, bx + bw / 2, by + imgH + 3);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
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
    for (const b of this._bodies) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        wx.navigateTo({ url: '/pages/book/book?zine=' + encodeURIComponent(b.id) });
        return;
      }
    }
  },

  // ---------- Events ----------
  onEnter() {
    wx.navigateTo({ url: '/pages/designer/designer' });
  },

  onRefresh() {
    this._bodies = [];
    if (this._ctx) {
      this._ctx.clearRect(0, 0, this._w, this._h);
    }
    this._load();
  },

  onSearchTap() {
    this.setData({ showSearch: true, searchQuery: '' });
  },

  onSearchInput(e) {
    this.setData({ searchQuery: e.detail.value });
  },

  onSearchConfirm() {
    const q = this.data.searchQuery.trim();
    if (q) this._search(q);
  },

  onSearchCancel() {
    this.setData({ showSearch: false, searchQuery: '' });
    // 恢复默认图标
    this._load();
  },

  onLoginTap() {
    this.setData({ showLogin: true, loginUser: '', loginPass: '' });
  },
  onCancelLogin() {
    this.setData({ showLogin: false });
  },
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
