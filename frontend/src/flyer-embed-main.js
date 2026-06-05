/**
 * Aperçu flyer (même moteur canvas que le SaaS) — chargé par flyer-embed.html.
 * Mode preview : canvas 1024×1536 + cache logo/assets + patch d’état léger (WKWebView iOS).
 */
import { API_BASE } from "./config.js";
import { FLYER_EXPORT, FLYER_PREVIEW_EXPORT, mergeFlyerState } from "./features/app-flyer-qr-presets.js";
import { renderFlyerCanvas } from "./features/app-flyer-qr-draw.js";

/** @type {true} */
window.__FIDPASS_PREVIEW_MODE = true;

/**
 * @returns {{ w: number, h: number }}
 */
function embedCanvasDimensions() {
  if (typeof window !== "undefined" && window.__FIDPASS_PREVIEW_MODE === true) {
    return FLYER_PREVIEW_EXPORT;
  }
  return FLYER_EXPORT;
}

/**
 * Chargement d’images depuis `data:image/...;base64,...` pour le canvas flyer.
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
    /* repli blob / fetch ci-dessous */
  }
  try {
    const comma = dataUrl.indexOf(",");
    if (comma > 0) {
      const meta = dataUrl.slice(0, comma);
      const b64 = dataUrl.slice(comma + 1);
      const mimeM = /data:([^;]+)/.exec(meta);
      const mime = mimeM ? mimeM[1] : "image/png";
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: mime });
      const objUrl = URL.createObjectURL(blob);
      const fromBlob = await new Promise((resolve) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => resolve(null);
        im.src = objUrl;
      });
      try {
        URL.revokeObjectURL(objUrl);
      } catch (_) {}
      if (fromBlob) return /** @type {HTMLImageElement} */ (fromBlob);
    }
  } catch (_) {
    /* ignore */
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
    /* repli img */
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
  if (!b64) return { flyer_prefs: null, share_url: "", match_predictions_enabled: false };
  try {
    const api = JSON.parse(atob(b64));
    const mp = api.match_predictions_enabled ?? api.matchPredictionsEnabled;
    return {
      flyer_prefs: api.flyer_prefs ?? null,
      share_url: typeof api.share_url === "string" ? api.share_url : "",
      match_predictions_enabled: mp === true || mp === 1 || mp === "1" || mp === "true",
    };
  } catch (_) {
    return { flyer_prefs: null, share_url: "", match_predictions_enabled: false };
  }
}

/** Incrémenté à chaque rendu : le dernier async gagne. */
let __flyerEmbedApplyGen = 0;

/** @type {{
 *   state: import("./features/app-flyer-qr-presets.js").FlyerState,
 *   share_url: string,
 *   match_predictions_enabled: boolean,
 *   cardSlug: string,
 *   logoIn: import("./features/app-flyer-qr-draw-utils.js").CanvasImageInput | null,
 *   bgIn: import("./features/app-flyer-qr-draw-utils.js").CanvasImageInput | null,
 *   logoKey: string,
 *   skipPublicLogoFallback: boolean,
 * } | null} */
let __flyerEmbedCache = null;

/**
 * @param {import("./features/app-flyer-qr-presets.js").FlyerState | null | undefined} raw
 */
function mergedStateFromRaw(raw) {
  return mergeFlyerState(
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? /** @type {import("./features/app-flyer-qr-presets.js").FlyerState} */ (raw)
      : null,
  );
}

/**
 * @param {string} shareUrl
 * @param {string} slugFromPrefs
 */
