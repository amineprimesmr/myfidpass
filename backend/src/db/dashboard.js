/**
 * Requêtes dashboard (stats, évolution). Référence : REFONTE-REGLES.md.
 */
import { getDb } from "./connection.js";
import { getNotificationCampaignInsightsForBusiness } from "./webpush.js";
import { getBusinessById } from "./businesses.js";
import {
  getMemberIdsBirthdayToday,
  getMemberIdsPointsNear,
  getMemberIdsRewardReady,
} from "../lib/member-campaign-segments.js";
import { sqlExcludeTechnicalMembers, sqlInactiveMembersSinceDays } from "./member-segment-sql.js";

/** Membres clients réels (hors invités QR @guest.invalid et aperçu Wallet). */
const REAL_MEMBERS_SQL = sqlExcludeTechnicalMembers();

const db = getDb();

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

function monthLabelFr(yyyymm) {
  const [y, m] = yyyymm.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return yyyymm;
  const d = new Date(Date.UTC(y, m - 1, 1));
  const raw = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return raw.length ? raw.charAt(0).toUpperCase() + raw.slice(1) : yyyymm;
}

function getPeriodBounds(period) {
  const now = new Date();
  if (MONTH_KEY_RE.test(period)) {
    return { since: null, month: period, label: monthLabelFr(period) };
  }
  switch (period) {
    case "today":
      return { since: "datetime('now', 'start of day')", label: "Aujourd'hui" };
    case "this_week":
      return {
        since: "datetime('now', '-' || ((CAST(strftime('%w','now') AS INTEGER) + 6) % 7) || ' days', 'start of day')",
        label: "Cette semaine",
      };
    case "7d":
      return { since: "datetime('now', '-7 days')", label: "7 jours" };
    case "30d":
      return { since: "datetime('now', '-30 days')", label: "30 jours" };
    case "this_month":
      return { since: null, month: now.toISOString().slice(0, 7), label: "Ce mois-ci" };
    case "6m":
      return { since: "datetime('now', '-6 months')", label: "6 mois" };
    case "12m":
    case "1y":
      return { since: "datetime('now', '-12 months')", label: "12 mois" };
    default:
      return { since: null, month: now.toISOString().slice(0, 7), label: "Ce mois-ci" };
  }
}

