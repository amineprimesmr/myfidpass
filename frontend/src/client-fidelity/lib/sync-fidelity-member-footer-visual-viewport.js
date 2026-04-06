/**
 * Safari iOS : le pied en position:fixed + bottom:0 est aligné sur le layout viewport, alors que la
 * barre d’URL (réduite ou non) change le visual viewport — il reste une bande où le fond fixed
 * (plage) reparaît. On expose l’écart en CSS pour allonger le padding du bandeau noir.
 *
 * Références : Visual Viewport API (MDN), comportements Safari / barre du bas (iOS 15+).
 *
 * @param {AbortSignal} signal
 * @returns {() => void}
 */
export function bindFidelityMemberFooterVisualViewport(signal) {
  const root = document.documentElement;
  const prop = "--fidelity-visual-gap-bottom";

  function sync() {
    const vv = globalThis.visualViewport;
    if (!vv) {
      root.style.removeProperty(prop);
      return;
    }
    const gapPx = computeVisualGapBottomPx(vv, globalThis.window.innerHeight);
    if (gapPx <= 0.5) root.style.removeProperty(prop);
    else root.style.setProperty(prop, `${gapPx}px`);
  }

  const vv = globalThis.visualViewport;
  if (!vv) {
    return () => {};
  }

  vv.addEventListener("resize", sync, { signal });
  vv.addEventListener("scroll", sync, { signal });
  globalThis.window.addEventListener("resize", sync, { signal });
  globalThis.window.addEventListener("orientationchange", sync, { signal });
  globalThis.window.addEventListener("pageshow", sync, { signal });
  signal.addEventListener("abort", () => root.style.removeProperty(prop), { once: true });
  sync();

  return () => {
    root.style.removeProperty(prop);
  };
}

/** @param {VisualViewport | null} vv @param {number} innerHeight */
export function computeVisualGapBottomPx(vv, innerHeight) {
  if (!vv || typeof innerHeight !== "number" || !Number.isFinite(innerHeight)) return 0;
  return Math.max(0, innerHeight - vv.offsetTop - vv.height);
}
