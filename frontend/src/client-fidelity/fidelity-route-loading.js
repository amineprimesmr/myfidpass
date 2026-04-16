/**
 * Écran de chargement route fidélité : voile flouté + logo commerce animé (GSAP si dispo).
 */
import { resolveClientLogoImgSrc } from "./lib/resolve-client-logo-src.js";

const OVERLAY_ID = "fidelity-route-loading-overlay";
/** Masque #fidelity-app pendant le chargement pour éviter que le flou du voile ne montre la vraie page dans le logo. */
const HTML_LOADING_CLASS = "fidpass-fidelity-route-loading";
const FALLBACK_LOADING_LOGO_SRC = "/assets/chargement.png";

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
  document.documentElement.classList.add(HTML_LOADING_CLASS);
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
  if (!(img instanceof globalThis.HTMLImageElement)) return;
  const ring = img.parentElement;
  const src = resolveClientLogoImgSrc(business, String(slug || ""), String(apiBase || ""));
  const applyFallback = () => {
    img.classList.add("fidelity-route-loading__logo--empty");
    ring?.classList.add("fidelity-route-loading__logo-ring--placeholder");
    img.src = FALLBACK_LOADING_LOGO_SRC;
  };
  if (!src) {
    applyFallback();
    return;
  }
  img.onerror = () => {
    img.onerror = null;
    applyFallback();
  };
  img.src = src;
  img.classList.remove("fidelity-route-loading__logo--empty");
  ring?.classList.remove("fidelity-route-loading__logo-ring--placeholder");
  if (typeof img.decode === "function") {
    img.decode().catch(() => {});
  }
}

/**
 * @param {HTMLElement} overlayEl
 */
export function startFidelityRouteLoadingAnimations(overlayEl) {
  if (!overlayEl) return;
  const content = overlayEl.querySelector(".fidelity-route-loading-overlay__content");
  logoSpinTween?.kill();
  logoSpinTween = null;
  const g = typeof globalThis.gsap !== "undefined" ? globalThis.gsap : undefined;
  overlayEl.classList.toggle("fidelity-route-loading-overlay--css-spin", !prefersReducedMotion());

  if (g && content && !prefersReducedMotion()) {
    g.fromTo(content, { scale: 0.88, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.55, ease: "power3.out" });
  } else {
    if (content) content.classList.add("fidelity-route-loading-overlay__content--in");
  }
}

/**
 * @param {HTMLElement} overlayEl
 * @param {{ minVisibleMs?: number }} [opts] — défaut 0 : pas d’attente artificielle une fois le contenu prêt.
 */
export async function dismissFidelityRouteLoadingOverlay(overlayEl, opts = {}) {
  const { minVisibleMs = 0 } = opts;
  const el = overlayEl && document.body.contains(overlayEl) ? overlayEl : document.getElementById(OVERLAY_ID);

  const cleanupHtmlClass = () => {
    document.documentElement.classList.remove(HTML_LOADING_CLASS);
    document.body.removeAttribute("aria-busy");
  };

  if (!el) {
    cleanupHtmlClass();
    return;
  }

  logoSpinTween?.kill();
  logoSpinTween = null;
  el.classList.remove("fidelity-route-loading-overlay--css-spin");

  const g = typeof globalThis.gsap !== "undefined" ? globalThis.gsap : undefined;

  /* Laisser un frame peindre #fidelity-app (masqué) puis fondu court */
  await doubleRAF();
  if (minVisibleMs > 0) {
    await new Promise((r) => setTimeout(r, minVisibleMs));
  }

  const OUT_MS = 0.2;

  try {
    if (g) {
      g.killTweensOf(el);
      await new Promise((resolve) => {
        g.to(el, {
          opacity: 0,
          duration: OUT_MS,
          ease: "power2.out",
          onComplete: () => {
            el.remove();
            resolve();
          },
        });
      });
    } else {
      el.classList.add("fidelity-route-loading-overlay--out");
      await new Promise((r) => setTimeout(r, Math.round(OUT_MS * 1000) + 30));
      el.remove();
    }
  } finally {
    cleanupHtmlClass();
  }
}
