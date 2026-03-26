import { initRouting } from "../router/index.js";

/** Routes client fidélité : `/fidelity/:slug` ou `/fidelity/:slug/jeu` uniquement. */
export function isFidelityClientSpaPath(pathname) {
  const p = pathname.replace(/\/$/, "") || "/";
  return /^\/fidelity\/[^/]+(\/jeu)?$/.test(p);
}

/**
 * Évite le rechargement complet du document au clic sur « Jouer » / « Retour » :
 * même origine que le routeur (history.pushState + initRouting).
 * @param {ParentNode | null | undefined} rootEl
 */
export function bindFidelitySpaLinks(rootEl) {
  if (!rootEl) return;
  rootEl.querySelectorAll('a[href^="/fidelity/"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      if (e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const href = a.getAttribute("href");
      if (!href) return;
      let url;
      try {
        url = new URL(href, window.location.origin);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (!isFidelityClientSpaPath(url.pathname)) return;
      e.preventDefault();
      const next = url.pathname + (url.search || "") + (url.hash || "");
      const current = window.location.pathname + window.location.search + window.location.hash;
      if (next === current) return;
      history.pushState({}, "", next);
      window.scrollTo(0, 0);
      initRouting().catch((err) => console.error("Navigation fidélité:", err));
    });
  });
}
