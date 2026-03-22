/**
 * Repository engagement_completions (avis Google, follow, etc.). Référence : REFONTE-REGLES.md.
 */
import { randomUUID } from "crypto";
import { getDb } from "./connection.js";
import { getBusinessById } from "./businesses.js";
import { addTicketsForEngagement } from "./games-helpers.js";

const db = getDb();

const DEFAULT_ENGAGEMENT_REWARDS = {
  google_review: { enabled: false, points: 50, place_id: "", require_approval: true, auto_verify_enabled: true },
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
    return { ...DEFAULT_ENGAGEMENT_REWARDS, ...parsed };
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
  const requireApproval = actionType === "google_review" && config.require_approval;
  const forcedStatus = ["approved", "pending", "pending_review"].includes(options.statusOverride) ? options.statusOverride : null;
  const status = forcedStatus || (requireApproval ? "pending" : "approved");
  const ticketsToGrant = status === "approved" ? 1 : 0;
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
  if (status === "approved" && ticketsToGrant > 0) {
    addTicketsForEngagement(businessId, memberId, ticketsToGrant, actionType, id);
  }
  const completion = db.prepare("SELECT * FROM engagement_completions WHERE id = ?").get(id);
  return { completion, pointsGranted: 0, ticketsGranted: ticketsToGrant, status, alreadyDone: false };
}

export function getEngagementCompletionsForBusiness(businessId, { status = null, limit = 50 } = {}) {
  let sql = `SELECT c.*, m.name as member_name, m.email as member_email
    FROM engagement_completions c
    JOIN members m ON m.id = c.member_id
    WHERE c.business_id = ?`;
  const params = [businessId];
  if (status && ["pending", "pending_review", "approved", "rejected"].includes(status)) {
    if (status === "pending") {
      sql += " AND c.status IN ('pending', 'pending_review')";
    } else {
      sql += " AND c.status = ?";
      params.push(status);
    }
  }
  sql += " ORDER BY c.created_at DESC LIMIT ?";
  params.push(limit);
  return db.prepare(sql).all(...params);
}

export function approveEngagementCompletion(completionId, businessId) {
  const c = db.prepare("SELECT * FROM engagement_completions WHERE id = ? AND business_id = ?").get(completionId, businessId);
  if (!c || (c.status !== "pending" && c.status !== "pending_review")) return null;
  const rewards = getEngagementRewards(businessId);
  const config = rewards[c.action_type];
  const tickets = 1;
  db.prepare(
    "UPDATE engagement_completions SET status = 'approved', points_granted = 0, reviewed_at = datetime('now') WHERE id = ?"
  ).run(completionId);
  addTicketsForEngagement(businessId, c.member_id, tickets, c.action_type, completionId);
  return db.prepare("SELECT * FROM engagement_completions WHERE id = ?").get(completionId);
}

export function rejectEngagementCompletion(completionId, businessId) {
  const c = db.prepare("SELECT * FROM engagement_completions WHERE id = ? AND business_id = ?").get(completionId, businessId);
  if (!c || (c.status !== "pending" && c.status !== "pending_review")) return null;
  db.prepare(
    "UPDATE engagement_completions SET status = 'rejected', reviewed_at = datetime('now') WHERE id = ?"
  ).run(completionId);
  return db.prepare("SELECT * FROM engagement_completions WHERE id = ?").get(completionId);
}

export function getEngagementCompletionsForMember(businessId, memberId) {
  return db
    .prepare(
      `SELECT action_type, points_granted, status, created_at FROM engagement_completions
       WHERE business_id = ? AND member_id = ? ORDER BY created_at DESC`
    )
    .all(businessId, memberId);
}
