import {
  loadRewardCelebrationStorage,
  saveRewardCelebrationStorage,
} from "./lib/reward-celebration-storage.js";
import { buildCelebrationQueue } from "./lib/member-reward-celebrations.js";
import { openRewardRedeemUnlocked } from "./bind-reward-redeem-ui.js";

/** @typedef {{ kind: "welcome"|"tier_unlocked"; threshold: number; tierIndex?: number; points?: number; label: string; imageUrl?: string; costLine?: string; bonusChip?: string; unlocked?: boolean }} CelebrationItem */

const pendingByRoot = new WeakMap();

function prefersReducedMotion() {
  if (typeof globalThis.matchMedia !== "function") return false;
  return globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * @param {HTMLElement} rootEl
 */
function getModal(rootEl) {
  return rootEl.querySelector("#fidelity-reward-celebration-modal");
}

/**
 * @param {HTMLElement} modal
 */
function closeCelebrationModal(modal) {
  if (!modal) return;
  modal.classList.remove("fidelity-reward-celebration--open", "fidelity-reward-celebration--instant");
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

/**
 * @param {HTMLElement} rootEl
 * @param {CelebrationItem} item
 * @returns {Promise<void>}
 */
function showOneCelebration(rootEl, item) {
  const modal = getModal(rootEl);
  if (!modal) return Promise.resolve();

  const kicker = modal.querySelector("#fidelity-reward-celebration-kicker");
  const title = modal.querySelector("#fidelity-reward-celebration-title");
  const lead = modal.querySelector("#fidelity-reward-celebration-lead");
  const img = modal.querySelector("#fidelity-reward-celebration-img");
  const prize = modal.querySelector("#fidelity-reward-celebration-prize");
  const bonus = modal.querySelector("#fidelity-reward-celebration-bonus");
  const primary = modal.querySelector("#fidelity-reward-celebration-primary");

  const isWelcome = item.kind === "welcome";
  if (kicker) {
    kicker.textContent = isWelcome ? "Bienvenue" : "Palier atteint";
  }
  if (title) {
    title.textContent = isWelcome ? "Ta récompense t'attend" : "Félicitations !";
  }
  if (lead) {
    lead.textContent = isWelcome
      ? item.unlocked
        ? "C’est la récompense configurée par le commerce — tu peux déjà en profiter en magasin."
        : "C’est la récompense que tu pourras débloquer en cumulant sur ta carte fidélité."
      : "Tu viens de débloquer une récompense sur ta carte fidélité.";
  }
  if (img instanceof HTMLImageElement) {
    img.src = item.imageUrl || "/assets/gift/gift1.png";
    img.alt = item.label || "Récompense";
  }
  if (prize) {
    prize.textContent = item.label || "Récompense";
    prize.classList.remove("hidden");
  }
  if (bonus) {
    const chip = String(item.bonusChip || "").trim();
    if (chip) {
      bonus.textContent = chip;
      bonus.classList.remove("hidden");
    } else {
      bonus.textContent = "";
      bonus.classList.add("hidden");
    }
  }
  if (primary) {
    const unlocked =
      item.kind === "tier_unlocked" || (item.kind === "welcome" && item.unlocked === true);
    primary.textContent = unlocked ? "Utiliser en magasin" : "Compris";
    primary.dataset.celebrationUnlocked = unlocked ? "1" : "0";
    primary.dataset.celebrationLabel = encodeURIComponent(item.label || "");
    primary.dataset.celebrationCostline = encodeURIComponent(item.costLine || "");
    primary.dataset.celebrationTierIndex = String(Math.max(0, item.tierIndex ?? 0));
    primary.dataset.celebrationPoints = String(Math.max(0, item.points ?? item.threshold ?? 0));
  }

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  return new Promise((resolve) => {
    const done = () => {
      closeCelebrationModal(modal);
      resolve();
    };

    const onPrimary = () => {
      if (primary?.dataset.celebrationUnlocked === "1") {
        let label = "";
        let costLine = "";
        try {
          label = decodeURIComponent(String(primary.dataset.celebrationLabel || ""));
          costLine = decodeURIComponent(String(primary.dataset.celebrationCostline || ""));
        } catch (_) {}
        const tierIndex = Math.max(
          0,
          parseInt(String(primary.dataset.celebrationTierIndex || "0"), 10) || 0,
        );
        const points = Math.max(
          0,
          parseInt(String(primary.dataset.celebrationPoints || "0"), 10) || 0,
        );
        openRewardRedeemUnlocked(rootEl, { label, costLine, tierIndex, points });
      }
      cleanup();
      done();
    };

    const onClose = () => {
      cleanup();
      done();
    };

    const cleanup = () => {
      primary?.removeEventListener("click", onPrimary);
      for (const btn of modal.querySelectorAll("[data-fid-celebration-close]")) {
        btn.removeEventListener("click", onClose);
      }
    };

    requestAnimationFrame(() => {
      modal.classList.add("fidelity-reward-celebration--open");
      if (prefersReducedMotion()) modal.classList.add("fidelity-reward-celebration--instant");
      else modal.classList.remove("fidelity-reward-celebration--instant");
      primary?.addEventListener("click", onPrimary, { once: true });
      for (const btn of modal.querySelectorAll("[data-fid-celebration-close]")) {
        btn.addEventListener("click", onClose, { once: true });
      }
    });
  });
}

/**
 * @param {HTMLElement} rootEl
 * @param {CelebrationItem[]} queue
 * @param {{ slug: string; memberId: string; onDone?: () => void }} opts
 */
export async function runRewardCelebrationQueue(rootEl, queue, opts) {
  if (!queue.length) return;
  const { slug, memberId, onDone } = opts;
  let storage = loadRewardCelebrationStorage(slug, memberId);

  for (const item of queue) {
    await showOneCelebration(rootEl, item);
    if (item.kind === "welcome") {
      storage = { ...storage, welcomeShown: true };
    }
    if (item.kind === "tier_unlocked" && Number.isInteger(item.threshold)) {
      const tiers = new Set(storage.tiers);
      tiers.add(item.threshold);
      storage = { ...storage, tiers: [...tiers] };
    }
    saveRewardCelebrationStorage(slug, memberId, storage);
  }

  onDone?.();
}

/**
 * @param {HTMLElement} rootEl
 * @param {CelebrationItem[]} queue
 * @param {{ slug: string; memberId: string }} meta
 */
export function scheduleRewardCelebrations(rootEl, queue, meta) {
  if (!queue.length) return;
  const prev = pendingByRoot.get(rootEl);
  const run = async () => {
    await prev;
    await runRewardCelebrationQueue(rootEl, queue, meta);
  };
  const p = run();
  pendingByRoot.set(rootEl, p);
}

/**
 * @param {{
 *   rootEl: HTMLElement;
 *   slug: string;
 *   getState: () => Record<string, unknown>;
 *   getPreviousBalance: () => number | null;
 *   setPreviousBalance: (n: number) => void;
 *   welcomeBonusJustGranted?: { type?: string; amount?: number } | null;
 *   signal: AbortSignal;
 * }} ctx
 */
export function bindRewardCelebrationUi(ctx) {
  const { rootEl, slug, getState, signal } = ctx;
  const modal = getModal(rootEl);
  if (!modal) return;

  const onKey = (e) => {
    if (e.key !== "Escape") return;
    if (modal.classList.contains("hidden")) return;
    closeCelebrationModal(modal);
  };
  document.addEventListener("keydown", onKey, { signal });
}

/**
 * Déclenche la file de célébrations si membre réel (hors invité QR).
 * @param {typeof ctx} ctx
 */
export function maybeScheduleRewardCelebrations(ctx) {
  const { rootEl, slug, getState, getPreviousBalance, setPreviousBalance, welcomeBonusJustGranted } = ctx;
  const state = getState();
  const member = state?.member;
  if (!member?.id) return;
  const email = String(member.email || "");
  if (email.toLowerCase().endsWith("@guest.invalid")) return;

  const programType = String(state.business?.program_type || "points").toLowerCase();
  const balance = Math.max(0, Math.floor(Number(member.points) || 0));
  const previousBalance = getPreviousBalance();

  const storage = loadRewardCelebrationStorage(slug, String(member.id));
  const queue = buildCelebrationQueue({
    slug,
    memberId: String(member.id),
    business: state.business,
    member,
    programType,
    previousBalance,
    storage,
    welcomeBonusJustGranted: welcomeBonusJustGranted ?? null,
  });

  setPreviousBalance(balance);

  if (queue.length) {
    scheduleRewardCelebrations(rootEl, queue, { slug, memberId: String(member.id) });
  }
}
