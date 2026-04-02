(function () {
  // Fabric is loaded globally via CDN.
  if (!window.fabric) {
    alert("未加载到 Fabric.js，请刷新页面后再试。");
    return;
  }

  const pageCountInput = document.getElementById("pageCountInput");
  const createBtn = document.getElementById("createBtn");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const pageIndexText = document.getElementById("pageIndexText");
  const addTextBtn = document.getElementById("addTextBtn");
  const addImageBtn = document.getElementById("addImageBtn");
  const deleteBtn = document.getElementById("deleteBtn");
  const clearPageBtn = document.getElementById("clearPageBtn");
  const imageFileInput = document.getElementById("imageFileInput");
  const exportIconBtn = document.getElementById("exportIconBtn");
  const statusText = document.getElementById("statusText");

  const pageWrap = document.getElementById("pageWrap");
  const canvasEl = document.getElementById("zineCanvas");

  // Use one Fabric canvas and swap page JSON in/out.
  const CANVAS_W = 720;
  const CANVAS_H = 900;

  let canvas = null;
  let pageCount = 0;
  let currentPageIndex = 0;
  let pageStates = []; // array<fabricJSon|null>
  let isLoading = false;
  let exportInProgress = false;
  let saveTimer = null;

  function setStatus(msg) {
    statusText.textContent = msg || "";
  }

  function updateNavButtons() {
    const hasPages = pageCount > 0;
    prevBtn.disabled = !hasPages || currentPageIndex <= 0;
    nextBtn.disabled = !hasPages || currentPageIndex >= pageCount - 1;

    const disabled = !hasPages;
    addTextBtn.disabled = disabled;
    addImageBtn.disabled = disabled;
    deleteBtn.disabled = disabled;
    clearPageBtn.disabled = disabled;
    exportIconBtn.disabled = disabled || exportInProgress;
  }

  function scheduleSaveCurrentPageState() {
    if (isLoading || pageCount <= 0) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (pageCount <= 0) return;
      pageStates[currentPageIndex] = canvas.toJSON();
    }, 220);
  }

  function ensureCanvas() {
    if (canvas) return;
    canvas = new fabric.Canvas("zineCanvas", {
      preserveObjectStacking: true,
      selection: true,
      backgroundColor: "#ffffff",
    });
    canvas.setWidth(CANVAS_W);
    canvas.setHeight(CANVAS_H);

    canvas.on("object:added", scheduleSaveCurrentPageState);
    canvas.on("object:modified", scheduleSaveCurrentPageState);
    canvas.on("object:removed", scheduleSaveCurrentPageState);
  }

  async function loadPage(index) {
    if (index < 0 || index >= pageCount) return;
    currentPageIndex = index;
    pageIndexText.textContent = `第 ${currentPageIndex + 1} / ${pageCount} 页`;

    isLoading = true;
    canvas.discardActiveObject();

    // Reset to a blank page.
    canvas.clear();
    canvas.setBackgroundColor("#ffffff", canvas.renderAll.bind(canvas));

    const json = pageStates[currentPageIndex];
    if (!json) {
      canvas.renderAll();
      isLoading = false;
      updateNavButtons();
      return;
    }

    await new Promise((resolve) => {
      canvas.loadFromJSON(json, () => {
        canvas.renderAll();
        resolve();
      });
    });

    isLoading = false;
    updateNavButtons();
  }

  function saveCurrentPageStateNow() {
    if (pageCount <= 0) return;
    if (isLoading) return;
    pageStates[currentPageIndex] = canvas.toJSON();
  }

  function createPages(count) {
    const n = Math.max(1, Math.min(20, Number(count) || 1));
    pageCount = n;
    currentPageIndex = 0;
    pageStates = new Array(n).fill(null);
    setStatus("");

    ensureCanvas();
    // Load the first page.
    loadPage(0).catch((e) => {
      console.error(e);
      setStatus("生成失败，请刷新后重试。");
    });
    updateNavButtons();
  }

  function addText(text) {
    const t = new fabric.Textbox(text, {
      left: canvas.getWidth() / 2,
      top: canvas.getHeight() / 2,
      originX: "center",
      originY: "center",
      fontSize: 28,
      fill: "#111827",
      width: 360,
      textAlign: "left",
      editable: true,
      styles: undefined,
    });
    canvas.add(t);
    canvas.setActiveObject(t);
    canvas.requestRenderAll();

    // Focus editor if supported.
    try {
      t.enterEditing();
      t.selectAll && t.selectAll();
    } catch (_) {}
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("读取剪贴板/文件失败"));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }

  function addImageFromDataURL(dataURL) {
    fabric.Image.fromURL(
      dataURL,
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
        });
        img.scale(scale);
        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.requestRenderAll();
      },
      { crossOrigin: "anonymous" }
    );
  }

  async function handlePaste(e) {
    if (pageCount <= 0) return;
    if (!e.clipboardData) return;

    // Ensure the event is for our page area.
    e.preventDefault();

    const dt = e.clipboardData;
    const items = dt.items ? Array.from(dt.items) : [];

    const imgItem = items.find((it) => it.type && it.type.startsWith("image/"));
    if (imgItem) {
      const blob = imgItem.getAsFile();
      if (!blob) return;
      try {
        const dataURL = await blobToDataURL(blob);
        addImageFromDataURL(dataURL);
      } catch (err) {
        console.error(err);
        setStatus("粘贴图片失败：可能是浏览器不允许剪贴板图片读取。");
      }
      return;
    }

    const text = (dt.getData("text/plain") || dt.getData("text") || "").trim();
    if (text) {
      // Keep pasted long text readable.
      const t = text.length > 240 ? text.slice(0, 240) : text;
      addText(t);
      return;
    }
  }

  async function exportIconPNG() {
    if (pageCount <= 0) return;
    updateNavButtons();

    setStatus("正在生成图标...");
    exportIconBtn.disabled = true;
    exportInProgress = true;
    try {
      // Keep current changes.
      saveCurrentPageStateNow();

      const originalIndex = currentPageIndex;

      // Pick 4 representative pages.
      const last = pageCount - 1;
      const pagesToPreview = [0, Math.min(1, last), Math.min(2, last), last];
      const uniquePages = [...new Set(pagesToPreview)];

      const previews = [];

      // Render thumbnails sequentially by swapping canvas.
      for (let k = 0; k < uniquePages.length; k++) {
        const pageIdx = uniquePages[k];
        setStatus(`渲染第 ${pageIdx + 1} / ${pageCount} 页...`);
        await loadPage(pageIdx);

        // Small render for icon.
        const thumb = canvas.toDataURL({
          format: "png",
          multiplier: 0.24,
        });
        previews.push(thumb);
      }

      // Restore current page.
      await loadPage(originalIndex);

      // Compose icon.
      const iconSize = 512;
      const icon = document.createElement("canvas");
      icon.width = iconSize;
      icon.height = iconSize;
      const ctx = icon.getContext("2d");

      // Background.
      ctx.fillStyle = "#ffffff";
      ctx.clearRect(0, 0, iconSize, iconSize);
      roundRect(ctx, 18, 18, iconSize - 36, iconSize - 36, 44);
      ctx.fill();

      // Border.
      ctx.lineWidth = 8;
      ctx.strokeStyle = "rgba(124,92,255,.55)";
      roundRect(ctx, 18, 18, iconSize - 36, iconSize - 36, 44);
      ctx.stroke();

      // 2x2 mini previews (must fit in 512x512).
      const gridPad = 28;
      const areaTop = 112;
      const areaBottom = iconSize - gridPad;
      const cellGap = 18;
      const cell = Math.floor((areaBottom - areaTop - cellGap) / 2);

      const x0 = gridPad;
      const x1 = gridPad + cell + cellGap;
      const y0 = areaTop;
      const y1 = areaTop + cell + cellGap;

      const positions = [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x0, y: y1 },
        { x: x1, y: y1 },
      ];

      for (let i = 0; i < previews.length; i++) {
        const img = await dataURLToImage(previews[i]);
        const p = positions[i] || positions[0];

        // Thumbs: add a subtle frame + rounded clip.
        ctx.save();
        ctx.fillStyle = "rgba(124,92,255,.08)";
        roundRect(ctx, p.x - 10, p.y - 10, cell + 20, cell + 20, 22);
        ctx.fill();

        ctx.beginPath();
        roundRectPath(ctx, p.x, p.y, cell, cell, 20);
        ctx.clip();
        ctx.drawImage(img, p.x, p.y, cell, cell);
        ctx.restore();
      }

      // Title overlay.
      ctx.fillStyle = "#111827";
      ctx.font =
        "700 22px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial";
      ctx.fillText("自由ZINE", 48, 68);
      ctx.fillStyle = "rgba(17,24,39,.72)";
      ctx.font =
        "600 16px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial";
      ctx.fillText(`共 ${pageCount} 页`, 48, 96);

      // Small corner mark.
      ctx.fillStyle = "rgba(124,92,255,.95)";
      ctx.beginPath();
      ctx.arc(iconSize - 54, 58, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 15px ui-sans-serif, system-ui";
      ctx.fillText("Z", iconSize - 58, 64);

      const dataURL = icon.toDataURL("image/png");
      downloadDataURL(dataURL, "自由ZINE-图标.png");

      setStatus("已生成：自由ZINE-图标.png");
    } finally {
      exportInProgress = false;
      updateNavButtons();
    }
  }

  function downloadDataURL(dataURL, filename) {
    const a = document.createElement("a");
    a.href = dataURL;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
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

  function dataURLToImage(dataURL) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("图片加载失败"));
      img.src = dataURL;
    });
  }

  // Events
  createBtn.addEventListener("click", () => {
    const count = Number(pageCountInput.value);
    createPages(count);
  });

  prevBtn.addEventListener("click", () => {
    if (pageCount <= 0) return;
    saveCurrentPageStateNow();
    loadPage(currentPageIndex - 1);
  });

  nextBtn.addEventListener("click", () => {
    if (pageCount <= 0) return;
    saveCurrentPageStateNow();
    loadPage(currentPageIndex + 1);
  });

  addTextBtn.addEventListener("click", () => {
    if (pageCount <= 0) return;
    const text = window.prompt("输入文字：");
    if (!text) return;
    addText(text.trim());
  });

  addImageBtn.addEventListener("click", () => {
    if (pageCount <= 0) return;
    imageFileInput.click();
  });

  imageFileInput.addEventListener("change", async () => {
    if (pageCount <= 0) return;
    const file = imageFileInput.files && imageFileInput.files[0];
    if (!file) return;
    const dataURL = await blobToDataURL(file);
    addImageFromDataURL(dataURL);
    // Reset to allow re-selecting same file.
    imageFileInput.value = "";
  });

  deleteBtn.addEventListener("click", () => {
    if (pageCount <= 0) return;
    const obj = canvas.getActiveObject();
    if (!obj) return;
    canvas.remove(obj);
    canvas.requestRenderAll();
  });

  clearPageBtn.addEventListener("click", async () => {
    if (pageCount <= 0) return;
    const ok = window.confirm("确定清空本页？");
    if (!ok) return;
    isLoading = true;
    canvas.clear();
    canvas.setBackgroundColor("#ffffff", canvas.renderAll.bind(canvas));
    canvas.requestRenderAll();
    pageStates[currentPageIndex] = null;
    isLoading = false;
    saveCurrentPageStateNow();
    setStatus("已清空本页");
  });

  exportIconBtn.addEventListener("click", async () => {
    if (pageCount <= 0) return;
    try {
      await exportIconPNG();
    } catch (err) {
      console.error(err);
      setStatus("导出失败，请重试。");
      exportIconBtn.disabled = false;
    }
  });

  // Paste support
  pageWrap.addEventListener("mousedown", () => {
    pageWrap.focus();
  });
  pageWrap.addEventListener("keydown", (e) => {
    // Allow Ctrl/Cmd+V to be handled by paste listener.
    // No-op: keep focus for paste.
  });
  pageWrap.addEventListener("paste", handlePaste);

  // Make sure clicking canvas keeps paste focus.
  canvasEl.addEventListener("click", () => pageWrap.focus());

  // Init empty state.
  ensureCanvas();
  pageIndexText.textContent = `第 0 / 0 页`;
  pageCountInput.value = pageCountInput.value || 3;
  updateNavButtons();
})();

