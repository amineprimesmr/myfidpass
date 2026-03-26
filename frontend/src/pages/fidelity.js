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
    } catch {
      showSlugError(`Entreprise « ${slug} » introuvable.`);
    }
  },
};
