/**
 * Interstitiel mobile après paiement Stripe : invite à télécharger l’app native.
 * Déclenché si l’URL contient session_id (success_url Stripe) et viewport ≤ 768px.
 */
const STORAGE_KEY = "fidpass_post_purchase_app_modal_session";

/** @returns {string | null} */
export function parseCheckoutSessionId(search) {
  const q = typeof search === "string" ? search.replace(/^\?/, "") : "";
  const id = new URLSearchParams(q).get("session_id");
  if (!id || !/^cs_[a-zA-Z0-9_]+$/.test(id)) return null;
  return id;
}

export function isPostPurchaseMobileViewport() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(max-width: 768px)").matches;
}

/**
 * @param {{ iosUrl?: string, androidUrl?: string, userAgent?: string }} opts
 * @returns {string}
 */
export function resolveNativeAppStoreUrl(opts = {}) {
  const ios = (opts.iosUrl ?? "").trim();
  const android = (opts.androidUrl ?? "").trim();
  const ua = opts.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent || "" : "");
  const isApple = /iPhone|iPad|iPod/i.test(ua);
  if (isApple && ios) return ios;
  if (!isApple && android) return android;
  if (ios) return ios;
  if (android) return android;
  if (isApple) return "https://apps.apple.com/fr/search?term=Myfidpass";
  return "https://play.google.com/store/search?q=Myfidpass&c=apps";
}

function readEnvStoreUrls() {
  const ios =
    typeof import.meta !== "undefined" && typeof import.meta.env?.VITE_APP_STORE_IOS_URL === "string"
      ? import.meta.env.VITE_APP_STORE_IOS_URL.trim()
      : "";
  const android =
    typeof import.meta !== "undefined" && typeof import.meta.env?.VITE_APP_STORE_ANDROID_URL === "string"
      ? import.meta.env.VITE_APP_STORE_ANDROID_URL.trim()
      : "";
  return { ios, android };
}

function stripSessionIdFromUrl() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("session_id")) return;
    url.searchParams.delete("session_id");
    const next = url.pathname + (url.search ? url.search : "") + url.hash;
    window.history.replaceState(null, "", next);
  } catch {
    /* ignore */
  }
}

function wasSeenForSession(sessionId) {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === sessionId;
  } catch {
    return false;
  }
}

function markSeen(sessionId) {
  try {
    sessionStorage.setItem(STORAGE_KEY, sessionId);
  } catch {
    /* ignore */
  }
}

/**
 * Affiche la modale si les conditions sont réunies (app déjà chargée, abonnement OK).
 */
export function maybeShowPostPurchaseAppModal() {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const sessionId = parseCheckoutSessionId(window.location.search);
  if (!sessionId || !isPostPurchaseMobileViewport()) return;

  if (wasSeenForSession(sessionId)) {
    stripSessionIdFromUrl();
    return;
  }

  const root = document.getElementById("post-purchase-app-modal");
  const cta = document.getElementById("post-purchase-app-modal-cta");
  const closeBtn = document.getElementById("post-purchase-app-modal-close");
  if (!root || !cta || !closeBtn) return;

  const { ios, android } = readEnvStoreUrls();
  cta.href = resolveNativeAppStoreUrl({ iosUrl: ios, androidUrl: android });

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    root.classList.add("hidden");
    root.setAttribute("aria-hidden", "true");
    document.body.classList.remove("post-purchase-app-modal-open");
    markSeen(sessionId);
    stripSessionIdFromUrl();
    closeBtn.removeEventListener("click", onCloseClick);
    root.removeEventListener("click", onBackdropClick);
  }

  function onCloseClick(e) {
    e.preventDefault();
    close();
  }

  function onBackdropClick(e) {
    if (e.target === root) close();
  }

  markSeen(sessionId);
  stripSessionIdFromUrl();

  root.classList.remove("hidden");
  root.setAttribute("aria-hidden", "false");
  document.body.classList.add("post-purchase-app-modal-open");

  closeBtn.addEventListener("click", onCloseClick);
  root.addEventListener("click", onBackdropClick);

  requestAnimationFrame(() => closeBtn.focus());
}
