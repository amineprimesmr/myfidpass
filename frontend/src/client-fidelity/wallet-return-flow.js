/**
 * Retour Safari après ajout Apple / Google Wallet — même principe que l’avis Google :
 * clé sessionStorage + visibility/pageshow + overlay « vérification » + polling membre + rerender.
 */
import { markRewardsWalletUnlocked } from "./lib/wallet-rewards-gate.js";

export const APPLE_WALLET_PENDING_KEY = "fidelity_apple_wallet_pending";
export const GOOGLE_WALLET_PENDING_KEY = "fidelity_google_wallet_pending";
export const WALLET_HERO_REVEAL_KEY = "fidelity_wallet_hero_reveal";

const VERIFY_MIN_MS = 1_100;
const VERIFY_JITTER_MS = 350;
/** PassKit peut enregistrer le device quelques secondes après le retour Safari. */
export const WALLET_REGISTRATION_POLL_MS = [0, 600, 1_400, 2_800, 4_500, 7_000];

const VERIFY_MESSAGES_APPLE = [
  "Nous vérifions l’ajout à Apple Wallet…",
  "Synchronisation de ta carte…",
  "Presque prêt…",
];
const VERIFY_MESSAGES_GOOGLE = [
  "Nous vérifions l’ajout à Google Wallet…",
  "Synchronisation de ta carte…",
  "Presque prêt…",
];

export function markAppleWalletPending(slug) {
  markWalletPending(slug, "apple");
}

export function markGoogleWalletPending(slug) {
  markWalletPending(slug, "google");
}

function markWalletPending(slug, platform) {
  if (!slug) return;
  const key = platform === "google" ? GOOGLE_WALLET_PENDING_KEY : APPLE_WALLET_PENDING_KEY;
  try {
    sessionStorage.setItem(key, JSON.stringify({ slug, ts: Date.now(), platform }));
  } catch (_) {}
}

function readWalletPending(slug) {
  for (const key of [APPLE_WALLET_PENDING_KEY, GOOGLE_WALLET_PENDING_KEY]) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) continue;
      const data = JSON.parse(raw);
      if (data.slug !== slug) continue;
      return { key, platform: data.platform || (key === APPLE_WALLET_PENDING_KEY ? "apple" : "google") };
    } catch {
      continue;
    }
  }
  return null;
}

function clearWalletPending(key) {
  try {
    sessionStorage.removeItem(key);
  } catch (_) {}
}

function openVerifyOverlay(rootEl) {
  const root = rootEl.querySelector("#fidelity-engagement-verify-root");
  if (!root) return false;
  root.classList.remove("hidden");
  root.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  return true;
}

function closeVerifyOverlay(rootEl) {
  const root = rootEl.querySelector("#fidelity-engagement-verify-root");
  if (!root) return;
  root.classList.add("hidden");
  root.setAttribute("aria-hidden", "true");
  if (!document.querySelector("#fidelity-qr-modal-root:not(.hidden)")) {
    document.body.style.overflow = "";
  }
}

function startVerifyPanelUx(rootEl, durationMs, messages, title) {
  const panel = rootEl.querySelector("#fidelity-engagement-panel-verify");
  const titleEl = rootEl.querySelector("#fidelity-engagement-verify-title");
  const msgEl = rootEl.querySelector("#fidelity-engagement-verify-text");
  const bar = rootEl.querySelector("#fidelity-engagement-verify-progress-bar");
  const msgs = messages.length ? messages : VERIFY_MESSAGES_APPLE;

  if (titleEl && title) titleEl.textContent = title;
  if (panel) panel.style.setProperty("--verify-duration", `${durationMs}ms`);
  if (bar) {
    bar.classList.remove("fidelity-qr-verify-progress-bar--animate");
    bar.getBoundingClientRect();
    bar.classList.add("fidelity-qr-verify-progress-bar--animate");
  }
  let idx = 0;
  if (msgEl) msgEl.textContent = msgs[0];
  const step = Math.max(260, Math.floor(durationMs / (msgs.length + 1)));
  const id = window.setInterval(() => {
    idx = (idx + 1) % msgs.length;
    if (msgEl) msgEl.textContent = msgs[idx];
  }, step);
  return () => window.clearInterval(id);
}

function memberAppleWalletReady(member) {
  if (!member) return false;
  return member.apple_wallet_registered === true || member.appleWalletRegistered === true;
}

async function pollMemberAppleWalletReady(getMember, slug, memberId) {
  for (const delay of WALLET_REGISTRATION_POLL_MS) {
    if (delay > 0) await new Promise((r) => globalThis.setTimeout(r, delay));
    const member = await getMember(slug, memberId);
    if (memberAppleWalletReady(member)) return member;
  }
  return null;
}

export function scheduleWalletHeroReveal() {
  try {
    sessionStorage.setItem(WALLET_HERO_REVEAL_KEY, "1");
  } catch (_) {}
}

