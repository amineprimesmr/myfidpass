/**
 * Configuration et helpers d’auth / API (partagés par main.js et éventuellement d’autres modules).
 */
const IS_MYFIDPASS_HOST =
  typeof window !== "undefined" && /(^|\.)myfidpass\.fr$/i.test(window.location.hostname);
const IS_LOCALHOST =
  typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
const RAW_ENV_API_BASE =
  typeof import.meta.env?.VITE_API_URL === "string" ? import.meta.env.VITE_API_URL.trim() : "";

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
  return typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
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
