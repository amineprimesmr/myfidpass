/**
 * Écran de chargement route fidélité : voile flouté + logo commerce animé (GSAP si dispo).
 */
import { resolveClientLogoImgSrc } from "./lib/resolve-client-logo-src.js";

const OVERLAY_ID = "fidelity-route-loading-overlay";
/** Masque #fidelity-app pendant le chargement pour éviter que le flou du voile ne montre la vraie page dans le logo. */
const HTML_LOADING_CLASS = "fidpass-fidelity-route-loading";
const FALLBACK_LOADING_LOGO_SRC = "/assets/chargement.png";

const ROUTE_LOADING_MESSAGES = [
  "Préparation de votre carte fidélité…",
  "Récupération de vos avantages…",
  "Presque prêt…",
];

/** @type {ReturnType<typeof setInterval> | null} */
let routeLoadingMsgTimer = null;

/** @type { { kill: () => void } | null } */
let logoSpinTween = null;

/** @type {ReturnType<typeof setTimeout> | null} */
let overlaySafetyTimer = null;

/** Incrémenté à chaque mount — dismiss ignore les overlays obsolètes. */
let overlayGeneration = 0;

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

/** Retire immédiatement le voile (sans animation) — filet de sécurité. */
export function forceDismissFidelityRouteLoadingOverlay() {
  logoSpinTween?.kill();
  logoSpinTween = null;
  if (routeLoadingMsgTimer) {
    clearInterval(routeLoadingMsgTimer);
    routeLoadingMsgTimer = null;
  }
  const g = typeof globalThis.gsap !== "undefined" ? globalThis.gsap : undefined;
  const el = document.getElementById(OVERLAY_ID);
  if (el) {
    if (g) g.killTweensOf(el);
    el.remove();
  }
  document.documentElement.classList.remove(HTML_LOADING_CLASS);
  document.body.removeAttribute("aria-busy");
}

/** Voile de chargement encore présent (évite modales floues en dessous, z-index 10050). */
export function isFidelityRouteLoadingOverlayActive() {
  const el = document.getElementById(OVERLAY_ID);
  return !!(el && document.body.contains(el));
}

/** Attend la fin du voile avant d’ouvrir une modale client. */
export async function waitForFidelityRouteLoadingDismissed(maxMs = 4000) {
  const deadline = Date.now() + maxMs;
  while (isFidelityRouteLoadingOverlayActive() && Date.now() < deadline) {
    await doubleRAF();
  }
}

/** @returns {HTMLElement} */
export function mountFidelityRouteLoadingOverlay() {
  forceDismissFidelityRouteLoadingOverlay();
  const generation = ++overlayGeneration;
  const el = document.createElement("div");
  el.id = OVERLAY_ID;
  el.dataset.fidLoadingGeneration = String(generation);
  el.className = "fidelity-route-loading-overlay";
  el.setAttribute("aria-busy", "true");
  el.innerHTML = `
    <div class="fidelity-route-loading-overlay__veil" aria-hidden="true"></div>
    <div class="fidelity-route-loading-overlay__content">
      <div class="fidelity-route-loading__logo-ring">
        <img class="fidelity-route-loading__logo" alt="" width="120" height="120" decoding="async" />
      </div>
      <div class="fidelity-route-loading__status" role="status" aria-live="polite">
        <p class="fidelity-route-loading__title">Chargement de votre espace</p>
        <div
          class="fidelity-route-loading__progress"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuetext="Chargement en cours"
        >
          <span class="fidelity-route-loading__progress-bar"></span>
        </div>
        <p class="fidelity-route-loading__msg" id="fidelity-route-loading-msg">Préparation de votre carte fidélité…</p>
      </div>
    </div>`;
  document.body.appendChild(el);
  document.body.setAttribute("aria-busy", "true");
  document.documentElement.classList.add(HTML_LOADING_CLASS);
  requestAnimationFrame(() => {
    if (document.body.contains(el)) el.classList.add("fidelity-route-loading-overlay--visible");
  });

  if (overlaySafetyTimer) clearTimeout(overlaySafetyTimer);
  overlaySafetyTimer = setTimeout(() => {
    overlaySafetyTimer = null;
    const current = document.getElementById(OVERLAY_ID);
    if (
      current &&
      current.dataset.fidLoadingGeneration === String(generation) &&
      document.body.contains(current)
    ) {
      forceDismissFidelityRouteLoadingOverlay();
    }
  }, 10000);

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
  const msgEl = overlayEl.querySelector("#fidelity-route-loading-msg");
  const bar = overlayEl.querySelector(".fidelity-route-loading__progress-bar");
  logoSpinTween?.kill();
  logoSpinTween = null;
  const g = typeof globalThis.gsap !== "undefined" ? globalThis.gsap : undefined;
  overlayEl.classList.toggle("fidelity-route-loading-overlay--css-spin", !prefersReducedMotion());
  if (bar instanceof HTMLElement) {
    bar.classList.remove("fidelity-route-loading__progress-bar--animate");
    bar.getBoundingClientRect();
    bar.classList.add("fidelity-route-loading__progress-bar--animate");
  }
  if (routeLoadingMsgTimer) clearInterval(routeLoadingMsgTimer);
  let idx = 0;
  if (msgEl) msgEl.textContent = ROUTE_LOADING_MESSAGES[0];
  routeLoadingMsgTimer = setInterval(() => {
    idx = (idx + 1) % ROUTE_LOADING_MESSAGES.length;
    if (msgEl) msgEl.textContent = ROUTE_LOADING_MESSAGES[idx];
  }, 1400);

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
  const el = overlayEl && document.body.contains(overlayEl) ? overlayEl : null;

  if (!el) {
    document.documentElement.classList.remove(HTML_LOADING_CLASS);
    document.body.removeAttribute("aria-busy");
    return;
  }

  if (overlaySafetyTimer) {
    clearTimeout(overlaySafetyTimer);
    overlaySafetyTimer = null;
  }

  logoSpinTween?.kill();
  logoSpinTween = null;
  if (routeLoadingMsgTimer) {
    clearInterval(routeLoadingMsgTimer);
    routeLoadingMsgTimer = null;
  }
  el.classList.remove("fidelity-route-loading-overlay--css-spin");

  const g = typeof globalThis.gsap !== "undefined" ? globalThis.gsap : undefined;
  const lowPerf =
    document.documentElement.classList.contains("fidpass-low-perf-mobile") ||
    prefersReducedMotion();

  await doubleRAF();
  if (minVisibleMs > 0) {
    await new Promise((r) => setTimeout(r, minVisibleMs));
  }

  const OUT_MS = lowPerf ? 0 : 0.2;

  try {
    if (!lowPerf && g) {
      g.killTweensOf(el);
      await Promise.race([
        new Promise((resolve) => {
          g.to(el, {
            opacity: 0,
            duration: OUT_MS,
            ease: "power2.out",
            onComplete: () => {
              if (document.body.contains(el)) el.remove();
              resolve();
            },
          });
        }),
        new Promise((resolve) => setTimeout(resolve, Math.round(OUT_MS * 1000) + 120)),
      ]);
    } else {
      el.classList.add("fidelity-route-loading-overlay--out");
      if (OUT_MS > 0) {
        await new Promise((r) => setTimeout(r, Math.round(OUT_MS * 1000) + 30));
      }
      if (document.body.contains(el)) el.remove();
    }
  } finally {
    document.documentElement.classList.remove(HTML_LOADING_CLASS);
    document.body.removeAttribute("aria-busy");
    if (document.getElementById(OVERLAY_ID) === el) el.remove();
  }
}
