const api = require('../../utils/api');
const auth = require('../../utils/auth');

Page({
  data: {
    admin: false,
    showLogin: false,
    loginUser: '',
    loginPass: '',
    status: ''
  },

  // Physics state
  _bodies: [],
  _canvas: null,
  _ctx: null,
  _w: 0,
  _h: 0,
  _dpr: 2,
  _animId: 0,
  _images: {},
  _loading: false,
  onLoad() {
    this.setData({ admin: auth.isAdmin() });
    this._initCanvas();
    this._loadIcons();
  },

  onShow() {
    this.setData({ admin: auth.isAdmin() });
    this._startLoop();
  },

  onHide() {
    this._stopLoop();
  },

  onUnload() {
    this._stopLoop();
  },

  // ---------- Canvas Init ----------
  _initCanvas() {
    const sys = wx.getSystemInfoSync();
    this._w = sys.windowWidth;
    this._h = sys.windowHeight;
    this._dpr = sys.pixelRatio || 2;

    const query = wx.createSelectorQuery();
    query.select('#physicsCanvas')
      .fields({ node: true, size: true })
      .exec(res => {
        if (!res || !res[0]) return setTimeout(() => this._initCanvas(), 200);
        const canvas = res[0].node;
        canvas.width = this._w * this._dpr;
        canvas.height = this._h * this._dpr;
        this._canvas = canvas;
        this._ctx = canvas.getContext('2d');
        this._startLoop();
      });
  },

  // ---------- Load Icons ----------
  async _loadIcons() {
    if (this._loading) return;
    this._loading = true;
    try {
      const res = await api.listZines();
      const items = (res && res.items) || [];
      this._bodies = [];

      for (let i = 0; i < Math.min(items.length, 36); i++) {
        const z = items[i];
        const ar = z.aspect ? (z.aspect.w / Math.max(1, z.aspect.h)) : 1;
        const maxSide = 88;
        let bw = maxSide, bh = maxSide;
        if (ar >= 1) bh = Math.max(44, Math.round(maxSide / ar));
        else bw = Math.max(44, Math.round(maxSide * ar));

        const raw = z.iconDataURL || '';
        const isHTTP = raw.startsWith('http://') || raw.startsWith('https://');

        // Load image if HTTP URL
        let img = null;
        if (isHTTP && this._canvas) {
          img = this._canvas.createImage();
          img.src = raw;
        }

        this._bodies.push({
          id: z.id,
          title: z.title || '未命名',
          img: img,
          hasImg: isHTTP,
          imgSrc: raw,
          x: 30 + Math.random() * (this._w - 160),
          y: 30 + Math.random() * (this._h - 200),
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          w: bw + 12,
          h: bh + 36  // icon + name text
        });
      }
      const n = this._bodies.length;
      this.setData({ status: n > 0 ? `${n} 个图标已就绪` : '暂无作品，点击按钮开始创作' });
      if (n > 0) setTimeout(() => this.setData({ status: '' }), 3000);
    } catch (e) {
      console.error('_loadIcons error', e);
      this.setData({ status: '加载失败：' + (e.message || '网络错误') });
    } finally {
      this._loading = false;
    }
  },

  // ---------- Physics Loop ----------
  _startLoop() {
    if (this._animId) return;
    const loop = () => {
      this._step();
      this._render();
      this._animId = this._canvas ? this._canvas.requestAnimationFrame(loop) : 0;
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
    const w = this._w;
    const h = this._h;

    // Repulsion zones
    const repellers = [
      { x: w / 2, y: h / 2, r: 120 },       // center button
      { x: 20, y: h - 20, r: 50 }             // login button
    ];

    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      const ax = a.x + a.w / 2;
      const ay = a.y + a.h / 2;

      // Gentle random drift
      a.vx += (Math.random() - 0.5) * 0.04;
      a.vy += (Math.random() - 0.5) * 0.04;

      // Damping
      a.vx *= 0.995;
      a.vy *= 0.995;

      // Repel from zones
      for (const rp of repellers) {
        const dx = ax - rp.x;
        const dy = ay - rp.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist < rp.r) {
          const force = (rp.r - dist) / rp.r * 0.5;
          a.vx += (dx / dist) * force;
          a.vy += (dy / dist) * force;
        }
      }

      // Collision with other bodies
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        const overlapX = (a.w + b.w) / 2 - Math.abs(ax - (b.x + b.w / 2));
        const overlapY = (a.h + b.h) / 2 - Math.abs(ay - (b.y + b.h / 2));
        if (overlapX > 0 && overlapY > 0) {
          const dx = ax - (b.x + b.w / 2);
          const dy = ay - (b.y + b.h / 2);
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 0.3;
          a.vx += (dx / dist) * force;
          a.vy += (dy / dist) * force;
          b.vx -= (dx / dist) * force;
          b.vy -= (dy / dist) * force;
        }
      }

      // Boundary
      if (a.x < 4) { a.x = 4; a.vx = Math.abs(a.vx) * 0.5; }
      if (a.y < 4) { a.y = 4; a.vy = Math.abs(a.vy) * 0.5; }
      if (a.x + a.w > w - 4) { a.x = w - 4 - a.w; a.vx = -Math.abs(a.vx) * 0.5; }
      if (a.y + a.h > h - 4) { a.y = h - 4 - a.h; a.vy = -Math.abs(a.vy) * 0.5; }

      // Clamp velocity
      const speed = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
      if (speed > 1.5) { a.vx *= 1.5 / speed; a.vy *= 1.5 / speed; }

      // Integrate
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
      const bw = b.w, bh = b.h;
      const radius = 14;

      // Card background
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(15,23,42,.10)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 4;
      this._roundRect(ctx, bx, by, bw, b.h - 18, radius);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      // Border
      ctx.strokeStyle = 'rgba(15,23,42,.08)';
      ctx.lineWidth = 1;
      this._roundRect(ctx, bx, by, bw, b.h - 18, radius);
      ctx.stroke();

      // Image or placeholder
      const imgH = b.h - 18;
      if (b.img && b.img.complete) {
        ctx.save();
        this._roundRectPath(ctx, bx, by, bw, imgH, radius);
        ctx.clip();
        ctx.drawImage(b.img, bx, by, bw, imgH);
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(79,70,229,.10)';
        this._roundRect(ctx, bx + 3, by + 3, bw - 6, imgH - 6, radius - 2);
        ctx.fill();
        // Title initials
        ctx.fillStyle = 'rgba(79,70,229,.50)';
        ctx.font = `700 ${Math.min(bw * 0.28, 28)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.title.slice(0, 4), bx + bw / 2, by + imgH / 2);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
      }

      // Title text below
      ctx.fillStyle = '#111827';
      ctx.font = '700 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const maxTW = bw - 6;
      const titleText = this._truncate(ctx, b.title, maxTW);
      ctx.fillText(titleText, bx + bw / 2, by + imgH + 2);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }

    ctx.restore();
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

  _truncate(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  },

  // ---------- Canvas Tap ----------
  onCanvasTap(e) {
    const x = e.detail.x;
    const y = e.detail.y;
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
    this._loadIcons().then(() => wx.stopPullDownRefresh());
  }
});
