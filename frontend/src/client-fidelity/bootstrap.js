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

// Configuration de la Slot Machine
const SLOT_ITEM_HEIGHT = 120; // Doit correspondre à la hauteur en CSS
const SPIN_DURATION_MS = 3000;
const EXTRA_SPINS = 5; // Nombre de tours complets avant de s'arrêter

export async function initClientFidelityPage({ slug, apiBase, rootEl }) {
  const api = createClientFidelityApi(apiBase);
  const store = createClientFidelityStore({ slug });
  
  let isSpinning = false;
  let currentReelItems = [];

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

  function initSlotMachine() {
    const reelEl = rootEl.querySelector("#fidelity-slot-reel");
    if (!reelEl) return;

    // Récupérer les lots possibles (simulé ici, idéalement on les aurait dans l'état du jeu)
    // Pour l'instant, on utilise une liste par défaut ou on extrait des rewards existants
    const defaultItems = ["Rien", "Café Offert", "Rien", "-10%", "Rien", "Dessert Offert", "Rien", "Menu Gratuit"];
    
    // On duplique la liste pour l'effet de rotation
    currentReelItems = [...defaultItems];
    
    renderReel(reelEl, currentReelItems);
  }

  function renderReel(reelEl, items) {
    // On crée une longue liste pour l'animation
    const displayItems = [...items, ...items, ...items, ...items, ...items, ...items];
    
    reelEl.innerHTML = displayItems.map(item => 
      `<div class="fidelity-slot-item">${item}</div>`
    ).join("");
    
    // Position initiale (sur le premier élément du 2ème set pour pouvoir monter/descendre)
    const initialOffset = -(items.length * SLOT_ITEM_HEIGHT);
    reelEl.style.transform = `translateY(${initialOffset}px)`;
    reelEl.style.transition = "none";
    
    // Forcer le reflow
    reelEl.offsetHeight;
  }

  function rerender() {
    renderClientPage(rootEl, store.get());
    bindEvents();
    if (!isSpinning) {
      initSlotMachine();
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
    const reelEl = rootEl.querySelector("#fidelity-slot-reel");
    const spinBtn = rootEl.querySelector("#fidelity-v2-spin-btn");
    const feedback = rootEl.querySelector("#fidelity-v2-game-feedback");
    
    if (!reelEl || !spinBtn) return;
    
    isSpinning = true;
    spinBtn.disabled = true;
    
    if (feedback) {
      feedback.classList.add("hidden");
      feedback.classList.remove("success", "error");
    }

    // 1. Démarrer l'animation d'attente (rotation rapide infinie)
    const baseItemsCount = currentReelItems.length;
    const startY = -(baseItemsCount * SLOT_ITEM_HEIGHT);
    const endYWait = -(baseItemsCount * 4 * SLOT_ITEM_HEIGHT);
    
    reelEl.style.transition = `transform 2s linear infinite`;
    reelEl.style.transform = `translateY(${endYWait}px)`;

    try {
      // 2. Appel API en parallèle
      const result = await api.spin(slug, "roulette", state.member.id, getFingerprint(), genIdempotencyKey());
      const rewardLabel = result.reward?.label || "Perdu";
      const isWin = result.reward && result.reward.type !== "none";

      // 3. Calculer la position finale
      // On s'assure que le lot gagnant est dans notre liste, sinon on l'ajoute temporairement
      let targetIndex = currentReelItems.findIndex(item => item.toLowerCase() === rewardLabel.toLowerCase());
      if (targetIndex === -1) {
        currentReelItems[0] = rewardLabel; // On remplace le premier pour simplifier
        targetIndex = 0;
        renderReel(reelEl, currentReelItems); // Re-render silencieux
      }

      // Calcul de la position : on fait plusieurs tours complets (EXTRA_SPINS) + on s'arrête sur l'index
      // On vise le 3ème set d'éléments pour avoir de la marge
      const finalTargetY = -((baseItemsCount * 3) + targetIndex) * SLOT_ITEM_HEIGHT;

      // 4. Animer vers la position finale avec un effet de rebond (cubic-bezier)
      // On attend un peu pour que l'API ne réponde pas trop vite et qu'on voit l'animation
      setTimeout(() => {
        reelEl.style.transition = `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.15, 0.85, 0.3, 1.1)`;
        reelEl.style.transform = `translateY(${finalTargetY}px)`;

        // 5. Fin de l'animation
        setTimeout(async () => {
          isSpinning = false;
          spinBtn.disabled = false;
          
          // Mettre en surbrillance le lot
          const items = reelEl.querySelectorAll('.fidelity-slot-item');
          const winningItemIndex = (baseItemsCount * 3) + targetIndex;
          if (items[winningItemIndex]) {
             if(isWin) items[winningItemIndex].classList.add('winner');
          }

          if (feedback) {
            feedback.textContent = isWin ? `Gagné : ${rewardLabel} ! 🎉` : "Dommage, essaie encore !";
            feedback.classList.add(isWin ? "success" : "error");
            feedback.classList.remove("hidden");
          }

          // Déclencher les confettis si victoire (à implémenter)
          if (isWin) {
            triggerConfetti();
          }

          await refreshMemberData();
        }, SPIN_DURATION_MS);
      }, 500); // Petit délai artificiel minimum

    } catch (err) {
      isSpinning = false;
      spinBtn.disabled = false;
      reelEl.style.transition = "transform 0.5s ease-out";
      reelEl.style.transform = `translateY(${startY}px)`; // Retour au début
      
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
