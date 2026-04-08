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
 * @param {string | null | undefined} s
 * @returns {number}
 */
function parseIsoToMs(s) {
  if (s == null || String(s).trim() === "") return 0;
  const t = Date.parse(String(s));
  return Number.isFinite(t) ? t : 0;
}

/**
 * URL à mettre dans <img src> pour le logo commerce (page fidélité / jeu).
 * Quand apiBase est vide (proxy Vite), on utilise toujours un chemin **relatif**
 * `/api/businesses/:slug/public/flyer-qr-logo` pour rester sur la même origine que la page.
 * Sinon le JSON peut contenir `http://127.0.0.1:3001/...` alors que la page est sur
 * `http://localhost:5174` → chargement d’image en échec → repli texte « OCALI… ».
 *
 * @param {Record<string, unknown> | null | undefined} business
 * @param {string} slug
 * @param {string} apiBase
 */
export function resolveClientLogoImgSrc(business, slug, apiBase) {
  const path = slug ? `/api/businesses/${encodeURIComponent(slug)}/public/flyer-qr-logo` : "";
  if (!path) return "";
  const baseTrim = preferSameOriginApiAssetPaths() ? "" : String(apiBase || "").replace(/\/$/, "");
  const apiLogoRaw = typeof business?.logoUrl === "string" ? business.logoUrl.trim() : "";
  /** Ne jamais suivre une URL « bandeau Wallet » : le hero jeu QR doit appeler `/public/flyer-qr-logo` (logo flyer si en base). */
  const pathOnly = (apiLogoRaw.split("?")[0] || "").toLowerCase();
  const apiLogoLooksWallet =
    apiLogoRaw.length > 0 &&
    /\/public\/logo$/i.test(pathOnly) &&
    !/\/public\/flyer-qr-logo/i.test(pathOnly);
  const apiLogo = apiLogoLooksWallet ? "" : apiLogoRaw;
  const srcBase = baseTrim ? apiLogo || `${baseTrim}${path}` : path;
  const upd = business?.logo_updated_at ?? business?.logoUpdatedAt;
  const flyerPrefsUpd = business?.flyer_prefs_updated_at ?? business?.flyerPrefsUpdatedAt;
  const vParts = [upd, flyerPrefsUpd]
    .filter((x) => x != null && String(x).trim() !== "")
    .map((x) => String(x).trim());
  const v = vParts.length ? vParts.join("|") : "";
  return v ? `${srcBase}${srcBase.includes("?") ? "&" : "?"}v=${encodeURIComponent(v)}` : srcBase;
}

/**
 * Icône marque **campagnes / notifications** (`GET …/notification-icon`) — uniquement pour ces écrans.
 * Ne pas utiliser pour le **hero jeu QR** : utiliser `resolveClientLogoImgSrc` (logo Flyer IA `/public/flyer-qr-logo`).
 *
 * @param {Record<string, unknown> | null | undefined} business
 * @param {string} slug
 * @param {string} apiBase
 */
export function resolveClientNotificationIconImgSrc(business, slug, apiBase) {
  const path = slug ? `/api/businesses/${encodeURIComponent(slug)}/notification-icon` : "";
  if (!path) return "";
  const baseTrim = preferSameOriginApiAssetPaths() ? "" : String(apiBase || "").replace(/\/$/, "");
  const apiNotifUrl = typeof business?.notificationIconUrl === "string" ? business.notificationIconUrl.trim() : "";
  const srcBase = baseTrim ? apiNotifUrl || `${baseTrim}${path}` : path;
  const upd =
    business?.notification_icon_updated_at ??
    business?.notificationIconUpdatedAt ??
    business?.logo_icon_updated_at ??
    business?.logoIconUpdatedAt ??
    business?.logo_updated_at ??
    business?.logoUpdatedAt;
  const v =
    upd != null && String(upd).trim() !== "" ? encodeURIComponent(String(upd).trim()) : "";
  return v ? `${srcBase}${srcBase.includes("?") ? "&" : "?"}v=${v}` : srcBase;
}

/**
 * Fond page /fidelity/:slug — même stratégie que le logo : sur myfidpass.fr, chemin relatif
 * `/api/businesses/:slug/fidelity-page-background` (rewrite Vercel) pour éviter CORP sur l’URL API en `background-image`.
 *
 * Règle produit : si le commerce a **à la fois** un asset « Page fidélité » (upload / 2ᵉ image IA)
 * **et** un fond enregistré dans les **prefs flyer** (`custom_bg_data_url`), on affiche le plus **récent**
 * (même visuel que le flyer composé quand l’utilisateur vient de valider le flyer IA).
 *
 * @param {Record<string, unknown> | null | undefined} business
 * @param {string} slug
 * @param {string} apiBase
 * @returns {string} chaîne vide si pas de fond configuré
 */
export function resolveFidelityPageBackgroundImgSrc(business, slug, apiBase) {
  const path = slug ? `/api/businesses/${encodeURIComponent(slug)}/fidelity-page-background` : "";
  const flyerPath = `/api/businesses/${encodeURIComponent(slug)}/public/flyer-custom-bg`;
  const baseTrim = preferSameOriginApiAssetPaths() ? "" : String(apiBase || "").replace(/\/$/, "");

  const rawFidelity =
    business?.fidelityPageBackgroundUrl ?? business?.fidelity_page_background_url ?? "";
  const rawFlyer =
    business?.flyerCustomBgUrl ?? business?.flyer_custom_bg_url ?? business?.flyerCustomBgURL ?? "";

  const hasFidelityAsset = path && String(rawFidelity).trim() !== "";
  const hasFlyerBg = Boolean(slug && String(rawFlyer).trim() !== "");

  if (!hasFidelityAsset && !hasFlyerBg) return "";

  const fidMs = parseIsoToMs(
    business?.fidelityPageBackgroundUpdatedAt ?? business?.fidelity_page_background_updated_at,
  );
  const flyerMs = parseIsoToMs(business?.flyer_prefs_updated_at ?? business?.flyerPrefsUpdatedAt);

  /** Fond prefs flyer plus récent (ou égal) que l’asset page fidélité → alignement avec le flyer validé. */
  const preferFlyer = hasFlyerBg && (!hasFidelityAsset || flyerMs >= fidMs);

  if (preferFlyer) {
    const srcBase = baseTrim ? `${baseTrim}${flyerPath}` : flyerPath;
    const upd = business?.flyer_prefs_updated_at ?? business?.flyerPrefsUpdatedAt;
    const v =
      upd != null && String(upd).trim() !== "" ? encodeURIComponent(String(upd).trim()) : "";
    return v ? `${srcBase}${srcBase.includes("?") ? "&" : "?"}v=${v}` : srcBase;
  }

  if (hasFidelityAsset) {
    const srcBase = baseTrim ? `${baseTrim}${path}` : path;
    const upd =
      business?.fidelityPageBackgroundUpdatedAt ?? business?.fidelity_page_background_updated_at;
    const v =
      upd != null && String(upd).trim() !== "" ? encodeURIComponent(String(upd).trim()) : "";
    return v ? `${srcBase}${srcBase.includes("?") ? "&" : "?"}v=${v}` : srcBase;
  }

  const srcBase = baseTrim ? `${baseTrim}${flyerPath}` : flyerPath;
  const upd = business?.flyer_prefs_updated_at ?? business?.flyerPrefsUpdatedAt;
  const v =
    upd != null && String(upd).trim() !== "" ? encodeURIComponent(String(upd).trim()) : "";
  return v ? `${srcBase}${srcBase.includes("?") ? "&" : "?"}v=${v}` : srcBase;
}
