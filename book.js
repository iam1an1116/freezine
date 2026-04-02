(function () {
  const coverImg = document.getElementById("bookCoverImg");
  const readBtn = document.getElementById("bookReadBtn");
  const hint = document.getElementById("bookHint");

  const hash = window.location.hash || "";
  const m = hash.match(/zine=([^&]+)/);
  const zineId = m && m[1] ? decodeURIComponent(m[1]) : null;

  if (!zineId) {
    hint.textContent = "缺少书籍 ID";
    readBtn.disabled = true;
    return;
  }

  async function loadCover() {
    try {
      const res = await fetch(`/api/zines/${encodeURIComponent(zineId)}`);
      if (!res.ok) throw new Error(`加载失败(${res.status})`);
      const z = await res.json();
      if (z && z.iconDataURL) {
        coverImg.src = z.iconDataURL;
      } else {
        coverImg.removeAttribute("src");
      }
      hint.textContent = "";
    } catch (e) {
      hint.textContent = `无法加载封面：${String(e?.message || e)}`;
    }
  }

  readBtn.addEventListener("click", () => {
    // Jump to main viewer in the same tab (new window already opened by the icon click).
    window.location.href = `./index.html#zine=${encodeURIComponent(zineId)}`;
  });

  loadCover();
})();

