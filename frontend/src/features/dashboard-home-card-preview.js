/**
 * Aperçu carte Wallet sur l’accueil mobile SaaS (même structure que « Ma carte »).
 */
import { resolveClientLogoImgSrc } from "../client-fidelity/lib/resolve-client-logo-src.js";
import {
  tiersFromApiPayload,
  getDefaultPointTiersBySector,
  getDefaultStampFinalLabelBySector,
} from "./app-card-rules-point-tiers.js";

/** @type {string | null} */
let _dashHomeCardBgObjectUrl = null;
/** @type {string | null} */
let _dashHomeStampIconObjectUrl = null;

function revokeIfBlob(url) {
  if (url && String(url).startsWith("blob:")) {
    try {
      URL.revokeObjectURL(url);
    } catch (_) {}
  }
}

/** Même correspondance que l’aperçu « Ma carte ». */
const STAMP_EMOJI_TO_ICON = {
  "\u2615": "cafe",
  "\uD83C\uDF54": "burger",
  "\uD83C\uDF55": "pizza",
  "\uD83E\uDD50": "croissant",
  "\uD83E\uDD69": "steak",
  "\uD83C\uDF63": "sushi",
  "\uD83E\uDD57": "salade",
  "\uD83C\uDF5E": "riz",
  "\uD83E\uDD56": "baguette",
  "\uD83D\uDC84": "giftsilver",
  "\u2702": "giftsilver",
};

function paintDashHomeStampsGrid(gridEl, iconSrc) {
  if (!gridEl || !iconSrc) return;
  const rows = gridEl.querySelectorAll(".builder-wallet-card-stamps-row");
  rows.forEach((row) => {
    row.innerHTML = "";
    for (let i = 0; i < 5; i++) {
      const span = document.createElement("span");
      span.className = "stamp stamp-img";
      span.setAttribute("aria-hidden", "true");
      const img = document.createElement("img");
      img.src = iconSrc;
      img.alt = "";
      img.width = 48;
      img.height = 48;
      span.appendChild(img);
      row.appendChild(span);
    }
  });
}

/**
 * @param {Record<string, unknown>} data
 * @param {string} slug
 * @param {(path: string, opts?: RequestInit) => Promise<Response>} api
 * @param {string} pageOrigin
 */
