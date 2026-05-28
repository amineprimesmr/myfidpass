/**
 * Utilisation récompense (points ou tampons) — partagé routes membre + scan intégration.
 */
import { deductPoints, resetMemberPoints, createTransaction } from "../db.js";

/**
 * @param {object} business
 * @param {object} member
 * @param {{ mode: "points" | "stamps"; tierIndex?: number; points?: number; actorUserId?: string | null; source?: string }} opts
 */
export function executeMemberRewardRedeem(business, member, opts) {
  const mode = opts.mode;
  const source = opts.source || "merchant_scan";
  const actorUserId = opts.actorUserId ?? null;

  if (mode === "stamps") {
    const requiredStamps =
      business.required_stamps != null && Number(business.required_stamps) > 0
        ? Math.floor(Number(business.required_stamps))
        : 10;
    const current = Number(member.points) || 0;
    if (current < requiredStamps) {
      return {
        ok: false,
        status: 400,
        code: "NOT_ENOUGH_STAMPS",
        error: `Le client n'a pas assez de tampons (${current}/${requiredStamps}).`,
      };
    }
    resetMemberPoints(member.id);
    createTransaction({
      businessId: business.id,
      memberId: member.id,
      type: "reward_redeem",
      points: -current,
      metadata: {
        subtype: "stamps",
        required_stamps: requiredStamps,
        source,
        reward_label: business.stamp_reward_label || "Récompense tampons",
      },
      actorUserId,
    });
    return {
      ok: true,
      type: "stamps",
      previous_points: current,
      new_points: 0,
      points_deducted: current,
      reward_label: business.stamp_reward_label || "Récompense tampons",
      message: "Récompense tampons utilisée.",
    };
  }

  let pointsToDeduct = Math.max(0, Math.floor(Number(opts.points) || 0));
  let tierIndex = Number.isInteger(opts.tierIndex) ? opts.tierIndex : null;
  let rewardLabel = null;

  if (tierIndex != null && tierIndex >= 0) {
    let tiers = business.points_reward_tiers;
    if (typeof tiers === "string" && tiers.trim()) {
      try {
        tiers = JSON.parse(tiers);
      } catch {
        tiers = [];
      }
    }
    if (!Array.isArray(tiers) || tierIndex >= tiers.length) {
      return { ok: false, status: 400, code: "INVALID_TIER", error: "Palier de récompense invalide." };
    }
    const tier = tiers[tierIndex];
    pointsToDeduct = Number(tier?.points) || 0;
    rewardLabel = String(tier?.label || "").trim() || `Récompense ${pointsToDeduct} pts`;
  }

  if (pointsToDeduct <= 0) {
    return {
      ok: false,
      status: 400,
      code: "REDEEM_POINTS_OR_TIER",
      error: "Palier ou nombre de points invalide.",
    };
  }

  const current = Number(member.points) || 0;
  if (current < pointsToDeduct) {
    return {
      ok: false,
      status: 400,
      code: "NOT_ENOUGH_POINTS",
      error: `Solde insuffisant (${current} pts). Cette récompense nécessite ${pointsToDeduct} pts.`,
      points_required: pointsToDeduct,
      points_balance: current,
    };
  }

  const updated = deductPoints(member.id, pointsToDeduct);
  if (!rewardLabel) rewardLabel = `Récompense ${pointsToDeduct} pts`;

  createTransaction({
    businessId: business.id,
    memberId: member.id,
    type: "reward_redeem",
    points: -pointsToDeduct,
    metadata: {
      subtype: "points",
      points_deducted: pointsToDeduct,
      tier_index: tierIndex,
      reward_label: rewardLabel,
      source,
    },
    actorUserId,
  });

  return {
    ok: true,
    type: "points",
    points_deducted: pointsToDeduct,
    previous_points: current,
    new_points: updated.points,
    tier_index: tierIndex,
    reward_label: rewardLabel,
    message: `Récompense utilisée : ${rewardLabel}.`,
  };
}
