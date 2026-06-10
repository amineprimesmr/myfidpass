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

/** Promise partagée : évite de re-télécharger stripe.js à chaque montage du checkout. */
let stripeJsPromise = null;

/**
 * @returns {Promise<import("@stripe/stripe-js").Stripe | null> | null}
 */
export function getStripeJs() {
  if (!STRIPE_PUBLISHABLE_KEY || typeof window === "undefined") return null;
  if (!stripeJsPromise) {
    stripeJsPromise = import("@stripe/stripe-js").then(({ loadStripe }) => loadStripe(STRIPE_PUBLISHABLE_KEY));
  }
  return stripeJsPromise;
}

/** Lance le chargement réseau de stripe.js dès que la route paiement est connue (chevauche React + fetch API). */
export function warmStripeJs() {
  void getStripeJs();
}

/** Payment Link Stripe (fallback legacy — préférer `/paiement` intégré). */
export const STRIPE_SAAS_PAYMENT_LINK = "https://buy.stripe.com/7sYcN53Z72N88et4Cr8Zq01";

/** @deprecated Ne plus préremplir de code promo — le 1 € 1er mois est appliqué côté API (coupon Stripe). */
export const STRIPE_SAAS_PAYMENT_PROMO_CODE = "MYFID1EURO";

/**
 * URL checkout abonnement (alias → `/paiement` intégré).
 * @param {string} [prefilledEmail]
 * @returns {string}
 */
export function buildStripeSaasPaymentUrl(prefilledEmail) {
  return resolveSaasSubscriptionPaymentUrl(prefilledEmail);
}

/** Payment Link Stripe — abonnement annuel (legacy, masqué dans l’app). */
const RAW_STRIPE_ANNUAL_PAYMENT_LINK =
  typeof import.meta.env?.VITE_STRIPE_ANNUAL_PAYMENT_LINK === "string"
    ? import.meta.env.VITE_STRIPE_ANNUAL_PAYMENT_LINK.trim()
    : "";

export const STRIPE_ANNUAL_PAYMENT_LINK =
  RAW_STRIPE_ANNUAL_PAYMENT_LINK || "https://buy.stripe.com/fZufZh7bjbjEeCR4Cr8Zq03";

/** @deprecated Ne plus préremplir automatiquement — codes promo saisis manuellement sur Stripe. */
export const STRIPE_ANNUAL_PAYMENT_PROMO_CODE = "";

/**
 * URL Payment Link abonnement annuel (legacy).
 * @param {string} [prefilledEmail]
 * @returns {string}
 */
export function buildStripeAnnualPaymentUrl(prefilledEmail) {
  try {
    const u = new URL(STRIPE_ANNUAL_PAYMENT_LINK);
    const em = (prefilledEmail || "").trim();
    if (em) u.searchParams.set("prefilled_email", em);
    return u.toString();
  } catch (_) {
    return STRIPE_ANNUAL_PAYMENT_LINK;
  }
}

/** WebView native (`?app_embed=1`) : checkout intégré `/paiement`. */
export function isSaasPaymentEmbeddedInNativeApp() {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("app_embed") === "1";
  } catch (_) {
    return false;
  }
}

/** Toujours checkout intégré — le 1 € 1er mois est appliqué côté API, pas via Payment Link + promo auto. */
export function subscriptionUsesExternalStripePaymentLink() {
  return false;
}

/**
 * URL cible abonnement SaaS : page `/paiement` (Payment Element + coupon 1 € côté API).
 * @param {string} [prefilledEmail]
 */
export function resolveSaasSubscriptionPaymentUrl(prefilledEmail) {
  let path = buildPaymentPathWithAuthHandoff("/paiement");
  const em = (prefilledEmail || "").trim();
  if (!em) return path;
  try {
    const hashIdx = path.indexOf("#");
    const pathWithoutHash = hashIdx >= 0 ? path.slice(0, hashIdx) : path;
    const hash = hashIdx >= 0 ? path.slice(hashIdx) : "";
    const u = new URL(pathWithoutHash, typeof window !== "undefined" ? window.location.origin : "https://www.myfidpass.fr");
    u.searchParams.set("prefilled_email", em);
    if (isSaasPaymentEmbeddedInNativeApp()) u.searchParams.set("app_embed", "1");
    return `${u.pathname}${u.search}${hash}`;
  } catch (_) {
    return path;
  }
}

