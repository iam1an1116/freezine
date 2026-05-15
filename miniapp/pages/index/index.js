const api = require('../../utils/api');
const auth = require('../../utils/auth');

Page({
  data: {
    icons: [],
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

  _loading: false,

  onLoad() {
    this.setData({ admin: auth.isAdmin() });
    this._load();
  },

  onShow() {
    this.setData({ admin: auth.isAdmin() });
  },

  // ---------- Load ----------
  async _load() {
    if (this._loading) return;
    this._loading = true;
    try {
      const res = await api.listZines();
      const items = (res && res.items) || [];
      const icons = this._buildIcons(items.slice(0, 12));
      this.setData({ icons, status: icons.length ? `${icons.length} 个图标` : '暂无作品' });
      setTimeout(() => { if (this.data.status && this.data.status.includes('图标')) this.setData({ status: '' }); }, 2500);
    } catch (e) {
      this.setData({ status: '加载失败' });
    } finally {
      this._loading = false;
    }
  },

  _buildIcons(items) {
    const sys = wx.getSystemInfoSync();
    const vw = sys.windowWidth;
    const vh = sys.windowHeight;
    const gap = 16;
    const maxSide = 72;

    const icons = [];
    for (let i = 0; i < items.length; i++) {
      const z = items[i];
      const ar = z.aspect ? (z.aspect.w / Math.max(1, z.aspect.h)) : 1;
      let bw = maxSide, bh = maxSide;
      if (ar >= 1) bh = Math.max(42, Math.round(maxSide / ar));
      else bw = Math.max(42, Math.round(maxSide * ar));

      const isHTTP = (z.iconDataURL || '').startsWith('http');
      const pos = this._gridPos(i, bw + gap, bh + 36, vw, vh);

      icons.push({
        id: z.id,
        title: z.title,
        pageCount: z.pageCount,
        iconDataURL: isHTTP ? z.iconDataURL : '',
        _bw: bw,
        _bh: bh,
        _w: bw + 8,
        _x: pos.x,
        _y: pos.y
      });
    }
    return icons;
  },

  _gridPos(index, cellW, cellH, vw, vh) {
    const gap = 16;
    const cols = Math.max(2, Math.floor((vw - gap) / (cellW + gap)));
    const rows = Math.max(3, Math.floor((vh - 120) / (cellH + gap)));
    const skipC = Math.floor(cols / 2);
    const skipR = Math.floor(rows / 2);

    const cells = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        if (r === skipR && c === skipC) continue;
        if (r >= rows - 1 && c === 0) continue;
        cells.push({ r, c });
      }
    if (!cells.length) for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push({ r, c });

    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }

    const cell = cells[index % cells.length];
    return {
      x: Math.round(gap + cell.c * (cellW + gap)),
      y: Math.round(gap + cell.r * (cellH + gap))
    };
  },

  // ---------- Search ----------
  onSearchTap() {
    this.setData({ showSearch: true, searchQuery: '', searchResults: [], searchDone: false });
  },
  onSearchInput(e) { this.setData({ searchQuery: e.detail.value }); },
  onSearch() {
    const q = (this.data.searchQuery || '').trim();
    if (!q) return;
    this.setData({ searchDone: false, searchResults: [] });
    api.searchZines(q).then(res => {
      this.setData({ searchResults: (res && res.items) || [], searchDone: true });
    }).catch(e => {
      this.setData({ searchDone: true, status: '搜索失败' });
    });
  },
  onSearchCancel() {
    this.setData({ showSearch: false, searchQuery: '', searchResults: [], searchDone: false });
  },
  onSearchItemTap(e) {
    wx.navigateTo({ url: '/pages/book/book?zine=' + encodeURIComponent(e.currentTarget.dataset.id) });
  },

  // ---------- Events ----------
  onEnter() { wx.navigateTo({ url: '/pages/designer/designer' }); },
  onRefresh() { this._load(); },
  onIconTap(e) {
    wx.navigateTo({ url: '/pages/book/book?zine=' + encodeURIComponent(e.currentTarget.dataset.id) });
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
