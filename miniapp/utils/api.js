const app = getApp();

const SUPABASE_URL = app.globalData.supabaseUrl;
const SUPABASE_KEY = app.globalData.supabaseKey;
const TABLE = 'zines';
const BUCKET = 'zines';

const ID_RE = /^[a-zA-Z0-9_-]+$/;

function _headers(extra) {
  return Object.assign({
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  }, extra || {});
}

function _badId(zid) {
  return !zid || !ID_RE.test(zid);
}

// 确保 aspect 是对象（Supabase 可能返回 string）
function _normalizeAspect(a) {
  if (!a) return { w: 1, h: 1 };
  if (typeof a === 'string') {
    try { return JSON.parse(a); } catch (_) { return { w: 1, h: 1 }; }
  }
  if (typeof a === 'object' && a.w != null && a.h != null) return a;
  return { w: 1, h: 1 };
}

// 确保 iconDataURL 是字符串（防止 [object Object]）
function _safeStr(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    // Supabase Storage 可能返回 { publicUrl: "..." }
    return v.publicUrl || v.public_url || '';
  }
  return String(v);
}

// ---------- ZINE CRUD ----------

function listZines() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${SUPABASE_URL}/rest/v1/${TABLE}?select=id,created_at,page_count,aspect,icon_data_url,title&order=created_at.desc&limit=60`,
      method: 'GET',
      header: _headers(),
      success(r) {
        if (r.statusCode >= 200 && r.statusCode < 300) {
          const items = (r.data || []).map(row => ({
            id: row.id,
            createdAt: row.created_at,
            pageCount: row.page_count,
            aspect: _normalizeAspect(row.aspect),
            iconDataURL: _safeStr(row.icon_data_url),
            title: row.title
          }));
          resolve({ items, storage: 'supabase' });
        } else {
          reject(new Error(`listZines ${r.statusCode}: ${JSON.stringify(r.data)}`));
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
          const d = row.data || {};
          resolve({
            id: row.id,
            title: row.title,
            createdAt: row.created_at,
            pageCount: row.page_count,
            aspect: _normalizeAspect(row.aspect),
            iconDataURL: _safeStr(row.icon_data_url),
            defaultFontFamily: row.default_font_family,
            defaultBgColor: row.default_bg_color,
            pageWidthPx: d.pageWidthPx,
            pageHeightPx: d.pageHeightPx,
            pageStates: d.pageStates || [],
            fontScaleForPage: d.fontScaleForPage || [],
            editorCanvasBorder: d.editorCanvasBorder || 'gray',
            defaultTextColor: d.defaultTextColor || '#0f172a'
          });
        } else {
          reject(new Error(`getZine ${r.statusCode}`));
        }
      },
      fail: reject
    });
  });
}

function saveZine(zid, payload) {
  return new Promise((resolve, reject) => {
    const row = {
      id: zid,
      title: payload.title || `ZINE-${zid.slice(0, 8)}`,
      created_at: payload.createdAt || Date.now(),
      page_count: payload.pageCount,
      aspect: payload.aspect,
      icon_data_url: _safeStr(payload.iconDataURL),
      default_font_family: payload.defaultFontFamily,
      default_bg_color: payload.defaultBgColor,
      data: {
        pageWidthPx: payload.pageWidthPx,
        pageHeightPx: payload.pageHeightPx,
        pageStates: payload.pageStates,
        fontScaleForPage: payload.fontScaleForPage || [],
        editorCanvasBorder: payload.editorCanvasBorder || 'gray',
        defaultTextColor: payload.defaultTextColor || '#0f172a'
      }
    };

    // 始终用 POST + upsert（PATCH 不会创建新行）
    wx.request({
      url: `${SUPABASE_URL}/rest/v1/${TABLE}`,
      method: 'POST',
      header: _headers({ 'Prefer': 'resolution=merge-duplicates' }),
      data: row,
      success(r) {
        if (r.statusCode >= 200 && r.statusCode < 300) {
          resolve({ ok: true, storage: 'supabase' });
        } else {
          reject(new Error(`saveZine ${r.statusCode}: ${JSON.stringify(r.data)}`));
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
          reject(new Error(`deleteZine ${r.statusCode}`));
        }
      },
      fail: reject
    });
  });
}

// ---------- Image Upload ----------

function uploadImage(dataUrl, zineId, fileName) {
  return new Promise((resolve, reject) => {
    const parts = String(dataUrl).split(',');
    if (parts.length < 2) return reject(new Error('invalid data url'));
    const b64 = parts[1];
    const buffer = wx.base64ToArrayBuffer(b64);

    const mime = String(dataUrl).match(/data:(image\/[^;]+)/);
    const contentType = mime ? mime[1] : 'image/png';
    const ext = contentType.includes('png') ? 'png'
      : contentType.includes('gif') ? 'gif'
      : contentType.includes('webp') ? 'webp'
      : 'jpg';

    const safeName = String(fileName || 'img')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'img';
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
          const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(key)}`;
          resolve({ ok: true, publicUrl, path: key });
        } else {
          reject(new Error(`uploadImage ${r.statusCode}: ${JSON.stringify(r.data)}`));
        }
      },
      fail: reject
    });
  });
}

module.exports = { listZines, getZine, saveZine, deleteZine, uploadImage };
