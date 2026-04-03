/**
 * SaaS — section « Page fidélité » : titre + fond (même UX que Flyer QR).
 */

const DEFAULT_QR_HERO_TITLE = "Participez au jeu et tentez de gagner une récompense.";

function setupImageDropZone(zoneEl, onFile) {
  if (!zoneEl) return;
  zoneEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    zoneEl.classList.add("app-drop-zone-active");
  });
  zoneEl.addEventListener("dragleave", (e) => {
    if (!zoneEl.contains(e.relatedTarget)) zoneEl.classList.remove("app-drop-zone-active");
  });
  zoneEl.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    zoneEl.classList.remove("app-drop-zone-active");
    const file = e.dataTransfer?.files?.[0];
    if (file) onFile(file);
  });
  zoneEl.addEventListener("paste", (e) => {
    const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith("image/"));
    const file = item?.getAsFile?.();
    if (file) {
      e.preventDefault();
      onFile(file);
    }
  });
}

/**
 * @param {{ api: (path: string, opts?: RequestInit) => Promise<Response>; slug: string; pageOrigin: string }} ctx
 */
export function initFidelityClientPageSection(ctx) {
  const { api, slug, pageOrigin } = ctx;
  const origin = (pageOrigin || "").replace(/\/$/, "") || (typeof window !== "undefined" ? window.location.origin.replace(/\/$/, "") : "");
  const publicFidelityUrl = `${origin}/fidelity/${encodeURIComponent(slug)}`;

  const titleInput = document.getElementById("app-fidelity-client-hero-title");
  const titleStatus = document.getElementById("app-fidelity-client-title-status");
  const input = document.getElementById("app-fidelity-client-bg-input");
  const drop = document.getElementById("app-fidelity-client-bg-drop");
  const chooseBtn = document.getElementById("app-fidelity-client-bg-choose");
  const previewWrap = document.getElementById("app-fidelity-client-preview-wrap");
  const previewImg = document.getElementById("app-fidelity-client-preview-img");
  const removeBtn = document.getElementById("app-fidelity-client-remove");
  const statusEl = document.getElementById("app-fidelity-client-status");
  const urlInput = document.getElementById("app-fidelity-client-public-url");
  const copyBtn = document.getElementById("app-fidelity-client-copy-url");
  const mockupTitle = document.getElementById("app-fidelity-client-mockup-title");
  const mockupBg = document.getElementById("app-fidelity-client-mockup-bg");
  const panelToggle = document.getElementById("app-fidelity-client-panel-toggle");
  const panel = document.getElementById("app-fidelity-client-panel");

  if (!input || !drop) return;

  if (panel && window.matchMedia("(min-width: 961px)").matches) {
    panel.classList.add("is-open");
    if (panelToggle) panelToggle.setAttribute("aria-expanded", "true");
  }

  if (panelToggle && panel) {
    panelToggle.addEventListener("click", () => {
      const open = panel.classList.toggle("is-open");
      panelToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  if (urlInput) urlInput.value = publicFidelityUrl;
  if (copyBtn && urlInput) {
    copyBtn.addEventListener("click", () => {
      urlInput.select();
      void navigator.clipboard.writeText(urlInput.value).then(() => {
        copyBtn.textContent = "Copié !";
        setTimeout(() => {
          copyBtn.textContent = "Copier";
        }, 1800);
      });
    });
  }

  function setStatus(msg, isErr) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.classList.toggle("hidden", !msg);
    statusEl.classList.toggle("error", Boolean(isErr));
    statusEl.classList.toggle("success", Boolean(msg) && !isErr);
  }

  function setTitleStatus(msg, isErr) {
    if (!titleStatus) return;
    titleStatus.textContent = msg || "";
    titleStatus.classList.toggle("hidden", !msg);
    titleStatus.classList.toggle("error", Boolean(isErr));
    titleStatus.classList.toggle("success", Boolean(msg) && !isErr);
  }

  function syncMockupDisplay(bgUrl, heroRaw) {
    if (mockupTitle) {
      const t = String(heroRaw ?? "").trim() || DEFAULT_QR_HERO_TITLE;
      mockupTitle.textContent = t;
    }
    if (mockupBg) {
      if (bgUrl) {
        const u = bgUrl.includes("?") ? `${bgUrl}&t=${Date.now()}` : `${bgUrl}?t=${Date.now()}`;
        mockupBg.style.backgroundImage = `url("${u.replace(/"/g, "%22")}")`;
        mockupBg.style.backgroundColor = "";
      } else {
        mockupBg.style.backgroundImage = "none";
        mockupBg.style.backgroundColor = "#f8fafc";
      }
    }
  }

  function syncThumbFromUrl(url) {
    if (previewImg && previewWrap) {
      if (url) {
        previewImg.src = `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
        previewWrap.classList.remove("hidden");
        if (removeBtn) removeBtn.classList.remove("hidden");
      } else {
        previewImg.removeAttribute("src");
        previewWrap.classList.add("hidden");
        if (removeBtn) removeBtn.classList.add("hidden");
      }
    }
  }

  let lastLoadedHero = "";
  let lastBgUrl = "";

  async function loadSettings() {
    try {
      const res = await api("/dashboard/settings");
      if (!res.ok) return;
      const data = await res.json();
      const url = data.fidelity_page_background_url || data.fidelityPageBackgroundUrl;
      const hero =
        data.fidelity_qr_hero_title != null
          ? String(data.fidelity_qr_hero_title)
          : data.fidelityQrHeroTitle != null
            ? String(data.fidelityQrHeroTitle)
            : "";
      lastLoadedHero = hero;
      lastBgUrl = url || "";
      if (titleInput) titleInput.value = hero;
      syncThumbFromUrl(url || "");
      syncMockupDisplay(url || "", hero);
    } catch (_) {}
  }

  let titleTimer = null;
  function scheduleTitleSave() {
    if (!titleInput) return;
    setTitleStatus("");
    window.clearTimeout(titleTimer);
    titleTimer = window.setTimeout(() => void saveHeroTitle(), 650);
  }

  async function saveHeroTitle() {
    if (!titleInput) return;
    const raw = titleInput.value;
    const payload =
      raw.trim() === "" ? { fidelity_qr_hero_title: null } : { fidelity_qr_hero_title: raw.trim().slice(0, 400) };
    try {
      const res = await api("/dashboard/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        lastLoadedHero = raw.trim();
        setTitleStatus("Titre enregistré.");
        syncMockupDisplay(lastBgUrl, lastLoadedHero);
      } else {
        const err = await res.json().catch(() => ({}));
        setTitleStatus(err.error || "Enregistrement impossible.", true);
      }
    } catch {
      setTitleStatus("Erreur réseau.", true);
    }
  }

  titleInput?.addEventListener("input", scheduleTitleSave);
  titleInput?.addEventListener("blur", () => {
    window.clearTimeout(titleTimer);
    void saveHeroTitle();
  });

  async function uploadDataUrl(dataUrl) {
    setStatus("");
    try {
      const res = await api("/dashboard/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fidelity_page_background_base64: dataUrl }),
      });
      if (res.ok) {
        setStatus("Image enregistrée. Elle apparaît sur la page fidélité après rafraîchissement.");
        await loadSettings();
      } else {
        const err = await res.json().catch(() => ({}));
        setStatus(err.error || "Enregistrement impossible.", true);
      }
    } catch {
      setStatus("Erreur réseau.", true);
    }
    input.value = "";
  }

  async function removeImage() {
    setStatus("");
    try {
      const res = await api("/dashboard/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fidelity_page_background_base64: null }),
      });
      if (res.ok) {
        setStatus("Fond retiré.");
        lastBgUrl = "";
        syncThumbFromUrl("");
        syncMockupDisplay("", titleInput ? titleInput.value : lastLoadedHero);
      } else {
        const err = await res.json().catch(() => ({}));
        setStatus(err.error || "Action impossible.", true);
      }
    } catch {
      setStatus("Erreur réseau.", true);
    }
  }

  drop.addEventListener("click", (e) => {
    if (e.target === input) return;
    input.click();
  });

  chooseBtn?.addEventListener("click", () => input.click());

  input.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return;
      await uploadDataUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  });

  setupImageDropZone(drop, (file) => {
    input.files = null;
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  removeBtn?.addEventListener("click", () => void removeImage());

  window.addEventListener("app-section-change", (e) => {
    if (e.detail?.sectionId === "fidelity-client") {
      if (urlInput) urlInput.value = publicFidelityUrl;
      void loadSettings();
    }
  });

  void loadSettings();
}
