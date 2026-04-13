/**
 * Retour navigateur OAuth → app : Universal Link https://myfidpass.fr/oauth/…
 * (pages statiques Vercel qui redirigent vers myfidpass://) ou repli myfidpass:// direct.
 *
 * Railway : MYFIDPASS_OAUTH_RETURN_BASE=https://myfidpass.fr/oauth
 */
const UL_BASE = (process.env.MYFIDPASS_OAUTH_RETURN_BASE || "").trim().replace(/\/$/, "");

const SCHEME_PATH = {
  tiktok: "myfidpass://oauth-tiktok",
  meta: "myfidpass://oauth-meta",
  "google-youtube": "myfidpass://oauth-google-youtube",
  "google-business": "myfidpass://oauth-google-business",
};

/**
 * @param {"tiktok"|"meta"|"google-youtube"|"google-business"} kind
 * @param {Record<string, string | string[] | undefined>} query
 */
export function buildNativeOAuthReturnUrl(kind, query) {
  const pathSeg =
    kind === "google-youtube" ? "google-youtube" : kind === "google-business" ? "google-business" : kind;
  if (UL_BASE.startsWith("https://")) {
    const u = new URL(`${UL_BASE}/${pathSeg}`);
    for (const [k, v] of Object.entries(query)) {
      if (v == null || v === "") continue;
      u.searchParams.set(k, Array.isArray(v) ? String(v[0]) : String(v));
    }
    return u.toString();
  }
  const scheme = SCHEME_PATH[kind];
  if (!scheme) return SCHEME_PATH.tiktok;
  const u = new URL(scheme);
  for (const [k, v] of Object.entries(query)) {
    if (v == null || v === "") continue;
    u.searchParams.set(k, Array.isArray(v) ? String(v[0]) : String(v));
  }
  return u.toString();
}
