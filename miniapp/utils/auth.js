const ADMIN_USER = 'Admin1an';
const ADMIN_PASS = 'frezINE1an--2157';
const KEY = 'free-zine:adminAuthed';

function isAdmin() {
  return wx.getStorageSync(KEY) === '1';
}

function login(user, pass) {
  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    wx.setStorageSync(KEY, '1');
    getApp().globalData.isAdmin = true;
    return true;
  }
  return false;
}

function logout() {
  wx.removeStorageSync(KEY);
  getApp().globalData.isAdmin = false;
}

module.exports = { isAdmin, login, logout };
