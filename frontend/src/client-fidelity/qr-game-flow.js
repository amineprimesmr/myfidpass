/**
 * Parcours QR : déblocage après étape Google, modales vérif → gain + opt-in (prénom + email) en une seule étape.
 */

import { applyQrThanksHero, runQrThanksHeroTransition } from "./qr-game-hero-thanks.js";

export const QR_GATE_KEY = "fid_qr_spin_gate";
export const QR_GOOGLE_PENDING_KEY = "fid_qr_google_pending";
/** Après retour de l’avis Google : hero « Merci, bonne chance ! » (pas après « Continuer » sans Google). */
export const QR_THANKS_HERO_KEY = "fid_qr_thanks_hero";

/** Même si sessionStorage échoue (Safari privé), le prochain rerender ne doit pas réécraser le titre. */
let qrThanksHeroMemory = false;

export function markQrThanksHeroDone() {
  qrThanksHeroMemory = true;
  try {
    sessionStorage.setItem(QR_THANKS_HERO_KEY, "1");
  } catch (_) {}
}

export function shouldShowQrThanksHero() {
  if (qrThanksHeroMemory) return true;
  try {
    return sessionStorage.getItem(QR_THANKS_HERO_KEY) === "1";
  } catch {
    return false;
  }
}

export { applyQrThanksHero, runQrThanksHeroTransition };

/** Un seul couple visibility/pageshow pour tout le module (évite N handlers après chaque rerender). */
let qrResumeListenersAbort = null;

const QR_PANEL_IDS = ["#fidelity-qr-panel-google", "#fidelity-qr-panel-verify", "#fidelity-qr-panel-reward"];

/** Conteneur page publique (référence passée au bootstrap peut diverger si le DOM est reconstruit). */
function fidelityAppMount(fallback) {
  return document.getElementById("fidelity-app") || fallback;
}

/** Durée affichée « vérification » (ms) — minimum 15 s, léger jitter pour paraître naturel */
const QR_VERIFY_MIN_MS = 15_000;
const QR_VERIFY_JITTER_MS = 4_000;

const QR_VERIFY_MESSAGES = [
  "Nous vérifions votre avis Google…",
  "Merci de patienter encore un instant…",
  "Nous finalisons la vérification…",
  "Presque terminé…",
];

/**
 * Barre de progression + messages qui défilent (durée alignée sur le timeout).
 * @returns {() => void}
 */
function startVerifyPanelUx(rootEl, durationMs) {
  const panel = rootEl.querySelector("#fidelity-qr-panel-verify");
  const msgEl = rootEl.querySelector("#fidelity-qr-verify-text");
  const bar = rootEl.querySelector("#fidelity-qr-verify-progress-bar");
  if (panel) {
    panel.style.setProperty("--verify-duration", `${durationMs}ms`);
  }
  if (bar) {
    bar.classList.remove("fidelity-qr-verify-progress-bar--animate");
    bar.getBoundingClientRect();
    bar.classList.add("fidelity-qr-verify-progress-bar--animate");
  }
  let idx = 0;
  if (msgEl) {
    msgEl.textContent = QR_VERIFY_MESSAGES[0];
  }
  const step = Math.max(1750, Math.floor(durationMs / (QR_VERIFY_MESSAGES.length + 1)));
  const id = window.setInterval(() => {
    idx = (idx + 1) % QR_VERIFY_MESSAGES.length;
    if (msgEl) msgEl.textContent = QR_VERIFY_MESSAGES[idx];
  }, step);
  return () => {
    window.clearInterval(id);
  };
}

export function isGuestMember(member) {
  return typeof member?.email === "string" && member.email.toLowerCase().endsWith("@guest.invalid");
}

export function isQrGateUnlocked() {
  try {
    return sessionStorage.getItem(QR_GATE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setQrGateUnlocked() {
  try {
    sessionStorage.setItem(QR_GATE_KEY, "1");
  } catch (_) {}
}

export function openQrModalRoot(rootEl) {
  const root = rootEl.querySelector("#fidelity-qr-modal-root");
  if (!root) return;
  root.classList.remove("hidden");
  root.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  root.classList.remove("fidelity-qr-modal-root--open");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.classList.add("fidelity-qr-modal-root--open");
    });
  });
}

/**
 * @param {HTMLElement} rootEl
 * @param {() => void} [onClosed] — appelé une fois la modale masquée (opacity / timeout).
 */
export function closeQrModalRoot(rootEl, onClosed) {
  const root = rootEl.querySelector("#fidelity-qr-modal-root");
  const fireClosed = () => {
    if (typeof onClosed === "function") {
      try {
        onClosed();
      } catch (e) {
        console.error("[fidelity] closeQrModalRoot onClosed", e);
      }
    }
  };
  if (!root) {
    fireClosed();
    return;
  }
  if (root.classList.contains("hidden")) {
    document.body.style.overflow = "";
    fireClosed();
    return;
  }
  root.classList.remove("fidelity-qr-modal-root--open");
  void root.offsetHeight;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    root.removeEventListener("transitionend", onEnd);
    root.classList.add("hidden");
    root.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    /* Laisser la modale disparaître du paint avant hero / animations (Safari). */
    globalThis.requestAnimationFrame(() => {
      globalThis.requestAnimationFrame(() => {
        fireClosed();
      });
    });
  };
  const onEnd = (e) => {
    if (e.target !== root) return;
    if (e.propertyName !== "opacity" && e.propertyName !== "") return;
    finish();
  };
  root.addEventListener("transitionend", onEnd);
  globalThis.setTimeout(() => finish(), 480);
}