export function getDashboardStats(businessId, period = "this_month") {
  const normalizedPeriod = period === "1y" ? "12m" : period;
  const bounds = getPeriodBounds(normalizedPeriod);
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const isHistoricalMonth = bounds.month != null && bounds.month < currentMonthKey;
  const membersCount =
    bounds.month != null
      ? db.prepare(`SELECT COUNT(*) as n FROM members WHERE business_id = ? AND ${REAL_MEMBERS_SQL} AND strftime('%Y-%m', created_at) <= ?`).get(businessId, bounds.month)
      : db.prepare(`SELECT COUNT(*) as n FROM members WHERE business_id = ? AND ${REAL_MEMBERS_SQL}`).get(businessId);
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
  const newMembers7d = isHistoricalMonth
    ? { n: 0 }
    : db.prepare(`SELECT COUNT(*) as n FROM members WHERE business_id = ? AND ${REAL_MEMBERS_SQL} AND created_at >= datetime('now', '-7 days')`).get(businessId);
  const newMembers30d = isHistoricalMonth
    ? { n: 0 }
    : db.prepare(`SELECT COUNT(*) as n FROM members WHERE business_id = ? AND ${REAL_MEMBERS_SQL} AND created_at >= datetime('now', '-30 days')`).get(businessId);
  const inactive30d = isHistoricalMonth
    ? { n: 0 }
    : db.prepare(`SELECT COUNT(*) as n FROM members WHERE business_id = ? AND ${REAL_MEMBERS_SQL} AND last_visit_at IS NOT NULL AND last_visit_at < datetime('now', '-30 days')`).get(businessId);
  const inactive90d = isHistoricalMonth
    ? { n: 0 }
    : db.prepare(`SELECT COUNT(*) as n FROM members WHERE business_id = ? AND ${REAL_MEMBERS_SQL} AND last_visit_at IS NOT NULL AND last_visit_at < datetime('now', '-90 days')`).get(businessId);
  const points50Count = isHistoricalMonth
    ? { n: 0 }
    : db.prepare(`SELECT COUNT(*) as n FROM members WHERE business_id = ? AND ${REAL_MEMBERS_SQL} AND points >= 50`).get(businessId);
  const pointsAvg = isHistoricalMonth
    ? { avg: 0 }
    : db.prepare(`SELECT COALESCE(ROUND(AVG(points), 0), 0) as avg FROM members WHERE business_id = ? AND ${REAL_MEMBERS_SQL}`).get(businessId);

  /**
   * Panier moyen = moyenne des `metadata.amount_eur` sur les crédits points **avec montant € saisi**.
   * Ne pas diviser par toutes les transactions (passages sans €, redeem, etc.) — sinon panier artificiellement bas.
   */
  const amountEurSqlFilter = `type = 'points_add' AND metadata IS NOT NULL
    AND json_extract(metadata, '$.amount_eur') IS NOT NULL
    AND CAST(json_extract(metadata, '$.amount_eur') AS REAL) > 0`;
  let declaredAmountSumEur = 0;
  let purchasesWithAmountEur = 0;
  try {
    if (bounds.month != null) {
      const row = db.prepare(
        `SELECT COALESCE(SUM(CAST(json_extract(metadata, '$.amount_eur') AS REAL)), 0) as total,
                COUNT(*) as n
         FROM transactions
         WHERE business_id = ? AND strftime('%Y-%m', created_at) = ? AND ${amountEurSqlFilter}`
      ).get(businessId, bounds.month);
      declaredAmountSumEur = row?.total ?? 0;
      purchasesWithAmountEur = row?.n ?? 0;
    } else {
      const row = db.prepare(
        `SELECT COALESCE(SUM(CAST(json_extract(metadata, '$.amount_eur') AS REAL)), 0) as total,
                COUNT(*) as n
         FROM transactions
         WHERE business_id = ? AND created_at >= ${bounds.since} AND ${amountEurSqlFilter}`
      ).get(businessId);
      declaredAmountSumEur = row?.total ?? 0;
      purchasesWithAmountEur = row?.n ?? 0;
    }
  } catch (_e) {
    /* json_extract peut échouer sur anciennes bases */
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
            `SELECT COUNT(*) as n FROM (SELECT member_id FROM transactions WHERE business_id = ? AND strftime('%Y-%m', created_at) = ? GROUP BY member_id HAVING COUNT(*) >= 10)`
          ).get(businessId, bounds.month)
        : db.prepare(
            `SELECT COUNT(*) as n FROM (SELECT member_id FROM transactions WHERE business_id = ? AND created_at >= ${bounds.since} GROUP BY member_id HAVING COUNT(*) >= 10)`
          ).get(businessId);
  } catch (_e) {
    /* sous-requête peut varier selon SQLite */
  }

  const newMembersInPeriod =
    bounds.month != null
      ? db
          .prepare(
            `SELECT COUNT(*) as n FROM members WHERE business_id = ? AND ${REAL_MEMBERS_SQL} AND strftime('%Y-%m', created_at) = ?`,
          )
          .get(businessId, bounds.month)
      : db
          .prepare(`SELECT COUNT(*) as n FROM members WHERE business_id = ? AND ${REAL_MEMBERS_SQL} AND created_at >= ${bounds.since}`)
          .get(businessId);

  const visitsInPeriod =
    bounds.month != null
      ? db
          .prepare(
            `SELECT COUNT(*) as n FROM transactions WHERE business_id = ? AND type = 'points_add' AND strftime('%Y-%m', created_at) = ?`,
          )
          .get(businessId, bounds.month)
      : db
          .prepare(
            `SELECT COUNT(*) as n FROM transactions WHERE business_id = ? AND type = 'points_add' AND created_at >= ${bounds.since}`,
          )
          .get(businessId);

  let rewardsRedeemed = { n: 0, pts: 0 };
  try {
    rewardsRedeemed =
      bounds.month != null
        ? db
            .prepare(
              `SELECT COUNT(*) as n, COALESCE(SUM(ABS(points)), 0) as pts FROM transactions WHERE business_id = ? AND type = 'reward_redeem' AND strftime('%Y-%m', created_at) = ?`,
            )
            .get(businessId, bounds.month)
        : db
            .prepare(
              `SELECT COUNT(*) as n, COALESCE(SUM(ABS(points)), 0) as pts FROM transactions WHERE business_id = ? AND type = 'reward_redeem' AND created_at >= ${bounds.since}`,
            )
            .get(businessId);
  } catch (_e) {
    /* */
  }

  const txCount = transactionsInPeriod?.n ?? 0;
  const declaredRounded = Math.round(declaredAmountSumEur * 100) / 100;
  const avgBasketEur =
    declaredRounded > 0 && purchasesWithAmountEur > 0
      ? Math.round((declaredRounded / purchasesWithAmountEur) * 100) / 100
      : null;
  const activeN = activeInPeriod?.n ?? 0;
  const visitsN = visitsInPeriod?.n ?? 0;
  /** Membres ayant au moins un passage / achat (`points_add`) — dénominateur cohérent (moyenne ≥ 1). */
  const membersWithPurchaseInPeriod =
    bounds.month != null
      ? db
          .prepare(
            `SELECT COUNT(DISTINCT member_id) as n FROM transactions WHERE business_id = ? AND type = 'points_add' AND strftime('%Y-%m', created_at) = ?`,
          )
          .get(businessId, bounds.month)
      : db
          .prepare(
            `SELECT COUNT(DISTINCT member_id) as n FROM transactions WHERE business_id = ? AND type = 'points_add' AND created_at >= ${bounds.since}`,
          )
          .get(businessId);
  const purchaseMembersN = membersWithPurchaseInPeriod?.n ?? 0;
  const avgVisitsPerActiveMember =
    visitsN > 0 && purchaseMembersN > 0
      ? Math.round((visitsN / purchaseMembersN) * 100) / 100
      : null;

  /** Missions avis Google validées côté client (claim `google_review`) — même logique que les follows réseaux, pas le total GBP. */
  let googleReviewsNewInPeriod = 0;
  try {
    if (bounds.month != null) {
      const gr = db
        .prepare(
          `SELECT COUNT(*) as n FROM engagement_completions
           WHERE business_id = ? AND action_type = 'google_review' AND status = 'approved'
           AND strftime('%Y-%m', created_at) = ?`,
        )
        .get(businessId, bounds.month);
      googleReviewsNewInPeriod = gr?.n ?? 0;
    } else {
      const gr = db
        .prepare(
          `SELECT COUNT(*) as n FROM engagement_completions
           WHERE business_id = ? AND action_type = 'google_review' AND status = 'approved'
           AND datetime(created_at) >= ${bounds.since}`,
        )
        .get(businessId);
      googleReviewsNewInPeriod = gr?.n ?? 0;
    }
  } catch (_e) {
    /* */
  }

  let notificationCampaigns = [];
  try {
    notificationCampaigns = getNotificationCampaignInsightsForBusiness(businessId, {
      limit: 24,
      monthKey: bounds.month ?? null,
    });
  } catch (_e) {
    notificationCampaigns = [];
  }

  return {
    period: bounds.label,
    periodKey: normalizedPeriod,
    membersCount: totalMembers,
    pointsThisMonth: pointsInPeriod?.total ?? 0,
    transactionsThisMonth: transactionsInPeriod?.n ?? 0,
    newMembersLast7Days: newMembers7d?.n ?? 0,
    newMembersLast30Days: newMembers30d?.n ?? 0,
    newMembersInPeriod: newMembersInPeriod?.n ?? 0,
    inactiveMembers30Days: inactive30d?.n ?? 0,
    inactiveMembers90Days: inactive90d?.n ?? 0,
    membersWithPoints50: points50Count?.n ?? 0,
    pointsAveragePerMember: pointsAvg?.avg ?? 0,
    activeMembersInPeriod: activeInPeriod?.n ?? 0,
    retentionPct,
    recurrentMembersInPeriod: recurrentInPeriod?.n ?? 0,
    visitsInPeriod: visitsN,
    avgVisitsPerActiveMember,
    avgBasketEur,
    rewardsRedeemedCount: rewardsRedeemed?.n ?? 0,
    pointsRedeemedInPeriod: Math.round(Number(rewardsRedeemed?.pts ?? 0)),
    googleReviewsNewInPeriod,
    socialFollowsClaimed: (() => {
      const networks = { instagram: "instagram_follow", tiktok: "tiktok_follow", facebook: "facebook_follow", twitter: "twitter_follow" };
      const out = {};
      for (const [net, actionType] of Object.entries(networks)) {
        try {
          let n = 0;
          if (bounds.month != null) {
            const r = db.prepare(
              `SELECT COUNT(*) as n FROM engagement_completions WHERE business_id = ? AND action_type = ? AND status = 'approved' AND strftime('%Y-%m', created_at) = ?`
            ).get(businessId, actionType, bounds.month);
            n = r?.n ?? 0;
          } else {
            const r = db.prepare(
              `SELECT COUNT(*) as n FROM engagement_completions WHERE business_id = ? AND action_type = ? AND status = 'approved' AND datetime(created_at) >= ${bounds.since}`
            ).get(businessId, actionType);
            n = r?.n ?? 0;
          }
          out[net] = n;
        } catch { out[net] = 0; }
      }
      return out;
    })(),
    notificationCampaigns,
  };
}

