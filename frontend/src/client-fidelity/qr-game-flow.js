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
/** Slug commerce courant quand mark a été appelé (évite d’afficher « Merci » sur un autre /fidelity/:slug). */
let qrThanksHeroSlug = null;

/**
 * @param {string} [slug] — commerce courant (recommandé)
 */
export function markQrThanksHeroDone(slug) {
  const s = String(slug ?? "").trim();
  qrThanksHeroMemory = true;
  qrThanksHeroSlug = s || null;
  try {
    if (s) sessionStorage.setItem(`${QR_THANKS_HERO_KEY}:slug:${s}`, "1");
    sessionStorage.setItem(QR_THANKS_HERO_KEY, "1");
  } catch (_) {}
}

/**
 * @param {string} [forSlug] — doit correspondre au slug marké si celui-ci était renseigné
 */
export function shouldShowQrThanksHero(forSlug) {
  const want = String(forSlug ?? "").trim();
  if (qrThanksHeroMemory) {
    if (!qrThanksHeroSlug) return true;
    if (!want || qrThanksHeroSlug === want) return true;
    return false;
  }
  try {
    if (want && sessionStorage.getItem(`${QR_THANKS_HERO_KEY}:slug:${want}`) === "1") return true;
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

/** Durée affichée « vérification » (ms) — courte : illusion de traitement sans bloquer l’utilisateur */
const QR_VERIFY_MIN_MS = 1_200;
const QR_VERIFY_JITTER_MS = 400;

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
  const step = Math.max(260, Math.floor(durationMs / (QR_VERIFY_MESSAGES.length + 1)));
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
  const mysteryBox = rootEl.querySelector("#fidelity-qr-mysterybox");
  const openGoogle = rootEl.querySelector("#fidelity-qr-open-google");
  const skipGoogle = rootEl.querySelector("#fidelity-qr-skip-google");
  const claimForm = rootEl.querySelector("#fidelity-qr-claim-form");
  const backdrop = rootEl.querySelector('[data-fid-qr-close="backdrop"]');

  /** Clone flottant ; l’original est retiré du DOM pendant le jeu (zéro fantôme d’ombre WebKit). */
  let mysteryFloatEl = null;

  function restoreMysteryBoxInHero() {
    const mb = mysteryBox;
    if (!(mb instanceof HTMLElement) || mb.parentNode) return;
    const decor = rootEl.querySelector(".fidelity-qr-hero-decor");
    if (!decor) return;
    const anchor = decor.querySelector(".fidelity-qr-hero-decor-chip--mini");
    if (anchor) decor.insertBefore(mb, anchor);
    else decor.appendChild(mb);
  }

  function disposeMysteryFloat() {
    if (mysteryFloatEl?.parentNode) {
      mysteryFloatEl.removeEventListener("click", onMysteryFloatClick);
      mysteryFloatEl.removeEventListener("keydown", onMysteryFloatKeydown);
      mysteryFloatEl.removeEventListener("mousedown", onMysteryFloatMouseDown);
      mysteryFloatEl.remove();
    }
    mysteryFloatEl = null;
    restoreMysteryBoxInHero();
    if (mysteryBox instanceof HTMLElement) {
      mysteryBox.classList.remove("fidelity-qr-mysterybox--ghost");
      mysteryBox.removeAttribute("aria-hidden");
      mysteryBox.setAttribute("tabindex", "0");
      mysteryBox.setAttribute("aria-pressed", "false");
    }
  }

  function parsePxVar(el, name) {
    const raw = el.style.getPropertyValue(name).trim();
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  }

  function nudgeMysteryFloat() {
    const el = mysteryFloatEl;
    if (!(el instanceof HTMLElement)) return;
    const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    const baseL = parsePxVar(el, "--fid-mb-x");
    const baseT = parsePxVar(el, "--fid-mb-y");
    const curTx = parsePxVar(el, "--fid-mb-tx");
    const curTy = parsePxVar(el, "--fid-mb-ty");
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const margin = 14;
    const vw = globalThis.innerWidth;
    const vh = globalThis.innerHeight;
    const minTx = margin - baseL;
    const maxTx = vw - margin - w - baseL;
    const minTy = margin - baseT;
    const maxTy = vh - margin - h - baseT;
    /* Saut net : distance angulaire — volontairement large (demande produit). */
    const minDist = reduced ? 44 : 130;
    const maxDist = reduced ? 96 : 260 + Math.random() * 180;
    const dist = minDist + Math.random() * (maxDist - minDist);
    const angle = Math.random() * Math.PI * 2;
    let tx = curTx + Math.cos(angle) * dist;
    let ty = curTy + Math.sin(angle) * dist;
    tx = Math.max(minTx, Math.min(maxTx, tx));
    ty = Math.max(minTy, Math.min(maxTy, ty));
    /* Si le bord a trop rogné le vecteur, pousser un peu vers le centre de la zone jouable. */
    const cx = (minTx + maxTx) / 2;
    const cy = (minTy + maxTy) / 2;
    if (Math.hypot(tx - curTx, ty - curTy) < minDist * 0.65) {
      const towardCx = cx - curTx;
      const towardCy = cy - curTy;
      const len = Math.hypot(towardCx, towardCy) || 1;
      const push = Math.min(minDist, Math.max(maxTx - minTx, maxTy - minTy) * 0.35);
      tx = Math.max(minTx, Math.min(maxTx, curTx + (towardCx / len) * push));
      ty = Math.max(minTy, Math.min(maxTy, curTy + (towardCy / len) * push));
    }
    const rot = -20 + Math.random() * 40;
    el.style.setProperty("--fid-mb-tx", `${tx}px`);
    el.style.setProperty("--fid-mb-ty", `${ty}px`);
    el.style.setProperty("--fid-mb-rot", `${rot}deg`);
  }

  function onMysteryFloatClick(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    nudgeMysteryFloat();
  }

  /** Évite le focus souris (halo / encadré WebKit sur img role=button). */
  function onMysteryBoxMouseDown(ev) {
    if (ev instanceof MouseEvent && ev.button !== 0) return;
    ev.preventDefault();
  }

  function onMysteryFloatMouseDown(ev) {
    if (ev instanceof MouseEvent && ev.button !== 0) return;
    ev.preventDefault();
  }

  function onMysteryFloatKeydown(ev) {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    ev.preventDefault();
    nudgeMysteryFloat();
  }

  function activateMysteryFloat() {
    const el = mysteryBox;
    if (!(el instanceof HTMLElement) || mysteryFloatEl) return;
    const r = el.getBoundingClientRect();
    const clone = el.cloneNode(true);
    clone.removeAttribute("id");
    clone.id = "fidelity-qr-mysterybox-float";
    clone.classList.add("fidelity-qr-mysterybox--flying");
    clone.style.setProperty("--fid-mb-x", `${r.left}px`);
    clone.style.setProperty("--fid-mb-y", `${r.top}px`);
    clone.style.setProperty("--fid-mb-w", `${r.width}px`);
    clone.style.setProperty("--fid-mb-tx", "0px");
    clone.style.setProperty("--fid-mb-ty", "0px");
    clone.style.setProperty("--fid-mb-rot", "-12deg");
    clone.setAttribute("aria-pressed", "true");
    clone.setAttribute("tabindex", "0");
    clone.style.setProperty("filter", "none");
    clone.style.setProperty("-webkit-filter", "none");
    clone.style.setProperty("box-shadow", "none");
    const mount =
      rootEl.querySelector("#fidelity-app") || rootEl.closest("#fidelity-app") || document.body;
    if (typeof el.blur === "function") el.blur();
    el.setAttribute("aria-hidden", "true");
    el.setAttribute("tabindex", "-1");
    el.setAttribute("aria-pressed", "true");
    /* Retrait du DOM d’abord : jamais deux calques mystery au même endroit (WebKit). */
    el.remove();
    mount.appendChild(clone);
    mysteryFloatEl = clone;
    clone.addEventListener("click", onMysteryFloatClick);
    clone.addEventListener("keydown", onMysteryFloatKeydown);
    clone.addEventListener("mousedown", onMysteryFloatMouseDown);
    globalThis.requestAnimationFrame(() => {
      nudgeMysteryFloat();
    });
  }

  function onMysteryBoxActivate(ev) {
    if (ev instanceof MouseEvent && ev.button !== 0) return;
    const el = mysteryBox;
    if (!(el instanceof HTMLElement)) return;
    if (mysteryFloatEl) return;
    activateMysteryFloat();
  }

  function onMysteryBoxKeydown(ev) {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    if (mysteryFloatEl) return;
    ev.preventDefault();
    onMysteryBoxActivate(ev);
  }

  mysteryBox?.addEventListener("mousedown", onMysteryBoxMouseDown);
  mysteryBox?.addEventListener("click", onMysteryBoxActivate);
  mysteryBox?.addEventListener("keydown", onMysteryBoxKeydown);

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
          markQrThanksHeroDone(slug);
          applyQrThanksHero(fidelityAppMount(rootEl), () => ({}));
          await new Promise((r) => globalThis.setTimeout(r, 280));
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
    disposeMysteryFloat();
    mysteryBox?.removeEventListener("mousedown", onMysteryBoxMouseDown);
    mysteryBox?.removeEventListener("click", onMysteryBoxActivate);
    mysteryBox?.removeEventListener("keydown", onMysteryBoxKeydown);
    qrResumeListenersAbort?.abort();
    qrResumeListenersAbort = null;
    if (verifyUnlockTimer != null) {
      globalThis.clearTimeout(verifyUnlockTimer);
      verifyUnlockTimer = null;
    }
  };
}