/**
 * @param {string} [email]
 * @returns {string}
 */
export function buildStripeSubscriptionPaymentLinkUrl(email) {
  return buildStripeSaasPaymentUrl(email);
}

/** E-mail connecté affiché dans l’app (`#app-user-email`) pour préremplir Stripe Checkout. */
export function guessLoggedInUserEmailForStripe() {
  if (typeof document === "undefined") return "";
  try {
    const el = document.getElementById("app-user-email");
    const t = (el?.textContent || "").trim();
    if (t && t.includes("@")) return t;
  } catch (_) {}
  return "";
}

/** Redirection abonnement SaaS (Payment Link PC ou page intégrée iOS). */
export function redirectToStripeSaasPayment(email) {
  if (typeof window === "undefined") return;
  const em =
    (email && String(email).trim()) || guessLoggedInUserEmailForStripe();
  window.location.href = resolveSaasSubscriptionPaymentUrl(em);
}

const AUTH_TOKEN_KEY = "fidpass_token";
const REFRESH_TOKEN_KEY = "fidpass_refresh_token";
const PENDING_ESTABLISHMENT_KEY = "fidpass_pending_establishment";
const PENDING_ESTABLISHMENTS_KEY = "fidpass_pending_establishments";

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

/** Dispatche après restauration session (hash ou natif) pour relancer le checkout embarqué. */
export const FIDPASS_AUTH_RESTORED_EVENT = "fidpass-auth-restored";

/**
 * Lit `#fid_auth=` / `#fid_refresh=` (fragment, non envoyé au serveur), enregistre les tokens puis nettoie l’URL.
 * À utiliser quand la page paiement s’ouvre hors du même contexte de stockage que l’app (Safari, autre WebView, nouvelle fenêtre).
 * @returns {boolean} true si au moins un token a été importé
 */
export function consumeAuthTransferFromHash() {
  if (typeof window === "undefined") return false;
  try {
    const hashRaw = window.location.hash.replace(/^#/, "").trim();
    if (!hashRaw) return false;
    const sp = new URLSearchParams(hashRaw);
    const access =
      sp.get("fid_auth") || sp.get("access_token") || sp.get("token");
    const refresh = sp.get("fid_refresh") || sp.get("refresh_token");
    let consumed = false;
    if (access && access.trim()) {
      setAuthToken(access.trim());
      consumed = true;
    }
    if (refresh && refresh.trim()) {
      setRefreshToken(refresh.trim());
      consumed = true;
    }
    if (consumed && typeof window.history?.replaceState === "function") {
      const clean = `${window.location.pathname}${window.location.search}`;
      window.history.replaceState(null, "", clean);
    }
    if (consumed && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent(FIDPASS_AUTH_RESTORED_EVENT));
    }
    return consumed;
  } catch (_) {
    return false;
  }
}

/** Origines autorisées pour le pont natif → Web (postMessage). */
function isAllowedMyfidpassOrigin(origin) {
  const o = String(origin || "");
  if (/^https:\/\/(www\.)?myfidpass\.fr$/i.test(o)) return true;
  if (/^http:\/\/localhost(?::\d+)?$/i.test(o)) return true;
  if (/^http:\/\/127\.0\.0\.1(?::\d+)?$/i.test(o)) return true;
  return false;
}

/**
 * Écoute `postMessage` depuis un wrapper natif (WKWebView, etc.) pour injecter la session.
 * Payload attendu : `{ type: "FIDPASS_AUTH", accessToken: string, refreshToken?: string }`
 * ou `{ source: "fidpass-native", accessToken, refreshToken }`.
 */
