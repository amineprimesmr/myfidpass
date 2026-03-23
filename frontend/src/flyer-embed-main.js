/**
 * Aperçu flyer (même moteur canvas que le SaaS) — chargé par flyer-embed.html.
 * Les données viennent de window.__FIDPASS_FLYER_B64__ (injection WKWebView) ou #fidpass-flyer-b64.
 */
import { API_BASE } from "./config.js";
import { FLYER_EXPORT, mergeFlyerState } from "./features/app-flyer-qr-presets.js";
import { renderFlyerCanvas } from "./features/app-flyer-qr-draw.js";

/** @param {string} dataUrl */
async function loadImageInputFromDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
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

async function run() {
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
  if (flyer_prefs?.custom_logo_data_url) {
    logoIn = await loadImageInputFromDataUrl(flyer_prefs.custom_logo_data_url);
  }
  if (flyer_prefs?.custom_bg_data_url) {
    bgIn = await loadImageInputFromDataUrl(flyer_prefs.custom_bg_data_url);
  }

  const slugMatch = share_url.match(/\/fidelity\/([^/?#]+)/);
  const cardSlug = slugMatch ? decodeURIComponent(slugMatch[1]) : "";
  const apiBase = API_BASE || "https://api.myfidpass.fr";
  if (!logoIn && cardSlug) {
    const logoApi = `${apiBase}/api/businesses/${encodeURIComponent(cardSlug)}/public/logo`;
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

void run();
