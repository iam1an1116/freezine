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

  onLoad() {
    this.setData({ admin: auth.isAdmin() });
    this._loadIcons();
  },

  onShow() {
    this.setData({ admin: auth.isAdmin() });
    if (this.data.icons.length === 0) {
      this._loadIcons();
    }
  },

  // ---------- 加载图标 ----------
  async _loadIcons() {
    wx.showNavigationBarLoading();
    try {
      const res = await api.listZines();
      const items = res.items || [];
      this._placedRects = [];

      const icons = items.slice(0, 60).map((z, i) => {
        const ar = z.aspect ? (z.aspect.w / Math.max(1, z.aspect.h)) : 1;
        const maxSide = 112;
        let bw = maxSide, bh = maxSide;
        if (ar >= 1) bh = Math.round(maxSide / ar);
        else bw = Math.round(maxSide * ar);

        const pos = this._findPos(bw + 20, bh + 40);
        return { ...z, _bw: bw, _bh: bh, _left: pos.left, _top: pos.top };
      });

      this.setData({ icons });
    } catch (e) {
      console.error('加载失败', e);
      this.setData({ status: '加载失败，下拉刷新重试' });
    } finally {
      wx.hideNavigationBarLoading();
    }
  },

  // Random placement — avoid home button (center) and login (bottom-left)
  _getObstacles() {
    const rects = [];
    const vw = wx.getSystemInfoSync().windowWidth;
    const vh = wx.getSystemInfoSync().windowHeight;
    // center button
    rects.push({ left: vw / 2 - 120, top: vh / 2 - 40, right: vw / 2 + 120, bottom: vh / 2 + 40 });
    // login dot
    rects.push({ left: 0, top: vh - 80, right: 80, bottom: vh });
    return rects;
  },

  _overlap(a, b) {
    return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  },

  _findPos(elW, elH) {
    const vw = wx.getSystemInfoSync().windowWidth;
    const vh = wx.getSystemInfoSync().windowHeight;
    const obstacles = this._getObstacles();
    const pad = 14;

    for (let i = 0; i < 300; i++) {
      const left = pad + Math.random() * (vw - elW - pad * 2);
      const top = pad + Math.random() * (vh - elH - pad * 2);
      const cand = { left: left - pad, top: top - pad, right: left + elW + pad, bottom: top + elH + pad };

      let hit = false;
      for (const o of obstacles) { if (this._overlap(cand, o)) { hit = true; break; } }
      if (hit) continue;
      for (const p of this._placedRects) { if (this._overlap(cand, p)) { hit = true; break; } }
      if (hit) continue;

      this._placedRects.push(cand);
      return { left: Math.round(left), top: Math.round(top) };
    }
    return { left: Math.round(pad + Math.random() * (vw - elW - pad * 2)), top: Math.round(pad + Math.random() * (vh - elH - pad * 2)) };
  },

  // ---------- 事件 ----------
  onEnter() {
    wx.navigateTo({ url: '/pages/designer/designer' });
  },

  onIconTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/viewer/viewer?id=' + encodeURIComponent(id) });
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
