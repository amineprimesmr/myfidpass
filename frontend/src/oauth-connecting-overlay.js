/**
 * Overlay plein écran pendant OAuth (Apple / Google) — UX type « connexion en cours ».
 */
import "./oauth-connecting-overlay.css";

const OVERLAY_ID = "fidpass-oauth-connecting";
const SAFETY_MS = 90_000;

let safetyTimer = null;
let previousBodyOverflow = "";
/** Empêche le callback « moment » Google de masquer l’overlay pendant l’échange backend. */
let googleCredentialFlowActive = false;

const APPLE_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36" aria-hidden="true"><path fill="#fff" d="M16.125 1.204c-1.47 0-2.97.84-3.9 2.04-.78.96-1.44 2.46-1.2 3.9 1.56.12 3.12-.84 3.96-2.04.78-1.08 1.38-2.58 1.14-3.9zM20.38 16.02c-.36 1.26-.78 2.46-1.44 3.66-.78 1.44-1.56 2.82-2.82 2.82-1.26 0-1.56-.78-2.94-.78-1.38 0-1.74.78-2.94.78-1.26 0-2.22-1.26-3-2.7-1.62-2.82-1.86-5.46-.78-7.02.78-1.14 2.04-1.86 3.18-1.86 1.2 0 1.92.78 2.94.78 1.02 0 1.68-.78 2.94-.78 1.02 0 2.1.66 2.88 1.74-2.52 1.38-2.1 4.98.42 5.94z"/></svg>`;

function clearSafetyTimer() {
  if (safetyTimer) {
    clearTimeout(safetyTimer);
    safetyTimer = null;
  }
}

function applyProvider(root, provider) {
  const title = root.querySelector(".fidpass-oauth-connecting__title");
  const slot = root.querySelector(".fidpass-oauth-connecting__provider");
  if (!(title instanceof HTMLElement) || !slot) return;
  if (provider === "apple") {
    title.textContent = "Connexion en cours à Apple";
    slot.innerHTML = APPLE_MARK_SVG;
  } else {
    title.textContent = "Connexion en cours à Google";
    slot.innerHTML =
      '<img src="/assets/logos/google.png" alt="" width="36" height="36" decoding="async" />';
  }
}

function ensureOverlay() {
  let root = document.getElementById(OVERLAY_ID);
  if (root) return root;
  root = document.createElement("div");
  root.id = OVERLAY_ID;
  root.className = "fidpass-oauth-connecting";
  root.setAttribute("hidden", "");
  root.setAttribute("aria-hidden", "true");
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  root.innerHTML = `
    <div class="fidpass-oauth-connecting__inner">
      <h1 class="fidpass-oauth-connecting__title">Connexion en cours</h1>
      <p class="fidpass-oauth-connecting__sub">Cela ne prendra qu’un instant…</p>
      <div class="fidpass-oauth-connecting__row">
        <div class="fidpass-oauth-connecting__brand">
          <img src="/assets/icone.png" alt="" width="46" height="46" decoding="async" />
        </div>
        <span class="fidpass-oauth-connecting__dash fidpass-oauth-connecting__dash--l" aria-hidden="true"></span>
        <div class="fidpass-oauth-connecting__spin-wrap">
          <div class="fidpass-oauth-connecting__spin" aria-hidden="true"></div>
        </div>
        <span class="fidpass-oauth-connecting__dash fidpass-oauth-connecting__dash--r" aria-hidden="true"></span>
        <div class="fidpass-oauth-connecting__provider"></div>
      </div>
    </div>`;
  document.body.appendChild(root);
  return root;
}

/**
 * Appelé dès qu’un jeton Google est reçu (avant le fetch backend) pour ignorer les événements « dismiss » du prompt.
 */
export function markGoogleCredentialFlowStarted() {
  googleCredentialFlowActive = true;
}

/**
 * Callback optionnel pour `google.accounts.id.prompt(handleGooglePromptMoment)` (One Tap).
 */
export function handleGooglePromptMoment(notification) {
  if (googleCredentialFlowActive) return;
  if (!notification) return;
  if (typeof notification.isNotDisplayed === "function" && notification.isNotDisplayed()) {
    hideOAuthConnectingOverlay();
    return;
  }
  if (typeof notification.isSkippedMoment === "function" && notification.isSkippedMoment()) {
    hideOAuthConnectingOverlay();
    return;
  }
  if (typeof notification.isDismissedMoment === "function" && notification.isDismissedMoment()) {
    hideOAuthConnectingOverlay();
  }
}

/**
 * @param {"apple" | "google"} provider
 */
export function showOAuthConnectingOverlay(provider) {
  const root = ensureOverlay();
  applyProvider(root, provider === "apple" ? "apple" : "google");
  clearSafetyTimer();
  safetyTimer = window.setTimeout(() => {
    hideOAuthConnectingOverlay();
  }, SAFETY_MS);
  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  root.removeAttribute("hidden");
  root.setAttribute("aria-hidden", "false");
}

export function hideOAuthConnectingOverlay() {
  clearSafetyTimer();
  googleCredentialFlowActive = false;
  const root = document.getElementById(OVERLAY_ID);
  if (root) {
    root.setAttribute("hidden", "");
    root.setAttribute("aria-hidden", "true");
  }
  document.body.style.overflow = previousBodyOverflow;
}
