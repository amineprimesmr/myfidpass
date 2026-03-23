/**
 * Page Flyer QR — aperçu canvas, personnalisation, export PNG.
 */
import { API_BASE } from "../config.js";
import { FLYER_EXPORT, FLYER_STORAGE_KEY, mergeFlyerState } from "./app-flyer-qr-presets.js";
import {
  readFlyerStateFromForm,
  writeFlyerFormFromState,
  loadStoredFlyerState,
  persistFlyerState,
} from "./app-flyer-qr-form.js";
import { FLYER_HEADLINE_FONTS } from "./app-flyer-qr-headline-fonts.js";
import { renderFlyerCanvas } from "./app-flyer-qr-draw.js";
import {
  getStoredFlyerCustomLogoDataUrl,
  setStoredFlyerCustomLogoDataUrl,
  initFlyerLogoControl,
  clearStoredFlyerCustomLogo,
} from "./app-flyer-logo-control.js";
import {
  getStoredFlyerCustomBgDataUrl,
  setStoredFlyerCustomBgDataUrl,
  initFlyerBgControl,
  clearStoredFlyerCustomBg,
} from "./app-flyer-bg-control.js";
import { wireFlyerQrBackgroundGallery } from "./app-flyer-qr-wire-bg.js";

/** @typedef {{ slug: string; pageOrigin: string; getShareLink: () => string; dashboardApi?: (path: string, init?: RequestInit) => Promise<Response> }} FlyerQrOpts */

/**
 * @param {string} slug
 * @param {FlyerQrOpts} opts
 */
