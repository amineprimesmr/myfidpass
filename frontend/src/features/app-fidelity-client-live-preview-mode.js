/**
 * Bascule aperçu statique / iframe page publique (/fidelity/:slug) dans le SaaS.
 * @param {{ getPublicUrl: () => string }} ctx
 */
export function wireFidelityClientLivePreviewMode(ctx) {
  const { getPublicUrl } = ctx;
  const viewport = document.getElementById("app-fidelity-client-live-preview-viewport");
  const liveWrap = document.getElementById("app-fidelity-client-live-preview-live-wrap");
  const iframe = document.getElementById("app-fidelity-client-live-iframe");
  const btnStatic = document.getElementById("app-fidelity-client-mode-static");
  const btnLive = document.getElementById("app-fidelity-client-mode-live");

  if (!viewport || !liveWrap || !iframe || !btnStatic || !btnLive) return;

  function setMode(mode) {
    const live = mode === "live";
    viewport.classList.toggle("app-fidelity-client-live-preview-viewport--live", live);
    viewport.setAttribute("aria-hidden", live ? "false" : "true");
    liveWrap.toggleAttribute("inert", !live);
    btnStatic.classList.toggle("is-active", !live);
    btnLive.classList.toggle("is-active", live);
    btnStatic.setAttribute("aria-pressed", live ? "false" : "true");
    btnLive.setAttribute("aria-pressed", live ? "true" : "false");

    if (live) {
      const base = getPublicUrl().replace(/\/$/, "");
      const sep = base.includes("?") ? "&" : "?";
      iframe.src = `${base}${sep}_fp_saas_preview=${Date.now()}`;
    }
  }

  btnStatic.addEventListener("click", () => setMode("static"));
  btnLive.addEventListener("click", () => setMode("live"));

  return {
    refreshLiveIframeIfLive: () => {
      if (!viewport.classList.contains("app-fidelity-client-live-preview-viewport--live")) return;
      const base = getPublicUrl().replace(/\/$/, "");
      const sep = base.includes("?") ? "&" : "?";
      iframe.src = `${base}${sep}_fp_saas_preview=${Date.now()}`;
    },
  };
}
