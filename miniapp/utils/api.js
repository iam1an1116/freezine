const app = getApp();

const SUPABASE_URL = app.globalData.supabaseUrl;
const SUPABASE_KEY = app.globalData.supabaseKey;
const TABLE = 'zines';
const BUCKET = 'zines';

const ID_RE = /^[a-zA-Z0-9_-]+$/;

function _headers() {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };
}

function _badId(zid) {
  return !zid || !ID_RE.test(zid);
}

// ---------- ZINE CRUD ----------

function listZines() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${SUPABASE_URL}/rest/v1/${TABLE}?select=id,created_at,page_count,aspect,icon_data_url,title&order=created_at.desc`,
      method: 'GET',
      header: _headers(),
      success(r) {
        if (r.statusCode >= 200 && r.statusCode < 300) {
          const items = (r.data || []).map(row => ({
            id: row.id,
            createdAt: row.created_at,
            pageCount: row.page_count,
            aspect: row.aspect,
            iconDataURL: row.icon_data_url,
            title: row.title
          }));
          resolve({ items, storage: 'supabase' });
        } else {
          reject(new Error(`API ${r.statusCode}`));
        }
      },
      fail: reject
    });
  });
}

function getZine(zid) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${SUPABASE_URL}/rest/v1/${TABLE}?select=*&id=eq.${encodeURIComponent(zid)}&limit=1`,
      method: 'GET',
      header: _headers(),
      success(r) {
        if (r.statusCode >= 200 && r.statusCode < 300) {
          const rows = r.data || [];
          if (!rows.length) return reject(new Error('not_found'));
          const row = rows[0];
          const data = row.data || {};
          resolve({
            id: row.id,
            title: row.title,
            createdAt: row.created_at,
            pageCount: row.page_count,
            aspect: row.aspect,
            iconDataURL: row.icon_data_url,
            defaultFontFamily: row.default_font_family,
            defaultBgColor: row.default_bg_color,
            pageWidthPx: data.pageWidthPx,
            pageHeightPx: data.pageHeightPx,
            pageStates: data.pageStates || [],
            fontScaleForPage: data.fontScaleForPage || [],
            editorCanvasBorder: data.editorCanvasBorder || 'gray',
            defaultTextColor: data.defaultTextColor || '#0f172a'
          });
        } else {
          reject(new Error(`API ${r.statusCode}`));
        }
      },
      fail: reject
    });
  });
}

function saveZine(zid, payload) {
  return new Promise((resolve, reject) => {
    const now = Date.now();
    const row = {
      id: zid,
      title: payload.title || `自由ZINE-${zid.slice(0, 8)}`,
      created_at: payload.createdAt || now,
      page_count: payload.pageCount,
      aspect: payload.aspect,
      icon_data_url: payload.iconDataURL,
      default_font_family: payload.defaultFontFamily,
      default_bg_color: payload.defaultBgColor,
      data: {
        pageWidthPx: payload.pageWidthPx,
        pageHeightPx: payload.pageHeightPx,
        pageStates: payload.pageStates,
        fontScaleForPage: payload.fontScaleForPage,
        editorCanvasBorder: payload.editorCanvasBorder,
        defaultTextColor: payload.defaultTextColor
      }
    };

    wx.request({
      url: `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(zid)}`,
      method: 'PATCH',
      header: { ..._headers(), 'Prefer': 'resolution=merge-duplicates' },
      data: row,
      success(r) {
        // Also try upsert if PATCH returns empty
        if (r.statusCode >= 200 && r.statusCode < 300) {
          resolve({ ok: true, storage: 'supabase' });
        } else {
          // fallback: POST upsert
          wx.request({
            url: SUPABASE_URL + '/rest/v1/' + TABLE,
            method: 'POST',
            header: { ..._headers(), 'Prefer': 'resolution=merge-duplicates' },
            data: row,
            success(r2) {
              if (r2.statusCode >= 200 && r2.statusCode < 300) {
                resolve({ ok: true, storage: 'supabase' });
              } else {
                reject(new Error(`API ${r2.statusCode}`));
              }
            },
            fail: reject
          });
        }
      },
      fail: reject
    });
  });
}

function deleteZine(zid) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(zid)}`,
      method: 'DELETE',
      header: _headers(),
      success(r) {
        if (r.statusCode >= 200 && r.statusCode < 300) {
          resolve({ ok: true, storage: 'supabase' });
        } else {
          reject(new Error(`API ${r.statusCode}`));
        }
      },
      fail: reject
    });
  });
}

// ---------- Image Upload ----------

function uploadImage(dataUrl, zineId, fileName) {
  return new Promise((resolve, reject) => {
    // Convert data URL to ArrayBuffer
    const [, b64] = dataUrl.split(',');
    const buffer = wx.base64ToArrayBuffer(b64);

    const mime = dataUrl.match(/data:(image\/[^;]+)/);
    const contentType = mime ? mime[1] : 'image/png';
    const ext = contentType.includes('png') ? 'png' : contentType.includes('gif') ? 'gif' : contentType.includes('webp') ? 'webp' : 'jpg';

    const safeName = (fileName || 'img').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '') || 'img';
    const key = `${zineId}/${Date.now()}-${safeName}.${ext}`;

    wx.request({
      url: `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`,
      method: 'POST',
      header: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': contentType,
        'cache-control': '3600'
      },
      data: buffer,
      success(r) {
        if (r.statusCode >= 200 && r.statusCode < 300) {
          const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}`;
          resolve({ ok: true, publicUrl, path: key });
        } else {
          reject(new Error(`Upload ${r.statusCode}`));
        }
      },
      fail: reject
    });
  });
}

module.exports = { listZines, getZine, saveZine, deleteZine, uploadImage };
