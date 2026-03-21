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

/** Export pour app.js : même règle que pour API_BASE / proxy Vite. */
export const IS_LOCAL_DEV = IS_LOCALHOST;
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

const AUTH_TOKEN_KEY = "fidpass_token";

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
  setAuthToken(null);
}

const DEV_BYPASS_PAYMENT_KEY = "fidpass_dev_paid";

export function isDevBypassPayment() {
  try {
    if (localStorage.getItem(DEV_BYPASS_PAYMENT_KEY) === "1") return true;
  } catch (_) {}
  return typeof window !== "undefined" && isLocalDevHostname(window.location.hostname);
}

export function setDevBypassPayment(on) {
  try {
    if (on) localStorage.setItem(DEV_BYPASS_PAYMENT_KEY, "1");
    else localStorage.removeItem(DEV_BYPASS_PAYMENT_KEY);
  } catch (_) {}
}

export function getAuthHeaders() {
  const token = getAuthToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (isDevBypassPayment()) headers["X-Dev-Bypass-Payment"] = "1";
  return headers;
}
