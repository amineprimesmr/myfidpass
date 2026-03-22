/**
 * Repository engagement_completions (avis Google, follow, etc.). Référence : REFONTE-REGLES.md.
 */
import { randomUUID } from "crypto";
import { getDb } from "./connection.js";
import { getBusinessById } from "./businesses.js";
import { addTicketsForEngagement } from "./games-helpers.js";

const db = getDb();

const DEFAULT_ENGAGEMENT_REWARDS = {
  google_review: { enabled: false, points: 50, place_id: "", require_approval: false, auto_verify_enabled: true },
  instagram_follow: { enabled: false, points: 10, url: "" },
  tiktok_follow: { enabled: false, points: 10, url: "" },
  facebook_follow: { enabled: false, points: 10, url: "" },
  twitter_follow: { enabled: false, points: 10, url: "" },
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
  const ticketsToGrant = 1;
  const id = randomUUID();
  db.prepare(
    `INSERT INTO engagement_completions (id, business_id, member_id, action_type, points_granted, status, proof_id, proof_score, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(
    id,
    businessId,
    memberId,
    actionType,
    0,
    status,
    options.proofId || null,
    Number.isFinite(Number(options.proofScore)) ? Number(options.proofScore) : null
  );
  addTicketsForEngagement(businessId, memberId, ticketsToGrant, actionType, id);
  const completion = db.prepare("SELECT * FROM engagement_completions WHERE id = ?").get(id);
  return { completion, pointsGranted: 0, ticketsGranted: ticketsToGrant, status, alreadyDone: false };
}

export function getEngagementCompletionsForMember(businessId, memberId) {
  return db
    .prepare(
      `SELECT action_type, points_granted, status, created_at FROM engagement_completions
       WHERE business_id = ? AND member_id = ? ORDER BY created_at DESC`
    )
    .all(businessId, memberId);
}
