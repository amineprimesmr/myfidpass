/**
 * Aperçu page jeu QR (même HTML/CSS que /fidelity/:slug en parcours invité).
 * Données : window.__FIDPASS_FLYER_B64__ (même JSON que flyer-embed).
 */
import { mergeFlyerState } from "./features/app-flyer-qr-presets.js";
import { renderQrGamePage } from "./client-fidelity/ui/qr-game-markup.js";
import { renderRouletteInlineMarkup } from "./client-fidelity/ui/roulette-inline-markup.js";
import { applyFidelityClientPageBackground } from "./client-fidelity/lib/apply-fidelity-client-bg.js";
import { resolveClientLogoImgSrc } from "./client-fidelity/lib/resolve-client-logo-src.js";
import {
  applyWheelFaceGradient,
  buildWheelSegmentHtml,
  DEFAULT_WHEEL_LABELS,
  WHEEL_SEGMENT_COUNT,
} from "./client-fidelity/lib/wheel-segments.js";

import "./style.css";
import "./fidelity-missions.css";
import "./fidelity-missions-gift-cta.css";
import "./fidelity-roulette-3d.css";
import "./fidelity-qr-game-flow.css";
import "./fidelity-powered-by.css";
import "./fidelity-qr-verify-panel.css";
import "./fidelity-qr-hero-thanks.css";
import "./fidelity-wheel-gift.css";
import "./fidelity-qr-game-layout-force.css";

