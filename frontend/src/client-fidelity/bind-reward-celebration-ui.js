import {
  loadRewardCelebrationStorage,
  saveRewardCelebrationStorage,
} from "./lib/reward-celebration-storage.js";
import { buildCelebrationQueue } from "./lib/member-reward-celebrations.js";
import { waitForFidelityRouteLoadingDismissed } from "./fidelity-route-loading.js";
import { openRewardRedeemUnlocked } from "./bind-reward-redeem-ui.js";
import {
  prefetchQRCodeModule,
  rewardRedeemQrDataUrl,
} from "./lib/member-qr-dataurl.js";
/** @typedef {{ kind: "welcome"|"tier_unlocked"; threshold: number; tierIndex?: number; points?: number; label: string; imageUrl?: string; costLine?: string; bonusChip?: string; unlocked?: boolean }} CelebrationItem */

const pendingByRoot = new WeakMap();

function prefersReducedMotion() {
  if (typeof globalThis.matchMedia !== "function") return false;
  return globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function useInstantCelebrationMotion() {
  return (
    prefersReducedMotion() ||
    document.documentElement.classList.contains("fidpass-low-perf-mobile")
  );
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
  const redeemOpen = document.querySelector(
    "#fidelity-reward-redeem-modal.fidelity-reward-redeem-modal--open",
  );
  if (!redeemOpen) document.body.style.overflow = "";
}

/**
 * @param {HTMLElement} rootEl
 * @param {CelebrationItem} item
 * @param {{ getState: () => Record<string, unknown> }} ctx
 * @returns {Promise<void>}
 */
async function showOneCelebration(rootEl, item, ctx) {
  if (isFidelityRouteLoadingOverlayActiveQuick()) {
    await waitForFidelityRouteLoadingDismissed(1200);
  }
  const modal = getModal(rootEl);
  if (!modal) return;

  const kicker = modal.querySelector("#fidelity-reward-celebration-kicker");
  const title = modal.querySelector("#fidelity-reward-celebration-title");
  const lead = modal.querySelector("#fidelity-reward-celebration-lead");
  const img = modal.querySelector("#fidelity-reward-celebration-img");
  const prize = modal.querySelector("#fidelity-reward-celebration-prize");
  const bonus = modal.querySelector("#fidelity-reward-celebration-bonus");
  const primary = modal.querySelector("#fidelity-reward-celebration-primary");

  const isWelcome = item.kind === "welcome";
  const unlocked =
    item.kind === "tier_unlocked" || (item.kind === "welcome" && item.unlocked === true);

  if (kicker) {
    kicker.textContent = isWelcome ? "Bienvenue" : "Palier atteint";
  }
  if (title) {
    title.textContent = isWelcome ? "Ta récompense t'attend" : "Félicitations !";
  }
  if (lead) {
    if (isWelcome && unlocked) {
      lead.textContent = "";
      lead.classList.add("hidden");
    } else {
      lead.classList.remove("hidden");
      lead.textContent = isWelcome
        ? "C’est la récompense que tu pourras débloquer en cumulant sur ta carte fidélité."
        : "Tu viens de débloquer une récompense sur ta carte fidélité.";
    }
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
  if (primary instanceof HTMLButtonElement) {
    primary.disabled = false;
    primary.removeAttribute("aria-busy");
    primary.textContent = unlocked ? "Obtenir ma récompense" : "Compris";
  }

  const state = ctx.getState();
  const memberId = state?.member?.id;
  const programType = String(state?.business?.program_type || "points").toLowerCase();
  const tierIndex = Math.max(0, Number(item.tierIndex) || 0);
  const points = Math.max(0, Number(item.points ?? item.threshold) || 0);

  let prefetchedQr = "";
  /** @type {Promise<string> | null} */
  let qrPrefetchPromise = null;
  if (unlocked && memberId) {
    prefetchQRCodeModule();
    qrPrefetchPromise = rewardRedeemQrDataUrl({
      memberId: String(memberId),
      programType,
      tierIndex,
      points,
    }).then((url) => {
      prefetchedQr = url;
      return url;
    });
  }

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  const instant = useInstantCelebrationMotion();
  if (instant) modal.classList.add("fidelity-reward-celebration--instant");
  else modal.classList.remove("fidelity-reward-celebration--instant");
  modal.classList.add("fidelity-reward-celebration--open");

  return new Promise((resolve) => {
    const done = () => {
      closeCelebrationModal(modal);
      resolve();
    };

    const onPrimary = () => {
      cleanup();
      if (unlocked) {
        closeCelebrationModal(modal);
        openRewardRedeemUnlocked(rootEl, {
          label: item.label || "Récompense",
          costLine: String(item.costLine || ""),
          tierIndex,
          points,
          qrDataUrl: prefetchedQr || undefined,
          qrPrefetchPromise: qrPrefetchPromise ?? undefined,
        });
        resolve();
        return;
      }
      done();
    };

    const onBackdropClose = () => {
      cleanup();
      done();
    };

    const cleanup = () => {
      primary?.removeEventListener("click", onPrimary);
      const backdrop = modal.querySelector(".fidelity-reward-celebration__backdrop");
      backdrop?.removeEventListener("click", onBackdropClose);
    };

    primary?.addEventListener("click", onPrimary, { once: true });
    const backdrop = modal.querySelector(".fidelity-reward-celebration__backdrop");
    backdrop?.addEventListener("click", onBackdropClose, { once: true });
  });
}

function isFidelityRouteLoadingOverlayActiveQuick() {
  const el = document.getElementById("fidelity-route-loading-overlay");
  return !!(el && document.body.contains(el));
}

/**
 * @param {HTMLElement} rootEl
 * @param {CelebrationItem[]} queue
 * @param {{ slug: string; memberId: string; getState: () => Record<string, unknown>; onDone?: () => void }} opts
 */
export async function runRewardCelebrationQueue(rootEl, queue, opts) {
  if (!queue.length) return;
  const { slug, memberId, onDone, getState } = opts;
  let storage = loadRewardCelebrationStorage(slug, memberId);

  for (const item of queue) {
    await showOneCelebration(rootEl, item, { getState });
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
 * @param {{ slug: string; memberId: string; getState: () => Record<string, unknown> }} meta
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
  const { rootEl, signal } = ctx;
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
    scheduleRewardCelebrations(rootEl, queue, {
      slug,
      memberId: String(member.id),
      getState,
    });
  }
}
