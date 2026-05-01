/**
 * Correspondances routes -> pages SEO (contenu statique).
 * Objectif: garder `router/index.js` léger tout en scalant le nombre d'URLs indexables.
 */

const SEO_STATIC_SLUGS = new Set([
  "solution-carte-fidelite-digitale",
  "logiciel-fidelite-restaurant",
  "programme-fidelite-salon-beaute",
  "prix-carte-fidelite-digitale",
  "guide-fidelisation-client-commerce",
  "alternative-carte-fidelite-papier",
  "logiciel-fidelite-boulangerie",
  "logiciel-fidelite-boucherie",
  "programme-fidelite-coiffure",
  "programme-fidelite-cafe",
  "integration-caisse-fidelite-wallet",
  "carte-fidelite-qr-code",
  "comparatif-stamp-me-alternative",
  "comparatif-sumup-loyalty-alternative",
]);

/** Slugs URL -> libellé ville (SEO local). */
const CITY_SLUGS = {
  paris: "Paris",
  lyon: "Lyon",
  marseille: "Marseille",
  toulouse: "Toulouse",
  nice: "Nice",
  nantes: "Nantes",
  strasbourg: "Strasbourg",
  montpellier: "Montpellier",
  bordeaux: "Bordeaux",
  lille: "Lille",
  rennes: "Rennes",
  reims: "Reims",
  "le-havre": "Le Havre",
  grenoble: "Grenoble",
  dijon: "Dijon",
  angers: "Angers",
};

export function matchSeoContentRoute(pathname) {
  const path = String(pathname || "").replace(/\/$/, "");
  if (!path) return null;

  const direct = path.replace(/^\//, "");
  if (SEO_STATIC_SLUGS.has(direct)) {
    return { type: "seo-content", page: direct };
  }

  const local = path.match(/^\/carte-fidelite-digitale-([a-z0-9-]+)$/i);
  if (local) {
    const citySlug = String(local[1] || "").toLowerCase();
    if (CITY_SLUGS[citySlug]) {
      return { type: "seo-content", page: "local-carte-fidelite-digitale", citySlug };
    }
  }

  return null;
}

export function getCityLabelFromSlug(citySlug) {
  return CITY_SLUGS[String(citySlug || "").toLowerCase()] || "";
}