function esc(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseBootstrap() {
  const b64 =
    typeof window.__FIDPASS_FLYER_B64__ === "string" && window.__FIDPASS_FLYER_B64__
      ? window.__FIDPASS_FLYER_B64__
      : document.getElementById("fidpass-flyer-b64")?.textContent?.trim() || "";
  if (!b64) return { flyer_prefs: null, share_url: "", updated_at: null };
  try {
    const api = JSON.parse(atob(b64));
    return {
      flyer_prefs: api.flyer_prefs ?? null,
      share_url: typeof api.share_url === "string" ? api.share_url : "",
      updated_at: typeof api.updated_at === "string" && api.updated_at.trim() ? api.updated_at.trim() : null,
    };
  } catch (_) {
    return { flyer_prefs: null, share_url: "", updated_at: null };
  }
}

/** @param {Record<string, unknown>} state */
function flyerStateToFlyerColorsRecord(state) {
  const hex = (v) => {
    const s = String(v ?? "").trim();
    return /^#[0-9A-Fa-f]{6}$/i.test(s) ? s : null;
  };
  /** @type {Record<string, string>} */
  const out = {};
  const ctaBg = hex(state.ctaBannerBgColor);
  const ctaText = hex(state.ctaTextColor);
  const wOdd = hex(state.wheelColorOdd);
  const wEven = hex(state.wheelColorEven);
  if (ctaBg) out.ctaBg = ctaBg;
  if (ctaText) out.ctaText = ctaText;
  if (wOdd) out.wheelOdd = wOdd;
  if (wEven) out.wheelEven = wEven;
  return out;
}

/**
 * @param {HTMLElement} rootEl
 * @param {{ colorOdd?: string | null, colorEven?: string | null }} cols
 */
function initQrEmbedWheel(rootEl, cols) {
  const wheelEl = rootEl.querySelector("#fidelity-roulette-wheel");
  if (!wheelEl) return;
  const n = WHEEL_SEGMENT_COUNT;
  applyWheelFaceGradient(wheelEl, n, {
    colorOdd: cols.colorOdd ?? null,
    colorEven: cols.colorEven ?? null,
  });
  wheelEl.style.transform = "rotate(0deg)";

  const escapeHtml = (str) => {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  };

  const segmentHtml = DEFAULT_WHEEL_LABELS.map((_, i) =>
    buildWheelSegmentHtml({
      segmentIndex: i,
      segmentCount: n,
      escapeHtml,
    }),
  ).join("");

  const fill = wheelEl.querySelector(".fidelity-roulette-wheel-bg");
  let shine = wheelEl.querySelector(".fidelity-roulette-wheel-shine");
  if (!shine) {
    shine = document.createElement("div");
    shine.className = "fidelity-roulette-wheel-shine";
    shine.setAttribute("aria-hidden", "true");
    if (fill) {
      fill.after(shine);
    } else {
      wheelEl.insertBefore(shine, wheelEl.firstChild);
    }
  }
  let disc = wheelEl.querySelector(".fidelity-roulette-wheel-disc");
  if (!disc) {
    disc = document.createElement("div");
    disc.className = "fidelity-roulette-wheel-disc";
    wheelEl.appendChild(disc);
  }
  disc.innerHTML = segmentHtml;
}

function renderQrGamePreviewFromCurrentBootstrap() {
  const { flyer_prefs, share_url, updated_at } = parseBootstrap();
  const app = document.getElementById("fidelity-app");
  if (!app) return;

  const state = mergeFlyerState(
    flyer_prefs?.state && typeof flyer_prefs.state === "object" && !Array.isArray(flyer_prefs.state)
      ? /** @type {import("./features/app-flyer-qr-presets.js").FlyerState} */ (flyer_prefs.state)
      : null,
  );

  const slugFromPrefs =
    flyer_prefs &&
    typeof flyer_prefs.business_slug === "string" &&
    flyer_prefs.business_slug.trim().length > 0
      ? flyer_prefs.business_slug.trim()
      : "";
  const slugMatch = share_url.match(/\/fidelity\/([^/?#]+)/);
  const cardSlug = slugFromPrefs || (slugMatch ? decodeURIComponent(slugMatch[1]) : "");

  /** Logo hero : data URL éditeur, sinon même repli `/public/flyer-qr-logo` que la prod. */
  const hasLogoKey =
    flyer_prefs != null && typeof flyer_prefs === "object" && Object.prototype.hasOwnProperty.call(flyer_prefs, "custom_logo_data_url");
  const rawLogo = hasLogoKey ? /** @type {{ custom_logo_data_url?: unknown }} */ (flyer_prefs).custom_logo_data_url : undefined;

  let logoUrl = "";
  if (typeof rawLogo === "string" && rawLogo.startsWith("data:image/")) {
    logoUrl = rawLogo;
  } else if (hasLogoKey && rawLogo === "") {
    logoUrl = "";
  } else if (cardSlug) {
    logoUrl = resolveClientLogoImgSrc(
      {
        logoUrl: "",
        flyer_prefs_updated_at: updated_at ?? undefined,
      },
      cardSlug,
      "",
    );
  }

  const defaultHero = "Participez au jeu et tentez de gagner une récompense.";
  const tagline = defaultHero;

  const fcRec = flyerStateToFlyerColorsRecord(state);
  const business = {
    flyerColors: fcRec,
    flyer_prefs_updated_at: updated_at ?? undefined,
  };

  const rouletteHtml = renderRouletteInlineMarkup(esc, {
    tickets: 1,
    spinCtaAriaLabel: "Jouer la partie — lancer la roue",
    ticketStatusDotClass: "fidelity-cta-pill-dot",
    variant: "qr",
  });

  app.innerHTML = renderQrGamePage(esc, {
    businessNameEsc: esc("Aperçu"),
    businessTaglineEsc: esc(tagline),
    rouletteHtml,
    googleReviewUrl: "",
    logoUrl,
    qrThanksHeroMode: false,
  });

  applyFidelityClientPageBackground(business);
  initQrEmbedWheel(app, {
    colorOdd: fcRec.wheelOdd ?? null,
    colorEven: fcRec.wheelEven ?? null,
  });
}

if (typeof window !== "undefined") {
  window.__FIDPASS_QR_GAME_APPLY__ = () => {
    renderQrGamePreviewFromCurrentBootstrap();
  };
}

function shouldAutoRenderOnLoad() {
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

if (shouldAutoRenderOnLoad()) {
  renderQrGamePreviewFromCurrentBootstrap();
}
