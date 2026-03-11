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

export async function initClientFidelityPage({ slug, apiBase, rootEl }) {
  const api = createClientFidelityApi(apiBase);
  const store = createClientFidelityStore({ slug });

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

  function rerender() {
    renderClientPage(rootEl, store.get());
    bindEvents();
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
    try {
      await api.convertTickets(slug, state.member.id, points, genIdempotencyKey());
      if (feedback) {
        feedback.textContent = "Conversion réussie.";
        feedback.classList.remove("hidden");
      }
      await refreshMemberData();
    } catch (err) {
      if (feedback) {
        feedback.textContent = err.message || "Conversion impossible.";
        feedback.classList.remove("hidden");
      }
    }
  }

  async function onSpinRoulette() {
    const state = store.get();
    const feedback = rootEl.querySelector("#fidelity-v2-game-feedback");
    const spinBtn = rootEl.querySelector("#fidelity-v2-spin-btn");
    if (spinBtn) spinBtn.disabled = true;
    try {
      const result = await api.spin(slug, "roulette", state.member.id, getFingerprint(), genIdempotencyKey());
      if (feedback) {
        const rewardLabel = result.reward?.label || "Pas de lot";
        feedback.textContent = `Résultat: ${rewardLabel}`;
        feedback.classList.remove("hidden");
      }
      await refreshMemberData();
    } catch (err) {
      if (feedback) {
        feedback.textContent = err.message || "Spin impossible.";
        feedback.classList.remove("hidden");
      }
    } finally {
      if (spinBtn) spinBtn.disabled = false;
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
