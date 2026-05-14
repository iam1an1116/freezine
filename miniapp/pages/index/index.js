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

      const icons = items.slice(0, 40).map((z, i) => {
        const ar = z.aspect ? (z.aspect.w / Math.max(1, z.aspect.h)) : 1;
        const maxSide = 96;
        let bw = maxSide, bh = maxSide;
        if (ar >= 1) bh = Math.max(48, Math.round(maxSide / ar));
        else bw = Math.max(48, Math.round(maxSide * ar));

        // 使用网格法，保证不重叠
        const pos = this._gridPos(i, bw + 14, bh + 34);

        const raw = z.iconDataURL || '';
        const isHTTP = raw.startsWith('http://') || raw.startsWith('https://');

        return {
          id: z.id,
          title: z.title,
          pageCount: z.pageCount,
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

  // ---------- 网格定位（绝不出错）----------
  _gridPos(index, elW, elH) {
    const sys = wx.getSystemInfoSync();
    const vw = sys.windowWidth;
    const vh = sys.windowHeight;
    const pad = 18;

    const cols = Math.max(1, Math.floor((vw - pad * 2) / (elW + pad)));
    const rows = Math.max(1, Math.floor((vh - pad * 2) / (elH + pad)));
    const centerCol = Math.floor(cols / 2);
    const centerRow = Math.floor(rows / 2);

    // 收集所有可用网格格子（跳过中央按钮区和左下角）
    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // 中央按钮区域 (3列 x 5行)
        if (Math.abs(c - centerCol) <= 1 && Math.abs(r - centerRow) <= 2) continue;
        // 左下角登录按钮区域
        if (r >= rows - 2 && c <= 1) continue;
        cells.push({ r, c });
      }
    }

    // 打乱格子顺序
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }

    // 如果格子不够，回退到全部可用格子
    const cell = cells[index % Math.max(1, cells.length)];

    // 在格子内加随机抖动，看起来自然
    const cellW = (vw - pad * 2) / cols;
    const cellH = (vh - pad * 2) / rows;
    const jx = (Math.random() - 0.5) * Math.max(0, cellW - elW);
    const jy = (Math.random() - 0.5) * Math.max(0, cellH - elH);

    return {
      left: Math.round(pad + cell.c * cellW + jx),
      top: Math.round(pad + cell.r * cellH + jy)
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
