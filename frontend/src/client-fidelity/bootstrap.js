import { createClientFidelityApi } from "./api/clientApi.js";
import { createClientFidelityStore } from "./state/store.js";
import { renderClientPage } from "./ui/view.js";
import { memberStorageKey, SUCCESS_MAX_AGE_MS } from "./constants.js";

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
const ROULETTE_SPIN_DURATION_MS = 4000;
const ROULETTE_EXTRA_TURNS = 6;
const DEFAULT_WHEEL_LABELS = ["PERDU", "PERDU", "Café offert", "PERDU", "-10%", "PERDU", "Dessert", "PERDU"];

export async function initClientFidelityPage({ slug, apiBase, rootEl, gamePage = false }) {
  const api = createClientFidelityApi(apiBase);
  const store = createClientFidelityStore({ slug });
  
  let isSpinning = false;
  let wheelLabels = [...DEFAULT_WHEEL_LABELS];
  let currentRotation = 0;

  async function hydrateMember(memberId) {
    if (!memberId) return;
    const [member, gamesData, tickets, rewardsData, actionsData] = await Promise.all([
      api.getMember(slug, memberId),
      api.getGames(slug),
      api.getTickets(slug, memberId),
      api.getRewards(slug, memberId),
      api.getEngagementActions(slug),
    ]);
    const wallet = await api.getWalletUrls(slug, memberId);
    store.patch({
      member,
      games: gamesData?.games || [],
      tickets,
      rewards: rewardsData?.rewards || [],
      engagementActions: actionsData?.actions || [],
      wallet,
    });
  }

  const business = await api.getBusiness(slug);
  store.patch({ business });
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
    for (let i = 0; i <= n; i++) {
      const deg = i * step;
      const fill = i % 2 === 0 ? "#1a2b42" : "#fff";
      stops.push(`${fill} ${deg}deg`);
    }
    return `conic-gradient(${stops.join(", ")})`;
  }

  function initRouletteWheel() {
    const wheelEl = rootEl.querySelector("#fidelity-roulette-wheel");
    if (!wheelEl || isSpinning) return;

    const n = wheelLabels.length;
    wheelEl.style.background = buildConicGradient(n);
    wheelEl.style.transform = `rotate(${currentRotation}deg)`;

    const segmentHtml = wheelLabels.map((label, i) => {
      const angle = (i + 0.5) * (360 / n);
      const isWhite = i % 2 === 1;
      const segClass = isWhite ? "fidelity-roulette-wheel-segment fidelity-roulette-segment-white" : "fidelity-roulette-wheel-segment";
      return `<div class="${segClass}" style="transform: rotate(${angle}deg);"><span>${escapeHtml(label)}</span></div>`;
    }).join("");

    wheelEl.innerHTML = segmentHtml;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function rerender() {
    renderClientPage(rootEl, store.get(), { gamePage, slug });
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
        errorEl.textContent = err.message || "Erreur lors de la création.";
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
        feedback.textContent = err.message || "Conversion impossible.";
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

    isSpinning = true;
    spinBtn.disabled = true;
    if (feedback) {
      feedback.classList.add("hidden");
      feedback.classList.remove("success", "error");
    }

    // Rotation d'attente (rapide) pendant l'appel API
    wheelEl.style.transition = "transform 0.15s linear";
    const spinStart = currentRotation;
    wheelEl.style.transform = `rotate(${spinStart + 360}deg)`;

    try {
      const result = await api.spin(slug, "roulette", state.member.id, getFingerprint(), genIdempotencyKey());
      const rewardLabel = (result.reward?.label || "PERDU").trim();
      const isWin = result.reward && result.reward.type !== "none";

      let winIndex = wheelLabels.findIndex((l) => String(l).toLowerCase() === rewardLabel.toLowerCase());
      if (winIndex === -1) {
        winIndex = 0;
        wheelLabels[0] = rewardLabel;
        initRouletteWheel();
      }

      const n = wheelLabels.length;
      const segmentAngle = 360 / n;
      // Arrêt : le segment winIndex doit être sous l'indicateur (à droite = 0°)
      const finalDelta = 360 * ROULETTE_EXTRA_TURNS + (360 - winIndex * segmentAngle);
      const targetRotation = currentRotation + finalDelta;

      wheelEl.style.transition = `transform ${ROULETTE_SPIN_DURATION_MS}ms cubic-bezier(0.2, 0.8, 0.3, 1)`;
      wheelEl.style.transform = `rotate(${targetRotation}deg)`;

      currentRotation = targetRotation;

      setTimeout(async () => {
        isSpinning = false;
        spinBtn.disabled = false;

        if (feedback) {
          feedback.textContent = isWin ? `Gagné : ${rewardLabel} ! 🎉` : "Dommage, essaie encore !";
          feedback.classList.add(isWin ? "success" : "error");
          feedback.classList.remove("hidden");
        }

        if (isWin) triggerConfetti();
        await refreshMemberData();
      }, ROULETTE_SPIN_DURATION_MS);
    } catch (err) {
      isSpinning = false;
      spinBtn.disabled = false;
      wheelEl.style.transition = "transform 0.5s ease-out";
      wheelEl.style.transform = `rotate(${currentRotation}deg)`;

      if (feedback) {
        feedback.textContent = err.message || "Erreur lors du jeu.";
        feedback.classList.add("error");
        feedback.classList.remove("hidden");
      }
    }
  }

  function triggerConfetti() {
    if (typeof window.confetti === "function") {
      const duration = 3000;
      const end = Date.now() + duration;

      (function frame() {
        window.confetti({
          particleCount: 5,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ['#ff0055', '#00ffcc', '#ffd700']
        });
        window.confetti({
          particleCount: 5,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: ['#ff0055', '#00ffcc', '#ffd700']
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      }());
    } else {
      console.log("Confetti library not loaded.");
    }
  }

  async function onClaimAction(actionType) {
    const state = store.get();
    const feedback = rootEl.querySelector("#fidelity-v2-action-feedback");
    try {
      await api.claimEngagement(slug, state.member.id, actionType);
      if (feedback) {
        feedback.textContent = "Demande envoyée. Les points seront crédités selon les règles du commerce.";
        feedback.classList.remove("hidden");
      }
      await refreshMemberData();
    } catch (err) {
      if (feedback) {
        feedback.textContent = err.message || "Impossible de réclamer les points.";
        feedback.classList.remove("hidden");
      }
    }
  }

  function bindEvents() {
    rootEl.querySelector("#fidelity-v2-form")?.addEventListener("submit", onSignupSubmit);
    rootEl.querySelector("#fidelity-v2-refresh")?.addEventListener("click", refreshMemberData);
    rootEl.querySelector("#fidelity-v2-convert-btn")?.addEventListener("click", onConvertTickets);
    rootEl.querySelector("#fidelity-v2-spin-btn")?.addEventListener("click", onSpinRoulette);
    rootEl.querySelectorAll("[data-claim-action]").forEach((btn) => {
      btn.addEventListener("click", () => onClaimAction(btn.getAttribute("data-claim-action")));
    });
    const apple = rootEl.querySelector("#fidelity-v2-apple");
    const google = rootEl.querySelector("#fidelity-v2-google");
    const wallet = store.get().wallet || {};
    if (apple && wallet.apple) apple.href = wallet.apple;
    if (google && wallet.google) google.href = wallet.google;
  }

  rerender();
}
