/**
 * Écran de chargement route fidélité : voile flouté + logo commerce animé (GSAP si dispo).
 */
import { resolveClientLogoImgSrc, resolveClientNotificationIconImgSrc } from "./lib/resolve-client-logo-src.js";

const OVERLAY_ID = "fidelity-route-loading-overlay";

/** @type { { kill: () => void } | null } */
let logoSpinTween = null;

function prefersReducedMotion() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

function doubleRAF() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

/** @returns {HTMLElement} */
export function mountFidelityRouteLoadingOverlay() {
  document.getElementById(OVERLAY_ID)?.remove();
  const el = document.createElement("div");
  el.id = OVERLAY_ID;
  el.className = "fidelity-route-loading-overlay";
  el.setAttribute("aria-busy", "true");
  el.innerHTML = `
    <div class="fidelity-route-loading-overlay__veil" aria-hidden="true"></div>
    <div class="fidelity-route-loading-overlay__content">
      <div class="fidelity-route-loading__logo-ring">
        <img class="fidelity-route-loading__logo" alt="" width="120" height="120" decoding="async" />
      </div>
    </div>`;
  document.body.appendChild(el);
  document.body.setAttribute("aria-busy", "true");
  requestAnimationFrame(() => {
    el.classList.add("fidelity-route-loading-overlay--visible");
  });
  return el;
}

/**
 * @param {HTMLElement} overlayEl
 * @param {Record<string, unknown> | null | undefined} business
 * @param {string} slug
 * @param {string} apiBase
 */
export function setFidelityRouteLoadingLogo(overlayEl, business, slug, apiBase) {
  const img = overlayEl?.querySelector(".fidelity-route-loading__logo");
  if (!(img instanceof HTMLImageElement)) return;
  const src = resolveClientNotificationIconImgSrc(business, String(slug || ""), String(apiBase || ""));
  if (!src) {
    img.classList.add("fidelity-route-loading__logo--empty");
    return;
  }
  const fallback = resolveClientLogoImgSrc(business, String(slug || ""), String(apiBase || ""));
  img.onerror = null;
  if (fallback && fallback !== src) {
    img.onerror = () => {
      img.onerror = null;
      img.src = fallback;
    };
  }
  img.src = src;
  img.classList.remove("fidelity-route-loading__logo--empty");
}

/**
 * @param {HTMLElement} overlayEl
 */
export function startFidelityRouteLoadingAnimations(overlayEl) {
  if (!overlayEl) return;
  const logo = overlayEl.querySelector(".fidelity-route-loading__logo");
  const content = overlayEl.querySelector(".fidelity-route-loading-overlay__content");
  logoSpinTween?.kill();
  logoSpinTween = null;

  const g = typeof globalThis.gsap !== "undefined" ? globalThis.gsap : undefined;

  const logoEl = logo instanceof HTMLImageElement ? logo : null;
  const hasLogo = logoEl && logoEl.src && !logoEl.classList.contains("fidelity-route-loading__logo--empty");

  if (g && content && !prefersReducedMotion()) {
    g.fromTo(content, { scale: 0.88, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.55, ease: "power3.out" });
    if (hasLogo) {
      g.set(logoEl, { transformOrigin: "50% 50%" });
      logoSpinTween = g.to(logoEl, { rotation: 360, duration: 2.8, repeat: -1, ease: "none" });
    }
  } else {
    overlayEl.classList.add("fidelity-route-loading-overlay--css-spin");
    if (content) content.classList.add("fidelity-route-loading-overlay__content--in");
  }
}

/**
 * @param {HTMLElement} overlayEl
 * @param {{ minVisibleMs?: number }} [opts]
 */
export async function dismissFidelityRouteLoadingOverlay(overlayEl, opts = {}) {
  const { minVisibleMs = 950 } = opts;
  const el = overlayEl && document.body.contains(overlayEl) ? overlayEl : document.getElementById(OVERLAY_ID);
  if (!el) {
    document.body.removeAttribute("aria-busy");
    return;
  }

  logoSpinTween?.kill();
  logoSpinTween = null;

  const t0 = performance.now();
  await doubleRAF();
  await new Promise((r) => setTimeout(r, 40));
  const elapsed = performance.now() - t0;
  if (elapsed < minVisibleMs) {
    await new Promise((r) => setTimeout(r, minVisibleMs - elapsed));
  }

  const g = typeof globalThis.gsap !== "undefined" ? globalThis.gsap : undefined;

  if (g) {
    await new Promise((resolve) => {
      g.to(el, {
        opacity: 0,
        duration: 0.48,
        ease: "power2.inOut",
        onComplete: () => {
          el.remove();
          resolve();
        },
      });
    });
  } else {
    el.classList.add("fidelity-route-loading-overlay--out");
    await new Promise((r) => setTimeout(r, 480));
    el.remove();
  }
  document.body.removeAttribute("aria-busy");
}
