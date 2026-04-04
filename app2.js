(async function () {
  if (!window.fabric) {
    alert("未加载到 Fabric.js，请刷新页面后再试。");
    return;
  }

  // ---------- DOM ----------
  const homeView = document.getElementById("homeView");
  const iconsWall = document.getElementById("iconsWall");
  const homeEnterBtn = document.getElementById("homeEnterBtn");

  const designerView = document.getElementById("designerView");
  const backHomeBtn = document.getElementById("backHomeBtn");

  const setupPanel = document.getElementById("setupPanel");
  const editorPanel = document.getElementById("editorPanel");

  const pageCountInput = document.getElementById("pageCountInput");
  const bookTitleInput = document.getElementById("bookTitleInput");
  const ratioRadios = Array.from(document.querySelectorAll('input[name="ratio"]'));
  const startBtn = document.getElementById("startBtn");

  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const pageIndexText = document.getElementById("pageIndexText");

  const addTextBtn = document.getElementById("addTextBtn");
  const addImageBtn = document.getElementById("addImageBtn");
  const deleteBtn = document.getElementById("deleteBtn");
  const clearPageBtn = document.getElementById("clearPageBtn");
  const imgScaleDownBtn = document.getElementById("imgScaleDownBtn");
  const imgScaleUpBtn = document.getElementById("imgScaleUpBtn");
  const imgSizeInfo = document.getElementById("imgSizeInfo");
  const imageFileInput = document.getElementById("imageFileInput");

  const fontScaleRange = document.getElementById("fontScaleRange");
  const fontScaleText = document.getElementById("fontScaleText");

  const fontFamilySelect = document.getElementById("fontFamilySelect");
  const fontColorInput = document.getElementById("fontColorInput");
  const bgColorInput = document.getElementById("bgColorInput");
  const canvasBorderRadios = Array.from(document.querySelectorAll('input[name="canvasBorder"]'));

  const appLoader = document.getElementById("appLoader");
  const appLoaderText = document.getElementById("appLoaderText");

  const finishBtn = document.getElementById("finishBtn");
  const statusText = document.getElementById("statusText");

  const viewerOverlay = document.getElementById("viewerOverlay");
  const viewerCloseBtn = document.getElementById("viewerCloseBtn");
  const viewerTitle = document.getElementById("viewerTitle");
  const viewerStatus = document.getElementById("viewerStatus");
  const viewerRail = document.getElementById("viewerRail");
  const viewerShareBtn = document.getElementById("viewerShareBtn");

  const pageWrap = document.getElementById("pageWrap");
  const canvasEl = document.getElementById("zineCanvas");

  // Surface runtime errors in UI (instead of failing silently).
  const globalErrorBar = document.getElementById("globalErrorBar");
  function showRuntimeError(err) {
    try {
      const msg = err && err.message ? err.message : String(err);
      if (statusText) statusText.textContent = `错误：${msg}`;
      if (globalErrorBar) {
        globalErrorBar.textContent = `错误：${msg}`;
        globalErrorBar.classList.remove("hidden");
      }
    } catch (_) {}
  }
  window.addEventListener("error", (e) => {
    showRuntimeError(e.error || e.message);
  });
  window.addEventListener("unhandledrejection", (e) => {
    showRuntimeError(e.reason || e.message);
  });

  // ---------- State ----------
  const RATIOS = {
    "1:1": { w: 1, h: 1, label: "1:1" },
    "5:4": { w: 5, h: 4, label: "5:4" },
    "3:2": { w: 3, h: 2, label: "3:2" },
    "4:5": { w: 4, h: 5, label: "4:5" },
    "2:3": { w: 2, h: 3, label: "2:3" },
  };

  const MIN_CANVAS_SIDE = 160; // avoid zero-size canvas
  const ICON_CANVAS_SIZE = 256;
  const HOME_ICON_SIZE = 96; // CSS size

  let canvas = null;
  let draft = null; // current book draft
  let currentPageIndex = 0;
  let pageCount = 0;
  let isLoadingPage = false;
  let exportInProgress = false;
  let saveTimer = null;
  let alignmentGuides = { v: [], h: [] };

  // Viewer modes
  let viewerMode = localStorage.getItem("free-zine:viewerMode") || "seamless"; // 'seamless' | 'single'
  let viewerSinglePageIndex = 0;
  let viewerCachedPageCount = 0;
  let appLoaderDepth = 0;
  /** -1 上一页, +1 下一页, 0 无方向（首次进入等） */
  let viewerSingleSwapDir = 0;

  function setAppLoading(on, message) {
    if (!appLoader) return;
    if (on) {
      appLoaderDepth += 1;
      if (appLoaderText && message) appLoaderText.textContent = message;
      appLoader.classList.remove("hidden");
      appLoader.setAttribute("aria-busy", "true");
      appLoader.setAttribute("aria-hidden", "false");
    } else {
      appLoaderDepth = Math.max(0, appLoaderDepth - 1);
      if (appLoaderDepth === 0) {
        appLoader.classList.add("hidden");
        appLoader.setAttribute("aria-busy", "false");
        appLoader.setAttribute("aria-hidden", "true");
      }
    }
  }

  function normalizeCanvasBorder(v) {
    if (v === "black" || v === "none") return v;
    return "gray";
  }

  function syncCanvasBorderOptionStyles() {
    canvasBorderRadios.forEach((radio) => {
      const opt = radio.closest(".border-option");
      if (!opt) return;
      opt.classList.toggle("is-selected", !!radio.checked);
    });
  }

  function applyEditorCanvasBorder() {
    if (!pageWrap) return;
    const mode = draft ? normalizeCanvasBorder(draft.editorCanvasBorder) : "gray";
    pageWrap.dataset.canvasBorder = mode;
    pageWrap.classList.toggle("canvas-border-none", mode === "none");
  }

  function syncCanvasBorderRadios() {
    const v = draft ? normalizeCanvasBorder(draft.editorCanvasBorder) : "gray";
    canvasBorderRadios.forEach((r) => {
      r.checked = r.value === v;
    });
    syncCanvasBorderOptionStyles();
  }


  // Admin (client-side only; not secure)
  const ADMIN_USER = "1an";
  const ADMIN_PASS = "Freezine2006";
  const ADMIN_FLAG_KEY = "free-zine:adminAuthed";
  function isAdminAuthed() {
    return localStorage.getItem(ADMIN_FLAG_KEY) === "1";
  }

  function syncLoginEntryUI() {
    if (!loginEntryBtn) return;
    loginEntryBtn.classList.toggle("authed", isAdminAuthed());
  }

  // Viewer controls
  const viewerModeSeamlessBtn = document.getElementById("viewerModeSeamlessBtn");
  const viewerModeSingleBtn = document.getElementById("viewerModeSingleBtn");
  const viewerPrevPageBtn = document.getElementById("viewerPrevPageBtn");
  const viewerNextPageBtn = document.getElementById("viewerNextPageBtn");
  const viewerDeleteBtn = document.getElementById("viewerDeleteBtn");

  // Admin login UI
  const loginEntryBtn = document.getElementById("loginEntryBtn");
  const loginModal = document.getElementById("loginModal");
  const loginUserInput = document.getElementById("loginUserInput");
  const loginPassInput = document.getElementById("loginPassInput");
  const loginSubmitBtn = document.getElementById("loginSubmitBtn");
  const loginCancelBtn = document.getElementById("loginCancelBtn");

  // ---------- Utilities ----------
  function setStatus(msg) {
    statusText.textContent = msg || "";
  }

  function setViewerStatus(msg) {
    viewerStatus.textContent = msg || "";
  }

  function clampInt(n, min, max) {
    const x = Number(n);
    if (!Number.isFinite(x)) return min;
    return Math.max(min, Math.min(max, Math.round(x)));
  }

  const MAX_ZINE_PAGES = 36;

  function normalizeTextHex(v) {
    const s = typeof v === "string" ? v.trim() : "";
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    return "#0f172a";
  }

  function fillToHex(fill) {
    if (fill == null) return null;
    if (typeof fill === "string") {
      const t = fill.trim();
      if (t.startsWith("#") && t.length >= 7) return normalizeTextHex(t.slice(0, 7));
      const m = t.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
      if (m) {
        const r = Math.max(0, Math.min(255, Number(m[1])));
        const g = Math.max(0, Math.min(255, Number(m[2])));
        const b = Math.max(0, Math.min(255, Number(m[3])));
        const to2 = (n) => n.toString(16).padStart(2, "0");
        return `#${to2(r)}${to2(g)}${to2(b)}`;
      }
    }
    return null;
  }

  function bookLandingShareURL(zid) {
    const base = new URL("book.html", window.location.href);
    base.hash = `zine=${encodeURIComponent(zid)}`;
    return base.href;
  }

  function getSelectedRatio() {
    const checked = ratioRadios.find((r) => r.checked);
    const val = (checked && checked.value) || "1:1";
    return RATIOS[val] || RATIOS["1:1"];
  }

  function calcPageDims(aspect) {
    // aspect is width:height. Fit page canvas into the editor container.
    let stageW = pageWrap.clientWidth;
    let stageH = pageWrap.clientHeight;
    if (!Number.isFinite(stageW) || stageW <= 0) stageW = 720;
    if (!Number.isFinite(stageH) || stageH <= 0) stageH = 600;

    const ratio = aspect.w / aspect.h;

    // Fit by whichever constraint is tighter.
    let wPx = stageW;
    let hPx = Math.round(wPx / ratio);
    if (hPx > stageH) {
      hPx = stageH;
      wPx = Math.round(hPx * ratio);
    }

    wPx = Math.max(MIN_CANVAS_SIDE, wPx);
    hPx = Math.max(MIN_CANVAS_SIDE, hPx);

    // Final clamp: never exceed stage dims (prevents container clipping).
    if (wPx > stageW) {
      wPx = stageW;
      hPx = Math.round(wPx / ratio);
    }
    if (hPx > stageH) {
      hPx = stageH;
      wPx = Math.round(hPx * ratio);
    }

    return { wPx: Math.max(1, wPx), hPx: Math.max(1, hPx) };
  }

  // ---------- Alignment Guides ----------
  function clearAlignmentGuides() {
    alignmentGuides.v = [];
    alignmentGuides.h = [];
    updateImageSizeInfo();
    if (canvas) canvas.requestRenderAll();
  }

  function drawAlignmentGuides(ctxOverride) {
    if (!canvas) return;
    const xs = alignmentGuides && Array.isArray(alignmentGuides.v) ? alignmentGuides.v : [];
    const ys = alignmentGuides && Array.isArray(alignmentGuides.h) ? alignmentGuides.h : [];
    if (!xs.length && !ys.length) return;

    const ctx = ctxOverride || canvas.getContext("2d");
    ctx.save();
    ctx.strokeStyle = "rgba(79, 70, 229, .75)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);

    xs.forEach((x) => {
      const px = Math.round(x) + 0.5;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, canvas.getHeight());
      ctx.stroke();
    });
    ys.forEach((y) => {
      const py = Math.round(y) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(canvas.getWidth(), py);
      ctx.stroke();
    });

    ctx.restore();
  }

  function drawRuleOfThirdsGuides(ctxOverride) {
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (!active) return;
    if (!(active.type === "image" || active.type === "textbox")) return;

    const ctx = ctxOverride || canvas.getContext("2d");
    const w = canvas.getWidth();
    const h = canvas.getHeight();
    const x1 = Math.round(w / 3) + 0.5;
    const x2 = Math.round((w * 2) / 3) + 0.5;
    const y1 = Math.round(h / 3) + 0.5;
    const y2 = Math.round((h * 2) / 3) + 0.5;

    ctx.save();
    ctx.strokeStyle = "rgba(15, 23, 42, .22)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    [x1, x2].forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    });
    [y1, y2].forEach((y) => {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    });
    ctx.restore();
  }

  function updateImageSizeInfo() {
    if (!imgSizeInfo || !canvas) return;
    const obj = canvas.getActiveObject();
    if (!obj || obj.type !== "image") {
      imgSizeInfo.classList.add("hidden");
      imgSizeInfo.textContent = "图片尺寸: -";
      return;
    }
    const w = Math.max(1, Math.round((obj.width || 0) * (obj.scaleX || 1)));
    const h = Math.max(1, Math.round((obj.height || 0) * (obj.scaleY || 1)));
    imgSizeInfo.classList.remove("hidden");
    imgSizeInfo.textContent = `图片尺寸: ${w} x ${h}px`;
  }

  function syncFontColorFromCanvasSelection() {
    if (!fontColorInput || !canvas) return;
    const obj = canvas.getActiveObject();
    if (!obj || obj.type !== "textbox") return;
    const hex = fillToHex(obj.fill);
    if (hex) fontColorInput.value = hex;
  }

  function applyAlignmentSnapping(obj, bestDx, bestDy) {
    if (!obj) return;
    if (bestDx) obj.left += bestDx;
    if (bestDy) obj.top += bestDy;
    obj.setCoords();
  }

  function handleObjectMoving(opt) {
    if (!opt || !opt.target) return;
    const obj = opt.target;
    if (!obj) return;

    // Don't align against invisible/guide objects.
    if (obj.excludeFromExport) return;

    const threshold = 10; // px in canvas coordinates (for better image snapping)

    const r1 = obj.getBoundingRect(true, true);
    const moving = {
      left: r1.left,
      right: r1.left + r1.width,
      top: r1.top,
      bottom: r1.top + r1.height,
      cx: r1.left + r1.width / 2,
      cy: r1.top + r1.height / 2,
    };

    let bestAbsDx = threshold + 1;
    let bestDx = 0;
    let bestAbsDy = threshold + 1;
    let bestDy = 0;

    const xGuides = [];
    const yGuides = [];

    const all = canvas.getObjects();
    for (let i = 0; i < all.length; i++) {
      const other = all[i];
      if (other === obj) continue;
      if (!other) continue;
      if (other.excludeFromExport) continue;

      const r2 = other.getBoundingRect(true, true);
      const cand = {
        leftDx: r2.left - moving.left,
        centerDx: r2.left + r2.width / 2 - moving.cx,
        rightDx: r2.left + r2.width - moving.right,
        topDy: r2.top - moving.top,
        centerDy: r2.top + r2.height / 2 - moving.cy,
        bottomDy: r2.top + r2.height - moving.bottom,
        leftX: r2.left,
        centerX: r2.left + r2.width / 2,
        rightX: r2.left + r2.width,
        topY: r2.top,
        centerY: r2.top + r2.height / 2,
        bottomY: r2.top + r2.height,
      };

      const absLeftDx = Math.abs(cand.leftDx);
      if (absLeftDx <= threshold) {
        xGuides.push(cand.leftX);
        if (absLeftDx < bestAbsDx) {
          bestAbsDx = absLeftDx;
          bestDx = cand.leftDx;
        }
      }
      const absCenterDx = Math.abs(cand.centerDx);
      if (absCenterDx <= threshold) {
        xGuides.push(cand.centerX);
        if (absCenterDx < bestAbsDx) {
          bestAbsDx = absCenterDx;
          bestDx = cand.centerDx;
        }
      }
      const absRightDx = Math.abs(cand.rightDx);
      if (absRightDx <= threshold) {
        xGuides.push(cand.rightX);
        if (absRightDx < bestAbsDx) {
          bestAbsDx = absRightDx;
          bestDx = cand.rightDx;
        }
      }

      const absTopDy = Math.abs(cand.topDy);
      if (absTopDy <= threshold) {
        yGuides.push(cand.topY);
        if (absTopDy < bestAbsDy) {
          bestAbsDy = absTopDy;
          bestDy = cand.topDy;
        }
      }
      const absCenterDy = Math.abs(cand.centerDy);
      if (absCenterDy <= threshold) {
        yGuides.push(cand.centerY);
        if (absCenterDy < bestAbsDy) {
          bestAbsDy = absCenterDy;
          bestDy = cand.centerDy;
        }
      }
      const absBottomDy = Math.abs(cand.bottomDy);
      if (absBottomDy <= threshold) {
        yGuides.push(cand.bottomY);
        if (absBottomDy < bestAbsDy) {
          bestAbsDy = absBottomDy;
          bestDy = cand.bottomDy;
        }
      }
    }

    alignmentGuides.v = Array.from(new Set(xGuides.map((x) => Math.round(x))));
    alignmentGuides.h = Array.from(new Set(yGuides.map((y) => Math.round(y))));

    applyAlignmentSnapping(obj, bestDx, bestDy);
    canvas.requestRenderAll();
  }

  function getFontScale() {
    if (!fontScaleRange) return 1;
    const v = Number(fontScaleRange.value);
    return Number.isFinite(v) ? v : 1;
  }

  function debounceSave() {
    if (!draft || exportInProgress) return;
    if (isLoadingPage) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!draft) return;
      draft.pageStates[currentPageIndex] = canvas.toJSON();
    }, 200);
  }

  function ensureMainCanvas(wPx, hPx) {
    if (!canvas) {
      canvas = new fabric.Canvas(canvasEl, {
        preserveObjectStacking: true,
        selection: true,
        backgroundColor: "#ffffff",
      });
      canvas.on("object:added", debounceSave);
      canvas.on("object:modified", debounceSave);
      canvas.on("object:removed", debounceSave);

      // Alignment guides: draw in the canvas render pipeline.
      canvas.on("after:render", (opt) => {
        const ctx = opt && opt.ctx ? opt.ctx : null;
        drawAlignmentGuides(ctx || undefined);
        drawRuleOfThirdsGuides(ctx || undefined);
      });
      canvas.on("object:moving", handleObjectMoving);
      canvas.on("object:scaling", handleObjectMoving);
      canvas.on("mouse:up", clearAlignmentGuides);
      canvas.on("selection:cleared", clearAlignmentGuides);
      canvas.on("selection:created", updateImageSizeInfo);
      canvas.on("selection:updated", updateImageSizeInfo);
      canvas.on("object:scaling", updateImageSizeInfo);
      canvas.on("object:modified", updateImageSizeInfo);
      canvas.on("selection:created", syncFontColorFromCanvasSelection);
      canvas.on("selection:updated", syncFontColorFromCanvasSelection);
    }
    // Force-sync both Fabric internal size and DOM CSS size.
    canvas.setDimensions({ width: wPx, height: hPx }, { backstoreOnly: false });
    canvas.setBackgroundColor("#ffffff");
    canvasEl.style.width = `${wPx}px`;
    canvasEl.style.height = `${hPx}px`;
    canvas.calcOffset();
    canvas.requestRenderAll();
    canvas.renderAll();
    applyEditorCanvasBorder();
  }

  async function loadPage(index) {
    if (!draft) return;
    if (index < 0 || index >= pageCount) return;
    currentPageIndex = index;
    pageIndexText.textContent = `第 ${currentPageIndex + 1} / ${pageCount} 页`;

    isLoadingPage = true;
    canvas.discardActiveObject();
    canvas.clear();
    canvas.setBackgroundColor(draft.defaultBgColor || "#ffffff");
    canvas.requestRenderAll();
    canvas.renderAll();

    const json = draft.pageStates[currentPageIndex];
    if (json) {
      await new Promise((resolve) => {
        canvas.loadFromJSON(json, () => {
          canvas.renderAll();
          resolve();
        });
      });
    } else {
      canvas.renderAll();
    }

    // Rescale existing text to match the current font-size slider.
    const currentScale = getFontScale();
    const storedScale =
      draft && draft.fontScaleForPage
        ? draft.fontScaleForPage[currentPageIndex]
        : currentScale;
    if (storedScale && Math.abs(storedScale - currentScale) > 0.0001) {
      const ratio = currentScale / storedScale;
      canvas.getObjects().forEach((obj) => {
        if (obj && obj.type === "textbox") {
          obj.fontSize = Math.max(8, Math.round(obj.fontSize * ratio));
          obj.setCoords();
        }
      });
      canvas.requestRenderAll();
      if (draft && draft.fontScaleForPage) draft.fontScaleForPage[currentPageIndex] = currentScale;
      if (draft) draft.pageStates[currentPageIndex] = canvas.toJSON();
    }

    // Sync background picker to current page background (if it's a hex value).
    if (bgColorInput) {
      const bg = canvas.backgroundColor;
      if (typeof bg === "string" && bg.startsWith("#")) {
        bgColorInput.value = bg;
      }
    }

    isLoadingPage = false;
    updateEditorButtons();
    syncFontColorFromCanvasSelection();
  }

  function saveCurrentPageNow() {
    if (!draft) return;
    if (exportInProgress) return;
    if (isLoadingPage) return;
    draft.pageStates[currentPageIndex] = canvas.toJSON();
  }

  function updateEditorButtons() {
    const hasPages = pageCount > 0;
    prevBtn.disabled = !hasPages || currentPageIndex <= 0;
    nextBtn.disabled = !hasPages || currentPageIndex >= pageCount - 1;

    addTextBtn.disabled = !hasPages;
    addImageBtn.disabled = !hasPages;
    deleteBtn.disabled = !hasPages;
    clearPageBtn.disabled = !hasPages;
    imgScaleDownBtn.disabled = !hasPages;
    imgScaleUpBtn.disabled = !hasPages;
    finishBtn.disabled = !hasPages || exportInProgress;
  }

  function addText(text) {
    if (!draft) return;
    const wPx = canvas.getWidth();
    const hPx = canvas.getHeight();
    const fontScale = getFontScale();
    const base = Math.round(Math.min(wPx, hPx) * 0.06);
    const fontSize = Math.max(12, Math.round(base * fontScale));
    const width = Math.round(wPx * 0.62);

    const t = new fabric.Textbox(text, {
      left: wPx / 2,
      top: hPx / 2,
      originX: "center",
      originY: "center",
      fontFamily:
        (draft && draft.defaultFontFamily) ||
        (fontFamilySelect ? fontFamilySelect.value : undefined) ||
        "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Arial",
      fontSize,
      fill:
        (fontColorInput && normalizeTextHex(fontColorInput.value)) ||
        (draft && normalizeTextHex(draft.defaultTextColor)) ||
        "#0f172a",
      width,
      textAlign: "left",
      editable: true,
    });

    canvas.add(t);
    canvas.setActiveObject(t);
    canvas.requestRenderAll();
    canvas.renderAll();

    // If entering edit mode fails in a given Fabric version, ignore.
    try {
      t.enterEditing();
      t.selectAll && t.selectAll();
    } catch (_) {}
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("读取失败"));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }

  const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

  function estimateDataURLBytes(dataURL) {
    // Rough byte size from base64 payload length.
    const base64 = String(dataURL).split(",")[1] || "";
    const padding = (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
    return Math.max(0, Math.ceil((base64.length * 3) / 4) - padding);
  }

  function loadImageFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("图片加载失败"));
      };
      img.src = url;
    });
  }

  async function compressImageBlobToDataURL(blob) {
    // First attempt reduces resolution by 10%-20% (scale=0.85~0.9).
    const img = await loadImageFromBlob(blob);

    let scale = 0.85;
    let quality = 0.9;
    let lastDataURL = null;

    // Convert to JPEG for predictable compression/size control.
    const mime = "image/jpeg";

    for (let i = 0; i < 8; i++) {
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));

      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);

      const dataURL = c.toDataURL(mime, quality);
      lastDataURL = dataURL;

      const bytes = estimateDataURLBytes(dataURL);
      if (bytes <= MAX_IMAGE_BYTES) return dataURL;

      // If still too large, keep lowering both resolution and quality.
      scale = Math.max(0.6, scale - 0.06);
      quality = Math.max(0.6, quality - 0.06);
    }

    // Best effort: return the smallest we got.
    return lastDataURL || (await blobToDataURL(blob));
  }

  async function imageBlobToDataURL(blob) {
    if (!blob) return null;
    if (blob.size <= MAX_IMAGE_BYTES) return blobToDataURL(blob);
    return compressImageBlobToDataURL(blob);
  }

  async function shrinkDataURLForUpload(dataURL, maxBytes) {
    const limit = Math.max(300 * 1024, maxBytes || 2 * 1024 * 1024);
    let cur = dataURL;
    if (estimateDataURLBytes(cur) <= limit) return cur;

    const img = await dataURLToImage(cur);
    let scale = 0.78;
    let quality = 0.82;
    let best = cur;

    for (let i = 0; i < 10; i++) {
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      const out = c.toDataURL("image/jpeg", quality);
      best = out;
      if (estimateDataURLBytes(out) <= limit) return out;
      scale = Math.max(0.42, scale - 0.06);
      quality = Math.max(0.5, quality - 0.06);
    }
    return best;
  }

  async function uploadImageDataURL(dataURL, fileName) {
    // Keep request payload small for serverless limits.
    const shrunken = await shrinkDataURLForUpload(dataURL, 2 * 1024 * 1024);
    const zid = draft && draft.id ? draft.id : "temp";
    const res = await apiJSON("/api/upload-image", {
      method: "POST",
      body: JSON.stringify({
        zineId: zid,
        fileName: fileName || `img-${Date.now()}.jpg`,
        dataUrl: shrunken,
      }),
    });
    if (!res || !res.publicUrl) throw new Error("图片上传失败：未返回 URL");
    return res.publicUrl;
  }

  function addImageFromURL(imageURL) {
    fabric.Image.fromURL(
      imageURL,
      (img) => {
        const maxW = canvas.getWidth() * 0.72;
        const maxH = canvas.getHeight() * 0.72;
        const scale = Math.min(maxW / img.width, maxH / img.height);

        img.set({
          left: canvas.getWidth() / 2,
          top: canvas.getHeight() / 2,
          originX: "center",
          originY: "center",
          selectable: true,
          evented: true,
        });
        img.scale(scale);

        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.requestRenderAll();
        canvas.renderAll();
      },
      { crossOrigin: "anonymous" }
    );
  }

  async function handlePaste(e) {
    if (!draft) return;
    if (!e.clipboardData) return;
    e.preventDefault();

    const dt = e.clipboardData;
    const items = dt.items ? Array.from(dt.items) : [];
    const imgItem = items.find((it) => it.type && it.type.startsWith("image/"));
    if (imgItem) {
      const blob = imgItem.getAsFile();
      if (!blob) return;
      try {
        const dataURL = await imageBlobToDataURL(blob);
        const url = await uploadImageDataURL(dataURL, `paste-${Date.now()}.jpg`);
        addImageFromURL(url);
      } catch (e) {
        setStatus(`粘贴图片失败：${String(e?.message || e)}`);
      }
      return;
    }

    const text = (dt.getData("text/plain") || dt.getData("text") || "").trim();
    if (text) {
      const t = text.length > 240 ? text.slice(0, 240) : text;
      addText(t);
    }
  }

  async function dataURLToImage(dataURL) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("图片加载失败"));
      img.src = dataURL;
    });
  }

  async function renderPageStateToDataURL(pageJson, pageW, pageH, multiplier) {
    const tempEl = document.createElement("canvas");
    tempEl.width = pageW;
    tempEl.height = pageH;
    const tempCanvas = new fabric.Canvas(tempEl, { selection: false });
    tempCanvas.setWidth(pageW);
    tempCanvas.setHeight(pageH);
    tempCanvas.backgroundColor = "#ffffff";
    tempCanvas.requestRenderAll();

    if (pageJson) {
      await new Promise((resolve) => {
        tempCanvas.loadFromJSON(pageJson, () => {
          tempCanvas.renderAll();
          resolve();
        });
      });
    } else {
      tempCanvas.renderAll();
    }

    // Important: dispose temp canvas to avoid memory leaks.
    const dataURL = tempCanvas.toDataURL({
      format: "png",
      multiplier: multiplier,
    });
    if (tempCanvas.dispose) tempCanvas.dispose();
    return dataURL;
  }

  function showHome() {
    document.documentElement.classList.remove("freezine-boot-reader");
    designerView.classList.add("hidden");
    viewerOverlay.classList.add("hidden");
    homeView.classList.remove("hidden");
    // Keep main editor in background and lazily restore saved icons.
    if (iconsWall && iconsWall.childElementCount === 0) {
      restoreHomeIconsFromStorage().catch(() => {});
    }
  }

  function showDesigner() {
    viewerOverlay.classList.add("hidden");
    homeView.classList.add("hidden");
    designerView.classList.remove("hidden");
  }

  // ---------- Home Icons / Storage ----------
  const STORAGE_PREFIX = "free-zine:";
  const STORAGE_INDEX_KEY = `${STORAGE_PREFIX}index`;
  const STORAGE_META_PREFIX = `${STORAGE_PREFIX}meta:`;
  let zines = []; // in-memory (includes pageStates)
  let currentViewingZineId = null;

  // Server-side storage via backend API.
  async function apiJSON(url, options) {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options && options.headers ? options.headers : {}),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`API ${res.status}: ${text || url}`);
    }
    return res.json();
  }

  function safeParseJSON(s) {
    try {
      return JSON.parse(s);
    } catch (_) {
      return null;
    }
  }

  function readStoredZineIds() {
    const raw = localStorage.getItem(STORAGE_INDEX_KEY);
    const arr = safeParseJSON(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((id) => typeof id === "string" && id.length > 0);
  }

  function cacheZineMeta(z) {
    if (!z || !z.id) return;
    const meta = {
      id: z.id,
      title: z.title || "未命名",
      createdAt: z.createdAt,
      pageCount: z.pageCount,
      aspect: z.aspect,
      iconDataURL: z.iconDataURL || null,
    };
    try {
      localStorage.setItem(`${STORAGE_META_PREFIX}${z.id}`, JSON.stringify(meta));
    } catch (_) {}
  }

  function readCachedMeta(id) {
    const raw = localStorage.getItem(`${STORAGE_META_PREFIX}${id}`);
    const meta = safeParseJSON(raw);
    if (!meta || typeof meta !== "object") return null;
    if (!meta.id) meta.id = id;
    return meta;
  }

  async function persistZineToStorage(z) {
    if (!z || !z.id) return;
    const payload = {
      id: z.id,
      title: z.title || "未命名",
      createdAt: z.createdAt,
      pageCount: z.pageCount,
      aspect: z.aspect,
      pageWidthPx: z.pageWidthPx,
      pageHeight: z.pageHeight,
      pageHeightPx: z.pageHeightPx,
      author: z.author || "匿名",
      pageStates: z.pageStates,
      fontScaleForPage: z.fontScaleForPage,
      defaultFontFamily: z.defaultFontFamily,
      defaultBgColor: z.defaultBgColor,
      defaultTextColor: normalizeTextHex(z.defaultTextColor || "#0f172a"),
      iconDataURL: z.iconDataURL,
      editorCanvasBorder: normalizeCanvasBorder(z.editorCanvasBorder),
    };
    await apiJSON(`/api/zines/${encodeURIComponent(z.id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });

    cacheZineMeta(payload);

    const ids = readStoredZineIds();
    if (!ids.includes(z.id)) {
      ids.unshift(z.id);
      localStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(ids.slice(0, 200)));
    }
  }

  async function loadZineFromStorage(id) {
    try {
      const payload = await apiJSON(`/api/zines/${encodeURIComponent(id)}`, { method: "GET" });
      if (!payload) return null;
      if (!payload.pageStates || !Array.isArray(payload.pageStates)) return null;
      return payload;
    } catch (_) {
      return null;
    }
  }

  function addIconToHome(zine) {
    // Use wrapper + icon + label.
    const item = document.createElement("div");
    item.className = "zine-item";
    item.dataset.zineId = zine.id;

    const btn = document.createElement("div");
    btn.className = "zine-icon-btn";
    btn.setAttribute("role", "button");
    btn.setAttribute("tabindex", "0");
    btn.setAttribute("aria-label", "打开电子书阅览");

    const aw = zine.aspect && zine.aspect.w ? Number(zine.aspect.w) : 1;
    const ah = zine.aspect && zine.aspect.h ? Number(zine.aspect.h) : 1;
    const ar = ah > 0 ? aw / ah : 1;
    const maxSide = 112;
    let bw = maxSide;
    let bh = maxSide;
    if (ar >= 1) {
      bh = Math.max(56, Math.round(maxSide / ar));
    } else {
      bw = Math.max(56, Math.round(maxSide * ar));
    }
    btn.style.width = `${bw}px`;
    btn.style.height = `${bh}px`;

    const img = document.createElement("img");
    img.alt = "自由ZINE 图标";
    img.src = zine.iconDataURL;

    btn.appendChild(img);
    item.appendChild(btn);

    const name = document.createElement("div");
    name.className = "zine-name";
    name.textContent = zine.title || "未命名";
    item.appendChild(name);

    btn.addEventListener("click", () => {
      // Open a landing page in a new window (cover + "阅览" button).
      window.open(`./book.html#zine=${encodeURIComponent(zine.id)}`, "_blank", "noopener,noreferrer");
    });
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        window.open(`./book.html#zine=${encodeURIComponent(zine.id)}`, "_blank", "noopener,noreferrer");
      }
    });
    iconsWall.appendChild(item);
  }

  function clearHomeIcons() {
    iconsWall.innerHTML = "";
  }

  async function restoreHomeIconsFromStorage() {
    if (!iconsWall) return;
    if (currentViewingZineId) return;
    setAppLoading(true, "加载书架…");
    try {
      const data = await apiJSON("/api/zines", { method: "GET" });
      const items = (data && data.items) || [];

      // Only clear & re-render after we have data (prevents "flash then disappear").
      clearHomeIcons();
      zines = [];

      for (let i = 0; i < items.length; i++) {
        if (currentViewingZineId) return;
        const z = items[i];
        if (!z || !z.id) continue;
        if (!zines.find((x) => x.id === z.id)) zines.push(z);
        if (z.iconDataURL && typeof z.iconDataURL === "string") addIconToHome(z);
        if (zines.length >= 60) break;
      }

      // If server returns empty (or iconDataURL missing), fallback to cached metas.
      if (iconsWall.childElementCount === 0) {
        const ids = readStoredZineIds();
        for (let i = 0; i < ids.length; i++) {
          const meta = readCachedMeta(ids[i]);
          if (!meta || !meta.iconDataURL) continue;
          if (!zines.find((x) => x.id === meta.id)) zines.push(meta);
          addIconToHome(meta);
          if (zines.length >= 60) break;
        }
      }
    } catch (e) {
      // On API failure, keep existing icons and show cached ones.
      const ids = readStoredZineIds();
      if (iconsWall.childElementCount === 0) {
        clearHomeIcons();
        zines = [];
        for (let i = 0; i < ids.length; i++) {
          const meta = readCachedMeta(ids[i]);
          if (!meta || !meta.iconDataURL) continue;
          if (!zines.find((x) => x.id === meta.id)) zines.push(meta);
          addIconToHome(meta);
          if (zines.length >= 60) break;
        }
      }
      showRuntimeError(e);
    } finally {
      setAppLoading(false);
    }
  }

  // ---------- Viewer ----------
  async function openViewer(zineId) {
    const prevViewingId = currentViewingZineId;
    let zine = zines.find((z) => z.id === zineId);
    if (!zine) {
      setAppLoading(true, "加载书籍…");
      try {
        const stored = await loadZineFromStorage(zineId);
        if (!stored) {
          setViewerStatus("无法加载书籍（后端无数据或网络错误）");
          showHome();
          return;
        }
        zine = stored;
        zines.push(zine);
      } finally {
        setAppLoading(false);
      }
    }

    setAppLoading(true, "渲染页面…");
    try {
      currentViewingZineId = zine.id;
      viewerCachedPageCount = Math.max(0, Number(zine.pageCount) || 0);
      exportInProgress = false; // allow UI
      viewerOverlay.classList.remove("hidden");
      homeView.classList.add("hidden");
      designerView.classList.add("hidden");
      viewerOverlay.classList.remove("single-mode");

      document.body.style.overflow = "hidden";
      viewerTitle.textContent = `自由ZINE · ${zine.pageCount} 页`;
      viewerRail.innerHTML = "";

      // Mode & single-page index: keep index when flipping pages on the same book (do not reset every open).
      viewerMode = localStorage.getItem("free-zine:viewerMode") || "seamless";
      if (viewerMode === "single" && prevViewingId === zine.id) {
        const fromStore = Number(localStorage.getItem("free-zine:viewerSingleIndex"));
        const base = Number.isFinite(fromStore) ? fromStore : viewerSinglePageIndex;
        viewerSinglePageIndex = Math.max(0, Math.min(viewerCachedPageCount - 1, base));
      } else {
        viewerSinglePageIndex = 0;
      }
      localStorage.setItem("free-zine:viewerSingleIndex", String(viewerSinglePageIndex));

      // Sync mode UI
      viewerModeSeamlessBtn?.classList.toggle("primary", viewerMode === "seamless");
      viewerModeSingleBtn?.classList.toggle("primary", viewerMode === "single");

      const isSingle = viewerMode === "single";
      viewerPrevPageBtn?.classList.toggle("hidden", !isSingle);
      viewerNextPageBtn?.classList.toggle("hidden", !isSingle);

      viewerRail.classList.toggle("single-mode", isSingle);

      viewerDeleteBtn.classList.toggle("hidden", !isAdminAuthed());

      viewerOverlay.tabIndex = 0;
      viewerOverlay.focus();

      const displayHeight = Math.min(720, Math.max(360, window.innerHeight - 140));

      const pageW = Math.max(1, Number(zine.pageWidthPx) || 720);
      const pageH = Math.max(1, Number(zine.pageHeightPx) || 720);
      const outputMultiplier = Math.min(
        2,
        Math.max(0.5, (isSingle ? displayHeight * 1.25 : displayHeight * 1.1) / pageH)
      );

      if (
        !zine.pageImageCache ||
        zine.pageImageCache.length !== zine.pageCount ||
        zine.pageImageCacheMultiplier !== outputMultiplier
      ) {
        zine.pageImageCache = new Array(zine.pageCount).fill(null);
        zine.pageImageCacheMultiplier = outputMultiplier;
      }

      const tempEl = document.createElement("canvas");
      tempEl.width = pageW;
      tempEl.height = pageH;
      const tempCanvas = new fabric.Canvas(tempEl, { selection: false });
      tempCanvas.setWidth(pageW);
      tempCanvas.setHeight(pageH);
      tempCanvas.backgroundColor = "#ffffff";
      tempCanvas.requestRenderAll();

      async function ensurePageImage(i) {
        let dataURL = zine.pageImageCache[i];
        if (dataURL) return dataURL;

        tempCanvas.clear();
        tempCanvas.setBackgroundColor("#ffffff", tempCanvas.renderAll.bind(tempCanvas));
        tempCanvas.requestRenderAll();

        const json = zine.pageStates[i];
        if (json) {
          await new Promise((resolve) => {
            tempCanvas.loadFromJSON(json, () => {
              tempCanvas.renderAll();
              resolve();
            });
          });
        } else {
          tempCanvas.renderAll();
        }

        dataURL = tempCanvas.toDataURL({ format: "png", multiplier: outputMultiplier });
        zine.pageImageCache[i] = dataURL;
        return dataURL;
      }

      setViewerStatus("正在渲染页面，请稍候...");

      if (isSingle) {
        const i = viewerSinglePageIndex;
        setViewerStatus(`第 ${i + 1} / ${zine.pageCount} 页`);
        const dataURL = await ensurePageImage(i);

        const img = document.createElement("img");
        img.className = "viewer-single-img";
        img.alt = `第 ${i + 1} 页`;
        img.src = dataURL;
        img.decoding = "async";

        const pageWrapEl = document.createElement("div");
        pageWrapEl.className = "viewer-page";
        const dir = viewerSingleSwapDir;
        viewerSingleSwapDir = 0;
        if (dir < 0) pageWrapEl.classList.add("swap-from-left");
        else if (dir > 0) pageWrapEl.classList.add("swap-from-right");
        else pageWrapEl.classList.add("swap-enter-soft");

        pageWrapEl.appendChild(img);
        viewerRail.appendChild(pageWrapEl);
      } else {
        for (let i = 0; i < zine.pageCount; i++) {
          setViewerStatus(`渲染第 ${i + 1} / ${zine.pageCount} 页...`);
          const dataURL = await ensurePageImage(i);

          const img = document.createElement("img");
          img.alt = `第 ${i + 1} 页`;
          img.src = dataURL;
          img.style.height = `${displayHeight}px`;
          if (i !== 0) img.style.borderLeft = "0";
          img.style.scrollSnapAlign = "start";

          const pageWrapEl = document.createElement("div");
          pageWrapEl.className = "viewer-page";
          pageWrapEl.appendChild(img);
          viewerRail.appendChild(pageWrapEl);
        }
      }

      if (tempCanvas.dispose) tempCanvas.dispose();
      setViewerStatus("");
      document.documentElement.classList.remove("freezine-boot-reader");
    } finally {
      setAppLoading(false);
    }
  }

  function closeViewer() {
    viewerOverlay.classList.add("hidden");
    document.body.style.overflow = "";
    // Return to home
    homeView.classList.remove("hidden");
    currentViewingZineId = null;
  }

  // ---------- Icon Generation ----------
  async function generateBookIcon(z) {
    const pw = Math.max(1, Number(z.pageWidthPx) || 720);
    const ph = Math.max(1, Number(z.pageHeightPx) || 720);
    const pageAspect = pw / ph;

    const maxSide = ICON_CANVAS_SIZE;
    let iconW = maxSide;
    let iconH = maxSide;
    if (pageAspect >= 1) {
      iconH = Math.max(72, Math.round(maxSide / pageAspect));
    } else {
      iconW = Math.max(72, Math.round(maxSide * pageAspect));
    }

    const icon = document.createElement("canvas");
    icon.width = iconW;
    icon.height = iconH;
    const ctx = icon.getContext("2d");

    const pad = 12;
    const innerMaxW = iconW - pad * 2;
    const innerMaxH = iconH - pad * 2;
    let coverW = innerMaxW;
    let coverH = Math.round(coverW / pageAspect);
    if (coverH > innerMaxH) {
      coverH = innerMaxH;
      coverW = Math.round(coverH * pageAspect);
    }
    const coverX = pad + (innerMaxW - coverW) / 2;
    const coverY = pad + (innerMaxH - coverH) / 2;
    const coverR = Math.min(14, coverW / 8, coverH / 8);
    const iconR = Math.min(18, iconW / 8, iconH / 8);

    ctx.fillStyle = "#ffffff";
    ctx.clearRect(0, 0, iconW, iconH);
    roundRect(ctx, 0.5, 0.5, iconW - 1, iconH - 1, iconR);
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(15,23,42,.1)";
    roundRect(ctx, 0.5, 0.5, iconW - 1, iconH - 1, iconR);
    ctx.stroke();

    setStatus("生成封面图标：渲染第 1 页...");
    const tempEl = document.createElement("canvas");
    tempEl.width = pw;
    tempEl.height = ph;
    const tempCanvas = new fabric.Canvas(tempEl, { selection: false });
    tempCanvas.setWidth(pw);
    tempCanvas.setHeight(ph);
    tempCanvas.setBackgroundColor("#ffffff");

    const json0 = z.pageStates && z.pageStates[0] ? z.pageStates[0] : null;
    if (json0) {
      await new Promise((resolve) => {
        tempCanvas.loadFromJSON(json0, () => {
          tempCanvas.renderAll();
          resolve();
        });
      });
    } else {
      tempCanvas.renderAll();
    }

    const coverDataURL = tempCanvas.toDataURL({ format: "png", multiplier: 0.52 });
    if (tempCanvas.dispose) tempCanvas.dispose();

    const coverImg = await dataURLToImage(coverDataURL);

    ctx.save();
    ctx.beginPath();
    roundRectPath(ctx, coverX, coverY, coverW, coverH, coverR);
    ctx.clip();
    ctx.drawImage(coverImg, coverX, coverY, coverW, coverH);
    ctx.restore();

    return icon.toDataURL("image/png");
  }

  function downloadDataURL(_dataURL, _filename) {
    // This app's flow is: icon is displayed on home for reading.
    // Download is optional; currently not required by your new spec.
  }

  function roundRect(ctx, x, y, w, h, r) {
    roundRectPath(ctx, x, y, w, h, r);
  }
  function roundRectPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  // ---------- Editor Flow ----------
  function resetDraft() {
    draft = null;
    pageCount = 0;
    currentPageIndex = 0;
    isLoadingPage = false;
    exportInProgress = false;
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  function startEditing() {
    const count = clampInt(pageCountInput.value, 1, MAX_ZINE_PAGES);
    const aspect = getSelectedRatio();
    startBtn.disabled = true;

    // Prevent user actions during canvas/draft initialization.
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    addTextBtn.disabled = true;
    addImageBtn.disabled = true;
    deleteBtn.disabled = true;
    clearPageBtn.disabled = true;
    imgScaleDownBtn.disabled = true;
    imgScaleUpBtn.disabled = true;
    finishBtn.disabled = true;

    setupPanel.classList.add("hidden");
    editorPanel.classList.remove("hidden");

    // Layout-dependent canvas size must be computed when the editor is visible.
    requestAnimationFrame(() => {
      // Wait another frame after `hidden` -> visible to stabilize layout.
      requestAnimationFrame(() => {
        const dims = calcPageDims(aspect);

        // Create draft
        draft = {
          id: crypto.randomUUID
            ? crypto.appendUUID()
            : String(Date.now()) + Math.random().toString(16).slice(2),
          title: (bookTitleInput && bookTitleInput.value ? bookTitleInput.value.trim() : "") || "未命名",
          author: (authorInput && authorInput.value ? authorInput.value.trim() : "") || "匿名",
          createdAt: Date.now(),
          pageCount: count,
          aspect: { w: aspect.w, h: aspect.h, label: aspect.label },
          pageWidthPx: dims.wPx,
          pageHeightPx: dims.hPx,
          defaultFontFamily: fontFamilySelect ? fontFamilySelect.value : "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Arial",
          defaultBgColor: bgColorInput ? bgColorInput.value : "#ffffff",
          defaultTextColor: fontColorInput ? normalizeTextHex(fontColorInput.value) : "#0f172a",
          editorCanvasBorder: normalizeCanvasBorder(
            (canvasBorderRadios.find((r) => r.checked) || {}).value || "gray"
          ),
          pageStates: new Array(count).fill(null),
          pageImageCache: new Array(count).fill(null),
          fontScaleForPage: new Array(count).fill(getFontScale()),
          pageImageCacheMultiplier: null,
          iconDataURL: null,
        };

        pageCount = count;
        currentPageIndex = 0;
        syncCanvasBorderRadios();
        ensureMainCanvas(dims.wPx, dims.hPx);

        setStatus(`已创建：${count} 页 · 比例 ${aspect.label}`);
        canvas.clear();
        canvas.setBackgroundColor(draft.defaultBgColor || "#ffffff");
        canvas.requestRenderAll();
        canvas.renderAll();

        loadPage(0)
          .then(() => {
            startBtn.disabled = false;
          })
          .catch((e) => {
            console.error(e);
            setStatus("创建失败，请刷新后重试。");
            startBtn.disabled = false;
          });
      });
    });
  }

  function finishAndReturnHome() {
    if (!draft) return;
    if (exportInProgress) return;
    exportInProgress = true;

    setStatus("正在封装成图标...");
    finishBtn.disabled = true;

    // Save latest page changes.
    saveCurrentPageNow();

    (async () => {
      try {
        const iconDataURL = await generateBookIcon(draft);
        draft.iconDataURL = iconDataURL;

        // IMPORTANT: server persistence must succeed before we show it on home,
        // otherwise it becomes a "ghost" icon that flashes then disappears.
        await persistZineToStorage(draft);

        // Add to home & keep in-memory for viewing.
        zines.push({
          id: draft.id,
          createdAt: draft.createdAt,
          pageCount: draft.pageCount,
          aspect: draft.aspect,
          iconDataURL: draft.iconDataURL,
        });
        addIconToHome(draft);

        setStatus("");
        resetDraft();
        // Back home
        setupPanel.classList.remove("hidden");
        editorPanel.classList.add("hidden");
        canvas && canvas.clear();

        showHome();
      } catch (e) {
        console.error(e);
        setStatus("保存失败：图片书在 Vercel/Serverless 可能因体积过大被拒绝。请减小图片或改用可持久存储的后端。");
        exportInProgress = false;
        updateEditorButtons();
      }
    })();
  }

  // ---------- Events ----------
  homeEnterBtn?.addEventListener("click", () => {
    showDesigner();
  });

  backHomeBtn?.addEventListener("click", () => {
    resetDraft();
    setupPanel.classList.remove("hidden");
    editorPanel.classList.add("hidden");
    setStatus("");
    showHome();
  });

  startBtn?.addEventListener("click", () => {
    startEditing();
  });

  prevBtn?.addEventListener("click", () => {
    if (!draft) return;
    saveCurrentPageNow();
    loadPage(currentPageIndex - 1);
  });

  nextBtn?.addEventListener("click", () => {
    if (!draft) return;
    saveCurrentPageNow();
    loadPage(currentPageIndex + 1);
  });

  addTextBtn.addEventListener("click", () => {
    if (!draft) return;
    const t = window.prompt("输入文字：");
    if (!t) return;
    addText(t.trim());
  });

  addImageBtn.addEventListener("click", () => {
    if (!draft) return;
    imageFileInput.click();
  });

  imageFileInput.addEventListener("change", async () => {
    if (!draft) return;
    const file = imageFileInput.files && imageFileInput.files[0];
    if (!file) return;
    try {
      const dataURL = await imageBlobToDataURL(file);
      const url = await uploadImageDataURL(dataURL, file.name || `upload-${Date.now()}.jpg`);
      addImageFromURL(url);
    } catch (e) {
      setStatus(`上传图片失败：${String(e?.message || e)}`);
    }
    imageFileInput.value = "";
  });

  deleteBtn.addEventListener("click", () => {
    if (!draft) return;
    const obj = canvas.getActiveObject();
    if (!obj) return;
    canvas.remove(obj);
    canvas.requestRenderAll();
  });

  function scaleSelectedImage(multiplier) {
    if (!draft) return;
    const obj = canvas.getActiveObject();
    if (!obj || obj.type !== "image") return;
    const nextX = Math.max(0.05, (obj.scaleX || 1) * multiplier);
    const nextY = Math.max(0.05, (obj.scaleY || 1) * multiplier);
    obj.scaleX = nextX;
    obj.scaleY = nextY;
    obj.setCoords();
    canvas.requestRenderAll();
    updateImageSizeInfo();
    saveCurrentPageNow();
  }

  imgScaleDownBtn?.addEventListener("click", () => scaleSelectedImage(0.92));
  imgScaleUpBtn?.addEventListener("click", () => scaleSelectedImage(1.08));

  clearPageBtn.addEventListener("click", async () => {
    if (!draft) return;
    const ok = window.confirm("确定清空本页？");
    if (!ok) return;
    isLoadingPage = true;
    canvas.clear();
    canvas.setBackgroundColor(draft.defaultBgColor || "#ffffff");
    canvas.requestRenderAll();
    draft.pageStates[currentPageIndex] = null;
    isLoadingPage = false;
    setStatus("已清空本页");
  });

  finishBtn.addEventListener("click", () => {
    finishAndReturnHome();
  });

  // Paste support
  pageWrap.addEventListener("mousedown", () => {
    pageWrap.focus();
  });
  pageWrap.addEventListener("paste", handlePaste);
  canvasEl.addEventListener("click", () => pageWrap.focus());

  viewerCloseBtn.addEventListener("click", () => {
    closeViewer();
  });

  // Viewer mode switching
  function persistViewerMode(mode) {
    viewerMode = mode;
    localStorage.setItem("free-zine:viewerMode", mode);
  }

  viewerModeSeamlessBtn?.addEventListener("click", () => {
    if (!currentViewingZineId) return;
    persistViewerMode("seamless");
    openViewer(currentViewingZineId).catch(() => {});
  });

  viewerModeSingleBtn?.addEventListener("click", () => {
    if (!currentViewingZineId) return;
    persistViewerMode("single");
    localStorage.setItem("free-zine:viewerSingleIndex", String(viewerSinglePageIndex));
    openViewer(currentViewingZineId).catch(() => {});
  });

  // Single-page navigation
  viewerPrevPageBtn?.addEventListener("click", () => {
    if (viewerMode !== "single") return;
    if (!currentViewingZineId) return;
    viewerSingleSwapDir = -1;
    viewerSinglePageIndex = Math.max(0, viewerSinglePageIndex - 1);
    localStorage.setItem("free-zine:viewerSingleIndex", String(viewerSinglePageIndex));
    openViewer(currentViewingZineId).catch(() => {});
  });

  viewerNextPageBtn?.addEventListener("click", () => {
    if (viewerMode !== "single") return;
    if (!currentViewingZineId) return;
    const maxIndex = Math.max(0, viewerCachedPageCount - 1);
    viewerSingleSwapDir = 1;
    viewerSinglePageIndex = Math.max(0, Math.min(maxIndex, viewerSinglePageIndex + 1));
    localStorage.setItem("free-zine:viewerSingleIndex", String(viewerSinglePageIndex));
    openViewer(currentViewingZineId).catch(() => {});
  });

  // Keyboard navigation in single mode
  viewerOverlay?.addEventListener("keydown", (e) => {
    if (viewerMode !== "single") return;
    if (viewerOverlay.classList.contains("hidden")) return;
    if (loginModal && !loginModal.classList.contains("hidden")) return;
    if (!currentViewingZineId) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      viewerPrevPageBtn?.click();
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      viewerNextPageBtn?.click();
    }
  });

  // Admin login UI
  function showLoginModal() {
    if (!loginModal) return;
    loginModal.classList.remove("hidden");
    loginUserInput?.focus();
  }
  function hideLoginModal() {
    if (!loginModal) return;
    loginModal.classList.add("hidden");
  }

  loginEntryBtn?.addEventListener("click", () => {
    showLoginModal();
  });
  loginCancelBtn?.addEventListener("click", () => {
    hideLoginModal();
  });

  loginModal?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      loginSubmitBtn?.click();
    }
  });

  loginSubmitBtn?.addEventListener("click", () => {
    const u = String(loginUserInput?.value || "");
    const p = String(loginPassInput?.value || "");
    if (u === ADMIN_USER && p === ADMIN_PASS) {
      localStorage.setItem(ADMIN_FLAG_KEY, "1");
      hideLoginModal();
      viewerDeleteBtn?.classList.toggle("hidden", !isAdminAuthed());
      syncLoginEntryUI();
      setStatus("管理员登录成功");
    } else {
      setStatus("管理员登录失败");
      if (loginPassInput) loginPassInput.value = "";
      loginPassInput?.focus();
    }
  });

  // Delete zine (admin only)
  async function deleteZineCompletely(zineId) {
    if (!zineId) return false;
    if (!isAdminAuthed()) return false;

    const ok = window.confirm("确定删除此电子书？此操作不可撤销。");
    if (!ok) return false;

    try {
      await apiJSON(`/api/zines/${encodeURIComponent(zineId)}`, { method: "DELETE" });
    } catch (e) {
      console.error(e);
      return false;
    }

    // Update index list
    const ids = readStoredZineIds().filter((id) => id !== zineId);
    localStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(ids));

    // Update in-memory & UI icons
    zines = zines.filter((z) => z.id !== zineId);
    const iconEl = iconsWall?.querySelector(`[data-zine-id="${zineId}"]`);
    iconEl?.remove();

    if (currentViewingZineId === zineId) closeViewer();
    if (window.location.hash.includes("zine=")) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    return true;
  }

  viewerDeleteBtn?.addEventListener("click", async () => {
    await deleteZineCompletely(currentViewingZineId);
  });

  viewerShareBtn.addEventListener("click", async () => {
    const zid = currentViewingZineId;
    if (!zid) return;
    const shareURL = bookLandingShareURL(zid);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareURL);
      } else {
        // Fallback for older browsers.
        window.prompt("复制该链接：", shareURL);
        return;
      }
      setViewerStatus("已复制分享链接");
      setTimeout(() => setViewerStatus(""), 1200);
    } catch (_) {
      window.prompt("复制该链接：", shareURL);
    }
  });

  // Live font scaling for existing text objects on the current page.
  function syncFontScaleText() {
    if (!fontScaleRange || !fontScaleText) return;
    const v = Number(fontScaleRange.value);
    fontScaleText.textContent = `${(Number.isFinite(v) ? v : 1).toFixed(2)}x`;
  }

  fontScaleRange?.addEventListener("input", () => {
    syncFontScaleText();
    if (!draft) return;
    if (exportInProgress) return;
    if (pageCount <= 0) return;

    const currentScale = getFontScale();
    const storedScale = draft.fontScaleForPage
      ? draft.fontScaleForPage[currentPageIndex] ?? currentScale
      : currentScale;
    if (!storedScale || Math.abs(storedScale - currentScale) < 0.0001) return;

    const ratio = currentScale / storedScale;
    canvas.getObjects().forEach((obj) => {
      if (obj && obj.type === "textbox") {
        obj.fontSize = Math.max(8, Math.round(obj.fontSize * ratio));
        obj.setCoords();
      }
    });

    draft.fontScaleForPage[currentPageIndex] = currentScale;
    draft.pageStates[currentPageIndex] = canvas.toJSON();
    canvas.requestRenderAll();
  });

  syncFontScaleText();

  // Live font family for existing text objects on the current page.
  fontFamilySelect?.addEventListener("change", () => {
    if (!draft) return;
    const val = fontFamilySelect.value;
    draft.defaultFontFamily = val;
    canvas.getObjects().forEach((obj) => {
      if (obj && obj.type === "textbox") {
        obj.fontFamily = val;
        obj.setCoords();
      }
    });
    canvas.requestRenderAll();
    if (!isLoadingPage) draft.pageStates[currentPageIndex] = canvas.toJSON();
  });

  // Live background color for the current page.
  bgColorInput?.addEventListener("input", () => {
    if (!draft) return;
    const col = bgColorInput.value;
    draft.defaultBgColor = col;
    canvas.setBackgroundColor(col);
    canvas.requestRenderAll();
    canvas.renderAll();
    if (!isLoadingPage) draft.pageStates[currentPageIndex] = canvas.toJSON();
  });

  fontColorInput?.addEventListener("input", () => {
    if (!draft || !canvas) return;
    const col = normalizeTextHex(fontColorInput.value);
    draft.defaultTextColor = col;
    const obj = canvas.getActiveObject();
    if (obj && obj.type === "textbox") {
      obj.set("fill", col);
      obj.setCoords();
      canvas.requestRenderAll();
    }
    if (!isLoadingPage) draft.pageStates[currentPageIndex] = canvas.toJSON();
  });

  canvasBorderRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      syncCanvasBorderOptionStyles();
      if (!draft) return;
      draft.editorCanvasBorder = normalizeCanvasBorder(radio.value);
      applyEditorCanvasBorder();
      if (!isLoadingPage) draft.pageStates[currentPageIndex] = canvas.toJSON();
    });
  });
  syncCanvasBorderOptionStyles();

  // Ratio selection: add visual state without relying on :has() selector.
  function syncRatioSelectionStyles() {
    ratioRadios.forEach((radio) => {
      const optionEl = radio.closest(".ratio-option");
      if (!optionEl) return;
      optionEl.classList.toggle("is-selected", !!radio.checked);
    });
  }

  ratioRadios.forEach((radio) => {
    radio.addEventListener("change", syncRatioSelectionStyles);
  });
  syncRatioSelectionStyles();

  // Init
  resetDraft();
  editorPanel.classList.add("hidden");
  setupPanel.classList.remove("hidden");
  syncLoginEntryUI();
  syncCanvasBorderRadios();

  // Open a specific ZINE from share link.
  const hash = window.location.hash || "";
  const m = hash.match(/zine=([^&]+)/);
  if (m && m[1]) {
    const zineId = decodeURIComponent(m[1]);
    const stored = await loadZineFromStorage(zineId);
    if (stored) {
      zines = [stored];
      openViewer(zineId).catch(() => {
        showHome();
      });
      return;
    }
    document.documentElement.classList.remove("freezine-boot-reader");
  }
  showHome();
})();