export function consumeWalletHeroReveal() {
  try {
    if (sessionStorage.getItem(WALLET_HERO_REVEAL_KEY) !== "1") return false;
    sessionStorage.removeItem(WALLET_HERO_REVEAL_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {HTMLElement} rootEl
 */
export function runWalletReadyHeroReveal(rootEl) {
  const cta = rootEl.querySelector(".fidelity-v2-hero-member .fidelity-earn-points-cta-wrap");
  if (!cta) return;
  cta.classList.add("fidelity-earn-points-cta-wrap--revealed");
  globalThis.setTimeout(() => cta.classList.remove("fidelity-earn-points-cta-wrap--revealed"), 2_400);
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.rootEl
 * @param {string} opts.slug
 * @param {() => string | null | undefined} opts.getMemberId
 * @param {(slug: string, memberId: string) => Promise<object>} opts.getMember
 * @param {() => Promise<void>} opts.refreshMemberData
 * @param {() => boolean} [opts.isBlocked]
 * @returns {Promise<boolean>}
 */
export async function runWalletReturnRefresh(opts) {
  const { rootEl, slug, getMemberId, getMember, refreshMemberData, isBlocked } = opts;
  if (isBlocked?.()) return false;

  const pending = readWalletPending(slug);
  if (!pending) return false;

  const memberId = getMemberId();
  if (!memberId) return false;

  const state = opts.getState?.();
  if (pending.platform === "apple" && state?.member && memberAppleWalletReady(state.member)) {
    clearWalletPending(pending.key);
    markRewardsWalletUnlocked(slug, memberId);
    return false;
  }

  const messages =
    pending.platform === "google" ? VERIFY_MESSAGES_GOOGLE : VERIFY_MESSAGES_APPLE;
  const title =
    pending.platform === "google"
      ? "Validation Google Wallet"
      : "Validation Apple Wallet";

  if (!openVerifyOverlay(rootEl)) {
    clearWalletPending(pending.key);
    await refreshMemberData();
    return true;
  }

  const durationMs = VERIFY_MIN_MS + Math.floor(Math.random() * VERIFY_JITTER_MS);
  const stopUx = startVerifyPanelUx(rootEl, durationMs, messages, title);
  await new Promise((r) => globalThis.setTimeout(r, durationMs));
  stopUx();

  const msgEl = rootEl.querySelector("#fidelity-engagement-verify-text");
  const bar = rootEl.querySelector("#fidelity-engagement-verify-progress-bar");
  const panel = rootEl.querySelector("#fidelity-engagement-panel-verify");
  if (msgEl) msgEl.textContent = "Carte détectée — mise à jour…";

  let success = false;
  if (pending.platform === "google") {
    await refreshMemberData();
    success = true;
  } else {
    const member = await pollMemberAppleWalletReady(getMember, slug, memberId);
    success = Boolean(member);
    if (success) await refreshMemberData();
  }
  clearWalletPending(pending.key);

  if (success) {
    markRewardsWalletUnlocked(slug, memberId);
    if (panel) panel.classList.add("fidelity-qr-modal--verify-done");
    if (bar instanceof HTMLElement) {
      bar.classList.remove("fidelity-qr-verify-progress-bar--animate");
      bar.style.width = "100%";
    }
    scheduleWalletHeroReveal();
    await new Promise((r) => globalThis.setTimeout(r, 280));
    closeVerifyOverlay(rootEl);
    if (panel) panel.classList.remove("fidelity-qr-modal--verify-done");
    return true;
  }

  closeVerifyOverlay(rootEl);
  if (panel) panel.classList.remove("fidelity-qr-modal--verify-done");
  await refreshMemberData();
  return false;
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.rootEl
 * @param {string} opts.slug
 * @param {() => string | null | undefined} opts.getMemberId
 * @param {(slug: string, memberId: string) => Promise<object>} opts.getMember
 * @param {() => Promise<void>} opts.refreshMemberData
 * @param {() => object} [opts.getState]
 * @param {() => boolean} [opts.isBlocked]
 * @param {AbortSignal} [opts.signal]
 * @returns {() => void}
 */
export function bindWalletReturnListeners(opts) {
  let running = false;
  const signal = opts.signal;

  const resume = () => {
    if (document.visibilityState !== "visible") return;
    if (running) return;
    if (!readWalletPending(opts.slug)) return;
    running = true;
    void runWalletReturnRefresh(opts).finally(() => {
      running = false;
    });
  };

  const optsListener = signal ? { signal } : undefined;
  document.addEventListener("visibilitychange", resume, optsListener);
  globalThis.addEventListener("pageshow", resume, optsListener);
  globalThis.setTimeout(resume, 0);

  return () => {
    document.removeEventListener("visibilitychange", resume);
    globalThis.removeEventListener("pageshow", resume);
  };
}
