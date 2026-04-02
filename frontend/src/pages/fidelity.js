import { initClientFidelityPage } from "../client-fidelity/bootstrap.js";
import { API_BASE } from "../config.js";
import { showSlugError } from "../main.js";

const rootEl = () => document.getElementById("fidelity-app");

export default {
  async init(route) {
    const slug = route.slug;
    if (!slug) return;
    try {
      await initClientFidelityPage({
        slug,
        apiBase: API_BASE,
        rootEl: rootEl(),
      });
    } catch (err) {
      const raw = String(err?.message || "").trim();
      /* getBusiness : 404 → « Entreprise introuvable » ; fetch réseau → message connexion */
      const isNetwork =
        /connexion|r[ée]seau|charger|fetch|Failed to fetch|NetworkError/i.test(raw) ||
        raw.includes("Impossible de charger");
      showSlugError(
        isNetwork
          ? raw || "Connexion impossible. Vérifie ta connexion ou réessaie dans un instant."
          : raw === "Entreprise introuvable" || !raw
            ? `Entreprise « ${slug} » introuvable.`
            : raw,
      );
    }
  },
};
