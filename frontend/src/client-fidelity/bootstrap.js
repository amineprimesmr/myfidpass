/**
 * Dérogation REFONTE-REGLES (max 400 lignes) : extraction prévue vers client-fidelity/roulette/
 * et client-fidelity/qr-game-flow-bindings.js — à traiter avant 2026-06-01.
 */
import { createClientFidelityApi } from "./api/clientApi.js";
import { messageUtilisateurPourErreur } from "./lib/client-error-fr.js";
import { createClientFidelityStore } from "./state/store.js";
import { renderClientPage } from "./ui/view.js";
import { memberStorageKey, SUCCESS_MAX_AGE_MS } from "./constants.js";
import {
  buildWheelSegmentHtml,
  DEFAULT_WHEEL_LABELS,
  normalizeWheelLabelsFromSegments,
  pickWheelIndexForReward,
  buildWheelConicGradient,
} from "./lib/wheel-segments.js";
import { isUnlimitedTicketsDemo } from "./lib/unlimited-tickets-demo.js";
import { startRouletteSpinSound } from "./lib/roulette-spin-audio.js";
import { bindFidelitySpaLinks } from "./fidelity-spa-nav.js";
import {
  applyQrThanksHero,
  bindQrGameUi,
  closeQrModalRoot,
  firstNonPerduLabel,
  isGuestMember,
  openQrModalRoot,
  showQrRewardPanel,
  shouldShowQrThanksHero,
} from "./qr-game-flow.js";
import {
  dismissFidelityRouteLoadingOverlay,
  mountFidelityRouteLoadingOverlay,
  setFidelityRouteLoadingLogo,
  startFidelityRouteLoadingAnimations,
} from "./fidelity-route-loading.js";
import { applyFidelityClientPageBackground } from "./lib/apply-fidelity-client-bg.js";
import { bindFidelityMemberFooterVisualViewport } from "./lib/sync-fidelity-member-footer-visual-viewport.js";
import {
  closeDeliveryReceiptScanOverlay,
  openDeliveryReceiptScanOverlay,
} from "./delivery-receipt-scan-overlay.js";
import { bindMissionsSheet, closeMissionsSheet } from "./missions-sheet-ui.js";
import { deliveryReceiptSuccessMessage, engagementClaimSuccessMessage } from "./lib/program-copy.js";

