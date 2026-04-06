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
  const apiLogo = typeof business?.logoUrl === "string" ? business.logoUrl.trim() : "";
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
 * Icône marque alignée sur l’aperçu **campagnes / notifications** (`GET …/notification-icon`),
 * pas sur `/public/logo` (rendu bandeau Wallet). À utiliser pour le hero parcours QR et le
 * chargement route si l’on veut la même image que le média « icône notif » du tableau de bord.
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
 * @param {Record<string, unknown> | null | undefined} business
 * @param {string} slug
 * @param {string} apiBase
 * @returns {string} chaîne vide si pas de fond configuré
 */
export function resolveFidelityPageBackgroundImgSrc(business, slug, apiBase) {
  const path = slug ? `/api/businesses/${encodeURIComponent(slug)}/fidelity-page-background` : "";
  const raw =
    business?.fidelityPageBackgroundUrl ?? business?.fidelity_page_background_url ?? "";
  if (!path || String(raw).trim() === "") return "";
  const baseTrim = preferSameOriginApiAssetPaths() ? "" : String(apiBase || "").replace(/\/$/, "");
  const srcBase = baseTrim ? `${baseTrim}${path}` : path;
  const upd =
    business?.fidelityPageBackgroundUpdatedAt ?? business?.fidelity_page_background_updated_at;
  const v =
    upd != null && String(upd).trim() !== "" ? encodeURIComponent(String(upd).trim()) : "";
  return v ? `${srcBase}${srcBase.includes("?") ? "&" : "?"}v=${v}` : srcBase;
}
