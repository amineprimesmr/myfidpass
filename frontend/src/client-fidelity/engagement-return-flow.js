/**
 * Retour après mission externe (réseaux, Trustpilot, etc.) — même illusion que l’avis Google QR :
 * overlay « vérification » puis claim automatique (sans preuve réelle).
 */

export const PENDING_ENGAGEMENT_CLAIM_KEY = "fidelity_pending_engagement_claim";
export const SOCIAL_ENGAGEMENT_RESUME_KEY = "fidelity_social_engagement_resume";

/** Délai mini avant claim auto (aligné avis Google QR : retour rapide accepté). */
export const PENDING_CLAIM_MIN_MS = 0;
export const PENDING_CLAIM_MAX_MS = 24 * 60 * 60 * 1000;

const VERIFY_MIN_MS = 1_200;
const VERIFY_JITTER_MS = 400;

export const EXTERNAL_ENGAGEMENT_ACTION_TYPES = new Set([
  "instagram_follow",
  "tiktok_follow",
  "facebook_follow",
  "twitter_follow",
  "snapchat_follow",
  "linkedin_follow",
  "youtube_follow",
  "trustpilot_review",
  "tripadvisor_review",
]);

const VERIFY_MESSAGES = {
  instagram_follow: [
    "Nous vérifions ton abonnement Instagram…",
    "Merci de patienter encore un instant…",
    "Nous finalisons la mission…",
    "Presque terminé…",
  ],
  tiktok_follow: [
    "Nous vérifions ton abonnement TikTok…",
    "Merci de patienter encore un instant…",
    "Nous finalisons la mission…",
    "Presque terminé…",
  ],
  facebook_follow: [
    "Nous vérifions ton abonnement Facebook…",
    "Merci de patienter encore un instant…",
    "Nous finalisons la mission…",
    "Presque terminé…",
  ],
  twitter_follow: [
    "Nous vérifions ton abonnement X…",
    "Merci de patienter encore un instant…",
    "Nous finalisons la mission…",
    "Presque terminé…",
  ],
  snapchat_follow: [
    "Nous vérifions ton abonnement Snapchat…",
    "Merci de patienter encore un instant…",
    "Nous finalisons la mission…",
    "Presque terminé…",
  ],
  linkedin_follow: [
    "Nous vérifions ton abonnement LinkedIn…",
    "Merci de patienter encore un instant…",
    "Nous finalisons la mission…",
    "Presque terminé…",
  ],
  youtube_follow: [
    "Nous vérifions ton abonnement YouTube…",
    "Merci de patienter encore un instant…",
    "Nous finalisons la mission…",
    "Presque terminé…",
  ],
  trustpilot_review: [
    "Nous vérifions ton avis Trustpilot…",
    "Merci de patienter encore un instant…",
    "Nous finalisons la mission…",
    "Presque terminé…",
  ],
  tripadvisor_review: [
    "Nous vérifions ton avis Tripadvisor…",
    "Merci de patienter encore un instant…",
    "Nous finalisons la mission…",
    "Presque terminé…",
  ],
  default: [
    "Nous vérifions ta mission…",
    "Merci de patienter encore un instant…",
    "Nous finalisons la validation…",
    "Presque terminé…",
  ],
};

export function isExternalEngagementAction(actionType) {
  return EXTERNAL_ENGAGEMENT_ACTION_TYPES.has(String(actionType || "").trim());
}

export function markExternalEngagementPending(slug, actionType) {
  if (!slug || !isExternalEngagementAction(actionType)) return;
  try {
    sessionStorage.setItem(
      PENDING_ENGAGEMENT_CLAIM_KEY,
      JSON.stringify({ slug, actionType, ts: Date.now() }),
    );
    sessionStorage.setItem(SOCIAL_ENGAGEMENT_RESUME_KEY, "1");
  } catch (_) {}
}

/**
 * @returns {null | { slug: string, actionType: string, ts: number } | { waitMs: number, data: object }}
 */
function readPendingClaim(slug) {
  try {
    const raw = sessionStorage.getItem(PENDING_ENGAGEMENT_CLAIM_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.slug !== slug || !data.actionType || !data.ts) return null;
    if (!isExternalEngagementAction(data.actionType)) return null;
    const age = Date.now() - data.ts;
    if (age > PENDING_CLAIM_MAX_MS) return null;
    if (age < PENDING_CLAIM_MIN_MS) {
      return { waitMs: PENDING_CLAIM_MIN_MS - age, data };
    }
    return data;
  } catch {
    return null;
  }
}

