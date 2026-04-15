/**
 * Configuration et helpers d’auth / API (partagés par main.js et éventuellement d’autres modules).
 */
const IS_MYFIDPASS_HOST =
  typeof window !== "undefined" && /(^|\.)myfidpass\.fr$/i.test(window.location.hostname);

/** True si on est en dev navigateur sur machine locale (localhost, 127.0.0.1, ::1). */
export function isLocalDevHostname(hostname) {
  if (!hostname) return false;
  const h = String(hostname).toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

const IS_LOCALHOST = typeof window !== "undefined" && isLocalDevHostname(window.location.hostname);

const RAW_ENV_API_BASE =
  typeof import.meta.env?.VITE_API_URL === "string" ? import.meta.env.VITE_API_URL.trim() : "";

// En prod sur myfidpass.fr : appeler directement api.myfidpass.fr (CORS déjà autorisé côté Railway).
// Ne pas utiliser /api sur la même origine : sur myfidpass.fr (sans www) Vercel renvoie d’abord une 307
// vers www.myfidpass.fr, ce qui casse fetch (cross-origin + perte possible du Bearer).
// En local : proxy Vite ou URL explicite si VITE_API_URL est défini.
function shouldForceApiSubdomain(base) {
  if (!IS_MYFIDPASS_HOST) return false;
  if (!base) return true;
  if (base.startsWith("/")) return true;
  try {
    const u = new URL(base, window.location.origin);
    return !/(^|\.)api\.myfidpass\.fr$/i.test(u.hostname);
  } catch (_) {
    return true;
  }
}

export const API_BASE =
  IS_LOCALHOST && !RAW_ENV_API_BASE
    ? ""
    : IS_MYFIDPASS_HOST
      ? RAW_ENV_API_BASE || "https://api.myfidpass.fr"
      : shouldForceApiSubdomain(RAW_ENV_API_BASE)
        ? "https://api.myfidpass.fr"
        : RAW_ENV_API_BASE || "";

/** Clé publique Stripe (Payment Element). À définir sur Vercel : `VITE_STRIPE_PUBLISHABLE_KEY`. */
const RAW_STRIPE_PUBLISHABLE_KEY =
  typeof import.meta.env?.VITE_STRIPE_PUBLISHABLE_KEY === "string"
    ? import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY.trim()
    : "";

export const STRIPE_PUBLISHABLE_KEY = RAW_STRIPE_PUBLISHABLE_KEY;

/** Payment Link Stripe unique pour le SaaS (checkout hébergé, code promo prérempli). */
export const STRIPE_SAAS_PAYMENT_LINK = "https://buy.stripe.com/7sYcN53Z72N88et4Cr8Zq01";

export const STRIPE_SAAS_PAYMENT_PROMO_CODE = "MYFID1EURO";

/**
 * URL de paiement abonnement / parcours payant : toujours ce lien + `prefilled_promo_code`, email optionnel.
 * @param {string} [prefilledEmail]
 * @returns {string}
 */
export function buildStripeSaasPaymentUrl(prefilledEmail) {
  try {
    const u = new URL(STRIPE_SAAS_PAYMENT_LINK);
    u.searchParams.set("prefilled_promo_code", STRIPE_SAAS_PAYMENT_PROMO_CODE);
    const em = (prefilledEmail || "").trim();
    if (em) u.searchParams.set("prefilled_email", em);
    return u.toString();
  } catch (_) {
    return `${STRIPE_SAAS_PAYMENT_LINK}?prefilled_promo_code=${encodeURIComponent(STRIPE_SAAS_PAYMENT_PROMO_CODE)}`;
  }
}

/** @returns {boolean} */
export function subscriptionUsesExternalStripePaymentLink() {
  return true;
}

/**
 * @param {string} [email]
 * @returns {string}
 */
export function buildStripeSubscriptionPaymentLinkUrl(email) {
  return buildStripeSaasPaymentUrl(email);
}

const AUTH_TOKEN_KEY = "fidpass_token";
const REFRESH_TOKEN_KEY = "fidpass_refresh_token";
const PENDING_ESTABLISHMENT_KEY = "fidpass_pending_establishment";

export function getAuthToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch (_) {
    return null;
  }
}

export function setAuthToken(token) {
  try {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch (_) {}
}

export function clearAuthToken() {
  const rt = getRefreshToken();
  setAuthToken(null);
  setRefreshToken(null);
  // Révoquer le refresh token côté serveur (fire-and-forget — on ne bloque pas l'UI)
  if (rt) {
    fetch(`${API_BASE}/api/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: rt }),
    }).catch(() => {});
  }
}

export function getRefreshToken() {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch (_) {
    return null;
  }
}

export function setRefreshToken(token) {
  try {
    if (token) localStorage.setItem(REFRESH_TOKEN_KEY, token);
    else localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch (_) {}
}

export function getPendingEstablishment() {
  try {
    const raw = localStorage.getItem(PENDING_ESTABLISHMENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const establishmentName = String(parsed?.establishment_name || parsed?.establishmentName || "").trim();
    const placeId = String(parsed?.google_place_id || parsed?.googlePlaceId || parsed?.place_id || parsed?.placeId || "").trim();
    if (!establishmentName || !placeId) return null;
    return {
      establishment_name: establishmentName,
      google_place_id: placeId,
    };
  } catch (_) {
    return null;
  }
}

export function setPendingEstablishment(input) {
  const establishmentName = String(
    input?.establishment_name || input?.establishmentName || ""
  ).trim();
  const placeId = String(
    input?.google_place_id || input?.googlePlaceId || input?.place_id || input?.placeId || ""
  ).trim();
  if (!establishmentName || !placeId) {
    clearPendingEstablishment();
    return;
  }
  try {
    localStorage.setItem(
      PENDING_ESTABLISHMENT_KEY,
      JSON.stringify({
        establishment_name: establishmentName,
        google_place_id: placeId,
        saved_at: Date.now(),
      })
    );
  } catch (_) {}
}

export function clearPendingEstablishment() {
  try {
    localStorage.removeItem(PENDING_ESTABLISHMENT_KEY);
  } catch (_) {}
}

/**
 * Tente de renouveler l'access token en utilisant le refresh token.
 * En cas de succès, met à jour les tokens en localStorage et retourne le nouvel access token.
 * En cas d'échec (refresh token expiré/révoqué), vide la session.
 * @returns {Promise<string|null>} Nouvel access token, ou null si impossible.
 */
export async function tryRefreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      clearAuthToken();
      return null;
    }
    const data = await res.json();
    if (data.token) setAuthToken(data.token);
    if (data.refreshToken) setRefreshToken(data.refreshToken);
    return data.token ?? null;
  } catch (_) {
    return null;
  }
}

/**
 * Wrapper fetch qui relance automatiquement avec un token rafraîchi en cas de 401.
 * Utilisation : remplacer `fetch(url, opts)` par `fetchWithAuth(url, opts)`.
 * @param {string} url
 * @param {RequestInit} [opts]
 * @returns {Promise<Response>}
 */
export async function fetchWithAuth(url, opts = {}) {
  const headers = { ...opts.headers, ...getAuthHeaders() };
  const res = await fetch(url, { ...opts, headers });
  if (res.status !== 401) return res;

  // Tenter un refresh
  const newToken = await tryRefreshAccessToken();
  if (!newToken) return res; // refresh échoué → retourner le 401 original

  // Rejouer avec le nouveau token
  const retryHeaders = { ...opts.headers, ...getAuthHeaders() };
  return fetch(url, { ...opts, headers: retryHeaders });
}

export function getAuthHeaders() {
  const token = getAuthToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