/**
 * Libellés + occurrences des `reward_redeem` sur la période (alignée sur `getDashboardStats`).
 * Tampons : libellé carte ; points : libellé du palier si `points_reward_tiers` matche `points_deducted`.
 */
export function getDashboardRewardsRedeemedBreakdown(businessId, period = "this_month", business = {}) {
  const normalizedPeriod = period === "1y" ? "12m" : period;
  const bounds = getPeriodBounds(normalizedPeriod);
  let tiers = business.points_reward_tiers;
  if (typeof tiers === "string" && tiers.trim()) {
    try {
      tiers = JSON.parse(tiers);
    } catch {
      tiers = [];
    }
  }
  if (!Array.isArray(tiers)) tiers = [];
  const stampLabel = (business.stamp_reward_label && String(business.stamp_reward_label).trim()) || "Récompense tampons";

  let rows;
  if (bounds.month != null) {
    rows = db
      .prepare(
        `SELECT metadata, points FROM transactions
         WHERE business_id = ? AND type = 'reward_redeem' AND strftime('%Y-%m', created_at) = ?`,
      )
      .all(businessId, bounds.month);
  } else {
    rows = db
      .prepare(
        `SELECT metadata, points FROM transactions
         WHERE business_id = ? AND type = 'reward_redeem' AND created_at >= ${bounds.since}`,
      )
      .all(businessId);
  }

  const tierLabelForPoints = (pts) => {
    const n = Number(pts);
    if (!Number.isFinite(n) || n <= 0) return `${pts} pts`;
    for (const t of tiers) {
      if (Number(t?.points) === n) {
        const lab = String(t?.label || "").trim();
        return lab || `${n} pts`;
      }
    }
    return `${n} pts`;
  };

  /** @type {Map<string, { label: string, count: number }>} */
  const map = new Map();

  for (const row of rows || []) {
    let meta = {};
    if (row.metadata) {
      try {
        meta = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;
      } catch {
        meta = {};
      }
    }
    const subtype = String(meta.subtype || "")
      .toLowerCase()
      .trim();
    const absPts = Math.abs(Number(row.points) || 0);

    if (subtype === "stamps") {
      const key = "stamps";
      const prev = map.get(key) || { label: stampLabel, count: 0 };
      prev.count += 1;
      map.set(key, prev);
    } else if (subtype === "points" || subtype === "") {
      const pts =
        meta.points_deducted != null && Number.isFinite(Number(meta.points_deducted))
          ? Number(meta.points_deducted)
          : absPts;
      const key = `points:${pts}`;
      const label = tierLabelForPoints(pts);
      const prev = map.get(key) || { label, count: 0 };
      prev.count += 1;
      map.set(key, prev);
    } else {
      const key = `other:${subtype}`;
      const label = `Récompense (${subtype})`;
      const prev = map.get(key) || { label, count: 0 };
      prev.count += 1;
      map.set(key, prev);
    }
  }

  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

const WEEKDAY_LABELS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

/**
 * Répartition du « trafic » caisse sur la période : crédits points (`points_add`) + utilisations récompense (`reward_redeem`).
 * Heures / jours : agrégation SQLite sur `created_at` (UTC serveur, voir `timezone_note` dans la réponse).
 */
export function getDashboardTrafficPatterns(businessId, period = "this_month") {
  const normalizedPeriod = period === "1y" ? "12m" : period;
  const bounds = getPeriodBounds(normalizedPeriod);
  const basis = "points_add_and_reward_redeem";
  const timezoneNote =
    "Les créneaux horaires et les jours sont calculés en heure UTC (serveur), pas à l’heure locale du magasin.";
  const typeFilter = `type IN ('points_add', 'reward_redeem')`;

  let totalRow;
  let hourRows;
  let wdRows;

  if (bounds.month != null) {
    totalRow = db
      .prepare(
        `SELECT COUNT(*) as n FROM transactions WHERE business_id = ? AND ${typeFilter} AND strftime('%Y-%m', created_at) = ?`,
      )
      .get(businessId, bounds.month);
    hourRows = db
      .prepare(
        `SELECT CAST(strftime('%H', created_at) AS INTEGER) AS hour, COUNT(*) AS n FROM transactions WHERE business_id = ? AND ${typeFilter} AND strftime('%Y-%m', created_at) = ? GROUP BY hour`,
      )
      .all(businessId, bounds.month);
    wdRows = db
      .prepare(
        `SELECT (CAST(strftime('%w', created_at) AS INTEGER) + 6) % 7 AS wd, COUNT(*) AS n FROM transactions WHERE business_id = ? AND ${typeFilter} AND strftime('%Y-%m', created_at) = ? GROUP BY wd`,
      )
      .all(businessId, bounds.month);
  } else {
    totalRow = db
      .prepare(
        `SELECT COUNT(*) as n FROM transactions WHERE business_id = ? AND ${typeFilter} AND created_at >= ${bounds.since}`,
      )
      .get(businessId);
    hourRows = db
      .prepare(
        `SELECT CAST(strftime('%H', created_at) AS INTEGER) AS hour, COUNT(*) AS n FROM transactions WHERE business_id = ? AND ${typeFilter} AND created_at >= ${bounds.since} GROUP BY hour`,
      )
      .all(businessId);
    wdRows = db
      .prepare(
        `SELECT (CAST(strftime('%w', created_at) AS INTEGER) + 6) % 7 AS wd, COUNT(*) AS n FROM transactions WHERE business_id = ? AND ${typeFilter} AND created_at >= ${bounds.since} GROUP BY wd`,
      )
      .all(businessId);
  }

  const totalEvents = totalRow?.n ?? 0;

  const byHourMap = new Map();
  for (const r of hourRows || []) {
    const h = Number(r.hour);
    if (Number.isFinite(h)) byHourMap.set(h, r.n ?? 0);
  }
  const byHour = [];
  for (let h = 0; h < 24; h++) {
    byHour.push({ hour: h, count: byHourMap.get(h) ?? 0 });
  }

  const byWdMap = new Map();
  for (const r of wdRows || []) {
    const wd = Number(r.wd);
    if (Number.isFinite(wd)) byWdMap.set(wd, r.n ?? 0);
  }
  const byWeekday = [];
  for (let wd = 0; wd < 7; wd++) {
    byWeekday.push({ weekday: wd, label: WEEKDAY_LABELS_FR[wd], count: byWdMap.get(wd) ?? 0 });
  }

  let peakHourRow = null;
  let maxH = -1;
  for (const row of byHour) {
    if (row.count > maxH) {
      maxH = row.count;
      peakHourRow = row;
    }
  }
  let peakHour = null;
  if (totalEvents > 0 && peakHourRow && maxH > 0) {
    peakHour = {
      hour: peakHourRow.hour,
      count: peakHourRow.count,
      pct_of_total: Math.round((peakHourRow.count / totalEvents) * 1000) / 10,
    };
  }

  let peakWeekdayRow = null;
  let maxW = -1;
  for (const row of byWeekday) {
    if (row.count > maxW) {
      maxW = row.count;
      peakWeekdayRow = row;
    }
  }
  let peakWeekday = null;
  if (totalEvents > 0 && peakWeekdayRow && maxW > 0) {
    peakWeekday = {
      weekday: peakWeekdayRow.weekday,
      label: peakWeekdayRow.label,
      count: peakWeekdayRow.count,
      pct_of_total: Math.round((peakWeekdayRow.count / totalEvents) * 1000) / 10,
    };
  }

  return {
    period: bounds.label,
    periodKey: normalizedPeriod,
    timezoneNote,
    basis,
    totalEvents,
    byHour,
    byWeekday,
    peakHour,
    peakWeekday,
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
      `SELECT COUNT(*) as n FROM members WHERE business_id = ? AND ${REAL_MEMBERS_SQL} AND created_at < ${end}`
    ).get(businessId);
    rows.push({
      week_index: i,
      operations_count: op?.n ?? 0,
      members_count: members?.n ?? 0,
    });
  }
  return rows;
}

