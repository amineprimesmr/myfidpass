/**
 * Page Flyer QR — aperçu canvas, personnalisation, export PNG.
 */
import { API_BASE } from "../config.js";
import { FLYER_STORAGE_KEY, FLYER_EXPORT, mergeFlyerState } from "./app-flyer-qr-presets.js";
import { renderFlyerCanvas } from "./app-flyer-qr-draw.js";

/** @typedef {{ slug: string; pageOrigin: string; getShareLink: () => string }} FlyerQrOpts */

function readStateFromForm(root) {
  /** @type {Record<string, HTMLInputElement | HTMLTextAreaElement | null>} */
  const q = (id) => root.querySelector(`#${id}`);
  return mergeFlyerState({
    headline: q("app-flyer-headline")?.value,
    subline: q("app-flyer-subline")?.value,
    ctaBanner: q("app-flyer-cta")?.value,
    step1: q("app-flyer-step1")?.value,
    step2: q("app-flyer-step2")?.value,
    step3: q("app-flyer-step3")?.value,
    footerSocial: q("app-flyer-social")?.value,
    colorPrimary: q("app-flyer-c1")?.value,
    colorSecondary: q("app-flyer-c2")?.value,
    colorAccent: q("app-flyer-c3")?.value,
    colorBgTop: q("app-flyer-bg1")?.value,
    colorBgBottom: q("app-flyer-bg2")?.value,
    showLegalMention: q("app-flyer-legal")?.checked !== false,
  });
}

/** @param {ParentNode} root @param {import("./app-flyer-qr-presets.js").FlyerState} s */
function writeFormFromState(root, s) {
  const set = (id, v) => {
    const el = root.querySelector(`#${id}`);
    if (el && "value" in el) el.value = v;
  };
  const chk = (id, v) => {
    const el = root.querySelector(`#${id}`);
    if (el && "checked" in el) el.checked = v;
  };
  set("app-flyer-headline", s.headline);
  set("app-flyer-subline", s.subline);
  set("app-flyer-cta", s.ctaBanner);
  set("app-flyer-step1", s.step1);
  set("app-flyer-step2", s.step2);
  set("app-flyer-step3", s.step3);
  set("app-flyer-social", s.footerSocial);
  set("app-flyer-c1", s.colorPrimary);
  set("app-flyer-c2", s.colorSecondary);
  set("app-flyer-c3", s.colorAccent);
  set("app-flyer-bg1", s.colorBgTop);
  set("app-flyer-bg2", s.colorBgBottom);
  chk("app-flyer-legal", s.showLegalMention);
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
  /** Recharge le logo (ex. après retour de « Ma carte »). */
  let flyerLogoDirty = true;

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
    const logoForCanvas = flyerLogoBitmap ?? flyerLogoObjectUrl;
    try {
      await renderFlyerCanvas(canvas, state, shareUrl(), logoForCanvas);
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
          exportNote.textContent = "Image prête pour impression (haute définition).";
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
      state = mergeFlyerState(null);
      writeFormFromState(root, state);
      schedulePaint();
    });
  }

  window.addEventListener("app-section-change", (e) => {
    if (e.detail?.sectionId === "flyer-qr") {
      flyerLogoDirty = true;
      if (linkInput) linkInput.value = shareUrl();
      schedulePaint();
    }
  });

  schedulePaint();
}
