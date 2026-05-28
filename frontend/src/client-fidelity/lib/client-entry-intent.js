/** Session parcours jeu QR (flyer / lien ?qr=1), distinct de l’inscription carte classique. */

export function qrGameSessionStorageKey(slug) {
  return `fid_qr_session_${String(slug || "").trim()}`;
}

/**
 * @param {string} slug
 * @param {{ persist?: boolean }} [opts] — persist=true enregistre la session (lien ?qr=1).
 */
export function isQrGameEntryIntent(slug, opts = {}) {
  if (typeof window === "undefined") return false;
  const s = String(slug || "").trim();
  if (!s) return false;

  const sp = new URLSearchParams(window.location.search);
  const qrParam = String(sp.get("qr") || sp.get("jeu") || "").toLowerCase();
  if (["1", "true", "yes"].includes(qrParam)) {
    if (opts.persist !== false) markQrGameSession(s);
    return true;
  }

  try {
    return sessionStorage.getItem(qrGameSessionStorageKey(s)) === "1";
  } catch {
    return false;
  }
}

/** @param {string} slug */
export function markQrGameSession(slug) {
  try {
    sessionStorage.setItem(qrGameSessionStorageKey(slug), "1");
  } catch (_) {}
}

/** @param {string} slug */
export function clearQrGameSession(slug) {
  try {
    sessionStorage.removeItem(qrGameSessionStorageKey(slug));
  } catch (_) {}
}

/**
 * URL publique espace client — `qrGame` ajoute ?qr=1 (flyer, jeu QR).
 * @param {string} origin
 * @param {string} slug
 * @param {{ qrGame?: boolean }} [opts]
 */
export function buildFidelityClientUrl(origin, slug, opts = {}) {
  const o = String(origin || "").replace(/\/$/, "");
  const path = `/fidelity/${encodeURIComponent(String(slug || "").trim())}`;
  if (!opts.qrGame) return `${o}${path}`;
  return `${o}${path}?qr=1`;
}