/** @param {HTMLElement} rootEl */
function hideAllQrPanels(rootEl) {
  for (const sel of QR_PANEL_IDS) {
    rootEl.querySelector(sel)?.classList.add("hidden");
  }
}

export function showQrGooglePanel(rootEl) {
  hideAllQrPanels(rootEl);
  rootEl.querySelector("#fidelity-qr-panel-google")?.classList.remove("hidden");
}

export function showQrVerifyPanel(rootEl) {
  hideAllQrPanels(rootEl);
  rootEl.querySelector("#fidelity-qr-panel-verify")?.classList.remove("hidden");
}

/**
 * Gain invité QR : une seule modale — félicitations + formulaire prénom / email (pas de passage auto ni 2e pop-up).
 * @param {HTMLElement} rootEl
 */
export function showQrRewardPanel(rootEl) {
  hideAllQrPanels(rootEl);
  const panel = rootEl.querySelector("#fidelity-qr-panel-reward");
  panel?.classList.remove("hidden");
  const nameInput = rootEl.querySelector("#fidelity-qr-claim-name");
  window.requestAnimationFrame(() => {
    if (nameInput instanceof HTMLElement) nameInput.focus();
  });
}

/** Premier libellé « gagnant » pour animation / fallback affichage. */
export function firstNonPerduLabel(wheelLabels) {
  const list = Array.isArray(wheelLabels) ? wheelLabels : [];
  for (const raw of list) {
    const s = String(raw || "").trim();
    if (s && !/^perdu$/i.test(s)) return s;
  }
  return "Une récompense";
}

/**
 * @param {object} ctx
 * @param {import("./api/clientApi.js").createClientFidelityApi} ctx.api
 * @param {string} ctx.slug
 * @param {() => object} ctx.getState
 * @param {() => void} ctx.rerender
 * @param {() => void} ctx.refreshMemberData
 * @param {(msg: string) => string} ctx.messageUtilisateurPourErreur
 */