export function wireNativeAuthBridge() {
  if (typeof window === "undefined") return;
  if (window.__fidpassNativeAuthBridgeWired) return;
  window.__fidpassNativeAuthBridgeWired = true;
  window.addEventListener("message", (event) => {
    if (!isAllowedMyfidpassOrigin(event.origin)) return;
    const d = event.data;
    if (!d || typeof d !== "object") return;
    const okBridge =
      d.type === "FIDPASS_AUTH" ||
      d.source === "fidpass-native" ||
      d.source === "MyFidPassNative";
    if (!okBridge) return;
    const at =
      d.accessToken ||
      d.token ||
      d.access_token ||
      (d.payload && (d.payload.accessToken || d.payload.token));
    const rt =
      d.refreshToken ||
      d.refresh_token ||
      (d.payload && (d.payload.refreshToken || d.payload.refresh_token));
    let wrote = false;
    if (at && typeof at === "string") {
      setAuthToken(at.trim());
      wrote = true;
    }
    if (rt && typeof rt === "string") {
      setRefreshToken(rt.trim());
      wrote = true;
    }
    if (wrote && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent(FIDPASS_AUTH_RESTORED_EVENT));
    }
  });
}

/**
 * Chemin pour ouvrir le paiement avec transfert explicite des tokens (nouvelle WebView / même onglet après navigation SPA).
 * @param {string} [basePath="/paiement"]
 * @returns {string}
 */
export function buildPaymentPathWithAuthHandoff(basePath = "/paiement") {
  const path = basePath.startsWith("/") ? basePath : `/${basePath}`;
  const t = getAuthToken();
  if (!t) return path;
  const rt = getRefreshToken();
  let frag = `fid_auth=${encodeURIComponent(t)}`;
  if (rt) frag += `&fid_refresh=${encodeURIComponent(rt)}`;
  return `${path}#${frag}`;
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

/** @param {string | null | undefined} token */
function parseJwtExpMs(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = payload.length % 4;
    if (pad) payload += "=".repeat(4 - pad);
    const json = JSON.parse(atob(payload));
    const exp = json?.exp;
    if (typeof exp === "number" && Number.isFinite(exp)) return exp * 1000;
    return null;
  } catch (_) {
    return null;
  }
}

/** Une seule rotation refresh web à la fois (évite d’invalider le refresh côté serveur en parallèle avec l’app native). */
let webRefreshInFlight = null;

/**
 * JWT encore valide (marge 120 s) → retourne l’access token.
 * Sinon POST /api/auth/refresh avec le refresh stocké en localStorage.
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<string|null>}
 */
export async function ensureWebSessionFresh(opts = {}) {
  const { forceRefresh = false } = opts;
  if (typeof window === "undefined") return getAuthToken();

  // WebView iOS : le natif gère POST /auth/refresh (Keychain). Un refresh web consommerait la rotation et casserait l’app.
  if (isSaasPaymentEmbeddedInNativeApp()) {
    return getAuthToken();
  }

  const current = getAuthToken();
  const expMs = parseJwtExpMs(current);
  const leewayMs = 120_000;
  if (!forceRefresh && current && expMs && expMs - Date.now() > leewayMs) {
    return current;
  }

  if (webRefreshInFlight) return webRefreshInFlight;

  webRefreshInFlight = (async () => {
    const rt = getRefreshToken();
    if (!rt) return current || null;
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ refreshToken: rt }),
      });
      const data = await res.json().catch(() => (/** @type {Record<string, unknown>} */ ({})));
      if (!res.ok) {
        if (res.status === 401) clearAuthToken();
        return null;
      }
      const access = String(data?.token || data?.access_token || "").trim();
      if (!access) return null;
      setAuthToken(access);
      const newRt = String(data?.refreshToken || data?.refresh_token || "").trim();
      if (newRt) setRefreshToken(newRt);
      if (typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new CustomEvent(FIDPASS_AUTH_RESTORED_EVENT));
      }
      return access;
    } catch (_) {
      return current || null;
    } finally {
      webRefreshInFlight = null;
    }
  })();

  return webRefreshInFlight;
}

