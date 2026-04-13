import { memberIdToQrDataUrl } from "./lib/member-qr-dataurl.js";

const closeMap = new WeakMap();

/**
 * @param {HTMLElement} rootEl
 */
export function closeRewardRedeemModal(rootEl) {
  closeMap.get(rootEl)?.();
}

function prefersReducedMotion() {
  if (typeof globalThis.matchMedia !== "function") return false;
  return globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * @param {{ rootEl: HTMLElement; getState: () => Record<string, unknown>; signal: AbortSignal }} p
 */
export function bindRewardRedeemUi({ rootEl, getState, signal }) {
  const modal = rootEl.querySelector("#fidelity-reward-redeem-modal");
  if (!modal) return;

  const unlockedEl = modal.querySelector("#fidelity-reward-redeem-state-unlocked");
  const lockedEl = modal.querySelector("#fidelity-reward-redeem-state-locked");
  const heading = modal.querySelector("#fidelity-reward-redeem-heading");
  const fineEl = modal.querySelector("#fidelity-reward-redeem-fine");
  const qrImg = modal.querySelector("#fidelity-reward-redeem-qr");
  const qrSkel = modal.querySelector("#fidelity-reward-redeem-qr-skel");
  const lockedHead = modal.querySelector("#fidelity-reward-redeem-locked-heading");
  const lockedBody = modal.querySelector("#fidelity-reward-redeem-locked-body");
  const backdrop = modal.querySelector(".fidelity-reward-redeem-modal__backdrop");
  const closeBtn = modal.querySelector("[data-fid-redeem-close]");
  const panel = modal.querySelector(".fidelity-reward-redeem-modal__panel");

  function closeModal() {
    modal.classList.remove("fidelity-reward-redeem-modal--open", "fidelity-reward-redeem-modal--instant");
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (qrImg) {
      qrImg.src = "";
      qrImg.classList.add("hidden");
    }
    if (qrSkel) qrSkel.classList.remove("hidden");
  }

  closeMap.set(rootEl, closeModal);

  async function openUnlocked({ label, costLine }) {
    if (!unlockedEl || !lockedEl || !heading || !fineEl || !qrImg || !qrSkel) return;
    const state = getState();
    const memberId = state?.member?.id;
    unlockedEl.classList.remove("hidden");
    lockedEl.classList.add("hidden");
    heading.textContent = label;
    fineEl.textContent = `Récompense affichée : ${label} · ${costLine}. Le solde est mis à jour par le commerce après validation.`;
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    modal.setAttribute("aria-labelledby", "fidelity-reward-redeem-heading");
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      modal.classList.add("fidelity-reward-redeem-modal--open");
      if (prefersReducedMotion()) modal.classList.add("fidelity-reward-redeem-modal--instant");
      else modal.classList.remove("fidelity-reward-redeem-modal--instant");
    });
    if (!memberId) return;
    qrSkel.classList.remove("hidden");
    qrImg.classList.add("hidden");
    try {
      qrImg.src = await memberIdToQrDataUrl(String(memberId));
      qrImg.alt = "Code à présenter en caisse";
      qrImg.classList.remove("hidden");
      qrSkel.classList.add("hidden");
    } catch {
      qrSkel.classList.add("hidden");
      fineEl.textContent = `Récompense : ${label} · ${costLine}. Ouvre ta carte Wallet pour te faire scanner, ou communique ton identifiant au personnel.`;
    }
  }

  function openLocked({ label, need, unitPhrase }) {
    if (!unlockedEl || !lockedEl || !lockedHead || !lockedBody) return;
    lockedEl.classList.remove("hidden");
    unlockedEl.classList.add("hidden");
    lockedHead.textContent = label;
    lockedBody.textContent =
      need <= 0
        ? "Bientôt disponible."
        : `Il te manque encore ${need} ${unitPhrase} pour débloquer cette récompense.`;
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    modal.setAttribute("aria-labelledby", "fidelity-reward-redeem-locked-heading");
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      modal.classList.add("fidelity-reward-redeem-modal--open");
      if (prefersReducedMotion()) modal.classList.add("fidelity-reward-redeem-modal--instant");
      else modal.classList.remove("fidelity-reward-redeem-modal--instant");
    });
  }

  function onTriggerClick(ev) {
    const btn = ev.target.closest?.("[data-fid-reward-trigger]");
    if (!(btn instanceof HTMLElement) || btn.tagName !== "BUTTON") return;
    const unlocked = btn.dataset.rewardUnlocked === "1";
    const threshold = Math.max(0, parseInt(String(btn.dataset.rewardThreshold || "0"), 10) || 0);
    const label = (() => {
      try {
        return decodeURIComponent(String(btn.dataset.rewardLabel || ""));
      } catch {
        return String(btn.dataset.rewardLabel || "");
      }
    })();
    let costLine = "";
    try {
      costLine = decodeURIComponent(String(btn.dataset.rewardCostline || ""));
    } catch {
      costLine = String(btn.dataset.rewardCostline || "");
    }
    const state = getState();
    const balance = Math.max(0, Math.floor(Number(state?.member?.points) || 0));
    const programType = String(state?.business?.program_type || "points").toLowerCase();
    const need = Math.max(0, threshold - balance);
    const unitPhrase =
      programType === "stamps" ? (need === 1 ? "tampon" : "tampons") : need === 1 ? "point" : "points";

    if (unlocked) {
      void openUnlocked({ label, costLine });
    } else {
      openLocked({ label, need, unitPhrase });
    }
  }

  rootEl.addEventListener("click", onTriggerClick, { signal });

  const onBackdrop = (e) => {
    if (e.target === backdrop) closeModal();
  };
  backdrop?.addEventListener("click", onBackdrop, { signal });
  closeBtn?.addEventListener("click", closeModal, { signal });

  panel?.addEventListener("click", (e) => e.stopPropagation(), { signal });
}
