/**
 * Page Flyer QR — aperçu canvas, personnalisation, export PNG.
 */
import { API_BASE } from "../config.js";
import { buildFidelityClientUrl } from "../client-fidelity/lib/client-entry-intent.js";
import { FLYER_EXPORT, mergeFlyerState, scopedFlyerStorageKey } from "./app-flyer-qr-presets.js";
import {
  readFlyerStateFromForm,
  writeFlyerFormFromState,
  loadStoredFlyerState,
  persistFlyerState,
} from "./app-flyer-qr-form.js";
import { renderFlyerCanvas } from "./app-flyer-qr-draw.js";
import {
  getStoredFlyerCustomLogoDataUrl,
  clearStoredFlyerCustomLogo,
  initFlyerLogoControl,
  scopedFlyerCustomLogoStorageKey,
} from "./app-flyer-logo-control.js";
import {
  getStoredFlyerCustomBgDataUrl,
  setStoredFlyerCustomBgDataUrl,
  initFlyerBgControl,
  clearStoredFlyerCustomBg,
  scopedFlyerCustomBgStorageKey,
} from "./app-flyer-bg-control.js";
import { wireFlyerQrBackgroundGallery } from "./app-flyer-qr-wire-bg.js";
import { ensureFlyerDisplayFontsLoaded } from "./flyer-display-fonts-load.js";
import {
  createFlyerAssetState,
  markBgDirty,
  markLogoDirty,
  refreshBgAsset,
  refreshLogoAsset,
} from "./app-flyer-qr-assets.js";
import { createRemoteSaveQueue } from "./app-flyer-qr-remote-save.js";

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

  const accentPicker = root.querySelector("#app-flyer-accent-unified");
  const bgPicker = root.querySelector("#app-flyer-bg-solid");
  const colorsToggleBtn = root.querySelector("#app-flyer-colors-toggle");
  const colorsPanel = root.querySelector("#app-flyer-colors-panel");
  const flyerStorageKey = scopedFlyerStorageKey(slug);
  const flyerCustomLogoStorageKey = scopedFlyerCustomLogoStorageKey(slug);
  const flyerCustomBgStorageKey = scopedFlyerCustomBgStorageKey(slug);

  function syncFlyerBgColorRowVisibility() {
    if (!bgPicker) return;
    const bgRow = bgPicker.closest(".app-flyer-color-row");
    if (!bgRow) return;
    const hasBackgroundImage = !!getStoredFlyerCustomBgDataUrl(flyerCustomBgStorageKey);
    bgRow.classList.toggle("hidden", hasBackgroundImage);
    bgRow.setAttribute("aria-hidden", hasBackgroundImage ? "true" : "false");
  }

  const flyerPalette = ["#ffffff", "#34c759", "#0a84ff", "#5856d6", "#af52de", "#ff2d55", "#ff9500", "#ffcc00", "#8e8e93", "#000000"];

  function normalizeHex(value, fallback) {
    const v = String(value || "").trim();
    return /^#[0-9A-Fa-f]{6}$/.test(v) ? v.toLowerCase() : fallback.toLowerCase();
  }

  function applyFlyerPickerValue(inputEl, hex) {
    if (!inputEl) return;
    inputEl.value = normalizeHex(hex, String(inputEl.value || "#000000"));
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    inputEl.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function openPreciseColorPicker(anchorBtn, inputEl) {
    if (!anchorBtn || !inputEl) return;
    const picker = document.createElement("input");
    picker.type = "color";
    picker.value = normalizeHex(inputEl.value, "#000000");
    const rect = anchorBtn.getBoundingClientRect();
    picker.style.position = "fixed";
    picker.style.left = `${Math.max(0, rect.left + rect.width / 2)}px`;
    picker.style.top = `${Math.max(0, rect.top + rect.height / 2)}px`;
    picker.style.width = "1px";
    picker.style.height = "1px";
    picker.style.opacity = "0";
    picker.style.pointerEvents = "none";
    picker.style.zIndex = "9999";
    document.body.appendChild(picker);
    const cleanup = () => {
      picker.removeEventListener("input", onInput);
      picker.removeEventListener("change", onChange);
      picker.removeEventListener("blur", cleanup);
      picker.remove();
    };
    const onInput = () => applyFlyerPickerValue(inputEl, picker.value);
    const onChange = () => {
      applyFlyerPickerValue(inputEl, picker.value);
      cleanup();
    };
    picker.addEventListener("input", onInput);
    picker.addEventListener("change", onChange);
    picker.addEventListener("blur", cleanup);
    picker.click();
    window.setTimeout(cleanup, 15000);
  }

  function wireFlyerSwatches(inputEl, labelText) {
    if (!inputEl) return;
    const row = inputEl.closest(".app-flyer-color-row");
    if (!row) return;
    const container = document.createElement("div");
    container.className = "app-logo-colors-swatches app-logo-colors-swatches--inline app-flyer-swatches";
    container.setAttribute("role", "group");
    container.setAttribute("aria-label", `Couleurs ${labelText}`);

    const plusBtn = document.createElement("button");
    plusBtn.type = "button";
    plusBtn.className = "app-logo-color-swatch app-logo-color-swatch--plus";
    plusBtn.textContent = "+";
    plusBtn.title = "Choisir une couleur précise";
    plusBtn.setAttribute("aria-label", `Choisir une couleur précise pour ${labelText}`);
    plusBtn.addEventListener("click", () => openPreciseColorPicker(plusBtn, inputEl));
    container.appendChild(plusBtn);

    flyerPalette.forEach((hex) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "app-logo-color-swatch";
      btn.style.background = hex;
      btn.setAttribute("data-hex", hex.toLowerCase());
      btn.setAttribute("aria-label", `Appliquer ${hex} à ${labelText}`);
      btn.addEventListener("click", () => applyFlyerPickerValue(inputEl, hex));
      container.appendChild(btn);
    });

    const sync = () => {
      const current = normalizeHex(inputEl.value, "#000000");
      container.querySelectorAll(".app-logo-color-swatch[data-hex]").forEach((btn) => {
        const sw = String(btn.getAttribute("data-hex") || "").toLowerCase();
        btn.classList.toggle("is-selected", sw === current);
      });
    };

    row.appendChild(container);
    inputEl.addEventListener("input", sync);
    inputEl.addEventListener("change", sync);
    sync();
  }

  wireFlyerSwatches(bgPicker, "fond");
  wireFlyerSwatches(accentPicker, "roue, cadeau, bandeau");
  if (colorsToggleBtn && colorsPanel) {
    colorsToggleBtn.addEventListener("click", () => {
      colorsPanel.classList.toggle("hidden");
      const expanded = !colorsPanel.classList.contains("hidden");
      colorsToggleBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
    });
  }

  const pickContrastingTextOnHexBg = (hex) => {
    const h = String(hex || "").trim();
    if (!/^#[0-9A-Fa-f]{6}$/.test(h)) return "#ffffff";
    const r = parseInt(h.slice(1, 3), 16) / 255;
    const g = parseInt(h.slice(3, 5), 16) / 255;
    const b = parseInt(h.slice(5, 7), 16) / 255;
    const lin = [r, g, b].map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    const l = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    return l > 0.55 ? "#0f172a" : "#ffffff";
  };
  const darkenHex = (hex, amount = 0.22) => {
    const h = String(hex || "").trim();
    if (!/^#[0-9A-Fa-f]{6}$/.test(h)) return "#cbd5e1";
    const r = parseInt(h.slice(1, 3), 16);
    const g = parseInt(h.slice(3, 5), 16);
    const b = parseInt(h.slice(5, 7), 16);
    const a = Math.max(0, Math.min(0.6, amount));
    const rr = Math.max(0, Math.min(255, Math.round(r * (1 - a))));
    const gg = Math.max(0, Math.min(255, Math.round(g * (1 - a))));
    const bb = Math.max(0, Math.min(255, Math.round(b * (1 - a))));
    return `#${rr.toString(16).padStart(2, "0")}${gg.toString(16).padStart(2, "0")}${bb.toString(16).padStart(2, "0")}`;
  };

  const setInputValue = (id, value) => {
    const el = root.querySelector(`#${id}`);
    if (el && "value" in el) el.value = value;
  };

  const syncThemeControlsFromPickers = () => {
    const accent =
      accentPicker && "value" in accentPicker && /^#[0-9A-Fa-f]{6}$/.test(String(accentPicker.value).trim())
        ? String(accentPicker.value).trim()
        : "#fbbf24";
    const bg =
      bgPicker && "value" in bgPicker && /^#[0-9A-Fa-f]{6}$/.test(String(bgPicker.value).trim())
        ? String(bgPicker.value).trim()
        : "#0f172a";
    const contrast = pickContrastingTextOnHexBg(accent);
    const accentAlt = darkenHex(accent, 0.26);

    setInputValue("app-flyer-headline-gift-stroke", contrast);
    setInputValue("app-flyer-c1", accent);
    setInputValue("app-flyer-c2", accentAlt);
    setInputValue("app-flyer-wheel-color-odd", accent);
    setInputValue("app-flyer-wheel-color-even", accentAlt);
    setInputValue("app-flyer-cta-bg", accent);
    setInputValue("app-flyer-cta-text-color", contrast);
    setInputValue("app-flyer-bg1", bg);
    setInputValue("app-flyer-bg2", bg);
  };

  if (panel && window.matchMedia("(min-width: 961px)").matches) {
    panel.classList.add("is-open");
    if (panelToggle) panelToggle.setAttribute("aria-expanded", "true");
  }

  const shareUrl = () => buildFidelityClientUrl(opts.pageOrigin, slug, { qrGame: true });

  let state = loadStoredFlyerState(flyerStorageKey);
  let matchPredictionsEnabled = false;
  const flyerAssets = createFlyerAssetState();

  /** @type {{ syncPreview: () => void } | undefined} */
  let flyerBgPanelApi;

  /** @param {unknown} prefs */
  function applyServerFlyerPrefs(prefs) {
    if (!prefs || typeof prefs !== "object") return;
    const p = /** @type {{ state?: unknown; custom_logo_data_url?: unknown; custom_bg_data_url?: unknown }} */ (prefs);
    const merged = mergeFlyerState(
      p.state && typeof p.state === "object" && !Array.isArray(p.state)
        ? /** @type {import("./app-flyer-qr-presets.js").FlyerState} */ (p.state)
        : null,
    );
    if (accentPicker && "value" in accentPicker) {
      accentPicker.value = /^#[0-9A-Fa-f]{6}$/.test(String(merged.colorPrimary || "").trim())
        ? String(merged.colorPrimary).trim()
        : "#fbbf24";
    }
    if (bgPicker && "value" in bgPicker) {
      bgPicker.value = /^#[0-9A-Fa-f]{6}$/.test(String(merged.colorBgTop || "").trim())
        ? String(merged.colorBgTop).trim()
        : "#0f172a";
    }
    writeFlyerFormFromState(root, merged);
    persistFlyerState(merged, flyerStorageKey);
    state = merged;
    // NE PAS effacer le logo local : il sera réenvoyé au prochain pushFlyerToServerNow.
    // Effacer inconditionnellement provoquait une race condition (logo importé avant sauvegarde puis perdu).
    if (typeof p.custom_bg_data_url === "string" && p.custom_bg_data_url.startsWith("data:image/")) {
      // Le serveur a un fond enregistré → le stocker localement
      setStoredFlyerCustomBgDataUrl(p.custom_bg_data_url, flyerCustomBgStorageKey);
    }
    // NE PAS effacer le fond local si le serveur n'en a pas encore :
    // un fond choisi localement peut exister avant la sauvegarde distante (debounce 2s).
    // Un clearStoredFlyerCustomBg() ici détruisait le fond généré si la page rechargait trop tôt.
    flyerBgPanelApi?.syncPreview();
    markLogoDirty(flyerAssets);
    markBgDirty(flyerAssets);
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
      const logoLocal = getStoredFlyerCustomLogoDataUrl(flyerCustomLogoStorageKey);
      if (logoLocal) body.custom_logo_data_url = logoLocal;
    }
    if (clearFlyerBgOnServer) {
      body.custom_bg_data_url = null;
    } else {
      const bgLocal = getStoredFlyerCustomBgDataUrl(flyerCustomBgStorageKey);
      if (bgLocal) body.custom_bg_data_url = bgLocal;
    }
    try {
      const res = await opts.dashboardApi("/dashboard/flyer", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok && typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new CustomEvent("fidpass:flyer-saved"));
      }
      return res.ok;
    } catch (_) {
      return false;
    }
  }

  const remoteSaveQueue = opts.dashboardApi
    ? createRemoteSaveQueue({ delayMs: 2000, run: async () => { await pushFlyerToServerNow(); } })
    : null;
  function scheduleRemoteSave() {
    remoteSaveQueue?.schedule();
  }

  async function hydrateFromServer() {
    if (!opts.dashboardApi) return;
    try {
      const res = await opts.dashboardApi("/dashboard/flyer", { method: "GET" });
      if (!res.ok) return;
      const j = await res.json();
      if (j.flyer_prefs && typeof j.flyer_prefs === "object") {
        applyServerFlyerPrefs(j.flyer_prefs);
      }
      const mp = j.match_predictions_enabled ?? j.matchPredictionsEnabled;
      matchPredictionsEnabled = mp === true || mp === 1 || mp === "1" || mp === "true";
      schedulePaint();
    } catch (_) {
      /* réseau ou session */
    }
  }

  writeFlyerFormFromState(root, state);
  if (accentPicker && "value" in accentPicker) accentPicker.value = state.colorPrimary;
  if (bgPicker && "value" in bgPicker) bgPicker.value = state.colorBgTop;
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

  flyerBgPanelApi = initFlyerBgControl({
    storageKey: flyerCustomBgStorageKey,
    onBgChange: () => {
      markBgDirty(flyerAssets);
      syncFlyerBgColorRowVisibility();
      schedulePaint();
      scheduleRemoteSave();
    },
  });

  wireFlyerQrBackgroundGallery(root, {
    markBgDirtyAndPaint: () => {
      markBgDirty(flyerAssets);
      syncFlyerBgColorRowVisibility();
      schedulePaint();
    },
    scheduleRemoteSave,
    getBgPanelApi: () => flyerBgPanelApi,
    storageKey: flyerCustomBgStorageKey,
  });

  initFlyerLogoControl({
    storageKey: flyerCustomLogoStorageKey,
    onCustomLogoChange: () => {
      markLogoDirty(flyerAssets);
      schedulePaint();
      scheduleRemoteSave();
    },
    removeBgApi: opts.dashboardApi
      ? async (dataUrl) => {
          try {
            const res = await opts.dashboardApi("/dashboard/flyer/remove-logo-background", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ image_data_url: dataUrl }),
            });
            if (!res.ok) return null;
            const json = await res.json();
            return json?.ok && json.png_data_url ? json.png_data_url : null;
          } catch (_) {
            return null;
          }
        }
      : undefined,
  });

  async function paint() {
    const gen = ++flyerpaintGen;
    state = readFlyerStateFromForm(root);
    persistFlyerState(state, flyerStorageKey);
    const wNeed = FLYER_EXPORT.w;
    const hNeed = FLYER_EXPORT.h;
    if (canvas.width !== wNeed || canvas.height !== hNeed) {
      canvas.width = wNeed;
      canvas.height = hNeed;
    }
    const logoApi = `${API_BASE}/api/businesses/${encodeURIComponent(slug)}/public/flyer-qr-logo`;
    await refreshLogoAsset(
      flyerAssets,
      logoApi,
      () => getStoredFlyerCustomLogoDataUrl(flyerCustomLogoStorageKey),
    );
    await refreshBgAsset(flyerAssets, () => getStoredFlyerCustomBgDataUrl(flyerCustomBgStorageKey));
    const logoForCanvas = flyerAssets.logoBitmap ?? flyerAssets.logoObjectUrl;
    const bgForCanvas = flyerAssets.bgBitmap ?? flyerAssets.bgObjectUrl;
    try {
      await renderFlyerCanvas(canvas, state, shareUrl(), logoForCanvas, bgForCanvas, {
        shouldBlit: () => gen === flyerpaintGen,
        matchPredictionsEnabled,
      });
      syncFlyerBgColorRowVisibility();
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

  if (accentPicker) {
    const onAccentChange = () => {
      syncThemeControlsFromPickers();
      schedulePaint();
      scheduleRemoteSave();
    };
    accentPicker.addEventListener("input", onAccentChange);
    accentPicker.addEventListener("change", onAccentChange);
  }
  if (bgPicker) {
    const onBgChange = () => {
      syncThemeControlsFromPickers();
      schedulePaint();
      scheduleRemoteSave();
    };
    bgPicker.addEventListener("input", onBgChange);
    bgPicker.addEventListener("change", onBgChange);
  }

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
        const blob = await new Promise((resolve, reject) => {
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("export_blob"))), "image/png");
        });
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.download = `flyer-qr-${slug}.png`;
        a.href = objUrl;
        a.click();
        setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
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
      clearStoredFlyerCustomLogo(flyerCustomLogoStorageKey);
      clearStoredFlyerCustomBg(flyerCustomBgStorageKey);
      flyerBgPanelApi?.syncPreview();
      markLogoDirty(flyerAssets);
      markBgDirty(flyerAssets);
      state = mergeFlyerState(null);
      writeFlyerFormFromState(root, state);
      if (accentPicker && "value" in accentPicker) accentPicker.value = state.colorPrimary;
      if (bgPicker && "value" in bgPicker) bgPicker.value = state.colorBgTop;
      syncFlyerBgColorRowVisibility();
      syncThemeControlsFromPickers();
      schedulePaint();
      void pushFlyerToServerNow({ clearFlyerLogoOnServer: true, clearFlyerBgOnServer: true });
    });
  }

  window.addEventListener("app-section-change", (e) => {
    if (e.detail?.sectionId === "flyer-qr") {
      markLogoDirty(flyerAssets);
      markBgDirty(flyerAssets);
      if (linkInput) linkInput.value = shareUrl();
      schedulePaint();
    }
  });

  void hydrateFromServer();
  syncFlyerBgColorRowVisibility();
  schedulePaint();
}
