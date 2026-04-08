import { resolveFidelityPageBackgroundImgSrc } from "./resolve-client-logo-src.js";

/**
 * Applique le fond personnalisé commerce sur #fidelity-app (page publique fidélité).
 * @param {Record<string, unknown> | null | undefined} business — réponse GET /api/businesses/:slug
 * @param {string} slug
 * @param {string} apiBase
 */
export function applyFidelityClientPageBackground(business, slug, apiBase) {
  const el = document.getElementById("fidelity-app");
  if (!el || !el.classList.contains("fidelity-page")) return;
  const resolved = resolveFidelityPageBackgroundImgSrc(business, String(slug || ""), String(apiBase || ""));
  el.classList.toggle("fidelity-page--client-bg", Boolean(resolved));
  if (resolved) {
    el.style.setProperty("--fidelity-client-bg", `url("${resolved}")`);
  } else {
    el.style.removeProperty("--fidelity-client-bg");
  }
  const bgHex = business?.backgroundColor ?? business?.background_color;
  if (typeof bgHex === "string" && /^#[0-9A-Fa-f]{6}$/.test(bgHex.trim())) {
    el.style.setProperty("--fidelity-qr-shell-bg", bgHex.trim());
  } else {
    el.style.removeProperty("--fidelity-qr-shell-bg");
  }
}
