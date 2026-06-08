/**
 * Segments campagnes sensibles au type de programme (points / tampons) et fuseau commerçant.
 */
import { getDb } from "../db/connection.js";
import { getBusinessById } from "../db/businesses.js";
import { sqlExcludeTechnicalMembers, sqlInactiveMembersSinceDays } from "../db/member-segment-sql.js";

const REAL_MEMBERS_SQL = sqlExcludeTechnicalMembers();
import { normalizeStampBalance } from "./stamps-cycle-math.js";
import { STAMP_MID_DEFAULT } from "./stamp-reward-tiers.js";
import {
  findNewlyUnlockedPointsTiers,
  normalizePointsRewardTiersForClient,
  SIGNUP_REWARD_POINTS,
} from "./points-reward-tiers.js";
import { findNewlyUnlockedStampRewardTiers } from "./stamp-reward-tiers.js";
import { resolveSignupRewardLabelForBusiness } from "./signup-reward-label.js";
import { getZonedCalendarParts, getMerchantNotificationTimezone } from "./merchant-notification-timezone.js";

const db = getDb();

export const POINTS_NEAR_WINDOW = 5;
export const STAMPS_NEAR_WINDOW = 2;

const PROFILE_COMPLETE_SQL =
  "birth_date IS NOT NULL AND TRIM(birth_date) != ''" +
  " AND phone IS NOT NULL AND TRIM(phone) != ''" +
  " AND city IS NOT NULL AND TRIM(city) != ''";

/** Scans / crédits réels (hors bonus inscription et corrections caisse). */
export function countMemberQualifyingScans(businessId, memberId) {
  const row = db
    .prepare(
      `SELECT COUNT(*) as n FROM transactions
       WHERE business_id = ? AND member_id = ?
         AND type NOT IN ('welcome_bonus', 'points_correction')`,
    )
    .get(businessId, memberId);
  return Number(row?.n) || 0;
}

export function memberHasExactlyOneQualifyingScan(businessId, memberId) {
  return countMemberQualifyingScans(businessId, memberId) === 1;
}

function loadBusinessOrNull(businessId, business) {
  if (business?.id) return business;
  return businessId ? getBusinessById(businessId) : null;
}

function pointsRewardTiersForBusiness(business) {
  const signupLabel = resolveSignupRewardLabelForBusiness(business.id);
  return normalizePointsRewardTiersForClient(business.points_reward_tiers, signupLabel);
}

function redeemablePointsTiers(tiers) {
  return tiers.filter((t) => t.points > SIGNUP_REWARD_POINTS);
}

/**
 * Récompense « prête » : palier franchi (tampon cycle / mi-parcours ou palier points).
 */
export function memberHasRewardReady(business, memberRow) {
  if (!business || !memberRow) return false;
  const raw = Math.max(0, Math.floor(Number(memberRow.points) || 0));
  if (raw <= 0) return false;

  const programType = String(business.program_type || "points").toLowerCase();
  if (programType === "stamps") {
    const required = Math.max(1, Math.floor(Number(business.required_stamps) || 10));
    const mod = normalizeStampBalance(raw, required);
    const midLabel = String(business.stamp_mid_reward_label || "").trim();
    if (mod === 0) return true;
    if (midLabel && required > STAMP_MID_DEFAULT && mod === STAMP_MID_DEFAULT) return true;
    return false;
  }

  const tiers = pointsRewardTiersForBusiness(business);
  const redeemable = redeemablePointsTiers(tiers);
  if (!redeemable.length) return raw >= 50;
  const minThreshold = Math.min(...redeemable.map((t) => t.points));
  return raw >= minThreshold;
}

/**
 * Proche du prochain palier (quelques points / tampons restants).
 */
