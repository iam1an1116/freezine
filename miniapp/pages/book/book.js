const api = require('../../utils/api');

Page({
  data: {
    loading: true,
    zineId: '',
    title: '',
    pageCount: 0,
    iconDataURL: ''
  },

  onLoad(opts) {
    const id = opts.zine || '';
    if (!id) {
      this.setData({ loading: false });
      return;
    }
    this.setData({ zineId: id });
    this._load(id);
  },

  async _load(id) {
    try {
      const z = await api.getZine(id);
      this.setData({
        loading: false,
        title: z.title,
        pageCount: z.pageCount,
        iconDataURL: z.iconDataURL
      });
    } catch (e) {
      this.setData({ loading: false, title: '加载失败' });
    }
  },

  onRead() {
    const id = this.data.zineId;
    if (id) {
      wx.navigateTo({ url: '/pages/viewer/viewer?id=' + encodeURIComponent(id) });
    }
  }
});
