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

      this.setData({ icons, status: `已加载 ${icons.length} 个图标` });
      setTimeout(() => { if (this.data.status && this.data.status.startsWith('已加载')) this.setData({ status: '' }); }, 3000);
    } catch (e) {
      console.error('_loadIcons error', e);
      this.setData({ status: `加载失败: ${e.message || '未知错误'}，下拉刷新重试` });
    } finally {
      wx.hideNavigationBarLoading();
      this._loading = false;
    }
  },

  // ---------- 网格定位（固定间距，绝不重叠）----------
  _gridPos(index, elW, elH) {
    const sys = wx.getSystemInfoSync();
    const vw = sys.windowWidth;
    const vh = sys.windowHeight;
    const gap = 22;

    const cols = Math.max(2, Math.floor((vw - gap) / (elW + gap)));
    const rows = Math.max(3, Math.floor((vh - gap) / (elH + gap)));
    const centerC = Math.floor(cols / 2);
    const centerR = Math.floor(rows / 2);

    // 收集所有格子
    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r === centerR && c === centerC) continue;  // 中央按钮
        if (r >= rows - 1 && c === 0) continue;        // 左下登录
        cells.push({ r, c });
      }
    }
    if (cells.length === 0) {
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          cells.push({ r, c });
    }

    // 打乱后按 index 取格子
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }

    const cell = cells[index % cells.length];
    return {
      left: Math.round(gap + cell.c * (elW + gap)),
      top:  Math.round(gap + cell.r * (elH + gap))
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
