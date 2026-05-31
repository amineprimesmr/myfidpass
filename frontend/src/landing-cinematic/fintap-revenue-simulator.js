import {
  DEFAULT_REVENUE_SECTOR_ID,
  getRevenueSectorConfig,
  MYFIDPASS_MONTHLY_COST,
} from "./fintap-revenue-simulator-data.js";

/** Jours ouvrés moyens par mois pour l'estimation. */
export const REVENUE_WORKING_DAYS_PER_MONTH = 26;

/**
 * Clients fidélisés / mois — indexé sur clients/jour (≈38 pour 60/j en restauration).
 * @param {number} clientsPerDay
 * @param {number} visitUplift
 */
export function estimateLoyalClientsPerMonth(clientsPerDay, visitUplift) {
  const ratio = 0.55 + visitUplift * 0.4;
  return Math.max(1, Math.round(clientsPerDay * ratio));
}

/**
 * Avis Google en plus / mois — calibré sur clients/jour (≈36 pour 60/j).
 * @param {number} clientsPerDay
 * @param {number} visitUplift
 */
export function estimateExtraGoogleReviewsPerMonth(clientsPerDay, visitUplift) {
  const loyal = estimateLoyalClientsPerMonth(clientsPerDay, visitUplift);
  return Math.max(1, Math.round(clientsPerDay * 0.42 + loyal * 0.28));
}

/**
 * @param {number} value
 * @returns {number}
 */
export function clampSimulatorNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/**
 * Estime le revenu additionnel d'un programme fidélité.
 *
 * @param {{ clientsPerDay: number, avgBasket: number | null, sectorId: string }} input
 */
export function computeRevenueSimulation(input) {
  const clientsPerDay = clampSimulatorNumber(input.clientsPerDay, 1, 2000);
  const sector =
    getRevenueSectorConfig(input.sectorId) ||
    getRevenueSectorConfig(DEFAULT_REVENUE_SECTOR_ID);
  const basketRaw = input.avgBasket;
  const basket =
    basketRaw != null && Number.isFinite(Number(basketRaw)) && Number(basketRaw) > 0
      ? clampSimulatorNumber(basketRaw, 1, 500)
      : sector.defaultBasket;

  const visitsPerMonth = clientsPerDay * REVENUE_WORKING_DAYS_PER_MONTH;
  const baseMonthlyRevenue = visitsPerMonth * basket;

  const extraFromVisits = baseMonthlyRevenue * sector.visitUplift;
  const extraFromBasket =
    visitsPerMonth * (1 + sector.visitUplift) * basket * sector.basketUplift;
  const additionalMonthly = Math.round(extraFromVisits + extraFromBasket);
  const additionalAnnual = additionalMonthly * 12;
  const subscriptionMonthly = MYFIDPASS_MONTHLY_COST;
  const subscriptionAnnual = Math.round(subscriptionMonthly * 12);
  const netMonthly = Math.round(additionalMonthly - subscriptionMonthly);
  const netAnnual = additionalAnnual - subscriptionAnnual;
  const roiMultiple =
    subscriptionAnnual > 0
      ? Math.round((additionalAnnual / subscriptionAnnual) * 10) / 10
      : 0;
  const visitUpliftPercent = Math.round(sector.visitUplift * 100);
  const basketUpliftPercent = Math.round(sector.basketUplift * 100);
  const loyalClientsPerMonth = estimateLoyalClientsPerMonth(clientsPerDay, sector.visitUplift);
  const extraGoogleReviewsPerMonth = estimateExtraGoogleReviewsPerMonth(
    clientsPerDay,
    sector.visitUplift
  );

  return {
    sectorId: sector.id,
    sectorLabel: sector.label,
    visitUpliftPercent,
    basketUpliftPercent,
    clientsPerDay,
    avgBasket: basket,
    visitsPerMonth,
    baseMonthlyRevenue: Math.round(baseMonthlyRevenue),
    additionalMonthly,
    additionalAnnual,
    subscriptionMonthly,
    subscriptionAnnual,
    netMonthly,
    netAnnual,
    roiMultiple,
    loyalClientsPerMonth,
    extraGoogleReviewsPerMonth,
  };
}

/**
 * @param {ReturnType<typeof computeRevenueSimulation>} results
 * @returns {string}
 */
export function buildRevenueSimulatorDisclaimer(results) {
  return (
    `* D'après nos clients en « ${results.sectorLabel} » : ` +
    `+${results.visitUpliftPercent}% de visites et +${results.basketUpliftPercent}% de panier en moyenne.`
  );
}

/**
 * @param {number} amount
 * @param {{ maximumFractionDigits?: number }} [opts]
 */
export function formatEuro(amount, opts = {}) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: opts.maximumFractionDigits ?? 0,
  }).format(n);
}
