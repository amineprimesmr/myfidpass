/**
 * Thème page publique fidélité.
 * Fond : toujours blanc (#f8fafc) — pas de fond IA ni d'upload custom visible ici.
 * Couleurs : appliquées depuis flyer_prefs (roue + bouton CTA) via CSS custom properties.
 *
 * @param {Record<string, unknown> | null | undefined} business
 */
export function applyFidelityClientPageBackground(business) {
  const el = document.getElementById("fidelity-app");
  if (!el || !el.classList.contains("fidelity-page")) return;

  // Supprimer tout fond éventuel persisté depuis une session précédente
  el.classList.remove("fidelity-page--client-bg");
  el.style.removeProperty("--fidelity-client-bg");
  el.style.removeProperty("--fidelity-qr-shell-bg");

  // Teinte CTA depuis flyer_prefs
  const fc = business?.flyerColors;
  if (fc?.ctaBg && /^#[0-9A-Fa-f]{6}$/i.test(fc.ctaBg)) {
    el.style.setProperty("--fid-flyer-cta-bg", fc.ctaBg);
  } else {
    el.style.removeProperty("--fid-flyer-cta-bg");
  }
  if (fc?.ctaText && /^#[0-9A-Fa-f]{6}$/i.test(fc.ctaText)) {
    el.style.setProperty("--fid-flyer-cta-text", fc.ctaText);
  } else {
    el.style.removeProperty("--fid-flyer-cta-text");
  }
}
