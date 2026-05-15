/**
 * 轻量级 Canvas 对象系统 — 替代 Fabric.js
 *
 * 数据格式（与 web 版 pageStates 兼容）：
 *   web 版存的是 fabric.Canvas.toJSON()，对象数组在 .objects 字段里。
 *   小程序版存相同的结构，但只用到 base props。
 *
 * Fabric 对象通用字段：
 *   type: 'textbox'|'image'|'text'
 *   left, top, width, height, scaleX, scaleY, angle
 *   fill (文字颜色), fontSize, fontFamily, text, textAlign
 *   src (图片 dataURL 或 http url)
 */

// ---------- 从 Fabric JSON 提取可渲染对象 ----------
function normalizeFabricJSON(json) {
  if (!json) return { objects: [], background: '#ffffff' };
  const bg = json.background || '#ffffff';
  const raw = json.objects || [];
  return {
    background: bg,
    objects: raw.map(obj => {
      const type = obj.type || 'textbox';
      const width = obj.width || (type === 'image' ? 100 : 360);
      const height = obj.height || (type === 'image' ? 100 : 80);
      const scaleX = obj.scaleX || 1;
      const scaleY = obj.scaleY || 1;
      const originX = obj.originX || 'left';
      const originY = obj.originY || 'top';

      // Fabric 的 left/top 是 origin 的坐标，转为左上角坐标
      const w = width * scaleX;
      const h = height * scaleY;
      const left = originX === 'center' ? (obj.left || 0) - w / 2 :
                   originX === 'right'  ? (obj.left || 0) - w :
                   (obj.left || 0);
      const top  = originY === 'center' ? (obj.top || 0) - h / 2 :
                   originY === 'bottom' ? (obj.top || 0) - h :
                   (obj.top || 0);

      return {
        id: obj.id || `obj-${Date.now()}-${Math.random()}`,
        type,
        left, top, width, height, scaleX, scaleY,
        angle: obj.angle || 0,
        fill: obj.fill || '#0f172a',
        fontSize: obj.fontSize || 28,
        fontFamily: obj.fontFamily || 'sans-serif',
        text: obj.text || '',
        textAlign: obj.textAlign || 'left',
        src: obj.src || ''
      };
    })
  };
}

