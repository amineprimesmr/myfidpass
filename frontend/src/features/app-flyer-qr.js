/**
 * Page Flyer QR — aperçu canvas, personnalisation, export PNG.
 */
import { API_BASE } from "../config.js";
import { FLYER_STORAGE_KEY, FLYER_EXPORT, mergeFlyerState } from "./app-flyer-qr-presets.js";
import { FLYER_HEADLINE_FONTS } from "./app-flyer-qr-headline-fonts.js";
import { renderFlyerCanvas } from "./app-flyer-qr-draw.js";
import {
  getStoredFlyerCustomLogoDataUrl,
  initFlyerLogoControl,
  clearStoredFlyerCustomLogo,
} from "./app-flyer-logo-control.js";
import {
  getStoredFlyerCustomBgDataUrl,
  initFlyerBgControl,
  clearStoredFlyerCustomBg,
} from "./app-flyer-bg-control.js";

/** @typedef {{ slug: string; pageOrigin: string; getShareLink: () => string }} FlyerQrOpts */

function readStateFromForm(root) {
  /** @type {Record<string, HTMLInputElement | HTMLTextAreaElement | null>} */
  const q = (id) => root.querySelector(`#${id}`);
  return mergeFlyerState({
    headline: q("app-flyer-headline")?.value,
    ctaBanner: q("app-flyer-cta")?.value,
    step1: q("app-flyer-step1")?.value,
    step2: q("app-flyer-step2")?.value,
    step3: q("app-flyer-step3")?.value,
    social1: q("app-flyer-social-1-type")?.value ?? "",
    socialUrl1: q("app-flyer-social-1-url")?.value ?? "",
    social2: q("app-flyer-social-2-type")?.value ?? "",
    socialUrl2: q("app-flyer-social-2-url")?.value ?? "",
    social3: q("app-flyer-social-3-type")?.value ?? "",
    socialUrl3: q("app-flyer-social-3-url")?.value ?? "",
    colorPrimary: q("app-flyer-c1")?.value,
    colorSecondary: q("app-flyer-c2")?.value,
    colorAccent: q("app-flyer-c3")?.value,
    colorBgTop: q("app-flyer-bg1")?.value,
    colorBgBottom: q("app-flyer-bg2")?.value,
    wheelRenderMode: q("app-flyer-wheel-mode")?.value === "png" ? "png" : "segments",
    wheelColorOdd: q("app-flyer-wheel-color-odd")?.value,
    wheelColorEven: q("app-flyer-wheel-color-even")?.value,
    wheelSegmentOffsetDeg: Number(q("app-flyer-wheel-offset")?.value),
    headlineFontId: q("app-flyer-headline-font")?.value,
    headlineTextColor: q("app-flyer-headline-fill")?.value,
    headlineStrokeColor: q("app-flyer-headline-stroke")?.value,
    headlineStrokeWidth: Number(q("app-flyer-headline-stroke-w")?.value),
    headlineLogoGapPct: Number(q("app-flyer-headline-logo-gap")?.value),
    headlineLetterSpacing: Number(q("app-flyer-headline-tracking")?.value),
    flyerBgOverlayPct: Number(q("app-flyer-bg-overlay")?.value),
    flyerQrOutlineWidth: Number(q("app-flyer-qr-outline")?.value),
  });
}

/** @param {ParentNode} root @param {import("./app-flyer-qr-presets.js").FlyerState} s */
function writeFormFromState(root, s) {
  const set = (id, v) => {
    const el = root.querySelector(`#${id}`);
    if (el && "value" in el) el.value = v;
  };
  set("app-flyer-headline", s.headline);
  set("app-flyer-cta", s.ctaBanner);
  set("app-flyer-step1", s.step1);
  set("app-flyer-step2", s.step2);
  set("app-flyer-step3", s.step3);
  set("app-flyer-social-1-type", s.social1 ?? "");
  set("app-flyer-social-1-url", s.socialUrl1 ?? "");
  set("app-flyer-social-2-type", s.social2 ?? "");
  set("app-flyer-social-2-url", s.socialUrl2 ?? "");
  set("app-flyer-social-3-type", s.social3 ?? "");
  set("app-flyer-social-3-url", s.socialUrl3 ?? "");
  set("app-flyer-c1", s.colorPrimary);
  set("app-flyer-c2", s.colorSecondary);
  set("app-flyer-c3", s.colorAccent);
  set("app-flyer-bg1", s.colorBgTop);
  set("app-flyer-bg2", s.colorBgBottom);
  set("app-flyer-wheel-mode", s.wheelRenderMode === "png" ? "png" : "segments");
  set("app-flyer-wheel-color-odd", s.wheelColorOdd ?? "");
  set("app-flyer-wheel-color-even", s.wheelColorEven ?? "");
  set("app-flyer-wheel-offset", String(s.wheelSegmentOffsetDeg ?? 0));
  set("app-flyer-headline-font", s.headlineFontId ?? "");
  set("app-flyer-headline-fill", s.headlineTextColor);
  set("app-flyer-headline-stroke", s.headlineStrokeColor);
  set("app-flyer-headline-stroke-w", String(s.headlineStrokeWidth ?? 0));
  set("app-flyer-headline-logo-gap", String(s.headlineLogoGapPct ?? 0));
  set("app-flyer-headline-tracking", String(s.headlineLetterSpacing ?? 0));
  set("app-flyer-bg-overlay", String(s.flyerBgOverlayPct ?? 52));
  set("app-flyer-qr-outline", String(s.flyerQrOutlineWidth ?? 0));
}

function loadStoredState() {
  try {
    const raw = localStorage.getItem(FLYER_STORAGE_KEY);
    if (!raw) return mergeFlyerState(null);
    return mergeFlyerState(JSON.parse(raw));
  } catch (_) {
    return mergeFlyerState(null);
  }
}

/** @param {import("./app-flyer-qr-presets.js").FlyerState} s */
function persistState(s) {
  try {
    localStorage.setItem(FLYER_STORAGE_KEY, JSON.stringify(s));
  } catch (_) {}
}

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

  let state = loadStoredState();
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

  writeFormFromState(root, state);
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
    },
  });

  flyerBgPanelApi = initFlyerBgControl({
    onBgChange: () => {
      flyerBgDirty = true;
      schedulePaint();
    },
  });

  async function paint() {
    state = readStateFromForm(root);
    persistState(state);
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
    el.addEventListener("input", schedulePaint);
    el.addEventListener("change", schedulePaint);
  });

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
      writeFormFromState(root, state);
      schedulePaint();
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

  schedulePaint();
}