export function bindQrGameUi(ctx) {
  /* Même sans modale QR (ex. passage espace membre), couper les anciens listeners pageshow/visibility. */
  qrResumeListenersAbort?.abort();
  qrResumeListenersAbort = null;

  const { rootEl, api, slug, getState, rerender, refreshMemberData, messageUtilisateurPourErreur, signal } = ctx;
  const modalRoot = rootEl.querySelector("#fidelity-qr-modal-root");
  if (!modalRoot) return () => {};

  const spinBtn = rootEl.querySelector("#fidelity-v2-spin-btn");
  const openGoogle = rootEl.querySelector("#fidelity-qr-open-google");
  const skipGoogle = rootEl.querySelector("#fidelity-qr-skip-google");
  const claimForm = rootEl.querySelector("#fidelity-qr-claim-form");
  const backdrop = rootEl.querySelector('[data-fid-qr-close="backdrop"]');

  let verifyUxCleanup = () => {};
  let verifyUnlockTimer = null;

  function runVerifyUnlock({ tryClaim }) {
    verifyUxCleanup();
    if (verifyUnlockTimer != null) {
      globalThis.clearTimeout(verifyUnlockTimer);
      verifyUnlockTimer = null;
    }
    const durationMs = QR_VERIFY_MIN_MS + Math.floor(Math.random() * QR_VERIFY_JITTER_MS);
    verifyUxCleanup = startVerifyPanelUx(rootEl, durationMs);
    verifyUnlockTimer = globalThis.setTimeout(() => {
      verifyUnlockTimer = null;
      void (async () => {
        verifyUxCleanup();
        verifyUxCleanup = () => {};
        setQrGateUnlocked();
        if (tryClaim) {
          const verifyPanel = rootEl.querySelector("#fidelity-qr-panel-verify");
          const msgEl = rootEl.querySelector("#fidelity-qr-verify-text");
          const bar = rootEl.querySelector("#fidelity-qr-verify-progress-bar");
          const progress = rootEl.querySelector("#fidelity-qr-verify-progress");
          if (msgEl && verifyPanel) {
            msgEl.textContent = "Avis bien reçu — merci !";
            verifyPanel.classList.add("fidelity-qr-modal--verify-done");
            bar?.classList.remove("fidelity-qr-verify-progress-bar--animate");
            if (bar instanceof HTMLElement) bar.style.width = "100%";
            if (progress instanceof HTMLElement) progress.setAttribute("aria-valuetext", "Vérification terminée");
          }
          /* Tout de suite : ne pas attendre closeQrModalRoot (Safari / transitionend capricieux). */
          markQrThanksHeroDone();
          applyQrThanksHero(fidelityAppMount(rootEl), () => ({}));
          await new Promise((r) => globalThis.setTimeout(r, 480));
          const mount = fidelityAppMount(rootEl);
          closeQrModalRoot(mount, () => {
            void (async () => {
              try {
                await runQrThanksHeroTransition(mount);
                const raw = sessionStorage.getItem("fidelity_pending_engagement_claim");
                if (raw) {
                  const data = JSON.parse(raw);
                  if (data.slug === slug && data.actionType === "google_review") {
                    sessionStorage.removeItem("fidelity_pending_engagement_claim");
                    const st = getState();
                    if (st.member?.id) {
                      await api.claimEngagement(slug, st.member.id, "google_review");
                      await refreshMemberData();
                    }
                  }
                }
                applyQrThanksHero(fidelityAppMount(rootEl), () => ({}));
              } catch (err) {
                console.error("[fidelity] post-verify-google", err);
                applyQrThanksHero(fidelityAppMount(rootEl), () => ({}));
              }
            })();
          });
        } else {
          closeQrModalRoot(rootEl);
        }
      })();
    }, durationMs);
  }

  /**
   * Reprise après avis Google : clé session + retour onglet, rechargement, ou BFCache.
   * Sans ça, un reload alors que la clé est encore là ne déclenche jamais visibilitychange → aucune transition hero.
   */
  function resumeGoogleReviewIfPending() {
    if (document.visibilityState !== "visible") return;
    if (!isGuestMember(getState().member) || isQrGateUnlocked()) return;
    try {
      if (sessionStorage.getItem(QR_GOOGLE_PENDING_KEY) !== "1") return;
      sessionStorage.removeItem(QR_GOOGLE_PENDING_KEY);
      openQrModalRoot(rootEl);
      showQrVerifyPanel(rootEl);
      runVerifyUnlock({ tryClaim: true });
    } catch (_) {}
  }

  const onSpinPre = (e) => {
    if (!isGuestMember(getState().member)) return;
    if (isQrGateUnlocked()) return;
    e.preventDefault();
    e.stopPropagation();
    openQrModalRoot(rootEl);
    showQrGooglePanel(rootEl);
  };

  spinBtn?.addEventListener("click", onSpinPre, true);

  openGoogle?.addEventListener("click", () => {
    try {
      sessionStorage.setItem(QR_GOOGLE_PENDING_KEY, "1");
      sessionStorage.setItem(
        "fidelity_pending_engagement_claim",
        JSON.stringify({ slug, actionType: "google_review", ts: Date.now() }),
      );
    } catch (_) {}
  });

  skipGoogle?.addEventListener("click", () => {
    openQrModalRoot(rootEl);
    showQrVerifyPanel(rootEl);
    runVerifyUnlock({ tryClaim: false });
  });

  qrResumeListenersAbort = new AbortController();
  const resumeSig = qrResumeListenersAbort.signal;
  document.addEventListener("visibilitychange", resumeGoogleReviewIfPending, { signal: resumeSig });
  globalThis.addEventListener("pageshow", resumeGoogleReviewIfPending, { signal: resumeSig });
  globalThis.setTimeout(resumeGoogleReviewIfPending, 0);

  backdrop?.addEventListener(
    "click",
    () => {
      if (!isQrGateUnlocked() && rootEl.querySelector("#fidelity-qr-panel-verify:not(.hidden)")) return;
      const rewardOpen = rootEl.querySelector("#fidelity-qr-panel-reward:not(.hidden)");
      if (rewardOpen) return;
      closeQrModalRoot(rootEl);
    },
    { signal },
  );

  claimForm?.addEventListener(
    "submit",
    async (ev) => {
      ev.preventDefault();
      const name = rootEl.querySelector("#fidelity-qr-claim-name")?.value?.trim();
      const email = rootEl.querySelector("#fidelity-qr-claim-email")?.value?.trim();
      const errEl = rootEl.querySelector("#fidelity-qr-claim-error");
      const submitBtn = rootEl.querySelector("#fidelity-qr-claim-submit");
      if (!name || !email) {
        if (errEl) {
          errEl.textContent = "Renseigne ton prénom et ton email.";
          errEl.classList.remove("hidden");
        }
        return;
      }
      if (errEl) errEl.classList.add("hidden");
      if (submitBtn) submitBtn.disabled = true;
      try {
        const st = getState();
        await api.claimGuestIdentity(slug, st.member.id, { name, email });
        closeQrModalRoot(rootEl);
        await refreshMemberData();
        rerender();
      } catch (err) {
        if (errEl) {
          errEl.textContent = messageUtilisateurPourErreur(err, err.message || "Erreur.");
          errEl.classList.remove("hidden");
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    },
    { signal },
  );

  return () => {
    spinBtn?.removeEventListener("click", onSpinPre, true);
    qrResumeListenersAbort?.abort();
    qrResumeListenersAbort = null;
    if (verifyUnlockTimer != null) {
      globalThis.clearTimeout(verifyUnlockTimer);
      verifyUnlockTimer = null;
    }
  };
}
