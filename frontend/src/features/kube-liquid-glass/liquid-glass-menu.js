/* global ResizeObserver */
/**
 * Menu responsive : desktop une ligne, mobile barre + panneau dépliant sous la pilule (sans overlay page).
 * @param {object} [options]
 * @param {ParentNode} [options.root] Conteneur des nœuds data-lg-* (obligatoire, un menu par instance)
 * @param {Element} [options.scrollLockEl] Réservé compat (non utilisé : pas de verrou scroll sur mobile)
 * @param {Element} [options.fallbackClassTarget] Cible pour .lg-fallback-filters (défaut: scrollLockEl)
 */
import {
  ensureAllFiltersSvg,
  updateFilterForGlass,
  applyBackdropNative,
  applyBackdropFallback,
  clearBackdropToFallback,
  MQL,
} from "./liquid-glass-menu-filters.js";
import "./liquid-glass-menu.css";
import "./liquid-glass-menu-mobile.css";

const DESK = "fidpassLgDesk";
const MBAR = "fidpassLgMbar";
const MPAN = "fidpassLgMpan";

/**
 * @param {ParentNode} root
 */
function getEls(root) {
  return {
    desk: root.querySelector("[data-lg-desk]"),
    bar: root.querySelector("[data-lg-bar]"),
    panel: root.querySelector("[data-lg-panel]"),
    burger: root.querySelector("[data-lg-burger]"),
    panelHost: root.querySelector("[data-lg-panel-host]"),
    rootSm: root.querySelector("[data-lg-root-sm]"),
    navClose: root.querySelector("[data-lg-nav-close]"),
  };
}

function supportsSvgBackdropUrl() {
  if (typeof window === "undefined" || typeof CSS === "undefined") return false;
  const cssSupports =
    CSS.supports?.("backdrop-filter", "url(#x)") ||
    CSS.supports?.("-webkit-backdrop-filter", "url(#x)") ||
    false;
  if (!cssSupports) return false;
  const el = document.createElement("div");
  el.style.backdropFilter = "url(#x)";
  el.style.webkitBackdropFilter = "url(#x)";
  return (
    String(el.style.backdropFilter || "").includes("url") ||
    String(el.style.webkitBackdropFilter || "").includes("url")
  );
}

function isLowPerfGlassDevice() {
  if (typeof navigator === "undefined" || typeof globalThis.matchMedia !== "function") return false;
  const ua = String(navigator.userAgent || "");
  const coarsePointer = globalThis.matchMedia("(pointer: coarse)").matches;
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const cores = Number(navigator.hardwareConcurrency || 0);
  const lowCores = Number.isFinite(cores) && cores > 0 && cores <= 4;
  return coarsePointer && (isIOS || lowCores);
}

/**
 * @param {HTMLElement} el
 * @param {string} filterId
 * @param {boolean} use
 */
function setNative(el, filterId, use) {
  if (!el) return;
  if (use) applyBackdropNative(el, filterId);
  else applyBackdropFallback(el);
}

/**
 * @param {object} p
 * @param {ReturnType<typeof getEls>} p.els
 * @param {() => void} [p.onBurger]
 * @param {AbortSignal} p.signal
 */
function initBurger(p) {
  const { els, onBurger, signal } = p;
  const { burger, rootSm, panelHost } = els;
  if (!burger || !panelHost) return;

  const shell = /** @type {HTMLElement | null} */ (panelHost.closest("[data-lg-shell]"));

  const close = () => {
    panelHost.classList.remove("is-open");
    panelHost.setAttribute("aria-hidden", "true");
    panelHost.setAttribute("inert", "");
    burger.setAttribute("aria-expanded", "false");
    if (rootSm) rootSm.classList.remove("lg-nav-sm--open");
    shell?.classList.remove("lg-nav-sm__shell--open");
    if (onBurger) onBurger();
  };

  const open = () => {
    panelHost.removeAttribute("inert");
    panelHost.classList.add("is-open");
    panelHost.setAttribute("aria-hidden", "false");
    burger.setAttribute("aria-expanded", "true");
    if (rootSm) rootSm.classList.add("lg-nav-sm--open");
    shell?.classList.add("lg-nav-sm__shell--open");
    if (onBurger) onBurger();
  };

  burger.addEventListener(
    "click",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (burger.getAttribute("aria-expanded") === "true") close();
      else open();
    },
    { signal }
  );

  document.addEventListener(
    "click",
    (e) => {
      if (panelHost.getAttribute("aria-hidden") === "true") return;
      if (!e.target) return;
      const t = /** @type {Element} */ (e.target);
      if (rootSm && rootSm.contains(/** @type {Node} */ (t))) return;
      close();
    },
    { signal }
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && panelHost.classList.contains("is-open")) {
        close();
        burger.focus();
      }
    },
    { signal }
  );

  if (els.panel) {
    els.panel.addEventListener(
      "click",
      (e) => {
        if (e.target && /** @type {Element} */ (e.target).closest("a[href]")) {
          close();
        }
      },
      { signal }
    );
  }

  if (els.navClose) {
    els.navClose.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        close();
        burger?.focus();
      },
      { signal }
    );
  }
}

