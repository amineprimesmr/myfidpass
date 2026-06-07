import {
  MYFIDPASS_MONTHLY_COST,
  REVENUE_SIMULATOR_ASSUMPTIONS,
  REVENUE_SIMULATOR_DAYS_PER_MONTH,
  REVENUE_SIMULATOR_DEFAULTS,
  REVENUE_SIMULATOR_LIMITS,
} from "./fintap-revenue-simulator-data.js";

/** Jours affichés sur la courbe (premier mois). */
export const REVENUE_CHART_DAYS = 30;

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clampSimulatorNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/**
 * Courbe de montée en charge sur 30 jours (0 → 1).
 * @param {number} day 1..30
 */
export function rampFactorForDay(day) {
  const t = clampSimulatorNumber(day, 1, REVENUE_CHART_DAYS) / REVENUE_CHART_DAYS;
  return 1 - Math.pow(1 - t, 1.55);
}

/**
 * @param {number} monthlyAdditional
 * @returns {{ day: number, cumulative: number, dailyRevenue: number, dailyCost: number }[]}
 */
export function build30DayChart(monthlyAdditional) {
  const dailySubscription = MYFIDPASS_MONTHLY_COST / REVENUE_CHART_DAYS;
  const points = [];
  let prevCumulative = 0;

  for (let day = 1; day <= REVENUE_CHART_DAYS; day += 1) {
    const target = Math.round(monthlyAdditional * rampFactorForDay(day));
    const dailyRevenue = Math.max(0, target - prevCumulative);
    prevCumulative = target;
    points.push({
      day,
      cumulative: target,
      dailyRevenue,
      dailyCost: Math.round(dailySubscription * 10) / 10,
    });
  }

  return points;
}

/**
 * Estime le revenu additionnel d'un programme fidélité (hypothèses fixes, sans secteur).
 *
 * @param {{ dailyVisitors: number, avgBasket: number | null }} input
 */
export function computeRevenueSimulation(input) {
  const {
    participationRate,
    activeMemberRate,
    extraVisitPerActiveMember,
    basketLiftOnMembers,
    reactivationShare,
    maxIncrementalShareOfRevenue,
  } = REVENUE_SIMULATOR_ASSUMPTIONS;

  const dailyVisitors = clampSimulatorNumber(
    input.dailyVisitors,
    REVENUE_SIMULATOR_LIMITS.dailyVisitors.min,
    REVENUE_SIMULATOR_LIMITS.dailyVisitors.max
  );
  const visitors = dailyVisitors * REVENUE_SIMULATOR_DAYS_PER_MONTH;
  const basketRaw = input.avgBasket;
  const basket =
    basketRaw != null && Number.isFinite(Number(basketRaw)) && Number(basketRaw) > 0
      ? clampSimulatorNumber(
          basketRaw,
          REVENUE_SIMULATOR_LIMITS.avgBasket.min,
          REVENUE_SIMULATOR_LIMITS.avgBasket.max
        )
      : REVENUE_SIMULATOR_DEFAULTS.avgBasket;

  const baseMonthlyRevenue = visitors * basket;
  const enrolledMembers = visitors * participationRate;
  const activeMembers = Math.max(1, Math.round(enrolledMembers * activeMemberRate));

  const extraVisitsRevenue = activeMembers * extraVisitPerActiveMember * basket;
  const basketLiftRevenue = activeMembers * basket * basketLiftOnMembers;
  const reactivationRevenue = visitors * reactivationShare * basket;

  let additionalMonthly = Math.round(
    extraVisitsRevenue + basketLiftRevenue + reactivationRevenue
  );

  const revenueCap = Math.round(baseMonthlyRevenue * maxIncrementalShareOfRevenue);
  additionalMonthly = Math.min(additionalMonthly, revenueCap);

  const subscriptionMonthly = MYFIDPASS_MONTHLY_COST;
  const netMonthly = Math.max(0, Math.round(additionalMonthly - subscriptionMonthly));
  const roiMultiple =
    subscriptionMonthly > 0
      ? Math.max(1, Math.round((additionalMonthly / subscriptionMonthly) * 10) / 10)
      : 0;

  const revenuePerActiveMember =
    Math.round((additionalMonthly / activeMembers) * 100) / 100;
  const costPerActiveMember =
    Math.round((subscriptionMonthly / activeMembers) * 100) / 100;

  const chartPoints = build30DayChart(additionalMonthly);
  const first30DaysRevenue = chartPoints[chartPoints.length - 1]?.cumulative ?? 0;

  return {
    dailyVisitors,
    monthlyVisitors: visitors,
    avgBasket: basket,
    baseMonthlyRevenue: Math.round(baseMonthlyRevenue),
    additionalMonthly,
    netMonthly,
    roiMultiple,
    activeMembers,
    enrolledMembers: Math.round(enrolledMembers),
    revenuePerActiveMember,
    costPerActiveMember,
    first30DaysRevenue,
    chartPoints,
    subscriptionMonthly,
  };
}

/**
 * @param {ReturnType<typeof computeRevenueSimulation>} results
 * @returns {string}
 */
export function buildRevenueSimulatorDisclaimer(results) {
  return (
    `* Estimation : +${formatEuro(results.revenuePerActiveMember, {
      maximumFractionDigits: 2,
    })}/client actif vs ${formatEuro(results.costPerActiveMember, {
      maximumFractionDigits: 2,
    })}/client. ` +
    `Basé sur ${results.activeMembers} clients actifs pour ${formatCompactNumber(
      results.dailyVisitors
    )} visiteurs/jour.`
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
  })
    .format(n)
    .replace(/[\s\u00a0]+€/g, "€");
}

/** @param {number} value */
export function formatCompactNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("fr-FR").format(Math.round(n));
}
