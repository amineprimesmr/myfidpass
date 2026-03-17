/**
 * Requêtes dashboard (stats, évolution). Référence : REFONTE-REGLES.md.
 */
import { getDb } from "./connection.js";
import { getBusinessById } from "./businesses.js";

const db = getDb();

function getPeriodBounds(period) {
  const now = new Date();
  switch (period) {
    case "7d":
      return { since: "datetime('now', '-7 days')", label: "7 jours" };
    case "30d":
      return { since: "datetime('now', '-30 days')", label: "30 jours" };
    case "this_month":
      return { since: null, month: now.toISOString().slice(0, 7), label: "Ce mois-ci" };
    case "6m":
      return { since: "datetime('now', '-6 months')", label: "6 mois" };
    default:
      return { since: null, month: now.toISOString().slice(0, 7), label: "Ce mois-ci" };
  }
}

export function getDashboardStats(businessId, period = "this_month") {
  const bounds = getPeriodBounds(period);
  const membersCount = db.prepare("SELECT COUNT(*) as n FROM members WHERE business_id = ?").get(businessId);
  const pointsInPeriod =
    bounds.month != null
      ? db.prepare(
          `SELECT COALESCE(SUM(points), 0) as total FROM transactions WHERE business_id = ? AND type = 'points_add' AND strftime('%Y-%m', created_at) = ?`
        ).get(businessId, bounds.month)
      : db.prepare(
          `SELECT COALESCE(SUM(points), 0) as total FROM transactions WHERE business_id = ? AND type = 'points_add' AND created_at >= ${bounds.since}`
        ).get(businessId);
  const transactionsInPeriod =
    bounds.month != null
      ? db.prepare(
          `SELECT COUNT(*) as n FROM transactions WHERE business_id = ? AND strftime('%Y-%m', created_at) = ?`
        ).get(businessId, bounds.month)
      : db.prepare(
          `SELECT COUNT(*) as n FROM transactions WHERE business_id = ? AND created_at >= ${bounds.since}`
        ).get(businessId);
  const newMembers7d = db.prepare(
    "SELECT COUNT(*) as n FROM members WHERE business_id = ? AND created_at >= datetime('now', '-7 days')"
  ).get(businessId);
  const newMembers30d = db.prepare(
    "SELECT COUNT(*) as n FROM members WHERE business_id = ? AND created_at >= datetime('now', '-30 days')"
  ).get(businessId);
  const inactive30d = db.prepare(
    `SELECT COUNT(*) as n FROM members WHERE business_id = ? AND (last_visit_at IS NULL OR last_visit_at < datetime('now', '-30 days'))`
  ).get(businessId);
  const inactive90d = db.prepare(
    `SELECT COUNT(*) as n FROM members WHERE business_id = ? AND (last_visit_at IS NULL OR last_visit_at < datetime('now', '-90 days'))`
  ).get(businessId);
  const pointsAvg = db.prepare(
    "SELECT COALESCE(ROUND(AVG(points), 0), 0) as avg FROM members WHERE business_id = ?"
  ).get(businessId);

  let estimatedRevenueEur = 0;
  try {
    if (bounds.month != null) {
      const row = db.prepare(
        `SELECT COALESCE(SUM(CAST(json_extract(metadata, '$.amount_eur') AS REAL)), 0) as total
         FROM transactions WHERE business_id = ? AND strftime('%Y-%m', created_at) = ? AND metadata IS NOT NULL`
      ).get(businessId, bounds.month);
      estimatedRevenueEur = row?.total ?? 0;
    } else {
      const row = db.prepare(
        `SELECT COALESCE(SUM(CAST(json_extract(metadata, '$.amount_eur') AS REAL)), 0) as total
         FROM transactions WHERE business_id = ? AND created_at >= ${bounds.since} AND metadata IS NOT NULL`
      ).get(businessId);
      estimatedRevenueEur = row?.total ?? 0;
    }
  } catch (_e) {
    /* json_extract peut échouer sur anciennes bases */
  }
  const business = getBusinessById(businessId);
  const pointsPerEuro = business?.points_per_euro != null ? Number(business.points_per_euro) : 1;
  if (estimatedRevenueEur <= 0 && (pointsInPeriod?.total ?? 0) > 0 && pointsPerEuro > 0) {
    estimatedRevenueEur = (pointsInPeriod.total ?? 0) / pointsPerEuro;
  }

  const activeInPeriod =
    bounds.month != null
      ? db.prepare(
          `SELECT COUNT(DISTINCT member_id) as n FROM transactions WHERE business_id = ? AND strftime('%Y-%m', created_at) = ?`
        ).get(businessId, bounds.month)
      : db.prepare(
          `SELECT COUNT(DISTINCT member_id) as n FROM transactions WHERE business_id = ? AND created_at >= ${bounds.since}`
        ).get(businessId);
  const totalMembers = membersCount?.n ?? 0;
  const retentionPct = totalMembers > 0 ? Math.round(((activeInPeriod?.n ?? 0) / totalMembers) * 100) : 0;

  let recurrentInPeriod = { n: 0 };
  try {
    recurrentInPeriod =
      bounds.month != null
        ? db.prepare(
            `SELECT COUNT(*) as n FROM (SELECT member_id FROM transactions WHERE business_id = ? AND strftime('%Y-%m', created_at) = ? GROUP BY member_id HAVING COUNT(*) >= 2)`
          ).get(businessId, bounds.month)
        : db.prepare(
            `SELECT COUNT(*) as n FROM (SELECT member_id FROM transactions WHERE business_id = ? AND created_at >= ${bounds.since} GROUP BY member_id HAVING COUNT(*) >= 2)`
          ).get(businessId);
  } catch (_e) {
    /* sous-requête peut varier selon SQLite */
  }

  return {
    period: bounds.label,
    periodKey: period,
    membersCount: totalMembers,
    pointsThisMonth: pointsInPeriod?.total ?? 0,
    transactionsThisMonth: transactionsInPeriod?.n ?? 0,
    newMembersLast7Days: newMembers7d?.n ?? 0,
    newMembersLast30Days: newMembers30d?.n ?? 0,
    inactiveMembers30Days: inactive30d?.n ?? 0,
    inactiveMembers90Days: inactive90d?.n ?? 0,
    pointsAveragePerMember: pointsAvg?.avg ?? 0,
    estimatedRevenueEur: Math.round(estimatedRevenueEur * 100) / 100,
    activeMembersInPeriod: activeInPeriod?.n ?? 0,
    retentionPct,
    recurrentMembersInPeriod: recurrentInPeriod?.n ?? 0,
  };
}

export function getDashboardEvolution(businessId, weeks = 6) {
  const rows = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = `datetime('now', '-${i + 1} weeks')`;
    const end = i === 0 ? "datetime('now')" : `datetime('now', '-${i} weeks')`;
    const op = db.prepare(
      `SELECT COUNT(*) as n FROM transactions WHERE business_id = ? AND created_at >= ${start} AND created_at < ${end}`
    ).get(businessId);
    const members = db.prepare(
      `SELECT COUNT(*) as n FROM members WHERE business_id = ? AND created_at < ${end}`
    ).get(businessId);
    rows.push({
      weekIndex: i,
      operationsCount: op?.n ?? 0,
      membersCount: members?.n ?? 0,
    });
  }
  return rows;
}
