App({
  globalData: {
    supabaseUrl: 'https://bkrsxteqbdsgrddlskle.supabase.co',
    supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrcnN4dGVxYmRzZ3JkZGxza2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMjQ3ODQsImV4cCI6MjA5MDcwMDc4NH0.HvTyn83uO4q2Iwb4tF9cBxmnfn_pUxYznQmSwRRq9Aw',
    zines: [],
    currentViewingZineId: null
  },

  onLaunch() {
    // 冷启动时尝试恢复管理员状态
    const authed = wx.getStorageSync('free-zine:adminAuthed');
    this.globalData.isAdmin = authed === '1';
  }
});
