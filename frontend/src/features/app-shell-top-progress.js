/**
 * Barre de progression fine en haut du shell SaaS /app (style admin Shopify — trait lumineux).
 */

let progressRaf = null;

/** @param {HTMLElement | null | undefined} el */
function getFill(el) {
  return el?.querySelector?.(".app-main-loading__fill") ?? null;
}

function cancelProgressLoop() {
  if (progressRaf != null) {
    cancelAnimationFrame(progressRaf);
    progressRaf = null;
  }
}

/** @returns {number} */
function nowMs() {
  if (
    typeof globalThis !== "undefined" &&
    globalThis.performance &&
    typeof globalThis.performance.now === "function"
  ) {
    return globalThis.performance.now();
  }
  return Date.now();
}

/**
 * Démarre l’animation d’approche asymptotique (jusqu’à ~88 %) jusqu’à {@link finishAppLoadingProgress}.
 * @param {HTMLElement | null} loadingEl `#app-main-loading`
 */
export function startAppLoadingProgress(loadingEl) {
  const fill = getFill(loadingEl);
  if (!loadingEl || !fill) return;
  cancelProgressLoop();
  loadingEl.classList.remove("hidden");
  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  fill.style.transition = reduced ? "none" : "transform 0.42s cubic-bezier(0.22, 1, 0.36, 1)";
  fill.style.transformOrigin = "left center";

  loadingEl.setAttribute("aria-busy", "true");

  if (reduced) {
    fill.style.transform = "scaleX(0.45)";
    return;
  }

  fill.style.transform = "scaleX(0.04)";

  const t0 = nowMs();

  const tick = () => {
    const now = nowMs();
    const elapsed = now - t0;
    const p = Math.min(0.88, 1 - Math.exp(-elapsed / 1650));
    fill.style.transform = `scaleX(${Math.max(0.045, p)})`;
    progressRaf = requestAnimationFrame(tick);
  };
  progressRaf = requestAnimationFrame(tick);
}

/**
 * Termine la barre (remplissage → masquée), ou masquage immédiat.
 * @param {HTMLElement | null} loadingEl
 * @param {{ immediate?: boolean }} [opts]
 */
export function finishAppLoadingProgress(loadingEl, opts = {}) {
  const { immediate } = opts;
  const fill = getFill(loadingEl);
  cancelProgressLoop();

  if (!loadingEl) return;

  if (!fill) {
    loadingEl.classList.add("hidden");
    return;
  }

  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (immediate || reduced) {
    fill.style.transition = "";
    fill.style.transform = "scaleX(0)";
    loadingEl.classList.add("hidden");
    loadingEl.removeAttribute("aria-busy");
    return;
  }

  fill.style.transition = "transform 0.42s cubic-bezier(0.2, 0.82, 0.28, 1)";
  const done = () => {
    loadingEl.classList.add("hidden");
    loadingEl.removeAttribute("aria-busy");
    fill.style.transform = "scaleX(0)";
    fill.style.transition = "";
  };

  fill.getBoundingClientRect();
  fill.style.transform = "scaleX(1)";

  const onEnd = (e) => {
    if (e.propertyName !== "transform") return;
    fill.removeEventListener("transitionend", onEnd);
    done();
  };
  fill.addEventListener("transitionend", onEnd, { once: true });
  window.setTimeout(() => {
    if (loadingEl.classList.contains("hidden")) return;
    fill.removeEventListener("transitionend", onEnd);
    done();
  }, 700);
}
