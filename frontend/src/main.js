/**
 * Point d’entrée : re-export showSlugError, init du shell landing, routage.
 * Référence : REFONTE-REGLES.md — main < 400 lignes.
 */
import { showSlugError } from "./features/fidelity-form.js";
import { initLandingShell } from "./features/landing-shell.js";
import { initRouting } from "./router/index.js";

export { showSlugError };

window.addEventListener("popstate", () => {
  initRouting().catch((err) => console.error("Routing error:", err));
});

async function bootstrap() {
  initLandingShell();
  try {
    await initRouting();
  } catch (err) {
    console.error("Erreur au chargement de l'app:", err);
    document.body.innerHTML = `
      <div style="font-family: system-ui; max-width: 32rem; margin: 2rem auto; padding: 1.5rem; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;">
        <h1 style="margin: 0 0 0.5rem; font-size: 1.25rem;">Erreur de chargement</h1>
        <p style="margin: 0 0 1rem; color: #991b1b;">L'application n'a pas pu démarrer. Ouvre la console (F12 → Console) pour voir l'erreur.</p>
        <p style="margin: 0; font-size: 0.875rem; color: #64748b;">Vérifie que le backend tourne sur le port 3001 (npm run dev à la racine).</p>
      </div>
    `;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
