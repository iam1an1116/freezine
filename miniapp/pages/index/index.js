const api = require('../../utils/api');
const auth = require('../../utils/auth');

Page({
  data: {
    icons: [],
    admin: false,
    showLogin: false,
    loginUser: '',
    loginPass: '',
    status: ''
  },

  _placedRects: [],
  _loading: false,

  onLoad() {
    this.setData({ admin: auth.isAdmin() });
    this._loadIcons();
  },

  onShow() {
    this.setData({ admin: auth.isAdmin() });
    if (this.data.icons.length === 0 && !this._loading) {
      this._loadIcons();
    }
  },

  // ---------- 加载图标 ----------
  async _loadIcons() {
    if (this._loading) return;
    this._loading = true;
    wx.showNavigationBarLoading();
    try {
      const res = await api.listZines();
      const items = res.items || [];
      this._placedRects = [];

      const icons = [];
      for (let i = 0; i < Math.min(items.length, 40); i++) {
        const z = items[i];
        const ar = z.aspect ? (z.aspect.w / Math.max(1, z.aspect.h)) : 1;
        const maxSide = 96;
        let bw = maxSide, bh = maxSide;
        if (ar >= 1) bh = Math.max(48, Math.round(maxSide / ar));
        else bw = Math.max(48, Math.round(maxSide * ar));

        const pos = this._findPos(bw + 16, bh + 32);

        // 避免将巨大的 data URL 传入 setData（会导致渲染异常）
        const imgSrc = z.iconDataURL || '';
        const isHTTP = imgSrc.startsWith('http://') || imgSrc.startsWith('https://');

        icons.push({
          id: z.id,
          title: z.title,
          pageCount: z.pageCount,
          _bw: bw,
          _bh: bh,
          _left: pos.left,
          _top: pos.top,
          _imgSrc: isHTTP ? imgSrc : '',
          _noImage: !isHTTP
        });
      }

      this.setData({ icons });
    } catch (e) {
      console.error('加载失败', e);
      this.setData({ status: '加载失败，下拉刷新重试' });
    } finally {
      wx.hideNavigationBarLoading();
      this._loading = false;
    }
  },

  // Random placement — avoid home button (center), login (bottom-left), status bar
  _getObstacles() {
    const sys = wx.getSystemInfoSync();
    const vw = sys.windowWidth;
    const vh = sys.windowHeight;
    const topBarH = (sys.statusBarHeight || 20) + 44; // status bar + nav bar
    const rects = [];
    // top status/nav bar
    rects.push({ left: 0, top: 0, right: vw, bottom: topBarH });
    // center button — generous margin
    rects.push({ left: vw / 2 - 140, top: vh / 2 - 60, right: vw / 2 + 140, bottom: vh / 2 + 60 });
    // login dot bottom-left
    rects.push({ left: 0, top: vh - 100, right: 80, bottom: vh });
    return rects;
  },

  _overlap(a, b) {
    return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  },

  _findPos(elW, elH) {
    const vw = wx.getSystemInfoSync().windowWidth;
    const vh = wx.getSystemInfoSync().windowHeight;
    const obstacles = this._getObstacles();
    const pad = 16;

    // Clamp element size to fit viewport
    const maxW = Math.min(elW, vw - pad * 2);
    const maxH = Math.min(elH, vh - pad * 2);

    for (let i = 0; i < 500; i++) {
      const left = pad + Math.random() * Math.max(0, vw - maxW - pad * 2);
      const top = pad + Math.random() * Math.max(0, vh - maxH - pad * 2);
      if (isNaN(left) || isNaN(top)) continue;
      const cand = { left: left - pad, top: top - pad, right: left + maxW + pad, bottom: top + maxH + pad };

      let hit = false;
      for (const o of obstacles) { if (this._overlap(cand, o)) { hit = true; break; } }
      if (hit) continue;
      for (const p of this._placedRects) { if (this._overlap(cand, p)) { hit = true; break; } }
      if (hit) continue;

      this._placedRects.push(cand);
      return { left: Math.round(left), top: Math.round(top) };
    }
    // Fallback: place in a corner area with some randomness
    const fl = pad + Math.random() * Math.max(0, vw - maxW - pad * 2);
    const ft = pad + Math.random() * Math.max(0, vh - maxH - pad * 2);
    return { left: Math.round(isNaN(fl) ? pad : fl), top: Math.round(isNaN(ft) ? pad : ft) };
  },

  // ---------- 事件 ----------
  onEnter() {
    wx.navigateTo({ url: '/pages/designer/designer' });
  },

  onIconTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/book/book?zine=' + encodeURIComponent(id) });
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

  // 下拉刷新
  onPullDownRefresh() {
    this._loadIcons().then(() => wx.stopPullDownRefresh());
  }
});