export function initAppFlyerQr(slug, opts) {
  const root = document.getElementById("flyer-qr");
  const canvas = document.getElementById("app-flyer-canvas");
  const linkInput = document.getElementById("app-flyer-link");
  const copyBtn = document.getElementById("app-flyer-copy-link");
  const downloadBtn = document.getElementById("app-flyer-download");
  const resetBtn = document.getElementById("app-flyer-reset");
  const panelToggle = document.getElementById("app-flyer-panel-toggle");
  const panel = document.getElementById("app-flyer-panel");
  const exportNote = document.getElementById("app-flyer-export-note");

  if (!root || !canvas || !(canvas instanceof HTMLCanvasElement)) return;

  const fontSel = root.querySelector("#app-flyer-headline-font");
  if (fontSel instanceof HTMLSelectElement && fontSel.options.length === 0) {
    FLYER_HEADLINE_FONTS.forEach((f) => {
      const o = document.createElement("option");
      o.value = f.id;
      o.textContent = f.label;
      fontSel.appendChild(o);
    });
  }

  if (panel && window.matchMedia("(min-width: 961px)").matches) {
    panel.classList.add("is-open");
    if (panelToggle) panelToggle.setAttribute("aria-expanded", "true");
  }

  const shareUrl = () => (opts.getShareLink ? opts.getShareLink() : `${opts.pageOrigin}/fidelity/${slug}`);

  let state = loadStoredFlyerState();
  /** @type {ImageBitmap | null} */
  let flyerLogoBitmap = null;
  /** @type {string | null} */
  let flyerLogoObjectUrl = null;
  /** Recharge le logo (ex. après retour de « Ma carte » ou changement import flyer). */
  let flyerLogoDirty = true;

  /** @type {ImageBitmap | null} */
  let flyerBgBitmap = null;
  /** @type {string | null} */
  let flyerBgObjectUrl = null;
  let flyerBgDirty = true;

  /** @type {{ syncPreview: () => void } | undefined} */
  let flyerLogoPanelApi;
  /** @type {{ syncPreview: () => void } | undefined} */
  let flyerBgPanelApi;

  let remoteTimer = null;
  let remoteBusy = false;

  /** @param {unknown} prefs */
  function applyServerFlyerPrefs(prefs) {
    if (!prefs || typeof prefs !== "object") return;
    const p = /** @type {{ state?: unknown; custom_logo_data_url?: unknown; custom_bg_data_url?: unknown }} */ (prefs);
    const merged = mergeFlyerState(
      p.state && typeof p.state === "object" && !Array.isArray(p.state)
        ? /** @type {import("./app-flyer-qr-presets.js").FlyerState} */ (p.state)
        : null,
    );
    writeFlyerFormFromState(root, merged);
    persistFlyerState(merged);
    state = merged;
    if (typeof p.custom_logo_data_url === "string" && p.custom_logo_data_url.startsWith("data:image/")) {
      setStoredFlyerCustomLogoDataUrl(p.custom_logo_data_url);
    } else {
      clearStoredFlyerCustomLogo();
    }
    if (typeof p.custom_bg_data_url === "string" && p.custom_bg_data_url.startsWith("data:image/")) {
      setStoredFlyerCustomBgDataUrl(p.custom_bg_data_url);
    } else {
      clearStoredFlyerCustomBg();
    }
    flyerLogoPanelApi?.syncPreview();
    flyerBgPanelApi?.syncPreview();
    flyerLogoDirty = true;
    flyerBgDirty = true;
  }

  function shouldMigrateLocalFlyerToServer() {
    if (getStoredFlyerCustomLogoDataUrl() || getStoredFlyerCustomBgDataUrl()) return true;
    try {
      const raw = localStorage.getItem(FLYER_STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return JSON.stringify(mergeFlyerState(parsed)) !== JSON.stringify(mergeFlyerState(null));
    } catch (_) {
      return false;
    }
  }

  async function pushFlyerToServerNow() {
    if (!opts.dashboardApi) return false;
    const st = readFlyerStateFromForm(root);
    const body = {
      state: st,
      custom_logo_data_url: getStoredFlyerCustomLogoDataUrl() || null,
      custom_bg_data_url: getStoredFlyerCustomBgDataUrl() || null,
    };
    try {
      const res = await opts.dashboardApi("/dashboard/flyer", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.ok;
    } catch (_) {
      return false;
    }
  }

  function scheduleRemoteSave() {
    if (!opts.dashboardApi) return;
    if (remoteTimer) clearTimeout(remoteTimer);
    remoteTimer = setTimeout(async () => {
      remoteTimer = null;
      if (remoteBusy) return;
      remoteBusy = true;
      try {
        await pushFlyerToServerNow();
      } finally {
        remoteBusy = false;
      }
    }, 2000);
  }

  async function hydrateFromServer() {
    if (!opts.dashboardApi) return;
    try {
      const res = await opts.dashboardApi("/dashboard/flyer", { method: "GET" });
      if (!res.ok) return;
      const j = await res.json();
      if (j.flyer_prefs && typeof j.flyer_prefs === "object") {
        applyServerFlyerPrefs(j.flyer_prefs);
      } else if (shouldMigrateLocalFlyerToServer()) {
        await pushFlyerToServerNow();
      }
      schedulePaint();
    } catch (_) {
      /* réseau ou session */
    }
  }

  writeFlyerFormFromState(root, state);
  if (linkInput) linkInput.value = shareUrl();

  let paintTimer = null;
  function schedulePaint() {
    if (paintTimer) cancelAnimationFrame(paintTimer);
    paintTimer = requestAnimationFrame(() => {
      paintTimer = null;
      void paint();
    });
  }

  const wheelModeEl = root.querySelector("#app-flyer-wheel-mode");
  wheelModeEl?.addEventListener("change", () => {
    schedulePaint();
  });

  flyerLogoPanelApi = initFlyerLogoControl({
    onCustomLogoChange: () => {
      flyerLogoDirty = true;
      schedulePaint();
      scheduleRemoteSave();
    },
  });

  flyerBgPanelApi = initFlyerBgControl({
    onBgChange: () => {
      flyerBgDirty = true;
      schedulePaint();
      scheduleRemoteSave();
    },
  });

  wireFlyerQrBackgroundGallery(root, {
    markBgDirtyAndPaint: () => {
      flyerBgDirty = true;
      schedulePaint();
    },
    getBgPanelApi: () => flyerBgPanelApi,
  });

  async function paint() {
    state = readFlyerStateFromForm(root);
    persistFlyerState(state);
    canvas.width = FLYER_EXPORT.w;
    canvas.height = FLYER_EXPORT.h;
    const logoApi = `${API_BASE}/api/businesses/${encodeURIComponent(slug)}/public/logo`;
    if (flyerLogoDirty) {
      if (flyerLogoBitmap) {
        try {
          flyerLogoBitmap.close();
        } catch (_) {}
        flyerLogoBitmap = null;
      }
      if (flyerLogoObjectUrl) {
        try {
          URL.revokeObjectURL(flyerLogoObjectUrl);
        } catch (_) {}
        flyerLogoObjectUrl = null;
      }
      const customData = getStoredFlyerCustomLogoDataUrl();
      let loaded = false;
      if (customData) {
        try {
          const res = await fetch(customData);
          if (res.ok) {
            const blob = await res.blob();
            if (typeof createImageBitmap === "function") {
              try {
                flyerLogoBitmap = await createImageBitmap(blob);
                loaded = !!flyerLogoBitmap;
              } catch (_) {
                flyerLogoObjectUrl = URL.createObjectURL(blob);
                loaded = true;
              }
            } else {
              flyerLogoObjectUrl = URL.createObjectURL(blob);
              loaded = true;
            }
          }
        } catch (_) {
          /* fallback logo fiche */
        }
      }
      if (!loaded) {
        try {
          const res = await fetch(logoApi, { mode: "cors", credentials: "omit" });
          if (res.ok) {
            const blob = await res.blob();
            if (typeof createImageBitmap === "function") {
              try {
                flyerLogoBitmap = await createImageBitmap(blob);
              } catch (_) {
                flyerLogoObjectUrl = URL.createObjectURL(blob);
              }
            } else {
              flyerLogoObjectUrl = URL.createObjectURL(blob);
            }
          }
        } catch (_) {
          /* pas de logo */
        }
      }
      flyerLogoDirty = false;
    }
    if (flyerBgDirty) {
      if (flyerBgBitmap) {
        try {
          flyerBgBitmap.close();
        } catch (_) {}
        flyerBgBitmap = null;
      }
      if (flyerBgObjectUrl) {
        try {
          URL.revokeObjectURL(flyerBgObjectUrl);
        } catch (_) {}
        flyerBgObjectUrl = null;
      }
      const bgData = getStoredFlyerCustomBgDataUrl();
      let bgLoaded = false;
      if (bgData) {
        try {
          const res = await fetch(bgData);
          if (res.ok) {
            const blob = await res.blob();
            if (typeof createImageBitmap === "function") {
              try {
                flyerBgBitmap = await createImageBitmap(blob);
                bgLoaded = !!flyerBgBitmap;
              } catch (_) {
                flyerBgObjectUrl = URL.createObjectURL(blob);
                bgLoaded = true;
              }
            } else {
              flyerBgObjectUrl = URL.createObjectURL(blob);
              bgLoaded = true;
            }
          }
        } catch (_) {}
      }
      flyerBgDirty = false;
    }
    const logoForCanvas = flyerLogoBitmap ?? flyerLogoObjectUrl;
    const bgForCanvas = flyerBgBitmap ?? flyerBgObjectUrl;
    try {
      await renderFlyerCanvas(canvas, state, shareUrl(), logoForCanvas, bgForCanvas);
    } catch (e) {
      if (typeof console !== "undefined" && console.warn) console.warn("[flyer-qr] render", e);
    }
  }

  root.querySelectorAll("[data-flyer-input]").forEach((el) => {
    el.addEventListener("input", () => {
      schedulePaint();
      scheduleRemoteSave();
    });
    el.addEventListener("change", () => {
      schedulePaint();
      scheduleRemoteSave();
    });
  });

  /** @param {string} rangeId @param {string} outId @param {boolean} [commaDecimal] */
  function bindFlyerRangeReadout(rangeId, outId, commaDecimal = false) {
    const r = root.querySelector(`#${rangeId}`);
    const o = root.querySelector(`#${outId}`);
    if (!r || !o || !("value" in r)) return;
    const sync = () => {
      let v = String(/** @type {HTMLInputElement} */ (r).value);
      if (commaDecimal) v = v.replace(".", ",");
      o.textContent = `${v} %`;
    };
    r.addEventListener("input", sync);
    sync();
  }
  bindFlyerRangeReadout("app-flyer-headline-size", "app-flyer-headline-size-out", true);
  bindFlyerRangeReadout("app-flyer-footer-text-scale", "app-flyer-footer-text-scale-out", false);
  bindFlyerRangeReadout("app-flyer-wheel-label-scale", "app-flyer-wheel-label-scale-out", false);

  if (panelToggle && panel) {
    panelToggle.addEventListener("click", () => {
      const open = panel.classList.toggle("is-open");
      panelToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  if (copyBtn && linkInput) {
    copyBtn.addEventListener("click", () => {
      linkInput.select();
      navigator.clipboard.writeText(linkInput.value).then(() => {
        copyBtn.textContent = "Copié !";
        setTimeout(() => { copyBtn.textContent = "Copier"; }, 1800);
      });
    });
  }

  if (downloadBtn) {
    downloadBtn.addEventListener("click", async () => {
      downloadBtn.disabled = true;
      try {
        await paint();
        const a = document.createElement("a");
        a.download = `flyer-qr-${slug}.png`;
        a.href = canvas.toDataURL("image/png");
        a.click();
        if (exportNote) {
          exportNote.textContent = `PNG ${FLYER_EXPORT.w}×${FLYER_EXPORT.h} px — prêt pour impression.`;
          exportNote.classList.remove("hidden");
        }
      } catch (_) {
        if (exportNote) {
          exportNote.textContent = "Export impossible (navigateur ou image externe). Réessayez sans bloqueur.";
          exportNote.classList.remove("hidden");
        }
      }
      downloadBtn.disabled = false;
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (!confirm("Réinitialiser le flyer aux textes et couleurs par défaut ?")) return;
      clearStoredFlyerCustomLogo();
      clearStoredFlyerCustomBg();
      flyerLogoPanelApi?.syncPreview();
      flyerBgPanelApi?.syncPreview();
      flyerLogoDirty = true;
      flyerBgDirty = true;
      state = mergeFlyerState(null);
      writeFlyerFormFromState(root, state);
      schedulePaint();
      void pushFlyerToServerNow();
    });
  }

  window.addEventListener("app-section-change", (e) => {
    if (e.detail?.sectionId === "flyer-qr") {
      flyerLogoDirty = true;
      flyerBgDirty = true;
      if (linkInput) linkInput.value = shareUrl();
      schedulePaint();
    }
  });

  void hydrateFromServer();
  schedulePaint();
}