// ---------- 渲染引擎 ----------
class CanvasEngine {
  /**
   * @param {WechatMiniprogram.Canvas} canvas - canvas 组件
   * @param {WechatMiniprogram.CanvasRenderingContext2D} ctx - 2d context
   * @param {number} w - 逻辑宽度
   * @param {number} h - 逻辑高度
   * @param {number} dpr - 设备像素比
   */
  constructor(canvas, ctx, w, h, dpr) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.w = w;
    this.h = h;
    this.dpr = dpr || 2;
    this.background = '#ffffff';
    this.objects = [];
    this.activeId = null;
    this.dirty = true;
    this._listeners = {};
  }

  on(evt, fn) {
    (this._listeners[evt] = this._listeners[evt] || []).push(fn);
  }
  _emit(evt, data) {
    (this._listeners[evt] || []).forEach(fn => fn(data));
  }

  // ----- data -----
  loadFromJSON(json) {
    const n = normalizeFabricJSON(json);
    this.background = n.background;
    this.objects = n.objects;
    this.activeId = null;
    this.dirty = true;
    this.render();
  }

  toJSON() {
    return {
      background: this.background,
      objects: this.objects.map(o => ({
        type: o.type,
        left: o.left, top: o.top,
        width: o.width, height: o.height,
        scaleX: o.scaleX, scaleY: o.scaleY,
        angle: o.angle || 0,
        fill: o.fill, fontSize: o.fontSize,
        fontFamily: o.fontFamily, text: o.text,
        textAlign: o.textAlign,
        src: o.src
      }))
    };
  }

  // ----- nav -----
  clear() {
    this.objects = [];
    this.activeId = null;
    this.background = '#ffffff';
    this.dirty = true;
    this.render();
  }

  setBackground(color) {
    this.background = color;
    this.dirty = true;
    this.render();
  }

  // ----- 增删 -----
  addText(text, opts = {}) {
    const fs = opts.fontSize || 28;
    const w = opts.width || Math.min(360, Math.max(80, (text||'').length * fs * 1.2 + 20));
    const h = opts.height || (fs * 1.6 + 16);
    const o = {
      id: `text-${Date.now()}`,
      type: 'textbox',
      left: opts.left != null ? opts.left : (this.w - w) / 2,
      top: opts.top != null ? opts.top : (this.h - h) / 2,
      width: w,
      height: h,
      scaleX: 1, scaleY: 1,
      angle: 0,
      fill: opts.fill || '#0f172a',
      fontSize: fs,
      fontFamily: opts.fontFamily || 'sans-serif',
      text: text || '',
      textAlign: 'left'
    };
    this.objects.push(o);
    this.activeId = o.id;
    this.dirty = true;
    this.render();
    return o;
  }

  addImage(src, naturalW, naturalH) {
    const maxW = this.w * 0.72;
    const maxH = this.h * 0.72;
    const scale = Math.min(maxW / naturalW, maxH / naturalH);
    const sw = naturalW * scale;
    const sh = naturalH * scale;
    const o = {
      id: `img-${Date.now()}`,
      type: 'image',
      left: (this.w - sw) / 2,
      top: (this.h - sh) / 2,
      width: naturalW,
      height: naturalH,
      scaleX: scale,
      scaleY: scale,
      angle: 0,
      src: src
    };
    this.objects.push(o);
    this.activeId = o.id;
    this.dirty = true;
    this.render();
    return o;
  }

  removeActive() {
    if (!this.activeId) return false;
    const idx = this.objects.findIndex(o => o.id === this.activeId);
    if (idx === -1) return false;
    this.objects.splice(idx, 1);
    this.activeId = null;
    this.dirty = true;
    this.render();
    return true;
  }

  setActive(id) {
    this.activeId = id;
    this.dirty = true;
    this.render();
    this._emit('selectionChange', { id });
  }

  getActive() {
    return this.objects.find(o => o.id === this.activeId) || null;
  }

  // ----- 属性修改 -----
  updateActive(props) {
    const obj = this.getActive();
    if (!obj) return;
    Object.assign(obj, props);
    this.dirty = true;
    this.render();
  }

  scaleActive(dir) {
    const obj = this.getActive();
    if (!obj) return;
    // 乘性缩放，每次 ±15%
    const factor = dir > 0 ? 1.15 : 0.85;
    const s = (obj.scaleX || 1) * factor;
    // 限制：最小 20px，最大 3× 画布
    const minS = 20 / Math.max(1, obj.width || 100);
    const maxS = (this.w * 3) / Math.max(1, obj.width || 100);
    obj.scaleX = Math.max(minS, Math.min(maxS, s));
    obj.scaleY = obj.scaleX;
    this.dirty = true;
    this.render();
  }

  // ----- 触摸命中 -----
  hitTest(x, y) {
    // 从上层往下找
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const o = this.objects[i];
      const ox = o.left;
      const oy = o.top;
      const ow = (o.width || 40) * (o.scaleX || 1);
      const oh = (o.height || 40) * (o.scaleY || 1);
      if (x >= ox && x <= ox + ow && y >= oy && y <= oy + oh) {
        return o.id;
      }
    }
    return null;
  }

  moveActive(dx, dy) {
    const obj = this.getActive();
    if (!obj) return;
    obj.left += dx;
    obj.top += dy;
    this.dirty = true;
    this.render();
  }

  // ----- 渲染 -----
  render() {
    const ctx = this.ctx;
    const dpr = this.dpr;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);

    // bg
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, this.w, this.h);

    // 九宫格参考线
    if (this.showGuides) {
      ctx.strokeStyle = 'rgba(99,102,241,.12)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 8]);
      const gx1 = this.w / 3, gx2 = this.w * 2 / 3;
      const gy1 = this.h / 3, gy2 = this.h * 2 / 3;
      ctx.beginPath();
      ctx.moveTo(gx1, 0); ctx.lineTo(gx1, this.h);
      ctx.moveTo(gx2, 0); ctx.lineTo(gx2, this.h);
      ctx.moveTo(0, gy1); ctx.lineTo(this.w, gy1);
      ctx.moveTo(0, gy2); ctx.lineTo(this.w, gy2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const o of this.objects) {
      ctx.save();
      const ox = o.left;
      const oy = o.top;

      if (o.type === 'textbox' || o.type === 'text') {
        const fs = (o.fontSize || 28) * (o.scaleX || 1);
        ctx.font = `${fs}px ${o.fontFamily || 'sans-serif'}`;
        ctx.fillStyle = o.fill || '#0f172a';
        ctx.textAlign = o.textAlign || 'left';
        ctx.textBaseline = 'top';

        // 简单换行
        const maxW = (o.width || 360) * (o.scaleX || 1);
        const lines = wrapText(ctx, o.text || '', maxW);
        const lineH = fs * 1.4;
        for (let i = 0; i < lines.length; i++) {
          const lx = o.textAlign === 'center' ? ox + maxW / 2 :
                     o.textAlign === 'right' ? ox + maxW : ox;
          ctx.fillText(lines[i], lx, oy + i * lineH);
        }
      } else if (o.type === 'image') {
        // 小程序中 image src 是临时路径或网络URL
        // 如果有缓存的 Image 对象，直接 draw
        if (o._img) {
          const sw = o.width * (o.scaleX || 1);
          const sh = o.height * (o.scaleY || 1);
          ctx.drawImage(o._img, ox, oy, sw, sh);
        } else {
          // 占位
          const sw2 = o.width * (o.scaleX || 1);
          const sh2 = o.height * (o.scaleY || 1);
          ctx.fillStyle = 'rgba(0,0,0,.06)';
          ctx.fillRect(ox, oy, sw2, sh2);
          ctx.strokeStyle = 'rgba(0,0,0,.12)';
          ctx.lineWidth = 1;
          ctx.strokeRect(ox, oy, sw2, sh2);
        }
      }

      // 选中框
      if (o.id === this.activeId) {
        const sw3 = (o.width || 40) * (o.scaleX || 1);
        const sh3 = (o.height || 40) * (o.scaleY || 1);
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 2]);
        ctx.strokeRect(ox, oy, sw3, sh3);
        ctx.setLineDash([]);
        // 8个手柄：贴边
        const hw = 14, hs = hw/2;
        const pts = [
          [ox-hs, oy-hs], [ox+sw3-hs, oy-hs], [ox-hs, oy+sh3-hs], [ox+sw3-hs, oy+sh3-hs],
          [ox+sw3/2-hs, oy-hs], [ox+sw3/2-hs, oy+sh3-hs],
          [ox-hs, oy+sh3/2-hs], [ox+sw3-hs, oy+sh3/2-hs]
        ];
        ctx.fillStyle = '#fff';
        pts.forEach(([x,y]) => ctx.fillRect(x-1, y-1, hw+2, hw+2));
        ctx.fillStyle = '#6366f1';
        pts.forEach(([x,y]) => ctx.fillRect(x, y, hw, hw));
      }

      ctx.restore();
    }
    ctx.restore();
    this.dirty = false;
  }

  // ----- 导出图片 -----
  toDataURL() {
    this.render();
    return new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas: this.canvas,
        success: res => resolve(res.tempFilePath),
        fail: reject
      });
    });
  }

  // ----- 异步加载图片（网络 URL -> Image 对象）-----
  loadImageForObject(obj) {
    if (!obj || obj.type !== 'image' || !obj.src) return Promise.resolve();
    if (obj._img) return Promise.resolve(obj._img);
    return new Promise(resolve => {
      const img = this.canvas.createImage();
      img.onload = () => {
        obj._img = img;
        this.render();
        resolve(img);
      };
      img.onerror = () => resolve(null);
      img.src = obj.src;
    });
  }

  loadAllImages() {
    return Promise.all(this.objects.filter(o => o.type === 'image').map(o => this.loadImageForObject(o)));
  }
}

// 简单文字换行
function wrapText(ctx, text, maxWidth) {
  if (!text) return [''];
  const lines = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const ch of para) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line.length > 0) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    lines.push(line);
  }
  return lines.length ? lines : [''];
}

module.exports = { CanvasEngine, normalizeFabricJSON };
