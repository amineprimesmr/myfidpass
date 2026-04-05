/**
 * SaaS — section « Page fidélité » : titre + fond + aperçu aligné sur la page jeu QR (roue réelle).
 */

import {
  buildWheelConicGradient,
  buildWheelSegmentHtml,
  normalizeWheelLabelsFromSegments,
} from "../client-fidelity/lib/wheel-segments.js";
import {
  resolveClientLogoImgSrc,
  resolveFidelityPageBackgroundImgSrc,
} from "../client-fidelity/lib/resolve-client-logo-src.js";
import { wireFidelityClientLivePreviewMode } from "./app-fidelity-client-live-preview-mode.js";

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

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function paintPreviewWheel(wheelEl, segments) {
  if (!wheelEl) return;
  const wheelLabels = normalizeWheelLabelsFromSegments(Array.isArray(segments) ? segments : []);
  const n = wheelLabels.length;
  wheelEl.style.background = buildWheelConicGradient(n);
  wheelEl.style.transform = "rotate(0deg)";

  const segmentHtml = wheelLabels
    .map((_, i) =>
      buildWheelSegmentHtml({
        segmentIndex: i,
        segmentCount: n,
        escapeHtml,
      }),
    )
    .join("");

  let shine = wheelEl.querySelector(".fidelity-roulette-wheel-shine");
  if (!shine) {
    shine = document.createElement("div");
    shine.className = "fidelity-roulette-wheel-shine";
    shine.setAttribute("aria-hidden", "true");
    wheelEl.insertBefore(shine, wheelEl.firstChild);
  }
  let disc = wheelEl.querySelector(".fidelity-roulette-wheel-disc");
  if (!disc) {
    disc = document.createElement("div");
    disc.className = "fidelity-roulette-wheel-disc";
    wheelEl.appendChild(disc);
  }
  disc.innerHTML = segmentHtml;
}

/**
 * @param {{ api: (path: string, opts?: RequestInit) => Promise<Response>; slug: string; pageOrigin: string }} ctx
 */
export function initFidelityClientPageSection(ctx) {
  const { api, slug, pageOrigin } = ctx;
  const origin = (pageOrigin || "").replace(/\/$/, "") || (typeof window !== "undefined" ? window.location.origin.replace(/\/$/, "") : "");
  const publicFidelityUrl = `${origin}/fidelity/${encodeURIComponent(slug)}`;
  const apiBase = origin;

  const livePreviewControls = wireFidelityClientLivePreviewMode({
    getPublicUrl: () => publicFidelityUrl,
  });

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
  const previewRoot = document.getElementById("app-fidelity-client-live-preview-root");
  const previewTitle = document.getElementById("app-fidelity-client-preview-title");
  const previewLogo = document.getElementById("app-fidelity-client-preview-logo");
  const previewWheel = document.getElementById("app-fidelity-client-preview-wheel");

  function setPreviewHeroTitleText(text) {
    if (!previewTitle) return;
    const inner = previewTitle.querySelector(".fidelity-qr-hero-title-inner");
    const v = String(text ?? "").trim() || DEFAULT_QR_HERO_TITLE;
    if (inner) inner.textContent = v;
    else previewTitle.textContent = v;
  }
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

  function syncLivePreview(settingsData, rouletteSegments) {
    const url = settingsData?.fidelity_page_background_url || settingsData?.fidelityPageBackgroundUrl;
    const heroRaw =
      settingsData?.fidelity_qr_hero_title != null
        ? String(settingsData.fidelity_qr_hero_title)
        : settingsData?.fidelityQrHeroTitle != null
          ? String(settingsData.fidelityQrHeroTitle)
          : "";
    const hero = String(heroRaw ?? "").trim() || DEFAULT_QR_HERO_TITLE;

    setPreviewHeroTitleText(hero);

    if (previewLogo) {
      const hasLogo = Boolean(settingsData?.logo_url || settingsData?.logoUrl);
      if (hasLogo) {
        const logoSrc = resolveClientLogoImgSrc(
          {
            logoUrl: settingsData.logo_url ?? settingsData.logoUrl,
            logo_updated_at: settingsData.logo_updated_at ?? settingsData.logoUpdatedAt,
          },
          slug,
          apiBase,
        );
        previewLogo.src = logoSrc;
        previewLogo.classList.remove("hidden");
      } else {
        previewLogo.removeAttribute("src");
        previewLogo.classList.add("hidden");
      }
    }

    if (previewRoot) {
      const businessStub = {
        fidelity_page_background_url: url || "",
        fidelityPageBackgroundUrl: url || "",
        fidelity_page_background_updated_at:
          settingsData?.fidelity_page_background_updated_at ?? settingsData?.fidelityPageBackgroundUpdatedAt,
        fidelityPageBackgroundUpdatedAt:
          settingsData?.fidelity_page_background_updated_at ?? settingsData?.fidelityPageBackgroundUpdatedAt,
      };
      const resolved = resolveFidelityPageBackgroundImgSrc(businessStub, slug, apiBase);
      previewRoot.classList.toggle("fidelity-page--client-bg", Boolean(resolved));
      if (resolved) {
        previewRoot.style.setProperty("--fidelity-client-bg", `url("${resolved}")`);
      } else {
        previewRoot.style.removeProperty("--fidelity-client-bg");
      }
    }

    paintPreviewWheel(previewWheel, rouletteSegments);
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

  async function loadSettings() {
    try {
      const [settingsRes, gamesRes] = await Promise.all([api("/dashboard/settings"), api("/games")]);
      if (!settingsRes.ok) return;
      const data = await settingsRes.json();
      let segments = [];
      if (gamesRes.ok) {
        try {
          const g = await gamesRes.json();
          segments = Array.isArray(g.roulette_segments) ? g.roulette_segments : [];
        } catch (_) {
          segments = [];
        }
      }
      const url = data.fidelity_page_background_url || data.fidelityPageBackgroundUrl;
      const hero =
        data.fidelity_qr_hero_title != null
          ? String(data.fidelity_qr_hero_title)
          : data.fidelityQrHeroTitle != null
            ? String(data.fidelityQrHeroTitle)
            : "";
      if (titleInput) titleInput.value = hero;
      syncThumbFromUrl(url || "");
      syncLivePreview(data, segments);
      livePreviewControls?.refreshLiveIframeIfLive?.();
    } catch (_) {}
  }

  let titleTimer = null;
  function scheduleTitleSave() {
    if (!titleInput) return;
    setTitleStatus("");
    window.clearTimeout(titleTimer);
    titleTimer = window.setTimeout(() => void saveHeroTitle(), 650);
  }

  function syncPreviewTitleFromInput() {
    if (!previewTitle || !titleInput) return;
    setPreviewHeroTitleText(String(titleInput.value ?? "").trim());
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
        setTitleStatus("Titre enregistré.");
        await loadSettings();
      } else {
        const err = await res.json().catch(() => ({}));
        setTitleStatus(err.error || "Enregistrement impossible.", true);
      }
    } catch {
      setTitleStatus("Erreur réseau.", true);
    }
  }

  titleInput?.addEventListener("input", () => {
    syncPreviewTitleFromInput();
    scheduleTitleSave();
  });
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
        syncThumbFromUrl("");
        await loadSettings();
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