/**
 * Injection session depuis l’app native (WKWebView) — mêmes clés que `getAuthToken` / `setAuthToken`.
 * @param {string} accessToken
 * @param {string} [refreshToken]
 */
export function applyAuthTokensToWebStorage(accessToken, refreshToken) {
  const access = String(accessToken || "").trim();
  if (access) setAuthToken(access);
  const refresh = String(refreshToken || "").trim();
  if (refresh) setRefreshToken(refresh);
  if (access || refresh) {
    if (typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent(FIDPASS_AUTH_RESTORED_EVENT));
    }
  }
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

const BUSINESS_PLACE_ALREADY_LINKED_HINT =
  "Ce commerce est déjà utilisé. Connectez-vous au compte existant ou choisissez un autre commerce.";

/**
 * Vérifie côté API si un lieu Google peut servir à une nouvelle inscription (pas déjà lié à un commerce).
 * @param {string} googlePlaceId
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function checkGooglePlaceAvailable(googlePlaceId) {
  const pid = String(googlePlaceId || "").trim();
  if (!pid) return { ok: false, message: BUSINESS_PLACE_ALREADY_LINKED_HINT };
  try {
    const res = await fetch(`${API_BASE}/api/auth/check-google-place`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ google_place_id: pid }),
    });
    const data = await res.json().catch(() => (/** @type {Record<string, unknown>} */ ({})));
    if (!res.ok) {
      const msg =
        String(/** @type {string | undefined} */ (data?.message || data?.error) || "").trim() ||
        "Impossible de vérifier ce commerce. Réessayez.";
      return { ok: false, message: msg };
    }
    if (data.place_available === false) {
      const msg =
        String(/** @type {string | undefined} */ (data?.error || data?.message) || "").trim() ||
        BUSINESS_PLACE_ALREADY_LINKED_HINT;
      return { ok: false, message: msg };
    }
    return { ok: true, message: "" };
  } catch (_) {
    return { ok: false, message: "Impossible de vérifier ce commerce. Réessayez." };
  }
}

export function clearPendingEstablishment() {
  try {
    localStorage.removeItem(PENDING_ESTABLISHMENT_KEY);
  } catch (_) {}
}

export function getPendingEstablishments() {
  try {
    const raw = localStorage.getItem(PENDING_ESTABLISHMENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => ({
        establishment_name: String(entry?.establishment_name || "").trim(),
        google_place_id: String(entry?.google_place_id || "").trim(),
      }))
      .filter((entry) => entry.establishment_name && entry.google_place_id);
  } catch (_) {
    return [];
  }
}

export function setPendingEstablishments(entries) {
  if (!Array.isArray(entries)) return;
  const cleaned = entries
    .map((entry) => ({
      establishment_name: String(entry?.establishment_name || entry?.establishmentName || "").trim(),
      google_place_id: String(entry?.google_place_id || entry?.googlePlaceId || entry?.place_id || "").trim(),
    }))
    .filter((entry) => entry.establishment_name && entry.google_place_id);
  try {
    if (cleaned.length === 0) {
      localStorage.removeItem(PENDING_ESTABLISHMENTS_KEY);
      return;
    }
    localStorage.setItem(PENDING_ESTABLISHMENTS_KEY, JSON.stringify(cleaned));
  } catch (_) {}
}

export function clearPendingEstablishments() {
  try {
    localStorage.removeItem(PENDING_ESTABLISHMENTS_KEY);
  } catch (_) {}
}

/**
 * Tente de renouveler l'access token en utilisant le refresh token.
 * En cas de succès, met à jour les tokens en localStorage et retourne le nouvel access token.
 * En cas d'échec (refresh token expiré/révoqué), vide la session.
 * @returns {Promise<string|null>} Nouvel access token, ou null si impossible.
 */
export async function tryRefreshAccessToken() {
  if (isSaasPaymentEmbeddedInNativeApp()) return getAuthToken();
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
