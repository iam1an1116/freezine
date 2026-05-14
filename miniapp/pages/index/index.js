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
  },

  // ---------- 加载图标 ----------
  async _loadIcons() {
    if (this._loading) return;
    this._loading = true;
    wx.showNavigationBarLoading();
    try {
      const res = await api.listZines();
      const items = (res && res.items) || [];
      this._placedRects = [];

      const icons = items.slice(0, 40).map(z => {
        const ar = z.aspect ? (z.aspect.w / Math.max(1, z.aspect.h)) : 1;
        const maxSide = 96;
        let bw = maxSide, bh = maxSide;
        if (ar >= 1) bh = Math.max(48, Math.round(maxSide / ar));
        else bw = Math.max(48, Math.round(maxSide * ar));

        const pos = this._findPos(bw + 16, bh + 32);

        // 关键修复：data URL 可能 >200KB，传入 setData 会导致渲染崩溃
        // 将 data: URL 替换为空字符串，http(s) URL 保留
        const raw = z.iconDataURL || '';
        const isHTTP = raw.startsWith('http://') || raw.startsWith('https://');

        return {
          id: z.id,
          title: z.title,
          createdAt: z.createdAt,
          pageCount: z.pageCount,
          aspect: z.aspect,
          iconDataURL: isHTTP ? raw : '',
          _bw: bw,
          _bh: bh,
          _left: pos.left,
          _top: pos.top
        };
      });

      this.setData({ icons });
    } catch (e) {
      console.error('_loadIcons error', e);
      this.setData({ status: '加载失败，下拉刷新重试' });
    } finally {
      wx.hideNavigationBarLoading();
      this._loading = false;
    }
  },

  // ---------- 随机放置 ----------
  _getObstacles() {
    const sys = wx.getSystemInfoSync();
    const vw = sys.windowWidth;
    const vh = sys.windowHeight;
    return [
      // 中央按钮区域
      { left: vw / 2 - 130, top: vh / 2 - 56, right: vw / 2 + 130, bottom: vh / 2 + 56 },
      // 左下角登录按钮
      { left: 0, top: vh - 90, right: 76, bottom: vh }
    ];
  },

  _overlap(a, b) {
    return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  },

  _findPos(elW, elH) {
    const vw = wx.getSystemInfoSync().windowWidth;
    const vh = wx.getSystemInfoSync().windowHeight;
    const obstacles = this._getObstacles();
    const pad = 12;

    const maxW = Math.min(elW, vw - pad * 2);
    const maxH = Math.min(elH, vh - pad * 2);
    const rangeW = Math.max(10, vw - maxW - pad * 2);
    const rangeH = Math.max(10, vh - maxH - pad * 2);

    for (let i = 0; i < 600; i++) {
      const left = pad + Math.random() * rangeW;
      const top = pad + Math.random() * rangeH;
      const cand = {
        left: left - pad, top: top - pad,
        right: left + maxW + pad, bottom: top + maxH + pad
      };

      let hit = false;
      for (const o of obstacles) { if (this._overlap(cand, o)) { hit = true; break; } }
      if (hit) continue;
      for (const p of this._placedRects) { if (this._overlap(cand, p)) { hit = true; break; } }
      if (hit) continue;

      this._placedRects.push(cand);
      return { left: Math.round(left), top: Math.round(top) };
    }
    // 最终回退：随机位置
    return {
      left: Math.round(pad + Math.random() * rangeW),
      top: Math.round(pad + Math.random() * rangeH)
    };
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

  onPullDownRefresh() {
    this._loadIcons().then(() => wx.stopPullDownRefresh());
  }
});