function applyDashboardHomeWalletPreview(data, slug, api, pageOrigin) {
  const card = document.getElementById("app-dash-home-wallet-card");
  if (!card || !data) return;

  const origin =
    String(pageOrigin || "").replace(/\/$/, "") ||
    (typeof window !== "undefined" ? window.location.origin.replace(/\/$/, "") : "");

  const orgName = String(data.organization_name ?? data.organizationName ?? "").trim() || "Commerce";
  const bgRaw = data.background_color ?? data.backgroundColor ?? "#1e3a8a";
  const fgRaw = data.foreground_color ?? data.foregroundColor ?? "#ffffff";
  const labelRaw = data.label_color ?? data.labelColor ?? "#dbeafe";
  const bgHex = typeof bgRaw === "string" && bgRaw.startsWith("#") ? bgRaw : `#${bgRaw}`;
  const fgHex = typeof fgRaw === "string" && fgRaw.startsWith("#") ? fgRaw : `#${fgRaw}`;
  const labelHex = typeof labelRaw === "string" && labelRaw.startsWith("#") ? labelRaw : `#${labelRaw}`;

  card.style.setProperty("--wallet-bg", bgHex);
  card.style.setProperty("--wallet-fg", fgHex);
  card.style.setProperty("--wallet-label", labelHex);

  const stripEl = document.getElementById("app-dash-home-wallet-strip");
  if (stripEl) stripEl.style.background = bgHex;

  const bodyEl = document.getElementById("app-dash-home-wallet-body");
  const mainBlockEl = document.getElementById("app-dash-home-main-block");
  const cardBgBannerEl = document.getElementById("app-dash-home-card-bg-banner");

  if (bodyEl) {
    bodyEl.style.color = fgHex;
  }

  let programType = String(data.program_type ?? data.programType ?? "points").toLowerCase();
  if (programType !== "points" && programType !== "stamps") programType = "points";
  const isStamps = programType === "stamps";

  const stripMode = String(data.strip_display_mode ?? data.stripDisplayMode ?? "logo").toLowerCase();
  const useStripText = stripMode === "text";
  const stripText = String(data.strip_text ?? data.stripText ?? "").trim() || orgName;

  const orgEl = document.getElementById("app-dash-home-org");
  const logoWrap = document.getElementById("app-dash-home-logo-wrap");
  const stripImg = document.getElementById("app-dash-home-strip-img");
  const stripTextEl = document.getElementById("app-dash-home-strip-text");
  const walletLogo = document.getElementById("app-dash-home-wallet-logo");
  const logoFallback = document.getElementById("app-dash-home-logo-fallback");

  if (orgEl) {
    orgEl.textContent = orgName;
    orgEl.classList.toggle("hidden", useStripText);
  }

  if (stripImg) {
    stripImg.removeAttribute("src");
    stripImg.classList.add("hidden");
  }
  if (stripTextEl) {
    if (useStripText) {
      stripTextEl.textContent = stripText;
      stripTextEl.classList.remove("hidden");
    } else {
      stripTextEl.textContent = "";
      stripTextEl.classList.add("hidden");
    }
  }
  if (logoWrap) {
    logoWrap.style.display = useStripText ? "none" : "";
  }

  const hasServerLogo = !!(data.logo_url || data.logoUrl);
  if (walletLogo) {
    if (hasServerLogo && !useStripText) {
      walletLogo.src = resolveClientLogoImgSrc(
        {
          logoUrl: data.logo_url ?? data.logoUrl,
          logo_updated_at: data.logo_updated_at ?? data.logoUpdatedAt,
          flyer_prefs_updated_at: data.flyer_prefs_updated_at ?? data.flyerPrefsUpdatedAt,
        },
        slug,
        origin,
      );
      walletLogo.classList.remove("hidden");
    } else {
      walletLogo.removeAttribute("src");
      walletLogo.classList.add("hidden");
    }
  }
  if (logoFallback) {
    const logoShown = !!(walletLogo && walletLogo.getAttribute("src") && !walletLogo.classList.contains("hidden"));
    logoFallback.classList.toggle("hidden", !!useStripText || logoShown);
  }

  const sectorRaw = String(data.sector ?? "");
  const tiersPayload = data.points_reward_tiers ?? data.pointsRewardTiers;
  const parsedTiers = tiersFromApiPayload(tiersPayload);
  const tiers =
    !isStamps && parsedTiers.length > 0
      ? parsedTiers
      : !isStamps
        ? getDefaultPointTiersBySector(sectorRaw)
        : [];
  const firstTier = tiers[0];

  const ptsWrap = document.getElementById("app-dash-home-pts-wrap");
  const stampsWrap = document.getElementById("app-dash-home-stamps-wrap");
  const bandeauEl = document.getElementById("app-dash-home-bandeau");
  const stampsGridEl = document.getElementById("app-dash-home-stamps-grid");
  const rewardWrap = document.getElementById("app-dash-home-reward-wrap");
  const restantsWrap = document.getElementById("app-dash-home-restants-wrap");
  const restantsValueEl = document.getElementById("app-dash-home-restants");
  const restantsLabelEl = document.getElementById("app-dash-home-restants-label");
  const valueEl = document.getElementById("app-dash-home-wallet-value");
  const labelEl = document.getElementById("app-dash-home-wallet-label");
  const rewardValueEl = document.getElementById("app-dash-home-wallet-reward");
  const headerRightEl = document.getElementById("app-dash-home-header-right");
  const memberLabelEl = document.getElementById("app-dash-home-member-label");

  const hasCardBg = !!(data.has_card_background ?? data.hasCardBackground);
  const showPointsOrStamps = !hasCardBg;

  if (headerRightEl) headerRightEl.textContent = "Récompenses " + String.fromCharCode(0x2197);
  if (memberLabelEl) memberLabelEl.textContent = "Membre";

  if (hasCardBg) {
    if (mainBlockEl) mainBlockEl.style.background = bgHex;
    if (bodyEl) {
      bodyEl.style.background = "transparent";
      bodyEl.style.backgroundImage = "none";
    }
    if (cardBgBannerEl) {
      cardBgBannerEl.classList.add("hidden");
      cardBgBannerEl.setAttribute("aria-hidden", "true");
      cardBgBannerEl.style.backgroundImage = "none";
    }
    revokeIfBlob(_dashHomeCardBgObjectUrl);
    _dashHomeCardBgObjectUrl = null;
    api("/card-background?v=" + Date.now())
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (!blob || !cardBgBannerEl || !bodyEl || !mainBlockEl) return;
        revokeIfBlob(_dashHomeCardBgObjectUrl);
        _dashHomeCardBgObjectUrl = URL.createObjectURL(blob);
        bodyEl.style.background = "transparent";
        cardBgBannerEl.classList.remove("hidden");
        cardBgBannerEl.setAttribute("aria-hidden", "false");
        cardBgBannerEl.style.backgroundImage = `url(${_dashHomeCardBgObjectUrl})`;
        cardBgBannerEl.style.backgroundSize = "cover";
        cardBgBannerEl.style.backgroundPosition = "center";
        cardBgBannerEl.style.backgroundRepeat = "no-repeat";
        mainBlockEl.style.background = bgHex;
      })
      .catch(() => {});
  } else {
    revokeIfBlob(_dashHomeCardBgObjectUrl);
    _dashHomeCardBgObjectUrl = null;
    if (bodyEl) {
      bodyEl.style.background = bgHex;
      bodyEl.style.backgroundImage = "none";
    }
    if (mainBlockEl) mainBlockEl.style.removeProperty("background");
    if (cardBgBannerEl) {
      cardBgBannerEl.classList.add("hidden");
      cardBgBannerEl.setAttribute("aria-hidden", "true");
      cardBgBannerEl.style.backgroundImage = "none";
    }
  }

  if (ptsWrap) ptsWrap.classList.toggle("hidden", isStamps || !showPointsOrStamps);
  if (stampsWrap) stampsWrap.classList.toggle("hidden", !isStamps || !showPointsOrStamps);
  if (bandeauEl) {
    if (isStamps && showPointsOrStamps) {
      bandeauEl.classList.remove("hidden");
      bandeauEl.style.background = bgHex;
    } else {
      bandeauEl.classList.add("hidden");
    }
  }
  if (rewardWrap) rewardWrap.classList.toggle("hidden", !!isStamps);
  if (restantsWrap) restantsWrap.classList.toggle("hidden", !isStamps || !showPointsOrStamps);

  const requiredStamps = Number(data.required_stamps ?? data.requiredStamps ?? 10) || 10;
  if (restantsValueEl && isStamps) restantsValueEl.textContent = "= " + String(requiredStamps);
  const lr = String(data.label_restants ?? data.labelRestants ?? "").trim();
  if (restantsLabelEl) restantsLabelEl.textContent = lr || "Restants";

  if (valueEl) valueEl.textContent = isStamps ? "" : "0";
  if (labelEl) labelEl.textContent = isStamps ? "Tampons" : "Points";

  if (rewardValueEl && !isStamps) {
    rewardValueEl.textContent = firstTier?.label?.trim() || "Paliers en magasin";
  } else if (rewardValueEl && isStamps) {
    const fin = String(data.stamp_reward_label ?? data.stampRewardLabel ?? "").trim();
    rewardValueEl.textContent = fin || getDefaultStampFinalLabelBySector(sectorRaw);
  }

  const stampEmoji = String(data.stamp_emoji ?? data.stampEmoji ?? "\u2615").trim() || "\u2615";
  const iconName = STAMP_EMOJI_TO_ICON[stampEmoji] || "cafe";
  const defaultStampIconSrc = `/assets/icons/${iconName}.png`;

  revokeIfBlob(_dashHomeStampIconObjectUrl);
  _dashHomeStampIconObjectUrl = null;

  if (isStamps && stampsGridEl && showPointsOrStamps) {
    if (data.has_stamp_icon ?? data.hasStampIcon) {
      api("/stamp-icon?v=" + Date.now())
        .then((r) => (r.ok ? r.blob() : null))
        .then((blob) => {
          if (!blob || !stampsGridEl) return;
          revokeIfBlob(_dashHomeStampIconObjectUrl);
          _dashHomeStampIconObjectUrl = URL.createObjectURL(blob);
          paintDashHomeStampsGrid(stampsGridEl, _dashHomeStampIconObjectUrl);
        })
        .catch(() => {
          paintDashHomeStampsGrid(stampsGridEl, defaultStampIconSrc);
        });
    } else {
      paintDashHomeStampsGrid(stampsGridEl, defaultStampIconSrc);
    }
  }

  const qr = document.getElementById("app-dash-home-wallet-qr");
  if (qr && slug) {
    const link = `${origin}/fidelity/${encodeURIComponent(slug)}`;
    qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(link)}`;
    qr.alt = "QR code — page fidélité";
  }
}

/**
 * @param {{ api: (path: string, opts?: RequestInit) => Promise<Response>; slug: string; pageOrigin?: string }} ctx
 */
export async function syncDashboardHomeCardPreview(ctx) {
  const { api, slug, pageOrigin } = ctx;
  if (!document.getElementById("app-dash-home-wallet-card")) return;
  const origin =
    (pageOrigin || "").replace(/\/$/, "") ||
    (typeof window !== "undefined" ? window.location.origin.replace(/\/$/, "") : "");
  try {
    const settingsRes = await api("/dashboard/settings");
    if (!settingsRes.ok) return;
    const data = await settingsRes.json();
    applyDashboardHomeWalletPreview(data, slug, api, origin);
  } catch (_) {}
}
