/** Secteurs Myfidpass — libellés + hypothèses marketing pour le simulateur. */
export const REVENUE_SECTOR_OPTIONS = [
  {
    id: "fastfood",
    label: "Restauration / Fast-food",
    defaultBasket: 14,
    visitUplift: 0.22,
    basketUplift: 0.08,
  },
  {
    id: "cafe",
    label: "Café / Bar",
    defaultBasket: 6.5,
    visitUplift: 0.18,
    basketUplift: 0.07,
  },
  {
    id: "boulangerie",
    label: "Boulangerie / Pâtisserie",
    defaultBasket: 8,
    visitUplift: 0.2,
    basketUplift: 0.06,
  },
  {
    id: "boucherie",
    label: "Boucherie / Traiteur",
    defaultBasket: 18,
    visitUplift: 0.16,
    basketUplift: 0.05,
  },
  {
    id: "coiffure",
    label: "Coiffure",
    defaultBasket: 32,
    visitUplift: 0.24,
    basketUplift: 0.04,
  },
  {
    id: "beauty",
    label: "Beauté / Spa",
    defaultBasket: 45,
    visitUplift: 0.26,
    basketUplift: 0.05,
  },
  {
    id: "retail",
    label: "Commerce de proximité",
    defaultBasket: 22,
    visitUplift: 0.15,
    basketUplift: 0.06,
  },
];

export const DEFAULT_REVENUE_SECTOR_ID = "fastfood";

/** Abonnement Pro mensuel (hors promo 1 €) — aligné sur la page paiement. */
export const MYFIDPASS_MONTHLY_COST = 49.99;

export const REVENUE_SIMULATOR_DEFAULTS = {
  clientsPerDay: 60,
  avgBasket: 22,
};

/** Part estimée des passages mensuels convertis en clients fidélisés. */
export const REVENUE_LOYAL_CLIENT_RATE = 0.14;

/** Part des clients fidélisés générant un avis Google supplémentaire / mois. */
export const REVENUE_GOOGLE_REVIEW_FROM_LOYAL_RATE = 0.1;

/**
 * @param {string | null | undefined} categoryId
 * @returns {typeof REVENUE_SECTOR_OPTIONS[number] | undefined}
 */
export function getRevenueSectorConfig(categoryId) {
  const id = String(categoryId || "").trim();
  return REVENUE_SECTOR_OPTIONS.find((s) => s.id === id);
}

/**
 * @param {string | null | undefined} suggestedCategory
 * @returns {string}
 */
export function mapSuggestedCategoryToSectorId(suggestedCategory) {
  const id = String(suggestedCategory || "").trim();
  if (getRevenueSectorConfig(id)) return id;
  return DEFAULT_REVENUE_SECTOR_ID;
}
