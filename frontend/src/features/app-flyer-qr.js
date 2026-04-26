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
import { getStoredFlyerCustomLogoDataUrl, clearStoredFlyerCustomLogo } from "./app-flyer-logo-control.js";
import {
  getStoredFlyerCustomBgDataUrl,
  setStoredFlyerCustomBgDataUrl,
  initFlyerBgControl,
  clearStoredFlyerCustomBg,
} from "./app-flyer-bg-control.js";
import { wireFlyerQrBackgroundGallery } from "./app-flyer-qr-wire-bg.js";
import { initFlyerAiGenerate } from "./app-flyer-ai-generate.js";
import { ensureFlyerDisplayFontsLoaded } from "./flyer-display-fonts-load.js";

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

  ensureFlyerDisplayFontsLoaded();

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
    // NE PAS effacer le logo local : il sera réenvoyé au prochain pushFlyerToServerNow.
    // Effacer inconditionnellement provoquait une race condition (logo importé avant sauvegarde puis perdu).
    if (typeof p.custom_bg_data_url === "string" && p.custom_bg_data_url.startsWith("data:image/")) {
      // Le serveur a un fond enregistré → le stocker localement
      setStoredFlyerCustomBgDataUrl(p.custom_bg_data_url);
    }
    // NE PAS effacer le fond local si le serveur n'en a pas encore :
    // après génération IA, le fond est stocké localement avant d'être sauvegardé (debounce 2s).
    // Un clearStoredFlyerCustomBg() ici détruisait le fond généré si la page rechargait trop tôt.
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

  /**
   * Envoie l’état flyer au serveur.
   * Important : ne pas envoyer `custom_logo_data_url` / `custom_bg_data_url` quand on ne les modifie pas,
   * sinon `normalizeFlyerPrefsPut` les force à `null` et **efface** le logo importé (page jeu QR → repli texte vert).
   * @param {{ clearFlyerLogoOnServer?: boolean; clearFlyerBgOnServer?: boolean }} [putOpts]
   */
  async function pushFlyerToServerNow(putOpts = {}) {
    if (!opts.dashboardApi) return false;
    const st = readFlyerStateFromForm(root);
    const { clearFlyerLogoOnServer = false, clearFlyerBgOnServer = false } = putOpts;
    /** @type {Record<string, unknown>} */
    const body = { state: st };
    if (clearFlyerLogoOnServer) {
      body.custom_logo_data_url = null;
    } else {
      const logoLocal = getStoredFlyerCustomLogoDataUrl();
      if (logoLocal) body.custom_logo_data_url = logoLocal;
    }
    if (clearFlyerBgOnServer) {
      body.custom_bg_data_url = null;
    } else {
      const bgLocal = getStoredFlyerCustomBgDataUrl();
      if (bgLocal) body.custom_bg_data_url = bgLocal;
    }
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
  /** Dernier `paint()` async gagnant (évite un blit obsolète si un autre render a commencé entre-temps). */
  let flyerpaintGen = 0;
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

  initFlyerAiGenerate(slug, {
    dashboardApi: opts.dashboardApi,
    onFlyerAiWheelTintsSynced: (oddHex, evenHex) => {
      const oddEl = root.querySelector("#app-flyer-wheel-color-odd");
      const evenEl = root.querySelector("#app-flyer-wheel-color-even");
      if (oddEl) oddEl.value = oddHex;
      if (evenEl) evenEl.value = evenHex;
    },
    onLogoApplied: () => {
      // Le logo IA a été stocké localement → sauvegarder immédiatement sur le serveur
      // puis recharger dans le canvas (l'API sert le logo, pas le localStorage)
      if (!remoteBusy) {
        remoteBusy = true;
        pushFlyerToServerNow().then(() => {
          flyerLogoDirty = true;
          schedulePaint();
        }).finally(() => { remoteBusy = false; });
      }
    },
    onFlyerAiBgColorsSynced: (bgTop, bgBottom) => {
      const bg1El = root.querySelector("#app-flyer-bg1");
      const bg2El = root.querySelector("#app-flyer-bg2");
      if (bg1El && bgTop) bg1El.value = bgTop;
      if (bg2El && bgBottom) bg2El.value = bgBottom;
      flyerBgPanelApi?.syncPreview?.();
    },
    onGeneratedBg: () => {
      flyerBgDirty = true;
      flyerBgPanelApi?.syncPreview?.();
      schedulePaint();
      // Save immédiat (pas de debounce) pour éviter la race condition :
      // un rechargement de page avant les 2s du debounce ne doit pas perdre le fond IA.
      if (!remoteBusy) {
        remoteBusy = true;
        pushFlyerToServerNow().finally(() => { remoteBusy = false; });
      }
    },
  });

  async function paint() {
    const gen = ++flyerpaintGen;
    state = readFlyerStateFromForm(root);
    persistFlyerState(state);
    const wNeed = FLYER_EXPORT.w;
    const hNeed = FLYER_EXPORT.h;
    if (canvas.width !== wNeed || canvas.height !== hNeed) {
      canvas.width = wNeed;
      canvas.height = hNeed;
    }
    const logoApi = `${API_BASE}/api/businesses/${encodeURIComponent(slug)}/public/flyer-qr-logo`;
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
      if (bgData) {
        try {
          // Priorité new Image() — fetch() échoue sur Safari/WKWebView pour les data URLs volumineuses
          const imgEl = await new Promise((resolve) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = () => resolve(null);
            im.src = bgData;
          });
          if (imgEl) {
            flyerBgBitmap = imgEl;
          } else if (bgData.startsWith("data:image/")) {
            // Repli blob pour les WKWebView qui rejettent les longues data URLs sur img.src
            const comma = bgData.indexOf(",");
            if (comma > 0) {
              const mimeM = /data:([^;]+)/.exec(bgData.slice(0, comma));
              const mime = mimeM ? mimeM[1] : "image/png";
              const bin = atob(bgData.slice(comma + 1));
              const bytes = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
              const blob = new Blob([bytes], { type: mime });
              const objUrl = URL.createObjectURL(blob);
              const imgBlob = await new Promise((resolve) => {
                const im = new Image();
                im.onload = () => resolve(im);
                im.onerror = () => resolve(null);
                im.src = objUrl;
              });
              URL.revokeObjectURL(objUrl);
              if (imgBlob) flyerBgBitmap = imgBlob;
            }
          }
        } catch (_) {}
      }
      flyerBgDirty = false;
    }
    const logoForCanvas = flyerLogoBitmap ?? flyerLogoObjectUrl;
    const bgForCanvas = flyerBgBitmap ?? flyerBgObjectUrl;
    try {
      await renderFlyerCanvas(canvas, state, shareUrl(), logoForCanvas, bgForCanvas, {
        shouldBlit: () => gen === flyerpaintGen,
      });
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
      flyerBgPanelApi?.syncPreview();
      flyerLogoDirty = true;
      flyerBgDirty = true;
      state = mergeFlyerState(null);
      writeFlyerFormFromState(root, state);
      schedulePaint();
      void pushFlyerToServerNow({ clearFlyerLogoOnServer: true, clearFlyerBgOnServer: true });
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
