/** Transition hero « Merci, bonne chance ! » après vérif Google (parcours QR). */

export const QR_THANKS_TITLE = "Merci, bonne chance !";

function qrPrefersReducedMotion() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

/**
 * @param {Element | null} el
 * @param {number} ms
 */
function waitAnimationFallback(el, ms) {
  return new Promise((resolve) => {
    if (!el) {
      resolve();
      return;
    }
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      el.removeEventListener("animationend", onAnim);
      resolve();
    };
    const onAnim = (e) => {
      if (e.target !== el) return;
      done();
    };
    el.addEventListener("animationend", onAnim);
    globalThis.setTimeout(done, ms);
  });
}

/**
 * @param {HTMLElement} rootEl
 * @param {() => unknown} getState
 */
export function applyQrThanksHero(rootEl, getState) {
  void getState;
  const inner = rootEl.querySelector(".fidelity-qr-hero-title-inner");
  const h1 = rootEl.querySelector("#fidelity-qr-hero-title");
  const success = rootEl.querySelector("#fidelity-qr-hero-success");
  if (inner && h1) {
    inner.textContent = QR_THANKS_TITLE;
    inner.classList.remove("fidelity-qr-hero-title-inner--exit", "fidelity-qr-hero-title-inner--enter");
    h1.classList.remove("fidelity-qr-title--lead");
    h1.classList.add("fidelity-qr-title--thanks");
  } else {
    const legacy = rootEl.querySelector(".fidelity-qr-title");
    if (legacy) {
      legacy.textContent = QR_THANKS_TITLE;
      legacy.classList.add("fidelity-qr-title--thanks", "fidelity-qr-title--lead");
    }
  }
  success?.classList.add("fidelity-qr-hero-success--visible");
}

/**
 * @param {HTMLElement} rootEl
 */
export async function runQrThanksHeroTransition(rootEl) {
  const inner = rootEl.querySelector(".fidelity-qr-hero-title-inner");
  const h1 = rootEl.querySelector("#fidelity-qr-hero-title");
  const hero = rootEl.querySelector(".fidelity-qr-hero");
  const success = rootEl.querySelector("#fidelity-qr-hero-success");
  if (!inner || !h1) {
    applyQrThanksHero(rootEl, () => ({}));
    return;
  }
  if (inner.textContent.trim() === QR_THANKS_TITLE) {
    h1.classList.add("fidelity-qr-title--thanks");
    h1.classList.remove("fidelity-qr-title--lead");
    success?.classList.add("fidelity-qr-hero-success--visible");
    return;
  }
  if (qrPrefersReducedMotion()) {
    applyQrThanksHero(rootEl, () => ({}));
    return;
  }
  hero?.classList.add("fidelity-qr-hero--celebrate");
  inner.classList.remove("fidelity-qr-hero-title-inner--enter");
  inner.classList.add("fidelity-qr-hero-title-inner--exit");
  await waitAnimationFallback(inner, 480);
  inner.textContent = QR_THANKS_TITLE;
  h1.classList.remove("fidelity-qr-title--lead");
  h1.classList.add("fidelity-qr-title--thanks");
  inner.classList.remove("fidelity-qr-hero-title-inner--exit");
  inner.classList.add("fidelity-qr-hero-title-inner--enter");
  await waitAnimationFallback(inner, 720);
  inner.classList.remove("fidelity-qr-hero-title-inner--enter");
  success?.classList.add("fidelity-qr-hero-success--visible");
  globalThis.setTimeout(() => hero?.classList.remove("fidelity-qr-hero--celebrate"), 900);
}
