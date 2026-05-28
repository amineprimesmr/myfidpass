/**
 * Repository engagement_completions (avis Google, follow, etc.). Référence : REFONTE-REGLES.md.
 */
import { randomUUID } from "crypto";
import { getDb } from "./connection.js";
import { getBusinessById, resolveBusinessProgramType, updateBusiness } from "./businesses.js";
import { addTicketsForEngagement, businessUsesTicketBonuses } from "./games-helpers.js";
import { addPoints, addStampsWithCycleRollover } from "./members.js";

const db = getDb();

const DEFAULT_ENGAGEMENT_REWARDS = {
  google_review: { enabled: false, points: 50, place_id: "", require_approval: false, auto_verify_enabled: true },
  instagram_follow: { enabled: false, points: 10, url: "" },
  tiktok_follow: { enabled: false, points: 10, url: "" },
  facebook_follow: { enabled: false, points: 10, url: "" },
  twitter_follow: { enabled: false, points: 10, url: "" },
  snapchat_follow: { enabled: false, points: 10, url: "" },
  linkedin_follow: { enabled: false, points: 10, url: "" },
  youtube_follow: { enabled: false, points: 10, url: "" },
  trustpilot_review: { enabled: false, points: 10, url: "" },
  tripadvisor_review: { enabled: false, points: 10, url: "" },
};

export function getEngagementRewards(businessId) {
  const b = getBusinessById(businessId);
  if (!b || !b.engagement_rewards) return { ...DEFAULT_ENGAGEMENT_REWARDS };
  try {
    const parsed = typeof b.engagement_rewards === "string" ? JSON.parse(b.engagement_rewards) : b.engagement_rewards;
    const merged = { ...DEFAULT_ENGAGEMENT_REWARDS, ...parsed };
    if (merged.google_review && typeof merged.google_review === "object") {
      merged.google_review = { ...merged.google_review, require_approval: false };
    }
    return merged;
  } catch (_e) {
    return { ...DEFAULT_ENGAGEMENT_REWARDS };
  }
}

/**
 * Met à jour les URL des missions « suivre » depuis les comptes OAuth (liens profil publics).
 * @param {string} businessId
 * @param {Record<string, string>} urlPatch — clés : instagram_follow, facebook_follow, tiktok_follow, youtube_follow ; valeurs : URL https
 * @returns {{ ok: boolean, updated?: boolean }}
 */
export function mergeEngagementRewardsUrlsFromOAuth(businessId, urlPatch) {
  if (!businessId || !urlPatch || typeof urlPatch !== "object") return { ok: false };
  const er = getEngagementRewards(businessId);
  const beforeSnap = JSON.stringify(er);
  for (const [key, raw] of Object.entries(urlPatch)) {
    const url = typeof raw === "string" ? raw.trim() : "";
    if (!url || !/^https:\/\//i.test(url)) continue;
    if (!Object.prototype.hasOwnProperty.call(er, key) || typeof er[key] !== "object") continue;
    const prev = er[key];
    const pts = Number(prev.points);
    er[key] = {
      ...prev,
      url,
      enabled: true,
      points: Number.isFinite(pts) && pts >= 1 ? pts : 10,
    };
  }
  if (JSON.stringify(er) === beforeSnap) return { ok: true, updated: false };
  updateBusiness(businessId, { engagement_rewards: er });
  return { ok: true, updated: true };
}

export function hasMemberCompletedEngagementAction(businessId, memberId, actionType, cooldownMonths = 12) {
  const since = new Date();
  since.setMonth(since.getMonth() - cooldownMonths);
  const sinceStr = since.toISOString();
  const row = db
    .prepare(
      `SELECT 1 FROM engagement_completions
       WHERE business_id = ? AND member_id = ? AND action_type = ? AND status IN ('approved', 'pending', 'pending_review')
       AND created_at >= ? LIMIT 1`
    )
    .get(businessId, memberId, actionType, sinceStr);
  return !!row;
}

export function createEngagementCompletion(businessId, memberId, actionType, options = {}) {
  const rewards = getEngagementRewards(businessId);
  const config = rewards[actionType];
  if (!config || !config.enabled || (config.points && config.points < 1)) {
    return { error: "action_disabled" };
  }
  const cooldown = Number.isFinite(Number(options.cooldownMonths))
    ? Number(options.cooldownMonths)
    : (actionType === "google_review" ? 12 : 120);
  if (hasMemberCompletedEngagementAction(businessId, memberId, actionType, cooldown)) {
    return { error: "already_done", alreadyDone: true };
  }
  const status = "approved";
  const rewardAmount = Math.max(1, Math.min(200, Math.floor(Number(config.points) || 1)));
  const business = getBusinessById(businessId);
  const programType = business ? resolveBusinessProgramType(business) : "points";
  const id = randomUUID();
  db.prepare(
    `INSERT INTO engagement_completions (id, business_id, member_id, action_type, points_granted, status, proof_id, proof_score, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(
    id,
    businessId,
    memberId,
    actionType,
    rewardAmount,
    status,
    options.proofId || null,
    Number.isFinite(Number(options.proofScore)) ? Number(options.proofScore) : null
  );

  let ticketsGranted = 0;
  let pointsGranted = 0;
  let stampsGranted = 0;

  if (businessUsesTicketBonuses(businessId)) {
    ticketsGranted = rewardAmount;
    addTicketsForEngagement(businessId, memberId, ticketsGranted, actionType, id);
  } else if (programType === "stamps") {
    const cycle = Math.max(1, Math.floor(Number(business?.required_stamps) || 10));
    const stampResult = addStampsWithCycleRollover(memberId, rewardAmount, cycle);
    stampsGranted = stampResult.rawAdded || rewardAmount;
    pointsGranted = 0;
  } else {
    addPoints(memberId, rewardAmount);
    pointsGranted = rewardAmount;
  }

  const completion = db.prepare("SELECT * FROM engagement_completions WHERE id = ?").get(id);
  return {
    completion,
    pointsGranted,
    ticketsGranted,
    stampsGranted,
    rewardAmount,
    programType,
    status,
    alreadyDone: false,
  };
}

export function getEngagementCompletionsForMember(businessId, memberId) {
  return db
    .prepare(
      `SELECT action_type, points_granted, status, created_at FROM engagement_completions
       WHERE business_id = ? AND member_id = ? ORDER BY created_at DESC`
    )
    .all(businessId, memberId);
}
