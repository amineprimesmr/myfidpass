/**
 * Sur myfidpass.fr, forcer des chemins relatifs `/api/...` : même origine que la page
 * (rewrite Vercel → API). Les URLs absolues vers api.myfidpass.fr peuvent être bloquées
 * par Cross-Origin-Resource-Policy sur la réponse API → image cassée dans le hero QR.
 */
function preferSameOriginApiAssetPaths() {
  try {
    const h = globalThis.location?.hostname;
    return typeof h === "string" && /(^|\.)myfidpass\.fr$/i.test(h);
  } catch (_) {
    return false;
  }
}

/**
 * @param {Record<string, unknown> | null | undefined} business
 */
export function businessHasFlyerCustomLogo(business) {
  if (!business || typeof business !== "object") return false;
  if (business.has_flyer_custom_logo === true || business.hasFlyerCustomLogo === true) return true;
  if (business.has_flyer_custom_logo === false || business.hasFlyerCustomLogo === false) return false;
  const raw = typeof business.logoUrl === "string" ? business.logoUrl.trim() : "";
  const pathOnly = (raw.split("?")[0] || "").toLowerCase();
  return /\/public\/flyer-qr-logo$/i.test(pathOnly);
}

/**
 * URL à mettre dans <img src> pour le logo commerce (page fidélité / jeu QR).
 * Priorité : logo importé dans le flyer ; sinon logo de la carte fidélité Wallet.
 *
 * @param {Record<string, unknown> | null | undefined} business
 * @param {string} slug
 * @param {string} apiBase
 */
export function resolveClientLogoImgSrc(business, slug, apiBase) {
  const useFlyer = businessHasFlyerCustomLogo(business);
  const asset = useFlyer ? "flyer-qr-logo" : "logo";
  const path = slug ? `/api/businesses/${encodeURIComponent(slug)}/public/${asset}` : "";
  if (!path) return "";
  const baseTrim = preferSameOriginApiAssetPaths() ? "" : String(apiBase || "").replace(/\/$/, "");
  const apiLogoRaw = typeof business?.logoUrl === "string" ? business.logoUrl.trim() : "";
  const pathOnly = (apiLogoRaw.split("?")[0] || "").toLowerCase();
  const apiLogoMatchesAsset =
    apiLogoRaw.length > 0 &&
    (pathOnly.endsWith(`/public/${asset}`) || pathOnly.endsWith(`/public/${asset}/`));
  const apiLogo = apiLogoMatchesAsset ? apiLogoRaw : "";
  const srcBase = baseTrim ? apiLogo || `${baseTrim}${path}` : path;
  const logoUpd = business?.logo_updated_at ?? business?.logoUpdatedAt;
  const flyerPrefsUpd = business?.flyer_prefs_updated_at ?? business?.flyerPrefsUpdatedAt;
  const vParts = useFlyer
    ? [flyerPrefsUpd, logoUpd]
    : [logoUpd, flyerPrefsUpd];
  const v = vParts
    .filter((x) => x != null && String(x).trim() !== "")
    .map((x) => String(x).trim())
    .join("|");
  return v ? `${srcBase}${srcBase.includes("?") ? "&" : "?"}v=${encodeURIComponent(v)}` : srcBase;
}

/** Repli explicite logo carte (ex. `onerror` si l’URL flyer est encore en cache). */
export function resolveClientWalletLogoImgSrc(business, slug, apiBase) {
  const path = slug ? `/api/businesses/${encodeURIComponent(slug)}/public/logo` : "";
  if (!path) return "";
  const baseTrim = preferSameOriginApiAssetPaths() ? "" : String(apiBase || "").replace(/\/$/, "");
  const upd = business?.logo_updated_at ?? business?.logoUpdatedAt;
  const srcBase = baseTrim ? `${baseTrim}${path}` : path;
  const v = upd != null && String(upd).trim() !== "" ? encodeURIComponent(String(upd).trim()) : "";
  return v ? `${srcBase}?v=${v}` : srcBase;
}

/**
 * Icône marque **campagnes / notifications** (`GET …/notification-icon`) — uniquement pour ces écrans.
 * Ne pas utiliser pour le **hero jeu QR** : utiliser `resolveClientLogoImgSrc`.
 *
 * @param {Record<string, unknown> | null | undefined} business
 * @param {string} slug
 * @param {string} apiBase
 */
export function resolveClientNotificationIconImgSrc(business, slug, apiBase) {
  const apiNotifUrl = typeof business?.notificationIconUrl === "string" ? business.notificationIconUrl.trim() : "";
  if (!apiNotifUrl) return "";
  const path = slug ? `/api/businesses/${encodeURIComponent(slug)}/notification-icon` : "";
  if (!path) return "";
  const baseTrim = preferSameOriginApiAssetPaths() ? "" : String(apiBase || "").replace(/\/$/, "");
  const srcBase = baseTrim ? apiNotifUrl || `${baseTrim}${path}` : path;
  const upd = business?.notification_icon_updated_at ?? business?.notificationIconUpdatedAt;
  const v =
    upd != null && String(upd).trim() !== "" ? encodeURIComponent(String(upd).trim()) : "";
  return v ? `${srcBase}${srcBase.includes("?") ? "&" : "?"}v=${v}` : srcBase;
}

/**
 * Fond page /fidelity/:slug — image importée manuellement par le commerçant.
 *
 * @param {Record<string, unknown> | null | undefined} business
 * @param {string} slug
 * @param {string} apiBase
 * @returns {string} chaîne vide si pas de fond configuré
 */
export function resolveFidelityPageBackgroundImgSrc(business, slug, apiBase) {
  if (!slug) return "";
  const path = `/api/businesses/${encodeURIComponent(slug)}/fidelity-page-background`;
  const baseTrim = preferSameOriginApiAssetPaths() ? "" : String(apiBase || "").replace(/\/$/, "");

  const raw = business?.fidelityPageBackgroundUrl ?? business?.fidelity_page_background_url ?? "";
  if (!String(raw).trim()) return "";

  const srcBase = baseTrim ? `${baseTrim}${path}` : path;
  const upd = business?.fidelityPageBackgroundUpdatedAt ?? business?.fidelity_page_background_updated_at;
  const v = upd != null && String(upd).trim() !== "" ? encodeURIComponent(String(upd).trim()) : "";
  return v ? `${srcBase}?v=${v}` : srcBase;
}