function clearPendingClaim() {
  try {
    sessionStorage.removeItem(PENDING_ENGAGEMENT_CLAIM_KEY);
    sessionStorage.removeItem(SOCIAL_ENGAGEMENT_RESUME_KEY);
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

/**
 * @param {HTMLElement} rootEl
 * @param {number} durationMs
 * @param {string[]} messages
 * @returns {() => void}
 */
function startVerifyPanelUx(rootEl, durationMs, messages) {
  const panel = rootEl.querySelector("#fidelity-engagement-panel-verify");
  const msgEl = rootEl.querySelector("#fidelity-engagement-verify-text");
  const bar = rootEl.querySelector("#fidelity-engagement-verify-progress-bar");
  const msgs = messages.length ? messages : VERIFY_MESSAGES.default;

  if (panel) {
    panel.style.setProperty("--verify-duration", `${durationMs}ms`);
  }
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

/**
 * @param {object} opts
 * @param {HTMLElement} opts.rootEl
 * @param {string} opts.slug
 * @param {() => string | null | undefined} opts.getMemberId
 * @param {(slug: string, memberId: string, actionType: string) => Promise<object>} opts.claimEngagement
 * @param {() => Promise<void>} opts.refreshMemberData
 * @param {(message: string) => void} [opts.onSuccess]
 * @param {() => boolean} [opts.isBlocked]
 */
export async function runExternalEngagementReturnClaim(opts) {
  const { rootEl, slug, getMemberId, claimEngagement, refreshMemberData, onSuccess, isBlocked } = opts;
  if (isBlocked?.()) return false;
  const pendingRaw = readPendingClaim(slug);
  if (!pendingRaw) return false;
  if (pendingRaw.waitMs != null) return false;
  const pending = pendingRaw;

  const memberId = getMemberId();
  if (!memberId) return false;

  if (!openVerifyOverlay(rootEl)) return false;

  const durationMs = VERIFY_MIN_MS + Math.floor(Math.random() * VERIFY_JITTER_MS);
  const messages = VERIFY_MESSAGES[pending.actionType] || VERIFY_MESSAGES.default;
  const stopUx = startVerifyPanelUx(rootEl, durationMs, messages);

  await new Promise((r) => globalThis.setTimeout(r, durationMs));

  stopUx();
  const msgEl = rootEl.querySelector("#fidelity-engagement-verify-text");
  const bar = rootEl.querySelector("#fidelity-engagement-verify-progress-bar");
  const panel = rootEl.querySelector("#fidelity-engagement-panel-verify");
  if (msgEl) msgEl.textContent = "Mission validée — merci !";
  if (panel) panel.classList.add("fidelity-qr-modal--verify-done");
  if (bar instanceof HTMLElement) {
    bar.classList.remove("fidelity-qr-verify-progress-bar--animate");
    bar.style.width = "100%";
  }

  clearPendingClaim();

  let claimMessage = "";
  try {
    const claimRes = await claimEngagement(slug, memberId, pending.actionType);
    claimMessage =
      claimRes?.message && typeof claimRes.message === "string" ? claimRes.message.trim() : "";
    await refreshMemberData();
    onSuccess?.(claimMessage);
    await new Promise((r) => globalThis.setTimeout(r, 320));
    closeVerifyOverlay(rootEl);
    if (panel) panel.classList.remove("fidelity-qr-modal--verify-done");
    return true;
  } catch (err) {
    const msg = String(err?.message || err || "").toLowerCase();
    if (msg.includes("déjà") || msg.includes("already_done")) {
      await refreshMemberData();
      closeVerifyOverlay(rootEl);
      if (panel) panel.classList.remove("fidelity-qr-modal--verify-done");
      return true;
    }
    closeVerifyOverlay(rootEl);
    if (panel) panel.classList.remove("fidelity-qr-modal--verify-done");
    return false;
  }
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.rootEl
 * @param {string} opts.slug
 * @param {() => string | null | undefined} opts.getMemberId
 * @param {(slug: string, memberId: string, actionType: string) => Promise<object>} opts.claimEngagement
 * @param {() => Promise<void>} opts.refreshMemberData
 * @param {(message: string) => void} [opts.onSuccess]
 * @param {() => boolean} [opts.isBlocked]
 * @param {AbortSignal} [opts.signal]
 * @returns {() => void}
 */
export function bindExternalEngagementReturnListeners(opts) {
  let running = false;
  let waitTimer = null;
  const signal = opts.signal;

  const resume = () => {
    if (document.visibilityState !== "visible") return;
    if (running) return;
    try {
      if (sessionStorage.getItem(SOCIAL_ENGAGEMENT_RESUME_KEY) !== "1") return;
    } catch {
      return;
    }

    const pendingRaw = readPendingClaim(opts.slug);
    if (pendingRaw?.waitMs != null && pendingRaw.waitMs > 0) {
      if (waitTimer != null) return;
      waitTimer = globalThis.setTimeout(() => {
        waitTimer = null;
        resume();
      }, pendingRaw.waitMs + 40);
      return;
    }

    running = true;
    void runExternalEngagementReturnClaim(opts).finally(() => {
      running = false;
    });
  };

  const optsListener = signal ? { signal } : undefined;
  document.addEventListener("visibilitychange", resume, optsListener);
  globalThis.addEventListener("pageshow", resume, optsListener);
  globalThis.setTimeout(resume, 0);

  return () => {
    if (waitTimer != null) globalThis.clearTimeout(waitTimer);
    document.removeEventListener("visibilitychange", resume);
    globalThis.removeEventListener("pageshow", resume);
  };
}
