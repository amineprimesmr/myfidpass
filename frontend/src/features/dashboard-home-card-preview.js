/**
 * Aperçu « page jeu QR » sur l’accueil mobile SaaS — même rendu que la section Page fidélité (statique).
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

const DEFAULT_QR_HERO_TITLE = "Participez au jeu et tentez de gagner une récompense.";

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
 * @param {Record<string, unknown>} settingsData
 * @param {{ label?: string }[]} rouletteSegments
 * @param {string} slug
 * @param {string} apiBase
 * @param {boolean} rouletteEnabled
 */
function applyDashboardHomePreview(settingsData, rouletteSegments, slug, apiBase, rouletteEnabled) {
  const previewRoot = document.getElementById("app-dashboard-home-preview-root");
  const previewTitle = document.getElementById("app-dashboard-home-preview-title");
  const previewLogo = document.getElementById("app-dashboard-home-preview-logo");
  const previewWheel = document.getElementById("app-dashboard-home-preview-wheel");
  const rouletteSection = document.getElementById("app-dashboard-home-roulette-section");
  if (!previewRoot) return;

  const heroRaw =
    settingsData?.fidelity_qr_hero_title != null
      ? String(settingsData.fidelity_qr_hero_title)
      : settingsData?.fidelityQrHeroTitle != null
        ? String(settingsData.fidelityQrHeroTitle)
        : "";
  const hero = String(heroRaw ?? "").trim() || DEFAULT_QR_HERO_TITLE;

  if (previewTitle) {
    const inner = previewTitle.querySelector(".fidelity-qr-hero-title-inner");
    if (inner) inner.textContent = hero;
    else previewTitle.textContent = hero;
  }

  if (previewLogo) {
    const hasWalletLogo = Boolean(settingsData?.logo_url || settingsData?.logoUrl);
    const hasFlyerPrefs = Boolean(
      String(settingsData?.flyer_prefs_updated_at ?? settingsData?.flyerPrefsUpdatedAt ?? "").trim(),
    );
    if (hasWalletLogo || hasFlyerPrefs) {
      const logoSrc = resolveClientLogoImgSrc(
        {
          logoUrl: settingsData.logo_url ?? settingsData.logoUrl,
          logo_updated_at: settingsData.logo_updated_at ?? settingsData.logoUpdatedAt,
          flyer_prefs_updated_at: settingsData?.flyer_prefs_updated_at ?? settingsData?.flyerPrefsUpdatedAt,
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

  const url = settingsData?.fidelity_page_background_url || settingsData?.fidelityPageBackgroundUrl;
  const businessStub = {
    fidelityPageBackgroundUrl: url || "",
    fidelity_page_background_updated_at:
      settingsData?.fidelity_page_background_updated_at ?? settingsData?.fidelityPageBackgroundUpdatedAt,
  };
  const resolved = resolveFidelityPageBackgroundImgSrc(businessStub, slug, apiBase);
  previewRoot.classList.toggle("fidelity-page--client-bg", Boolean(resolved));
  if (resolved) {
    previewRoot.style.setProperty("--fidelity-client-bg", `url("${resolved}")`);
  } else {
    previewRoot.style.removeProperty("--fidelity-client-bg");
  }
  const shellHex = settingsData?.background_color ?? settingsData?.backgroundColor;
  if (typeof shellHex === "string" && /^#[0-9A-Fa-f]{6}$/.test(shellHex.trim())) {
    previewRoot.style.setProperty("--fidelity-qr-shell-bg", shellHex.trim());
  } else {
    previewRoot.style.removeProperty("--fidelity-qr-shell-bg");
  }

  paintPreviewWheel(previewWheel, rouletteSegments);

  if (rouletteSection) {
    rouletteSection.classList.toggle("hidden", !rouletteEnabled);
  }
}

/**
 * @param {{ api: (path: string, opts?: RequestInit) => Promise<Response>; slug: string; pageOrigin?: string }} ctx
 */
export async function syncDashboardHomeCardPreview(ctx) {
  const { api, slug, pageOrigin } = ctx;
  if (!document.getElementById("app-dashboard-home-preview-root")) return;
  const origin =
    (pageOrigin || "").replace(/\/$/, "") ||
    (typeof window !== "undefined" ? window.location.origin.replace(/\/$/, "") : "");
  try {
    const [settingsRes, gamesRes] = await Promise.all([api("/dashboard/settings"), api("/games")]);
    if (!settingsRes.ok) return;
    const data = await settingsRes.json();
    let segments = [];
    let rouletteEnabled = true;
    if (gamesRes.ok) {
      try {
        const g = await gamesRes.json();
        segments = Array.isArray(g.roulette_segments) ? g.roulette_segments : [];
        const gr = Array.isArray(g.games) ? g.games.find((x) => x.game_code === "roulette") : null;
        if (gr) rouletteEnabled = Boolean(gr.enabled);
      } catch (_) {
        segments = [];
      }
    }
    applyDashboardHomePreview(data, segments, slug, origin, rouletteEnabled);
  } catch (_) {}
}