const MEMBERS_CHART_POINT_COUNT = 7;

/**
 * Jalons jour du mois pour la courbe Membres.
 * - Mois en cours avec peu de jours écoulés : un point par jour (1…J) pour coller aux vraies inscriptions.
 * - Mois long / historique : 7 jalons uniques incluant jour 1 et dernier jour, sans trou (ex. pas de 1,2,3,5…).
 */
function memberChartMilestoneDays(y, m, daysInMonth) {
  const now = new Date();
  const isCurrentMonth = y === now.getFullYear() && m === now.getMonth() + 1;
  const endDay = isCurrentMonth ? Math.min(now.getDate(), daysInMonth) : daysInMonth;
  if (endDay <= 1) return [1];

  const maxDailyPoints = 15;
  if (endDay <= maxDailyPoints) {
    return Array.from({ length: endDay }, (_, i) => i + 1);
  }

  const days = new Set([1, endDay]);
  for (let i = 1; i < MEMBERS_CHART_POINT_COUNT - 1; i++) {
    const t = i / (MEMBERS_CHART_POINT_COUNT - 1);
    const d = 1 + Math.round(t * (endDay - 1));
    days.add(Math.min(Math.max(1, d), endDay));
  }
  return [...days].sort((a, b) => a - b);
}

/**
 * Évolution sur un mois civil (YYYY-MM) : 7 jalons répartis sur le mois écoulé pour la courbe Membres.
 * `new_members_in_month` = cumul d’inscriptions du 1er au jour J (courbe qui monte avec le mois).
 * `operations_count` = passages sur l’intervalle entre deux jalons (fréquence / barres).
 */
