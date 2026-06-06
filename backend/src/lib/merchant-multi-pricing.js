/**
 * Grille multi-commerces (mensuel) : 1 commerce 49,99 € ; 2 = 89,99 € total ;
 * chaque commerce au-delà de 2 : +34,99 € / mois (jusqu’à 5 emplacements).
 * Annuel : même ratio que l’offre 1 commerce (399 € / an vs 49,99 € / mois) appliqué au total mensuel.
 */

export const MULTI_BUSINESS_MONTHLY_1_CENTS = 4999;
const MULTI_BUSINESS_MONTHLY_2_TOTAL_CENTS = 8999;
const MULTI_BUSINESS_MONTHLY_EXTRA_PER_SLOT_CENTS = 3499;
/** Référence annuelle 1 commerce (399 € / an), alignée STRIPE_PRICE_ID_ANNUAL. */
export const MULTI_BUSINESS_ANNUAL_1_REFERENCE_CENTS = 39900;

/**
 * @param {number} slots — nombre de commerces (1–5)
 * @returns {number} total mensuel en centimes
 */
export function multiBusinessMonthlyTotalCents(slots) {
  const n = Math.min(5, Math.max(1, Math.floor(Number(slots) || 1)));
  if (n === 1) return MULTI_BUSINESS_MONTHLY_1_CENTS;
  return MULTI_BUSINESS_MONTHLY_2_TOTAL_CENTS + Math.max(0, n - 2) * MULTI_BUSINESS_MONTHLY_EXTRA_PER_SLOT_CENTS;
}

/**
 * @param {number} slots — nombre de commerces (1–5)
 * @returns {number} total annuel en centimes (arrondi)
 */
export function multiBusinessAnnualTotalCents(slots) {
  const monthly = multiBusinessMonthlyTotalCents(slots);
  return Math.round((monthly * MULTI_BUSINESS_ANNUAL_1_REFERENCE_CENTS) / MULTI_BUSINESS_MONTHLY_1_CENTS);
}

/**
 * Répartit `totalCents` sur `count` lignes (somme exacte), en répartissant le reste sur les premiers index.
 * @param {number} totalCents
 * @param {number} count
 * @param {number} indexZeroBased
 * @returns {number}
 */
export function amountCentsForSplitIndex(totalCents, count, indexZeroBased) {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  const total = Math.max(0, Math.floor(Number(totalCents) || 0));
  const idx = Math.min(n - 1, Math.max(0, Math.floor(indexZeroBased)));
  const base = Math.floor(total / n);
  const remainder = total % n;
  return base + (idx < remainder ? 1 : 0);
}

/**
 * Montant de la ligne d’abonnement « par commerce » pour un index donné (0-based).
 * @param {number} totalBusinesses — nombre de commerces du compte (1–5)
 * @param {number} businessIndexZeroBased
 * @param {"month"|"year"} interval
 */
export function resolveBusinessSplitAmountCents(totalBusinesses, businessIndexZeroBased, interval = "month") {
  const n = Math.min(5, Math.max(1, Math.floor(Number(totalBusinesses) || 1)));
  const total =
    interval === "year" ? multiBusinessAnnualTotalCents(n) : multiBusinessMonthlyTotalCents(n);
  return amountCentsForSplitIndex(total, n, businessIndexZeroBased);
}

/** Affichage EUR (ex. `49,99 €`). */
export function formatEuroFromCents(cents) {
  const n = Math.max(0, Math.floor(Number(cents) || 0));
  const euros = (n / 100).toFixed(2).replace(".", ",");
  return `${euros} €`;
}

/**
 * Devis passage d’un palier à un autre (mensuel).
 * @param {number} fromSlots — quota actuellement payé (1–5)
 * @param {number} toSlots — quota cible (1–5, ≥ fromSlots)
 */
export function merchantPricingQuote(fromSlots, toSlots) {
  const from = Math.min(5, Math.max(1, Math.floor(Number(fromSlots) || 1)));
  const to = Math.min(5, Math.max(from, Math.floor(Number(toSlots) || from)));
  const fromMonthlyCents = multiBusinessMonthlyTotalCents(from);
  const toMonthlyCents = multiBusinessMonthlyTotalCents(to);
  const fromAnnualCents = multiBusinessAnnualTotalCents(from);
  const toAnnualCents = multiBusinessAnnualTotalCents(to);
  const incrementalMonthlyCents = Math.max(0, toMonthlyCents - fromMonthlyCents);
  const incrementalAnnualCents = Math.max(0, toAnnualCents - fromAnnualCents);
  return {
    from_slots: from,
    to_slots: to,
    from_monthly_cents: fromMonthlyCents,
    to_monthly_cents: toMonthlyCents,
    from_annual_cents: fromAnnualCents,
    to_annual_cents: toAnnualCents,
    incremental_monthly_cents: incrementalMonthlyCents,
    incremental_annual_cents: incrementalAnnualCents,
    from_monthly_label: formatEuroFromCents(fromMonthlyCents),
    to_monthly_label: formatEuroFromCents(toMonthlyCents),
    incremental_monthly_label: formatEuroFromCents(incrementalMonthlyCents),
    from_annual_label: formatEuroFromCents(fromAnnualCents),
    to_annual_label: formatEuroFromCents(toAnnualCents),
    incremental_annual_label: formatEuroFromCents(incrementalAnnualCents),
    is_upgrade: to > from,
  };
}
