/**
 * Applique le fond personnalisé commerce sur #fidelity-app (page publique fidélité).
 * @param {Record<string, unknown> | null | undefined} business — réponse GET /api/businesses/:slug
 */
export function applyFidelityClientPageBackground(business) {
  const el = document.getElementById("fidelity-app");
  if (!el || !el.classList.contains("fidelity-page")) return;
  const url =
    business?.fidelityPageBackgroundUrl ??
    business?.fidelity_page_background_url;
  const v =
    business?.fidelityPageBackgroundUpdatedAt ??
    business?.fidelity_page_background_updated_at ??
    "0";
  el.classList.toggle("fidelity-page--client-bg", Boolean(url));
  if (url) {
    const sep = String(url).includes("?") ? "&" : "?";
    el.style.setProperty(
      "--fidelity-client-bg",
      `url("${String(url)}${sep}v=${encodeURIComponent(String(v))}")`,
    );
  } else {
    el.style.removeProperty("--fidelity-client-bg");
  }
}
