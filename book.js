(function () {
  const coverImg = document.getElementById("bookCoverImg");
  const coverWrap = document.getElementById("bookCoverWrap");
  const readBtn = document.getElementById("bookReadBtn");
  const hint = document.getElementById("bookHint");
  const bookLoader = document.getElementById("bookLoader");
  const bookLoaderText = document.getElementById("bookLoaderText");
  const META_PREFIX = "free-zine:meta:";

  function hideLoader() {
    if (!bookLoader) return;
    bookLoader.classList.add("hidden");
    bookLoader.setAttribute("aria-busy", "false");
    bookLoader.setAttribute("aria-hidden", "true");
  }

  function setLoaderText(t) {
    if (bookLoaderText) bookLoaderText.textContent = t || "加载中…";
  }

  const hash = window.location.hash || "";
  const m = hash.match(/zine=([^&]+)/);
  const zineId = m && m[1] ? decodeURIComponent(m[1]) : null;

  if (!zineId) {
    hideLoader();
    hint.textContent = "缺少书籍 ID";
    readBtn.disabled = true;
    return;
  }

  function setCoverAspect(z) {
    if (!coverWrap || !z) return;
    const aw = z.aspect && z.aspect.w ? Number(z.aspect.w) : 1;
    const ah = z.aspect && z.aspect.h ? Number(z.aspect.h) : 1;
    if (ah > 0 && aw > 0) {
      coverWrap.style.aspectRatio = `${aw} / ${ah}`;
    }
  }

  async function renderCoverFromZine(z) {
    if (!window.fabric || !z) return null;
    const pw = Math.max(1, Number(z.pageWidthPx) || 720);
    const ph = Math.max(1, Number(z.pageHeightPx) || 720);
    const el = document.createElement("canvas");
    el.width = pw;
    el.height = ph;
    const c = new fabric.Canvas(el, { selection: false });
    c.setWidth(pw);
    c.setHeight(ph);
    c.setBackgroundColor(z.defaultBgColor || "#ffffff");

    const json0 = z.pageStates && z.pageStates[0];
    if (json0) {
      await new Promise((resolve) => {
        c.loadFromJSON(json0, () => {
          c.renderAll();
          resolve();
        });
      });
    } else {
      c.renderAll();
    }

    const targetMax = Math.min(1400, Math.max(720, Math.round(Math.min(window.devicePixelRatio || 1, 2) * 640)));
    const mult = Math.min(2.2, Math.max(1, targetMax / Math.max(pw, ph)));
    const dataURL = c.toDataURL({ format: "png", multiplier: mult });
    if (c.dispose) c.dispose();
    return dataURL;
  }

  async function loadCover() {
    setLoaderText("加载书籍…");
    try {
      const res = await fetch(`/api/zines/${encodeURIComponent(zineId)}`);
      if (!res.ok) throw new Error(`加载失败(${res.status})`);
      const z = await res.json();

      setCoverAspect(z);

      setLoaderText("渲染高清封面…");
      let src = null;
      try {
        src = await renderCoverFromZine(z);
      } catch (_) {
        src = null;
      }
      if (!src && z.iconDataURL) src = z.iconDataURL;
      if (src) {
        await new Promise((resolve) => {
          coverImg.onload = () => resolve();
          coverImg.onerror = () => resolve();
          coverImg.src = src;
          if (coverImg.complete) resolve();
        });
        hint.textContent = "";
      } else {
        coverImg.removeAttribute("src");
        hint.textContent = "暂无封面";
      }
      coverWrap.classList.remove("is-loading");
      coverWrap.classList.add("cover-ready");
    } catch (e) {
      try {
        const raw = localStorage.getItem(`${META_PREFIX}${zineId}`);
        const meta = raw ? JSON.parse(raw) : null;
        if (meta && meta.iconDataURL) {
          setCoverAspect(meta);
          coverImg.src = meta.iconDataURL;
          hint.textContent = "";
          coverWrap.classList.remove("is-loading");
          coverWrap.classList.add("cover-ready");
          hideLoader();
          return;
        }
      } catch (_) {}
      hint.textContent = `无法加载封面：${String(e?.message || e)}`;
      coverWrap.classList.remove("is-loading");
    } finally {
      hideLoader();
    }
  }

  readBtn.addEventListener("click", () => {
    window.location.href = `./index.html#zine=${encodeURIComponent(zineId)}`;
  });

  loadCover();
})();