function genIdempotencyKey() {
  return `fid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getFingerprint() {
  const ua = navigator.userAgent || "";
  const lang = navigator.language || "fr";
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const hw = `${screen.width}x${screen.height}`;
  return `${ua}|${lang}|${tz}|${hw}`.slice(0, 250);
}

// Configuration roulette : durée + easing type « vraie roue » (ralenti long en fin de courbe)
const ROULETTE_SPIN_DURATION_MS = 6200;
const ROULETTE_EXTRA_TURNS = 6;
/** Courbe forte fin de course (léger dépassement puis amorti), proche d’un ease-out physique */
const ROULETTE_SPIN_EASING = "cubic-bezier(0.05, 0.72, 0.12, 1)";

function prefersReducedMotion() {
  if (typeof globalThis.matchMedia !== "function") return false;
  return globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Annule les écouteurs document de la session précédente (évite doublons à chaque navigation SPA). */
let fidelityDocumentListenersAbort = null;

export async function initClientFidelityPage({ slug, apiBase, rootEl }) {
  const api = createClientFidelityApi(apiBase);
  const store = createClientFidelityStore({ slug });
  
  let isSpinning = false;
  let wheelLabels = [...DEFAULT_WHEEL_LABELS];
  let currentRotation = 0;
  let disposeQrUi = () => {};
  /** Photo ticket livraison (data URL) — réinitialisé à chaque `bindEvents`. */
  let deliveryReceiptDataUrl = null;

  fidelityDocumentListenersAbort?.abort();
  fidelityDocumentListenersAbort = new AbortController();
  const { signal } = fidelityDocumentListenersAbort;

  bindFidelityMemberFooterVisualViewport(signal);

  const loadingOverlay = mountFidelityRouteLoadingOverlay();

  try {
  async function hydrateMember(memberId) {
    if (!memberId) return;
    const [member, gamesData, tickets, actionsData] = await Promise.all([
      api.getMember(slug, memberId),
      api.getGames(slug),
      api.getTickets(slug, memberId),
      api.getEngagementActions(slug),
    ]);
    const wallet = await api.getWalletUrls(slug, memberId);
    const memberWithPoints =
      member && tickets != null && Number.isFinite(Number(tickets.points))
        ? { ...member, points: Number(tickets.points) }
        : member;
    store.patch({
      member: memberWithPoints,
      games: gamesData?.games || [],
      roulette_segments: Array.isArray(gamesData?.roulette_segments) ? gamesData.roulette_segments : [],
      tickets,
      engagementActions: actionsData?.actions || [],
      wallet,
    });
  }

  const business = await api.getBusiness(slug);
  store.patch({ business, unlimitedTicketsTest: isUnlimitedTicketsDemo() });
  setFidelityRouteLoadingLogo(loadingOverlay, business, slug, apiBase);
  startFidelityRouteLoadingAnimations(loadingOverlay);

  /**
   * Lien « Voir en ligne » au dos du pass : /fidelity/:slug?m=<uuid> — ouvre directement le compte web.
   */
  async function tryHydrateMemberFromPassLink() {
    if (typeof window === "undefined" || typeof URLSearchParams === "undefined") return false;
    const sp = new URLSearchParams(window.location.search);
    const mid = (sp.get("m") || sp.get("member") || "").trim();
    if (!mid) return false;
    try {
      await hydrateMember(mid);
      localStorage.setItem(memberStorageKey(slug), JSON.stringify({ memberId: mid, createdAt: Date.now() }));
      if (typeof history !== "undefined" && history.replaceState) {
        history.replaceState(null, "", `/fidelity/${encodeURIComponent(slug)}${window.location.hash || ""}`);
      }
      return true;
    } catch {
      return false;
    }
  }

  async function ensureGuestSession() {
    if (await tryHydrateMemberFromPassLink()) return;
    const raw = localStorage.getItem(memberStorageKey(slug));
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.memberId && Date.now() - (parsed.createdAt || 0) < SUCCESS_MAX_AGE_MS) {
          await hydrateMember(parsed.memberId);
          return;
        }
      } catch (_) {}
    }
    const email = `guest-${crypto.randomUUID()}@guest.invalid`;
    const data = await api.createMember(slug, { name: "Invité", email });
    const memberId = data.memberId || data.member?.id;
    if (!memberId) throw new Error("Session invitée impossible");
    localStorage.setItem(memberStorageKey(slug), JSON.stringify({ memberId, createdAt: Date.now() }));
    await hydrateMember(memberId);
  }

  try {
    await ensureGuestSession();
  } catch (e) {
    console.error("[fidelity] ensureGuestSession", e);
  }

  function syncWheelLabelsFromStore() {
    const segs = store.get().roulette_segments;
    wheelLabels = normalizeWheelLabelsFromSegments(Array.isArray(segs) ? segs : []);
  }

  function initRouletteWheel() {
    const wheelEl = rootEl.querySelector("#fidelity-roulette-wheel");
    if (!wheelEl || isSpinning) return;
    syncWheelLabelsFromStore();

    const n = wheelLabels.length;
    const fc = store.get().business?.flyerColors;
    wheelEl.style.background = buildWheelConicGradient(n, {
      colorOdd: fc?.wheelOdd ?? null,
      colorEven: fc?.wheelEven ?? null,
    });
    wheelEl.style.transform = `rotate(${currentRotation}deg)`;

    const segmentHtml = wheelLabels
      .map((_, i) =>
        buildWheelSegmentHtml({
          segmentIndex: i,
          segmentCount: n,
          escapeHtml,
        }),
      )
      .join("");

    let shine = wheelEl.querySelector(".fidelity-roulette-wheel-shine");
    if (!shine) {
      shine = document.createElement("div");
      shine.className = "fidelity-roulette-wheel-shine";
      shine.setAttribute("aria-hidden", "true");
      wheelEl.insertBefore(shine, wheelEl.firstChild);
    }
    let disc = wheelEl.querySelector(".fidelity-roulette-wheel-disc");
    if (!disc) {
      disc = document.createElement("div");
      disc.className = "fidelity-roulette-wheel-disc";
      wheelEl.appendChild(disc);
    }
    disc.innerHTML = segmentHtml;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function openProfileMissionModal() {
    const m = rootEl.querySelector("#fidelity-profile-mission-modal");
    if (!m) return;
    m.classList.remove("hidden");
    m.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => rootEl.querySelector("#fidelity-v2-profile-phone")?.focus());
  }

  function closeProfileMissionModal() {
    const m = rootEl.querySelector("#fidelity-profile-mission-modal");
    if (!m) return;
    m.classList.add("hidden");
    m.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function rerender() {
    document.body.style.overflow = "";
    renderClientPage(rootEl, store.get(), { slug, apiBase });
    applyFidelityClientPageBackground(store.get().business);
    /* Après refreshMemberData le HTML est reconstruit : réaligne le hero si l’état « Merci » est actif. */
    if (shouldShowQrThanksHero(slug) && rootEl.querySelector("main.fidelity-qr-game")) {
      applyQrThanksHero(rootEl, () => store.get());
    }
    bindEvents();
    if (!isSpinning) {
      initRouletteWheel();
    }
  }

  async function refreshMemberData() {
    const state = store.get();
    if (!state.member?.id) return;
    await hydrateMember(state.member.id);
    rerender();
  }

  async function onProfileBonusSubmit(event) {
    event.preventDefault();
    const state = store.get();
    if (!state.member?.id) return;
    const phone = rootEl.querySelector("#fidelity-v2-profile-phone")?.value?.trim() || "";
    const city = rootEl.querySelector("#fidelity-v2-profile-city")?.value?.trim() || "";
    const birthRaw = rootEl.querySelector("#fidelity-v2-profile-birth")?.value?.trim() || "";
    const feedback = rootEl.querySelector("#fidelity-v2-profile-feedback");
    const submitBtn = rootEl.querySelector("#fidelity-v2-profile-submit");
    if (feedback) {
      feedback.textContent = "";
      feedback.classList.remove("success", "error");
      feedback.classList.add("hidden");
    }
    if (submitBtn) submitBtn.disabled = true;
    try {
      await api.submitProfileForTicket(slug, state.member.id, {
        phone,
        city,
        birth_date: birthRaw,
      });
      await refreshMemberData();
    } catch (err) {
      if (feedback) {
        feedback.textContent = messageUtilisateurPourErreur(err, err.message || "Enregistrement impossible.");
        feedback.classList.remove("hidden");
        feedback.classList.add("error");
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async function onSignupSubmit(event) {
    event.preventDefault();
    const name = rootEl.querySelector("#fidelity-v2-name")?.value?.trim();
    const email = rootEl.querySelector("#fidelity-v2-email")?.value?.trim();
    const errorEl = rootEl.querySelector("#fidelity-v2-error");
    if (!name || !email) {
      if (errorEl) {
        errorEl.textContent = "Renseigne ton nom et ton email.";
        errorEl.classList.remove("hidden");
      }
      return;
    }
    try {
      const data = await api.createMember(slug, { name, email });
      const memberId = data.memberId || data.member?.id;
      if (!memberId) throw new Error("Création impossible");
      localStorage.setItem(memberStorageKey(slug), JSON.stringify({ memberId, createdAt: Date.now() }));
      await hydrateMember(memberId);
      rerender();
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = messageUtilisateurPourErreur(err, err.message || "Erreur lors de la création.");
        errorEl.classList.remove("hidden");
      }
    }
  }

  async function onConvertTickets() {
    const state = store.get();
    const input = rootEl.querySelector("#fidelity-v2-convert-input");
    const feedback = rootEl.querySelector("#fidelity-v2-game-feedback");
    const points = Number(input?.value || 0);
    
    if (feedback) {
      feedback.classList.remove("success", "error", "hidden");
    }

    try {
      await api.convertTickets(slug, state.member.id, points, genIdempotencyKey());
      if (feedback) {
        feedback.textContent = "Conversion réussie !";
        feedback.classList.add("success");
      }
      await refreshMemberData();
    } catch (err) {
      if (feedback) {
        feedback.textContent = messageUtilisateurPourErreur(err, err.message || "Conversion impossible.");
        feedback.classList.add("error");
      }
    }
  }

  async function onSpinRoulette() {
    if (isSpinning) return;
    const state = store.get();
    const wheelEl = rootEl.querySelector("#fidelity-roulette-wheel");
    const spinBtn = rootEl.querySelector("#fidelity-v2-spin-btn");
    const feedback = rootEl.querySelector("#fidelity-v2-game-feedback");

    if (!wheelEl || !spinBtn) return;

    const tickets = state.unlimitedTicketsTest ? 999 : Number(state.tickets?.ticket_balance ?? 0);
    const spinCost = Number((state.games || []).find((g) => g.game_code === "roulette")?.ticket_cost ?? 1);

    if (!state.member?.id) {
      if (feedback) {
        feedback.textContent = "Crée ta carte fidélité pour jouer.";
        feedback.classList.add("error");
        feedback.classList.remove("hidden", "success");
      }
      return;
    }
    if (tickets < spinCost) {
      if (feedback) {
        feedback.textContent = `Il te faut ${spinCost} point${spinCost > 1 ? "s" : ""} pour jouer. Gagne des points via les missions ou convertis tes points sur la page carte.`;
        feedback.classList.add("error");
        feedback.classList.remove("hidden", "success");
      }
      return;
    }

    const reduceMotion = prefersReducedMotion();
    const spinDurationMs = reduceMotion ? 0 : ROULETTE_SPIN_DURATION_MS;
    const spinStart = currentRotation;

    isSpinning = true;
    spinBtn.disabled = true;
    spinBtn.setAttribute("aria-busy", "true");
    if (feedback) {
      feedback.classList.add("hidden");
      feedback.classList.remove("success", "error");
    }

    wheelEl.style.willChange = "transform";

    const clearBusy = () => {
      spinBtn.disabled = false;
      spinBtn.removeAttribute("aria-busy");
    };

    const releaseWillChangeSoon = () => {
      window.setTimeout(() => {
        wheelEl.style.willChange = "auto";
      }, 120);
    };

    let spinAudioStop = () => {};

    try {
      const result = await api.spin(slug, "roulette", state.member.id, getFingerprint(), genIdempotencyKey());
      const rawLabel = (result.reward?.label || "PERDU").trim();
      const bonusPts = Math.max(0, Number(result.reward?.value?.points) || 0);
      const bonusStamps = Math.max(0, Number(result.reward?.value?.stamps) || 0);
      const programType = String(state.business?.program_type || "points").toLowerCase();
      const isWinPoints = result.reward?.kind === "points" && bonusPts > 0;
      const isWinStamps = result.reward?.kind === "stamps" && bonusStamps > 0;
      const isWin = isWinPoints || isWinStamps;
      const rewardLabel = isWin ? rawLabel : "PERDU";
      const qrGuest = isGuestMember(state.member);
      const wheelStopLabel = qrGuest && !isWin ? firstNonPerduLabel(wheelLabels) : rewardLabel;

      const winIndex = pickWheelIndexForReward(wheelLabels, wheelStopLabel);

      const n = wheelLabels.length;
      const segmentAngle = 360 / n;
      /* Un tour complet depuis la position actuelle, puis alignement segment + tours bonus */
      const baseRotation = spinStart + 360;
      let deltaMod = (90 - (winIndex + 0.5) * segmentAngle - baseRotation) % 360;
      if (deltaMod < 0) deltaMod += 360;
      const finalDelta = deltaMod + 360 * ROULETTE_EXTRA_TURNS;
      const targetRotation = baseRotation + finalDelta;

      const showOutcome = async () => {
        spinAudioStop();
        wheelEl.classList.remove("fidelity-roulette-wheel--is-spinning");
        /* Normalise la rotation accumulée pour éviter la dérive de précision sur les spins successifs.
         * targetRotation % 360 donne la même position visuelle en restant dans [0, 360). */
        const normalizedRot = ((targetRotation % 360) + 360) % 360;
        currentRotation = normalizedRot;
        wheelEl.style.transition = "none";
        void wheelEl.offsetHeight; /* force reflow avant de changer le transform */
        wheelEl.style.transform = `rotate(${normalizedRot}deg)`;
        try {
          if (
            isWin &&
            typeof navigator !== "undefined" &&
            typeof navigator.vibrate === "function"
          ) {
            navigator.vibrate([16, 32, 20, 38, 24]);
          }
        } catch (_) {}
        isSpinning = false;
        clearBusy();
        if (qrGuest) {
          if (feedback) feedback.classList.add("hidden");
          openQrModalRoot(rootEl);
          showQrRewardPanel(rootEl);
          triggerWinCelebrationConfetti();
          /* Ne pas appeler rerender() ici : il remplace tout le DOM et faisait disparaître la modale. */
          try {
            await hydrateMember(state.member.id);
          } catch (_) {}
          releaseWillChangeSoon();
          return;
        }
        if (feedback) {
          const winMsg =
            programType === "stamps" && isWinStamps
              ? `Bravo ! ${rawLabel} sur ta carte 🎉`
              : isWinPoints
                ? `Bravo ! +${bonusPts} point${bonusPts > 1 ? "s" : ""} sur ta carte 🎉`
                : isWin
                  ? `Bravo ! ${rawLabel} 🎉`
                  : "";
          feedback.textContent = isWin ? winMsg : "Dommage, essaie encore !";
          feedback.classList.add(isWin ? "success" : "error");
          feedback.classList.remove("hidden");
        }
        if (isWin) triggerWinCelebrationConfetti();
        await refreshMemberData();
        releaseWillChangeSoon();
      };

      wheelEl.offsetHeight;
      currentRotation = targetRotation;

      if (reduceMotion) {
        wheelEl.style.transition = "none";
        wheelEl.style.transform = `rotate(${targetRotation}deg)`;
        await showOutcome();
        return;
      }

      try {
        const audio = await startRouletteSpinSound(spinDurationMs);
        spinAudioStop = typeof audio?.stop === "function" ? audio.stop : () => {};
      } catch (_) {
        spinAudioStop = () => {};
      }

      wheelEl.classList.add("fidelity-roulette-wheel--is-spinning");
      wheelEl.style.transition = `transform ${spinDurationMs}ms ${ROULETTE_SPIN_EASING}`;
      wheelEl.style.transform = `rotate(${targetRotation}deg)`;

      let completed = false;
      const fallbackMs = spinDurationMs + 950;
      const t = window.setTimeout(() => {
        if (completed) return;
        completed = true;
        wheelEl.removeEventListener("transitionend", onTransitionEnd);
        void showOutcome();
      }, fallbackMs);

      function onTransitionEnd(e) {
        if (e.target !== wheelEl || e.propertyName !== "transform") return;
        if (completed) return;
        completed = true;
        window.clearTimeout(t);
        wheelEl.removeEventListener("transitionend", onTransitionEnd);
        void showOutcome();
      }

      wheelEl.addEventListener("transitionend", onTransitionEnd);
    } catch (err) {
      spinAudioStop();
      wheelEl.classList.remove("fidelity-roulette-wheel--is-spinning");
      isSpinning = false;
      clearBusy();
      wheelEl.style.willChange = "transform";
      wheelEl.style.transition = reduceMotion ? "none" : "transform 0.45s cubic-bezier(0.33, 1, 0.68, 1)";
      wheelEl.style.transform = `rotate(${spinStart}deg)`;
      releaseWillChangeSoon();

      if (feedback) {
        feedback.textContent = messageUtilisateurPourErreur(err, "Le jeu n’a pas pu aboutir. Réessaie.");
        feedback.classList.add("error");
        feedback.classList.remove("hidden", "success");
      }
    }
  }

  function triggerWinCelebrationConfetti() {
    if (prefersReducedMotion() || typeof window.confetti !== "function") return;
    const mobile =
      typeof globalThis.matchMedia === "function" && globalThis.matchMedia("(max-width: 520px)").matches;
    const duration = mobile ? 2200 : 3400;
    const end = Date.now() + duration;
    const n = mobile ? 3 : 4;
    const colors = ["#ff0055", "#f472b6", "#00ffcc", "#ffd700", "#a78bfa", "#38bdf8"];

    window.confetti({
      particleCount: mobile ? 38 : 52,
      spread: 72,
      startVelocity: mobile ? 34 : 40,
      ticks: mobile ? 220 : 260,
      origin: { x: 0.5, y: 0.35 },
      colors,
      scalar: mobile ? 0.9 : 1,
    });

    let tick = 0;
    (function frame() {
      tick += 1;
      /* Un frame sur deux : moins de confettis latéraux, rendu plus léger */
      if (tick % 2 === 0) {
        window.confetti({
          particleCount: n,
          angle: 60,
          spread: 48,
          origin: { x: 0, y: 0.55 },
          colors,
        });
        window.confetti({
          particleCount: n,
          angle: 120,
          spread: 48,
          origin: { x: 1, y: 0.55 },
          colors,
        });
      }

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    })();
  }

  const PENDING_CLAIM_KEY = "fidelity_pending_engagement_claim";
  const PENDING_CLAIM_MIN_MS = 45000;
  const PENDING_CLAIM_MAX_MS = 24 * 60 * 60 * 1000;

  async function tryAutoClaimOnReturn() {
    const state = store.get();
    if (!state.member?.id) return;
    if (isGuestMember(state.member)) return;
    try {
      const raw = sessionStorage.getItem(PENDING_CLAIM_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.slug !== slug || !data.actionType || !data.ts) return;
      const age = Date.now() - data.ts;
      if (age < PENDING_CLAIM_MIN_MS || age > PENDING_CLAIM_MAX_MS) return;
      sessionStorage.removeItem(PENDING_CLAIM_KEY);
      await api.claimEngagement(slug, state.member.id, data.actionType);
      await refreshMemberData();
      const feedback = rootEl.querySelector("#fidelity-v2-action-feedback");
      if (feedback) {
        const pt = String(store.get().business?.program_type || "points").toLowerCase();
        feedback.textContent = engagementClaimSuccessMessage(pt);
        feedback.classList.remove("hidden");
        setTimeout(() => feedback.classList.add("hidden"), 4000);
      }
    } catch (_) {}
  }

  function bindEvents() {
    disposeQrUi();
    disposeQrUi = () => {};
    deliveryReceiptDataUrl = null;

    rootEl.querySelector("#fidelity-v2-form")?.addEventListener("submit", onSignupSubmit);
    rootEl.querySelector("#fidelity-v2-convert-btn")?.addEventListener("click", onConvertTickets);
    rootEl.querySelector("#fidelity-v2-spin-btn")?.addEventListener("click", onSpinRoulette);
    rootEl.querySelector("#fidelity-v2-profile-form")?.addEventListener("submit", onProfileBonusSubmit);
    rootEl.querySelectorAll(".fidelity-profile-mission-open").forEach((btn) => {
      btn.addEventListener("click", () => openProfileMissionModal());
    });
    rootEl.querySelector(".fidelity-profile-mission-modal__backdrop")?.addEventListener("click", closeProfileMissionModal);
    rootEl.querySelector(".fidelity-profile-mission-modal__close")?.addEventListener("click", closeProfileMissionModal);
    rootEl.querySelectorAll(".fidelity-engagement-open-link").forEach((link) => {
      link.addEventListener("click", () => {
        const actionType = link.getAttribute("data-action-type");
        if (actionType) {
          sessionStorage.setItem(PENDING_CLAIM_KEY, JSON.stringify({
            slug,
            actionType,
            ts: Date.now(),
          }));
        }
      });
    });
    const apple = rootEl.querySelector("#fidelity-v2-apple");
    const google = rootEl.querySelector("#fidelity-v2-google");
    const wallet = store.get().wallet || {};
    if (apple && wallet.apple) apple.href = wallet.apple;
    if (google && wallet.google) google.href = wallet.google;

    const deliveryFile = rootEl.querySelector("#fidelity-delivery-receipt-file");
    const deliveryStickyBtn = rootEl.querySelector("#fidelity-delivery-receipt-sticky-btn");
    const deliveryFb = rootEl.querySelector("#fidelity-delivery-receipt-feedback");
    let deliveryReceiptSubmitInFlight = false;

    async function submitDeliveryReceiptClaimFlow() {
      const state = store.get();
      if (!state.member?.id || !deliveryReceiptDataUrl || deliveryReceiptSubmitInFlight) return;
      deliveryReceiptSubmitInFlight = true;
      if (deliveryStickyBtn) {
        deliveryStickyBtn.disabled = true;
        deliveryStickyBtn.setAttribute("aria-busy", "true");
      }
      if (deliveryFb) {
        deliveryFb.classList.add("hidden");
        deliveryFb.classList.remove("error", "success");
      }
      openDeliveryReceiptScanOverlay({ imageDataUrl: deliveryReceiptDataUrl });
      try {
        const commaIdx = deliveryReceiptDataUrl.indexOf(",");
        const b64 = commaIdx >= 0 ? deliveryReceiptDataUrl.slice(commaIdx + 1) : deliveryReceiptDataUrl;
        const mimeMatch = /^data:([^;]+);/.exec(deliveryReceiptDataUrl);
        const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
        await api.submitDeliveryReceiptClaim(slug, state.member.id, {
          image_base64: b64,
          mime_type: mime,
          idempotency_key: genIdempotencyKey(),
        });
        await refreshMemberData();
        if (deliveryFb) {
          const pt = String(store.get().business?.program_type || "points").toLowerCase();
          const successMsg = deliveryReceiptSuccessMessage(pt);
          deliveryFb.textContent = successMsg;
          deliveryFb.classList.remove("hidden");
          deliveryFb.classList.add("success");
          deliveryFb.classList.remove("error");
          globalThis.setTimeout(() => {
            if (!deliveryFb || deliveryFb.textContent !== successMsg) return;
            deliveryFb.classList.add("hidden");
            deliveryFb.classList.remove("success");
          }, 4000);
        }
        deliveryReceiptDataUrl = null;
        if (deliveryFile) deliveryFile.value = "";
      } catch (err) {
        if (deliveryFb) {
          deliveryFb.textContent = messageUtilisateurPourErreur(err, err.message || "Envoi impossible.");
          deliveryFb.classList.remove("hidden");
          deliveryFb.classList.add("error");
          deliveryFb.classList.remove("success");
        }
        if (deliveryFile) deliveryFile.value = "";
      } finally {
        closeDeliveryReceiptScanOverlay();
        deliveryReceiptSubmitInFlight = false;
        if (deliveryStickyBtn) {
          deliveryStickyBtn.disabled = false;
          deliveryStickyBtn.removeAttribute("aria-busy");
        }
      }
    }

    if (deliveryStickyBtn && deliveryFile) {
      deliveryStickyBtn.addEventListener("click", () => deliveryFile.click());
    }
    if (deliveryFile) {
      deliveryFile.addEventListener("change", (ev) => {
        const file = ev.target?.files?.[0];
        if (!file || !file.type.startsWith("image/")) {
          if (deliveryFb) {
            deliveryFb.textContent = "Choisis une image (photo ou capture d’écran).";
            deliveryFb.classList.remove("hidden");
            deliveryFb.classList.add("error");
            deliveryFb.classList.remove("success");
          }
          ev.target.value = "";
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          deliveryReceiptDataUrl = String(reader.result || "");
          if (deliveryFb) {
            deliveryFb.textContent = "";
            deliveryFb.classList.add("hidden");
            deliveryFb.classList.remove("error", "success");
          }
          void submitDeliveryReceiptClaimFlow();
        };
        reader.readAsDataURL(file);
      });
    }

    rootEl.querySelector("[data-fid-missions-rail]")?.addEventListener("keydown", (e) => {
      const rail = e.currentTarget;
      if (!(rail instanceof HTMLElement)) return;
      const step = Math.min(300, Math.max(160, rail.clientWidth * 0.82));
      if (e.key === "ArrowRight") {
        rail.scrollBy({ left: step, behavior: "smooth" });
        e.preventDefault();
      } else if (e.key === "ArrowLeft") {
        rail.scrollBy({ left: -step, behavior: "smooth" });
        e.preventDefault();
      } else if (e.key === "Home") {
        rail.scrollTo({ left: 0, behavior: "smooth" });
        e.preventDefault();
      } else if (e.key === "End") {
        rail.scrollTo({ left: rail.scrollWidth, behavior: "smooth" });
        e.preventDefault();
      }
    });

    bindFidelitySpaLinks(rootEl);
    bindMissionsSheet(rootEl, { signal });

    disposeQrUi = bindQrGameUi({
      rootEl,
      api,
      slug,
      getState: () => store.get(),
      rerender,
      refreshMemberData,
      messageUtilisateurPourErreur,
      signal,
    });
  }

  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "visible") tryAutoClaimOnReturn();
    },
    { signal }
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape") return;
      const m = rootEl.querySelector("#fidelity-profile-mission-modal");
      if (m && !m.classList.contains("hidden")) closeProfileMissionModal();
      const qr = rootEl.querySelector("#fidelity-qr-modal-root");
      const rewardOpen = rootEl.querySelector("#fidelity-qr-panel-reward:not(.hidden)");
      if (qr && !qr.classList.contains("hidden") && !rewardOpen) closeQrModalRoot(rootEl);
      const ms = rootEl.querySelector("#fidelity-missions-sheet");
      if (ms?.classList.contains("fidelity-missions-sheet--open")) {
        closeMissionsSheet(rootEl);
      }
    },
    { signal }
  );

  rerender();
  tryAutoClaimOnReturn();
  } finally {
    await dismissFidelityRouteLoadingOverlay(loadingOverlay);
  }
}