export function getDashboardEvolutionForMonth(businessId, yyyymm) {
  if (!MONTH_KEY_RE.test(yyyymm)) return [];
  const [yStr, mStr] = yyyymm.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return [];
  const daysInMonth = new Date(y, m, 0).getDate();
  const pad = (d) => String(d).padStart(2, "0");
  const monthStart = `${yStr}-${mStr}-01`;

  const milestones = memberChartMilestoneDays(y, m, daysInMonth);
  const rows = [];
  for (let b = 0; b < milestones.length; b++) {
    const queryDay = milestones[b];
    const prevQueryDay = b === 0 ? 0 : milestones[b - 1];
    const intervalStartDay = prevQueryDay + 1;
    const intervalEndDay = queryDay;
    const intervalStart =
      intervalStartDay <= intervalEndDay
        ? `${yStr}-${mStr}-${pad(intervalStartDay)}`
        : `${yStr}-${mStr}-${pad(queryDay)}`;
    const queryEndDate = `${yStr}-${mStr}-${pad(queryDay)}`;

    const op =
      intervalStartDay <= intervalEndDay
        ? db
            .prepare(
              `SELECT COUNT(*) as n FROM transactions WHERE business_id = ?
               AND date(created_at) >= date(?) AND date(created_at) <= date(?)`,
            )
            .get(businessId, intervalStart, queryEndDate)
        : { n: 0 };

    const newInMonth = db
      .prepare(
        `SELECT COUNT(*) as n FROM members WHERE business_id = ? AND ${REAL_MEMBERS_SQL}
         AND date(created_at) >= date(?) AND date(created_at) <= date(?)`,
      )
      .get(businessId, monthStart, queryEndDate);

    const amountEurSqlFilter = `type = 'points_add' AND metadata IS NOT NULL
      AND json_extract(metadata, '$.amount_eur') IS NOT NULL
      AND CAST(json_extract(metadata, '$.amount_eur') AS REAL) > 0`;
    let avgBasketEurInMonth = null;
    let avgBasketEurInInterval = null;
    let basketTotalEurInMonth = null;
    try {
      const basketMonthRow = db
        .prepare(
          `SELECT COALESCE(SUM(CAST(json_extract(metadata, '$.amount_eur') AS REAL)), 0) as total,
                  COUNT(*) as n
           FROM transactions
           WHERE business_id = ? AND date(created_at) >= date(?) AND date(created_at) <= date(?)
           AND ${amountEurSqlFilter}`,
        )
        .get(businessId, monthStart, queryEndDate);
      const monthN = basketMonthRow?.n ?? 0;
      const monthTotal = basketMonthRow?.total ?? 0;
      if (monthTotal > 0) {
        basketTotalEurInMonth = Math.round(monthTotal * 100) / 100;
      }
      if (monthN > 0 && monthTotal > 0) {
        avgBasketEurInMonth = Math.round((monthTotal / monthN) * 100) / 100;
      }

      if (intervalStartDay <= intervalEndDay) {
        const basketIntervalRow = db
          .prepare(
            `SELECT COALESCE(SUM(CAST(json_extract(metadata, '$.amount_eur') AS REAL)), 0) as total,
                    COUNT(*) as n
             FROM transactions
             WHERE business_id = ? AND date(created_at) >= date(?) AND date(created_at) <= date(?)
             AND ${amountEurSqlFilter}`,
          )
          .get(businessId, intervalStart, queryEndDate);
        const intervalN = basketIntervalRow?.n ?? 0;
        const intervalTotal = basketIntervalRow?.total ?? 0;
        if (intervalN > 0 && intervalTotal > 0) {
          avgBasketEurInInterval = Math.round((intervalTotal / intervalN) * 100) / 100;
        }
      }
    } catch (_e) {
      /* json_extract */
    }

    const membersTotal = db
      .prepare(
        `SELECT COUNT(*) as n FROM members WHERE business_id = ? AND ${REAL_MEMBERS_SQL} AND date(created_at) <= date(?)`,
      )
      .get(businessId, queryEndDate);

    rows.push({
      week_index: b,
      day_of_month: queryDay,
      operations_count: op?.n ?? 0,
      members_count: membersTotal?.n ?? 0,
      new_members_in_month: newInMonth?.n ?? 0,
      avg_basket_eur_in_month: avgBasketEurInMonth,
      avg_basket_eur_in_interval: avgBasketEurInInterval,
      basket_total_eur_in_month: basketTotalEurInMonth,
    });
  }
  return rows;
}

