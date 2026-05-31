import {
  DEFAULT_REVENUE_SECTOR_ID,
  getRevenueSectorConfig,
  MYFIDPASS_MONTHLY_COST,
} from "./fintap-revenue-simulator-data.js";

/** Jours ouvrés moyens par mois pour l'estimation. */
export const REVENUE_WORKING_DAYS_PER_MONTH = 26;

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
  const subscriptionAnnual = Math.round(MYFIDPASS_MONTHLY_COST * 12);
  const netAnnual = additionalAnnual - subscriptionAnnual;
  const roiMultiple =
    subscriptionAnnual > 0
      ? Math.round((additionalAnnual / subscriptionAnnual) * 10) / 10
      : 0;

  return {
    sectorId: sector.id,
    sectorLabel: sector.label,
    clientsPerDay,
    avgBasket: basket,
    visitsPerMonth,
    baseMonthlyRevenue: Math.round(baseMonthlyRevenue),
    additionalMonthly,
    additionalAnnual,
    subscriptionAnnual,
    netAnnual,
    roiMultiple,
    extraVisitsPerMonth: Math.round(visitsPerMonth * sector.visitUplift),
  };
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
