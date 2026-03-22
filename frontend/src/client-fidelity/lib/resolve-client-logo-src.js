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
  const baseTrim = String(apiBase || "").replace(/\/$/, "");
  const apiLogo = typeof business?.logoUrl === "string" ? business.logoUrl.trim() : "";
  const srcBase = baseTrim ? apiLogo || `${baseTrim}${path}` : path;
  const upd = business?.logo_updated_at ?? business?.logoUpdatedAt;
  const v =
    upd != null && String(upd).trim() !== "" ? encodeURIComponent(String(upd).trim()) : "";
  return v ? `${srcBase}${srcBase.includes("?") ? "&" : "?"}v=${v}` : srcBase;
}