/** Compteurs pour l’écran campagnes (segments étendus). */
export function getCampaignSegmentCounts(businessId) {
  const business = getBusinessById(businessId);
  const inactive14 = db.prepare(
    `SELECT COUNT(*) as n FROM members WHERE business_id = ? AND ${REAL_MEMBERS_SQL} AND ${sqlInactiveMembersSinceDays(14)}`
  ).get(businessId);
  const inactive60 = db.prepare(
    `SELECT COUNT(*) as n FROM members WHERE business_id = ? AND ${REAL_MEMBERS_SQL} AND last_visit_at IS NOT NULL AND last_visit_at < datetime('now', '-60 days')`
  ).get(businessId);
  const new7 = db.prepare(
    `SELECT COUNT(*) as n FROM members WHERE business_id = ? AND ${REAL_MEMBERS_SQL} AND created_at >= datetime('now', '-7 days')`
  ).get(businessId);
  const welcomeNew = db.prepare(
    `SELECT COUNT(*) as n FROM members WHERE business_id = ? AND ${REAL_MEMBERS_SQL} AND created_at >= datetime('now', '-14 days') AND last_visit_at IS NULL`
  ).get(businessId);
  const pointsNear50Count = business ? getMemberIdsPointsNear(businessId, business).length : 0;
  const inactive30d = db.prepare(
    `SELECT COUNT(*) as n FROM members WHERE business_id = ? AND ${REAL_MEMBERS_SQL} AND last_visit_at IS NOT NULL AND last_visit_at < datetime('now', '-30 days')`
  ).get(businessId);
  const inactive90d = db.prepare(
    `SELECT COUNT(*) as n FROM members WHERE business_id = ? AND ${REAL_MEMBERS_SQL} AND last_visit_at IS NOT NULL AND last_visit_at < datetime('now', '-90 days')`
  ).get(businessId);
  const new30d = db.prepare(
    `SELECT COUNT(*) as n FROM members WHERE business_id = ? AND ${REAL_MEMBERS_SQL} AND created_at >= datetime('now', '-30 days')`
  ).get(businessId);
  const points50CountN = business ? getMemberIdsRewardReady(businessId, business).length : 0;
  let recurrentInPeriod = { n: 0 };
  try {
    recurrentInPeriod = db.prepare(
      `SELECT COUNT(*) as n FROM (
        SELECT member_id FROM transactions WHERE business_id = ?
        AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
        GROUP BY member_id HAVING COUNT(*) >= 10
      )`
    ).get(businessId);
  } catch (_e) {
    /* */
  }
  const birthdayTodayCount = getMemberIdsBirthdayToday(businessId).length;
  return {
    inactive14: inactive14?.n ?? 0,
    inactive30: inactive30d?.n ?? 0,
    inactive60: inactive60?.n ?? 0,
    inactive90: inactive90d?.n ?? 0,
    new7: new7?.n ?? 0,
    new30: new30d?.n ?? 0,
    welcomeNew: welcomeNew?.n ?? 0,
    pointsNear50: pointsNear50Count,
    points50: points50CountN,
    recurrent: recurrentInPeriod?.n ?? 0,
    birthdayToday: birthdayTodayCount,
  };
}
