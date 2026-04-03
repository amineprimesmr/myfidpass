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
 * `/api/businesses/:slug/public/logo` pour rester sur la même origine que la page.
 * Sinon le JSON peut contenir `http://127.0.0.1:3001/...` alors que la page est sur
 * `http://localhost:5174` → chargement d’image en échec → repli texte « OCALI… ».
 *
 * @param {Record<string, unknown> | null | undefined} business
 * @param {string} slug
 * @param {string} apiBase
 */
export function resolveClientLogoImgSrc(business, slug, apiBase) {
  const path = slug ? `/api/businesses/${encodeURIComponent(slug)}/public/logo` : "";
  if (!path) return "";
  const baseTrim = preferSameOriginApiAssetPaths() ? "" : String(apiBase || "").replace(/\/$/, "");
  const apiLogo = typeof business?.logoUrl === "string" ? business.logoUrl.trim() : "";
  const srcBase = baseTrim ? apiLogo || `${baseTrim}${path}` : path;
  const upd = business?.logo_updated_at ?? business?.logoUpdatedAt;
  const v =
    upd != null && String(upd).trim() !== "" ? encodeURIComponent(String(upd).trim()) : "";
  return v ? `${srcBase}${srcBase.includes("?") ? "&" : "?"}v=${v}` : srcBase;
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
