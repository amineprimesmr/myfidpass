/**
 * Calcul des points (scan / caisse) et plafonds anti-fraude (réglages commerce).
 * Utilisé par les endpoints de scan membre.
 */

/**
 * @param {object} business Ligne `businesses` SQLite
 * @param {{ pointsDirect?: unknown, amountEur?: unknown, visit?: boolean }} input
 * @returns {number}
 */
export function computeRawPointsForCredit(business, input) {
  const pointsDirect = Number(input?.pointsDirect);
  const amountEur = Number(input?.amountEur);
  const visit = input?.visit === true;
  const perEuro = Number(business.points_per_euro) || 1;
  const perVisit = Number(business.points_per_visit) || 0;
  const minAmount = business.points_min_amount_eur != null ? Number(business.points_min_amount_eur) : null;
  const programType = (business.program_type || "").toLowerCase();
  let points = 0;
  if (Number.isInteger(pointsDirect) && pointsDirect > 0) points += pointsDirect;
  if (!Number.isNaN(amountEur) && amountEur > 0) {
    if (minAmount == null || amountEur >= minAmount) {
      points += Math.floor(amountEur * perEuro);
    }
  }
  if (visit && perVisit > 0) points += perVisit;
  if (visit && programType === "stamps" && points === 0) points = 1;
  return points;
}

/**
 * @param {object} business
 * @param {number} rawPoints
 * @param {number} countAddsToday Nombre de transactions `points_add` déjà enregistrées aujourd’hui (UTC) pour ce membre.
 * @returns {{ ok: true, points: number, capped: boolean, originalPoints: number } | { ok: false, status: number, code: string, error: string }}
 */
export function enforceScanSecurityLimits(business, rawPoints, countAddsToday) {
  const maxPassesRaw = business.scan_max_passes_per_member_per_day;
  const maxPasses =
    maxPassesRaw != null && maxPassesRaw !== "" ? Math.floor(Number(maxPassesRaw)) : 0;
  if (Number.isFinite(maxPasses) && maxPasses > 0 && countAddsToday >= maxPasses) {
    return {
      ok: false,
      status: 400,
      code: "DAILY_SCAN_LIMIT_REACHED",
      error: `Limite atteinte : ${maxPasses} crédit(s) maximum par client et par jour (réglages sécurité).`,
    };
  }
  const maxPtsRaw = business.scan_max_points_per_transaction;
  const maxPts = maxPtsRaw != null && maxPtsRaw !== "" ? Math.floor(Number(maxPtsRaw)) : 0;
  let points = rawPoints;
  let capped = false;
  if (Number.isFinite(maxPts) && maxPts > 0 && points > maxPts) {
    points = maxPts;
    capped = true;
  }
  return { ok: true, points, capped, originalPoints: rawPoints };
}
