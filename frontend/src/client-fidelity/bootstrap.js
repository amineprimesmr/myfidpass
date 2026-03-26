/**
 * Dérogation REFONTE-REGLES (max 400 lignes) : extraction prévue vers client-fidelity/roulette/
 * — à traiter avant 2026-06-01.
 */
import { createClientFidelityApi } from "./api/clientApi.js";
import { messageUtilisateurPourErreur } from "./lib/client-error-fr.js";
import { createClientFidelityStore } from "./state/store.js";
import { renderClientPage } from "./ui/view.js";
import { memberStorageKey, SUCCESS_MAX_AGE_MS } from "./constants.js";
import {
  DEFAULT_WHEEL_LABELS,
  formatWheelSegmentDisplayLabel,
  normalizeWheelLabelsFromSegments,
  pickWheelIndexForReward,
} from "./lib/wheel-segments.js";
import { isUnlimitedTicketsDemo } from "./lib/unlimited-tickets-demo.js";
import { bindFidelitySpaLinks } from "./fidelity-spa-nav.js";

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

// Configuration roulette (roue circulaire)
const ROULETTE_SPIN_DURATION_MS = 3400;
const ROULETTE_EXTRA_TURNS = 5;

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
  try {
    const raw = localStorage.getItem(memberStorageKey(slug));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.memberId && Date.now() - (parsed.createdAt || 0) < SUCCESS_MAX_AGE_MS) {
        await hydrateMember(parsed.memberId);
      }
    }
  } catch (_) {}

  function buildConicGradient(n) {
    const step = 360 / n;
    const stops = [];
    for (let i = 0; i < n; i++) {
      const a = i * step;
      const b = (i + 1) * step;
      const mid = a + step / 2;
      if (i % 2 === 0) {
        stops.push(`#080808 ${a}deg`, `#2a2a2a ${mid}deg`, `#111111 ${b}deg`);
      } else {
        stops.push(`#ffffff ${a}deg`, `#e6e6e6 ${mid}deg`, `#fafafa ${b}deg`);
      }
    }
    return `conic-gradient(${stops.join(", ")})`;
  }

  function formatWheelLabel(label) {
    return formatWheelSegmentDisplayLabel(label);
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
    wheelEl.style.background = buildConicGradient(n);
    wheelEl.style.transform = `rotate(${currentRotation}deg)`;

    const segmentHtml = wheelLabels.map((label, i) => {
      const angle = (i + 0.5) * (360 / n);
      const isWhite = i % 2 === 1;
      const segClass = isWhite ? "fidelity-roulette-wheel-segment fidelity-roulette-segment-white" : "fidelity-roulette-wheel-segment";
      const displayLabel = formatWheelLabel(label);
      // Demi-disque bas (bissectrice > 180°) : inverser la rotation du libellé pour qu’il ne soit pas à l’envers.
      const labelRotateDeg = angle > 180 ? 90 : -90;
      return `<div class="${segClass}" style="transform: rotate(${angle}deg); --label-rotate: ${labelRotateDeg}deg;"><span class="fidelity-roulette-segment-label-anchor"><span class="fidelity-roulette-segment-label fidelity-roulette-segment-label-text">${escapeHtml(displayLabel)}</span></span></div>`;
    }).join("");

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
        feedback.textContent = `Il te faut ${spinCost} ticket(s). Gagne des tickets via les missions ou (mode points) convertis tes points sur la page carte.`;
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

      const winIndex = pickWheelIndexForReward(wheelLabels, rewardLabel);

      const n = wheelLabels.length;
      const segmentAngle = 360 / n;
      /* Un tour complet depuis la position actuelle, puis alignement segment + tours bonus */
      const baseRotation = spinStart + 360;
      let deltaMod = (90 - (winIndex + 0.5) * segmentAngle - baseRotation) % 360;
      if (deltaMod < 0) deltaMod += 360;
      const finalDelta = deltaMod + 360 * ROULETTE_EXTRA_TURNS;
      const targetRotation = baseRotation + finalDelta;

      const showOutcome = async () => {
        isSpinning = false;
        clearBusy();
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
        if (isWin) triggerConfetti();
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

      wheelEl.style.transition = `transform ${spinDurationMs}ms cubic-bezier(0.17, 0.82, 0.24, 1)`;
      wheelEl.style.transform = `rotate(${targetRotation}deg)`;

      let completed = false;
      const fallbackMs = spinDurationMs + 750;
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

  function triggerConfetti() {
    if (prefersReducedMotion() || typeof window.confetti !== "function") return;
    const mobile =
      typeof globalThis.matchMedia === "function" && globalThis.matchMedia("(max-width: 520px)").matches;
    const duration = mobile ? 1600 : 2400;
    const end = Date.now() + duration;
    const n = mobile ? 2 : 4;

    (function frame() {
      window.confetti({
        particleCount: n,
        angle: 60,
        spread: 52,
        origin: { x: 0 },
        colors: ["#ff0055", "#00ffcc", "#ffd700"],
      });
      window.confetti({
        particleCount: n,
        angle: 120,
        spread: 52,
        origin: { x: 1 },
        colors: ["#ff0055", "#00ffcc", "#ffd700"],
      });

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
        feedback.textContent = "Tickets ajoutés à ta carte.";
        feedback.classList.remove("hidden");
        setTimeout(() => feedback.classList.add("hidden"), 4000);
      }
    } catch (_) {}
  }

  function bindEvents() {
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
  }

  fidelityDocumentListenersAbort?.abort();
  fidelityDocumentListenersAbort = new AbortController();
  const { signal } = fidelityDocumentListenersAbort;

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
    },
    { signal }
  );

  rerender();
  tryAutoClaimOnReturn();
}