/**
 * @param {object} [options]
 * @param {ParentNode} [options.root]
 * @param {Element} [options.scrollLockEl]
 * @param {Element} [options.fallbackClassTarget]
 * @returns {() => void}
 */
export function initLiquidGlassMenu(options = {}) {
  const root = options.root;
  if (!root || typeof (/** @type {ParentNode} */ (root)).querySelector !== "function") {
    return () => {};
  }

  ensureAllFiltersSvg();
  const lowPerfGlass = isLowPerfGlassDevice();
  const nativeOk = supportsSvgBackdropUrl() && !lowPerfGlass;
  const scrollLockEl = options.scrollLockEl || null;
  const fallbackTarget = options.fallbackClassTarget || scrollLockEl;
  if (!nativeOk && fallbackTarget) {
    fallbackTarget.classList.add("lg-fallback-filters");
  }
  if (nativeOk && fallbackTarget) {
    fallbackTarget.classList.add("lg-native-filters");
  }
  if (lowPerfGlass && fallbackTarget) {
    fallbackTarget.classList.add("lg-ios-glass-mode");
  }

  const els = getEls(root);
  if (!els.desk && !els.bar) return () => {};

  const mql = window.matchMedia(MQL);
  const getDrawer = () => els.burger && els.burger.getAttribute("aria-expanded") === "true";

  let rafT = 0;
  const scheduleAll = () => {
    if (rafT) cancelAnimationFrame(rafT);
    rafT = requestAnimationFrame(() => {
      rafT = 0;
      if (mql.matches) {
        if (els.desk) {
          setNative(els.desk, DESK, nativeOk);
          updateFilterForGlass(els.desk, "D");
        }
        if (els.bar) clearBackdropToFallback(els.bar);
        if (els.panel) clearBackdropToFallback(els.panel);
      } else {
        if (els.desk) clearBackdropToFallback(els.desk);
        if (getDrawer() && els.panel) {
          if (nativeOk) {
            setNative(els.panel, MPAN, true);
            updateFilterForGlass(els.panel, "P");
            requestAnimationFrame(() => updateFilterForGlass(els.panel, "P"));
          } else {
            applyBackdropFallback(els.panel);
          }
          if (els.bar) applyBackdropFallback(els.bar);
        } else if (els.bar) {
          setNative(els.bar, MBAR, nativeOk);
          updateFilterForGlass(els.bar, "B");
          if (els.panel) clearBackdropToFallback(els.panel);
        }
      }
    });
  };

  if (els.desk) {
    if (nativeOk) {
      setNative(els.desk, DESK, true);
    } else {
      applyBackdropFallback(els.desk);
    }
  }
  if (els.bar) {
    if (nativeOk) {
      setNative(els.bar, MBAR, true);
    } else {
      applyBackdropFallback(els.bar);
    }
  }
  if (els.panel) {
    applyBackdropFallback(els.panel);
  }

  const mqlHandler = () => {
    els.burger?.setAttribute("aria-expanded", "false");
    if (els.panelHost) {
      els.panelHost.classList.remove("is-open");
      els.panelHost.setAttribute("aria-hidden", "true");
      els.panelHost.setAttribute("inert", "");
    }
    const shell = /** @type {HTMLElement | null} */ (els.panelHost?.closest("[data-lg-shell]"));
    shell?.classList.remove("lg-nav-sm__shell--open");
    els.rootSm?.classList.remove("lg-nav-sm--open");
    if (scrollLockEl) scrollLockEl.classList.remove("lg-menu-noscroll");
    scheduleAll();
  };
  mql.addEventListener("change", mqlHandler);

  const ac = new AbortController();
  initBurger({ els, onBurger: () => scheduleAll(), signal: ac.signal });

  const roD = new ResizeObserver(() => scheduleAll());
  const roB = new ResizeObserver(() => scheduleAll());
  const roP = new ResizeObserver(() => scheduleAll());
  if (els.desk) roD.observe(els.desk);
  if (els.bar) roB.observe(els.bar);
  if (els.panel) roP.observe(els.panel);

  const onWin = () => scheduleAll();
  window.addEventListener("resize", onWin, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", onWin, { passive: true });
  }
  requestAnimationFrame(scheduleAll);

  return () => {
    ac.abort();
    mql.removeEventListener("change", mqlHandler);
    window.removeEventListener("resize", onWin);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener("resize", onWin);
    }
    roD.disconnect();
    roB.disconnect();
    roP.disconnect();
    if (scrollLockEl) scrollLockEl.classList.remove("lg-menu-noscroll");
    if (fallbackTarget) fallbackTarget.classList.remove("lg-fallback-filters");
    if (fallbackTarget) fallbackTarget.classList.remove("lg-native-filters");
    if (fallbackTarget) fallbackTarget.classList.remove("lg-ios-glass-mode");
  };
}