function resolveCardSlug(shareUrl, slugFromPrefs) {
  if (slugFromPrefs) return slugFromPrefs;
  const slugMatch = shareUrl.match(/\/fidelity\/([^/?#]+)/);
  return slugMatch ? decodeURIComponent(slugMatch[1]) : "";
}

function resolveApiBase() {
  const rawBase = typeof API_BASE === "string" ? API_BASE.trim().replace(/\/$/, "") : "";
  const host = typeof window !== "undefined" && window.location?.hostname ? String(window.location.hostname) : "";
  return (
    rawBase ||
    (/myfidpass\.fr$/i.test(host) ? "https://api.myfidpass.fr" : "") ||
    "https://api.myfidpass.fr"
  );
}

/**
 * @param {ReturnType<typeof parseBootstrap>} parsed
 */
async function resolveLogoFromBootstrap(parsed) {
  const prefsRaw = parsed.flyer_prefs;
  const hasLogoKey =
    prefsRaw != null &&
    typeof prefsRaw === "object" &&
    Object.prototype.hasOwnProperty.call(prefsRaw, "custom_logo_data_url");
  const rawLogo = hasLogoKey ? /** @type {{ custom_logo_data_url?: unknown }} */ (prefsRaw).custom_logo_data_url : undefined;
  let logoKey = "unset";
  if (typeof rawLogo === "string" && rawLogo.startsWith("data:image/")) {
    logoKey = `data:${rawLogo.length}:${rawLogo.slice(0, 48)}`;
    return {
      logoIn: await loadImageInputFromDataUrl(rawLogo),
      logoKey,
      skipPublicLogoFallback: false,
    };
  }
  if (hasLogoKey && rawLogo === "") {
    return { logoIn: null, logoKey: "cleared", skipPublicLogoFallback: true };
  }
  return { logoIn: null, logoKey: "fallback", skipPublicLogoFallback: false };
}

/**
 * @param {typeof __flyerEmbedCache} cache
 */
async function ensureLogoInCache(cache) {
  if (!cache) return;
  if (cache.logoIn != null || cache.skipPublicLogoFallback) return;
  if (!cache.cardSlug) return;
  const logoApi = `${resolveApiBase()}/api/businesses/${encodeURIComponent(cache.cardSlug)}/public/flyer-qr-logo`;
  cache.logoIn = await loadImageInputFromHttp(logoApi);
  if (cache.logoIn) cache.logoKey = `api:${cache.cardSlug}`;
}

/**
 * Rendu depuis le cache (patch couleur / texte — pas de re-parse bootstrap).
 */
async function renderFromEmbedCache() {
  const cache = __flyerEmbedCache;
  if (!cache) {
    await renderFromCurrentBootstrap();
    return;
  }
  const gen = ++__flyerEmbedApplyGen;
  const canvas = document.getElementById("fidpass-flyer-canvas");
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;

  await ensureLogoInCache(cache);

  const dim = embedCanvasDimensions();
  if (canvas.width !== dim.w || canvas.height !== dim.h) {
    canvas.width = dim.w;
    canvas.height = dim.h;
  }

  const targetUrl =
    cache.share_url.trim() ||
    (cache.cardSlug
      ? `${typeof window !== "undefined" ? window.location.origin : ""}/fidelity/${cache.cardSlug}`
      : "");

  try {
    await renderFlyerCanvas(
      canvas,
      cache.state,
      targetUrl || "https://myfidpass.fr",
      cache.logoIn,
      cache.bgIn,
      {
        shouldBlit: () => gen === __flyerEmbedApplyGen,
        matchPredictionsEnabled: cache.match_predictions_enabled,
      },
    );
  } catch (e) {
    if (typeof console !== "undefined" && console.warn) console.warn("[flyer-embed]", e);
  }
}

/**
 * Rendu complet depuis `window.__FIDPASS_FLYER_B64__` (WKWebView / injection live).
 */
async function renderFromCurrentBootstrap() {
  const gen = ++__flyerEmbedApplyGen;
  const parsed = parseBootstrap();
  const canvas = document.getElementById("fidpass-flyer-canvas");
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;

  const prefsRaw = parsed.flyer_prefs;
  const state = mergedStateFromRaw(
    prefsRaw?.state && typeof prefsRaw.state === "object" && !Array.isArray(prefsRaw.state)
      ? prefsRaw.state
      : null,
  );

  const slugFromPrefs =
    prefsRaw &&
    typeof prefsRaw.business_slug === "string" &&
    prefsRaw.business_slug.trim().length > 0
      ? prefsRaw.business_slug.trim()
      : "";
  const cardSlug = resolveCardSlug(parsed.share_url, slugFromPrefs);

  const logoResolved = await resolveLogoFromBootstrap(parsed);
  let logoIn = logoResolved.logoIn;
  const skipPublicLogoFallback = logoResolved.skipPublicLogoFallback;

  let bgIn = null;
  if (prefsRaw?.custom_bg_data_url) {
    bgIn = await loadImageInputFromDataUrl(prefsRaw.custom_bg_data_url);
  }

  if (!logoIn && cardSlug && !skipPublicLogoFallback) {
    const logoApi = `${resolveApiBase()}/api/businesses/${encodeURIComponent(cardSlug)}/public/flyer-qr-logo`;
    logoIn = await loadImageInputFromHttp(logoApi);
  }

  __flyerEmbedCache = {
    state,
    share_url: parsed.share_url,
    match_predictions_enabled: parsed.match_predictions_enabled,
    cardSlug,
    logoIn,
    bgIn,
    logoKey: logoResolved.logoKey,
    skipPublicLogoFallback,
  };

  const dim = embedCanvasDimensions();
  if (canvas.width !== dim.w || canvas.height !== dim.h) {
    canvas.width = dim.w;
    canvas.height = dim.h;
  }

  const targetUrl =
    parsed.share_url.trim() ||
    (cardSlug ? `${typeof window !== "undefined" ? window.location.origin : ""}/fidelity/${cardSlug}` : "");

  try {
    await renderFlyerCanvas(canvas, state, targetUrl || "https://myfidpass.fr", logoIn, bgIn, {
      shouldBlit: () => gen === __flyerEmbedApplyGen,
      matchPredictionsEnabled: parsed.match_predictions_enabled,
    });
  } catch (e) {
    if (typeof console !== "undefined" && console.warn) console.warn("[flyer-embed]", e);
  }
}

/**
 * Patch léger (couleurs, textes, roue) — sans re-parse du bootstrap ni re-fetch logo.
 * @param {string} jsonStr
 */
function patchFlyerStateFromJSON(jsonStr) {
  if (!jsonStr || typeof jsonStr !== "string") return;
  let patch;
  try {
    patch = JSON.parse(jsonStr);
  } catch (_) {
    return;
  }
  if (!__flyerEmbedCache) {
    void renderFromCurrentBootstrap();
    return;
  }
  if (patch.state && typeof patch.state === "object" && !Array.isArray(patch.state)) {
    __flyerEmbedCache.state = mergedStateFromRaw({
      ...__flyerEmbedCache.state,
      ...patch.state,
    });
  }
  if (typeof patch.share_url === "string") {
    __flyerEmbedCache.share_url = patch.share_url;
    __flyerEmbedCache.cardSlug = resolveCardSlug(patch.share_url, __flyerEmbedCache.cardSlug);
  }
  const mp = patch.match_predictions_enabled ?? patch.matchPredictionsEnabled;
  if (mp === true || mp === false || mp === 1 || mp === 0) {
    __flyerEmbedCache.match_predictions_enabled =
      mp === true || mp === 1 || mp === "1" || mp === "true";
  }
  void renderFromEmbedCache();
}

if (typeof window !== "undefined") {
  window.__FIDPASS_FLYER_APPLY__ = () => {
    void renderFromCurrentBootstrap();
  };
  window.__FIDPASS_FLYER_PATCH_STATE__ = (jsonStr) => {
    patchFlyerStateFromJSON(jsonStr);
  };
}

function shouldAutoRenderFlyerEmbedOnLoad() {
  try {
    const b64 =
      typeof window.__FIDPASS_FLYER_B64__ === "string" && window.__FIDPASS_FLYER_B64__
        ? window.__FIDPASS_FLYER_B64__
        : "";
    if (!b64 || b64.length < 12) return false;
    const api = JSON.parse(atob(b64));
    return api.flyer_prefs != null && typeof api.flyer_prefs === "object";
  } catch {
    return false;
  }
}

if (shouldAutoRenderFlyerEmbedOnLoad()) {
  void renderFromCurrentBootstrap();
}
