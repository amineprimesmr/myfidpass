/**
 * Aperçu flyer (même moteur canvas que le SaaS) — chargé par flyer-embed.html.
 * Les données viennent de window.__FIDPASS_FLYER_B64__ (injection WKWebView) ou #fidpass-flyer-b64.
 */
import { API_BASE } from "./config.js";
import { FLYER_EXPORT, mergeFlyerState } from "./features/app-flyer-qr-presets.js";
import { renderFlyerCanvas } from "./features/app-flyer-qr-draw.js";

/**
 * Chargement d’images depuis `data:image/...;base64,...` pour le canvas flyer.
 * Important WKWebView : `fetch(dataUrl)` échoue ou tronque souvent sur les data URLs volumineuses
 * (fond IA JPEG/PNG) → fond absent (dégradé par défaut) alors que l’aperçu « brut » fonctionne ailleurs.
 * `new Image()` + `src = dataUrl` est le chemin fiable pour les data URLs.
 *
 * @param {string} dataUrl
 * @returns {Promise<HTMLImageElement | ImageBitmap | string | null>}
 */
async function loadImageInputFromDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  if (!dataUrl.startsWith("data:image/")) return null;
  try {
    const fromImg = await new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = dataUrl;
    });
    if (fromImg) return /** @type {HTMLImageElement} */ (fromImg);
  } catch (_) {
    /* repli fetch ci-dessous */
  }
  try {
    const res = await fetch(dataUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (typeof createImageBitmap === "function") {
      try {
        return await createImageBitmap(blob);
      } catch (_) {
        return URL.createObjectURL(blob);
      }
    }
    return URL.createObjectURL(blob);
  } catch (_) {
    return null;
  }
}

/** @param {string} url */
async function loadImageInputFromHttp(url) {
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (typeof createImageBitmap === "function") {
      try {
        return await createImageBitmap(blob);
      } catch (_) {
        return URL.createObjectURL(blob);
      }
    }
    return URL.createObjectURL(blob);
  } catch (_) {
    /* Repli : certains WKWebView rejettent fetch+blob mais acceptent <img crossorigin>. */
  }
  try {
    const im = await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("logo img"));
      img.src = url;
    });
    return /** @type {HTMLImageElement} */ (im);
  } catch (_) {
    return null;
  }
}

function parseBootstrap() {
  const b64 =
    typeof window.__FIDPASS_FLYER_B64__ === "string" && window.__FIDPASS_FLYER_B64__
      ? window.__FIDPASS_FLYER_B64__
      : document.getElementById("fidpass-flyer-b64")?.textContent?.trim() || "";
  if (!b64) return { flyer_prefs: null, share_url: "" };
  try {
    const api = JSON.parse(atob(b64));
    return {
      flyer_prefs: api.flyer_prefs ?? null,
      share_url: typeof api.share_url === "string" ? api.share_url : "",
    };
  } catch (_) {
    return { flyer_prefs: null, share_url: "" };
  }
}

/**
 * Rendu complet depuis `window.__FIDPASS_FLYER_B64__` (WKWebView / injection live).
 * Exposé sur `window` pour mises à jour sans recharger la page (évite flash noir).
 */
async function renderFromCurrentBootstrap() {
  const { flyer_prefs, share_url } = parseBootstrap();
  const canvas = document.getElementById("fidpass-flyer-canvas");
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;

  const state = mergeFlyerState(
    flyer_prefs?.state && typeof flyer_prefs.state === "object" && !Array.isArray(flyer_prefs.state)
      ? /** @type {import("./features/app-flyer-qr-presets.js").FlyerState} */ (flyer_prefs.state)
      : null,
  );

  let logoIn = null;
  let bgIn = null;
  const prefsRaw = flyer_prefs;
  const hasLogoKey =
    prefsRaw != null &&
    typeof prefsRaw === "object" &&
    Object.prototype.hasOwnProperty.call(prefsRaw, "custom_logo_data_url");
  const rawLogo = hasLogoKey ? /** @type {{ custom_logo_data_url?: unknown }} */ (prefsRaw).custom_logo_data_url : undefined;
  if (typeof rawLogo === "string" && rawLogo.startsWith("data:image/")) {
    logoIn = await loadImageInputFromDataUrl(rawLogo);
  } else if (hasLogoKey && (rawLogo === "" || rawLogo === null)) {
    logoIn = null;
  }
  const skipPublicLogoFallback =
    hasLogoKey && (rawLogo === "" || rawLogo === null);
  if (flyer_prefs?.custom_bg_data_url) {
    bgIn = await loadImageInputFromDataUrl(flyer_prefs.custom_bg_data_url);
  }

  const slugFromPrefs =
    flyer_prefs &&
    typeof flyer_prefs.business_slug === "string" &&
    flyer_prefs.business_slug.trim().length > 0
      ? flyer_prefs.business_slug.trim()
      : "";
  const slugMatch = share_url.match(/\/fidelity\/([^/?#]+)/);
  const cardSlug = slugFromPrefs || (slugMatch ? decodeURIComponent(slugMatch[1]) : "");
  /** Vite dev : API_BASE peut être "" → URL relative cassée dans WKWebView. Toujours viser l’API prod sur le domaine MyFidpass. */
  const rawBase = typeof API_BASE === "string" ? API_BASE.trim().replace(/\/$/, "") : "";
  const host = typeof window !== "undefined" && window.location?.hostname ? String(window.location.hostname) : "";
  const apiBase =
    rawBase ||
    (/myfidpass\.fr$/i.test(host) ? "https://api.myfidpass.fr" : "") ||
    "https://api.myfidpass.fr";
  if (!logoIn && cardSlug && !skipPublicLogoFallback) {
    const logoApi = `${apiBase}/api/businesses/${encodeURIComponent(cardSlug)}/public/flyer-qr-logo`;
    logoIn = await loadImageInputFromHttp(logoApi);
  }

  const targetUrl =
    share_url.trim() ||
    (cardSlug ? `${typeof window !== "undefined" ? window.location.origin : ""}/fidelity/${cardSlug}` : "");

  canvas.width = FLYER_EXPORT.w;
  canvas.height = FLYER_EXPORT.h;
  try {
    await renderFlyerCanvas(canvas, state, targetUrl || "https://myfidpass.fr", logoIn, bgIn);
  } catch (e) {
    if (typeof console !== "undefined" && console.warn) console.warn("[flyer-embed]", e);
  }
}

if (typeof window !== "undefined") {
  window.__FIDPASS_FLYER_APPLY__ = () => {
    void renderFromCurrentBootstrap();
  };
}

void renderFromCurrentBootstrap();