export function memberIsPointsNearReward(business, memberRow) {
  if (!business || !memberRow) return false;
  const raw = Math.max(0, Math.floor(Number(memberRow.points) || 0));

  const programType = String(business.program_type || "points").toLowerCase();
  if (programType === "stamps") {
    const required = Math.max(1, Math.floor(Number(business.required_stamps) || 10));
    const mod = normalizeStampBalance(raw, required);
    const midLabel = String(business.stamp_mid_reward_label || "").trim();
    const mid = STAMP_MID_DEFAULT;
    if (midLabel && required > mid && mod < mid) {
      const gap = mid - mod;
      return gap > 0 && gap <= STAMPS_NEAR_WINDOW;
    }
    if (mod > 0) {
      const gap = required - mod;
      return gap > 0 && gap <= STAMPS_NEAR_WINDOW;
    }
    return false;
  }

  const tiers = pointsRewardTiersForBusiness(business);
  if (!tiers.length) {
    return raw >= 40 && raw < 50;
  }
  const next = tiers.find((t) => t.points > raw);
  if (!next) return false;
  const gap = next.points - raw;
  return gap > 0 && gap <= POINTS_NEAR_WINDOW;
}

export function memberCrossedRewardUnlocked(business, previousBalance, newBalance) {
  if (!business) return false;
  const prev = Math.max(0, Math.floor(Number(previousBalance) || 0));
  const next = Math.max(0, Math.floor(Number(newBalance) || 0));
  if (next <= prev) return false;

  const programType = String(business.program_type || "points").toLowerCase();
  if (programType === "stamps") {
    return findNewlyUnlockedStampRewardTiers(business, prev, next).length > 0;
  }

  const tiers = pointsRewardTiersForBusiness(business);
  if (!tiers.length) return prev < 50 && next >= 50;
  return findNewlyUnlockedPointsTiers(tiers, prev, next).length > 0;
}

export function getMemberIdsRewardReady(businessId, business = null) {
  const b = loadBusinessOrNull(businessId, business);
  if (!b) return [];
  const rows = db
    .prepare(`SELECT id, points FROM members WHERE business_id = ? AND ${REAL_MEMBERS_SQL}`)
    .all(businessId);
  return rows.filter((m) => memberHasRewardReady(b, m)).map((m) => m.id);
}

export function getMemberIdsPointsNear(businessId, business = null) {
  const b = loadBusinessOrNull(businessId, business);
  if (!b) return [];
  const rows = db
    .prepare(`SELECT id, points FROM members WHERE business_id = ? AND ${REAL_MEMBERS_SQL}`)
    .all(businessId);
  return rows.filter((m) => memberIsPointsNearReward(b, m)).map((m) => m.id);
}

function parseBirthMonthDay(birthDate) {
  const s = String(birthDate || "").trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[2]}-${iso[3]}`;
  const fr = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s);
  if (fr) return `${String(fr[2]).padStart(2, "0")}-${String(fr[1]).padStart(2, "0")}`;
  return null;
}

export function isBirthdayTodayInMerchantTz(birthDate, now = new Date(), timeZone = getMerchantNotificationTimezone()) {
  const md = parseBirthMonthDay(birthDate);
  if (!md) return false;
  const { md: todayMd } = getZonedCalendarParts(now, timeZone);
  return md === todayMd;
}

export function getMemberIdsBirthdayToday(businessId, now = new Date(), timeZone = getMerchantNotificationTimezone()) {
  const rows = db
    .prepare(`SELECT id, birth_date FROM members WHERE business_id = ? AND ${REAL_MEMBERS_SQL} AND ${PROFILE_COMPLETE_SQL}`)
    .all(businessId);
  return rows.filter((m) => isBirthdayTodayInMerchantTz(m.birth_date, now, timeZone)).map((m) => m.id);
}

/** Résolution segment API → IDs membres (points50 / pointsNear50 / birthdayToday program-aware). */
export function resolveMemberIdsForCampaignSegment(businessId, segment, business = null) {
  const b = loadBusinessOrNull(businessId, business);
  switch (segment) {
    case "inactive14":
    case "inactive30":
    case "inactive60":
    case "inactive90": {
      const days = { inactive14: 14, inactive30: 30, inactive60: 60, inactive90: 90 }[segment];
      const rows = db
        .prepare(`SELECT id FROM members WHERE business_id = ? AND ${REAL_MEMBERS_SQL} AND ${sqlInactiveMembersSinceDays(days)}`)
        .all(businessId);
      return rows.map((r) => r.id);
    }
    case "points50":
      return getMemberIdsRewardReady(businessId, b);
    case "pointsNear50":
      return getMemberIdsPointsNear(businessId, b);
    case "birthdayToday":
      return getMemberIdsBirthdayToday(businessId);
    default:
      return null;
  }
}
