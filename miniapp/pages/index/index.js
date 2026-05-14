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

  // ---------- 网格定位 ----------
  _gridPos(index, elW, elH) {
    const sys = wx.getSystemInfoSync();
    const vw = sys.windowWidth;
    const vh = sys.windowHeight;
    const pad = 18;

    const cols = Math.max(2, Math.floor((vw - pad * 2) / (elW + pad)));
    const rows = Math.max(3, Math.floor((vh - pad * 2) / (elH + pad)));
    const centerCol = Math.floor(cols / 2);
    const centerRow = Math.floor(rows / 2);

    // 收集可用格子，仅跳过中央按钮本身（1格）
    const cells = [];
    const skipR = centerRow;
    const skipC = centerCol;
    const skipR2 = rows - 1; // 底部留一行给登录按钮

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r === skipR && c === skipC) continue;   // 中央按钮
        if (r === skipR2 && c === 0) continue;      // 左下登录
        cells.push({ r, c });
      }
    }

    // 如果有效格子不够，把所有格子都用上
    if (cells.length === 0) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          cells.push({ r, c });
        }
      }
    }

    // 打乱
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }

    const cell = cells[index % cells.length];
    const cellW = (vw - pad * 2) / cols;
    const cellH = (vh - pad * 2) / rows;
    const jx = (Math.random() - 0.5) * Math.max(0, cellW - elW - 4);
    const jy = (Math.random() - 0.5) * Math.max(0, cellH - elH - 4);

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
