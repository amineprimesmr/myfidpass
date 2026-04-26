/* global ResizeObserver */
/**
 * Menu responsive : desktop une ligne, mobile barre + panneau (Liquid Glass / kube).
 */
import {
  ensureAllFiltersSvg,
  updateFilterForGlass,
  applyBackdropNative,
  applyBackdropFallback,
  clearBackdropToFallback,
  MQL,
  DEFAULTS,
} from "./liquid-glass-menu-filters.js";
import "./liquid-glass-menu.css";

const DESK = "fidpassLgDesk";
const MBAR = "fidpassLgMbar";
const MPAN = "fidpassLgMpan";

function supportsSvgBackdropUrl() {
  if (typeof window === "undefined" || !window.chrome) return false;
  const el = document.createElement("div");
  el.style.backdropFilter = "url(#x)";
  return el.style.backdropFilter.includes("url");
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
 * @param {ReturnType<typeof getEls>} els
 */
function initBurger(els) {
  const { burger, rootSm, panelHost, onBurger } = els;
  if (!burger || !panelHost) return;

  const app = document.getElementById("liquid-glass-test-app");
  const close = () => {
    panelHost.classList.remove("is-open");
    panelHost.setAttribute("hidden", "");
    panelHost.setAttribute("aria-hidden", "true");
    burger.setAttribute("aria-expanded", "false");
    if (rootSm) rootSm.classList.remove("lg-nav-sm--open");
    if (app) app.classList.remove("lg-menu-noscroll");
    if (onBurger) onBurger();
  };

  const open = () => {
    panelHost.removeAttribute("hidden");
    panelHost.setAttribute("aria-hidden", "false");
    panelHost.classList.add("is-open");
    burger.setAttribute("aria-expanded", "true");
    if (rootSm) rootSm.classList.add("lg-nav-sm--open");
    if (app) app.classList.add("lg-menu-noscroll");
    if (onBurger) onBurger();
  };

  burger.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (burger.getAttribute("aria-expanded") === "true") close();
    else open();
  });

  document.addEventListener("click", (e) => {
    if (panelHost.getAttribute("aria-hidden") === "true") return;
    if (!rootSm || !e.target) return;
    if (rootSm.contains(/** @type {Node} */ (e.target))) return;
    close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panelHost.classList.contains("is-open")) {
      close();
      burger.focus();
    }
  });

  const glPanel = document.getElementById("fidpass-liquid-menu-glass-panel");
  if (glPanel) {
    glPanel.addEventListener("click", (e) => {
      if (e.target && /** @type {Element} */ (e.target).closest("a[href]")) {
        close();
      }
    });
  }
}

function getEls() {
  return {
    desk: document.getElementById("fidpass-liquid-menu-glass"),
    bar: document.getElementById("fidpass-liquid-menu-glass-bar"),
    panel: document.getElementById("fidpass-liquid-menu-glass-panel"),
    burger: document.getElementById("lg-menu-burger"),
    panelHost: document.getElementById("lg-menu-panel"),
    rootSm: document.getElementById("lg-nav-sm"),
  };
}

export function initLiquidGlassMenu() {
  ensureAllFiltersSvg();
  const nativeOk = supportsSvgBackdropUrl();
  if (!nativeOk) {
    document
      .getElementById("liquid-glass-test-app")
      ?.classList.add("lg-fallback-filters");
  }
  const els = getEls();
  if (!els.desk && !els.bar) return () => {};

  const mql = window.matchMedia(MQL);
  let drawerOpen = false;
  const getDrawer = () => els.burger && els.burger.getAttribute("aria-expanded") === "true";

  let rafT = 0;
  const scheduleAll = () => {
    if (rafT) cancelAnimationFrame(rafT);
    rafT = requestAnimationFrame(() => {
      rafT = 0;
      drawerOpen = getDrawer();
      if (mql.matches) {
        if (els.desk) {
          setNative(els.desk, DESK, nativeOk);
          updateFilterForGlass(els.desk, "D", DEFAULTS);
        }
        if (els.bar) clearBackdropToFallback(els.bar);
        if (els.panel) clearBackdropToFallback(els.panel);
      } else {
        if (els.desk) clearBackdropToFallback(els.desk);
        drawerOpen = getDrawer();
        if (drawerOpen && els.panel) {
          setNative(els.panel, MPAN, nativeOk);
          if (els.bar) {
            clearBackdropToFallback(els.bar);
            els.bar.classList.add("lg-menu--bar-ghost");
          }
          updateFilterForGlass(els.panel, "P", DEFAULTS);
        } else if (els.bar) {
          setNative(els.bar, MBAR, nativeOk);
          els.bar.classList.remove("lg-menu--bar-ghost");
          updateFilterForGlass(els.bar, "B", DEFAULTS);
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

  const app = document.getElementById("liquid-glass-test-app");
  const mqlHandler = () => {
    els.burger?.setAttribute("aria-expanded", "false");
    if (els.panelHost) {
      els.panelHost.setAttribute("hidden", "");
      els.panelHost.classList.remove("is-open");
      els.panelHost.setAttribute("aria-hidden", "true");
    }
    els.rootSm?.classList.remove("lg-nav-sm--open");
    if (app) app.classList.remove("lg-menu-noscroll");
    scheduleAll();
  };
  mql.addEventListener("change", mqlHandler);

  initBurger({ ...els, onBurger: () => scheduleAll() });

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
    mql.removeEventListener("change", mqlHandler);
    window.removeEventListener("resize", onWin);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener("resize", onWin);
    }
    roD.disconnect();
    roB.disconnect();
    roP.disconnect();
  };
}
