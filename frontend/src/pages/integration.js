/** Page intégration : affichage géré par le routeur (slug hint, etc.). */
import { renderPublicCatalogSummary } from "../features/integration-hub.js";

export default {
  init() {
    const root = document.getElementById("landing-integration-catalog-root");
    if (root) renderPublicCatalogSummary(root);
  },
};
