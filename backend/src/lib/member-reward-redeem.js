/**
 * Utilisation récompense (points ou tampons) — partagé routes membre + scan intégration.
 */
import { deductPoints, resetMemberPoints, createTransaction } from "../db.js";
import { normalizeStampBalance } from "./stamps-cycle-math.js";
import { resolvePointsRewardFromQr, resolveStampRewardFromQr, stampCycleSize } from "./reward-redeem-qr.js";

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
    const cycleN = stampCycleSize(business);
    const resolved = resolveStampRewardFromQr(business, {
      mode: "stamps",
      stampThreshold: opts.stampThreshold ?? opts.points ?? null,
    });
    const balance = normalizeStampBalance(member.points, cycleN);
    const cost = resolved.pointsRequired;
    if (balance < cost) {
      return {
        ok: false,
        status: 400,
        code: "NOT_ENOUGH_STAMPS",
        error: `Le client n'a pas assez de tampons (${balance}/${cost}).`,
        points_required: cost,
        points_balance: balance,
      };
    }
    const previousPoints = balance;
    let newPoints;
    if (resolved.isFullCard) {
      resetMemberPoints(member.id);
      newPoints = 0;
    } else {
      const updated = deductPoints(member.id, cost);
      newPoints = normalizeStampBalance(updated.points, cycleN);
    }
    createTransaction({
      businessId: business.id,
      memberId: member.id,
      type: "reward_redeem",
      points: -cost,
      metadata: {
        subtype: "stamps",
        required_stamps: cycleN,
        stamp_threshold: resolved.stampThreshold,
        source,
        reward_label: resolved.label,
      },
      actorUserId,
    });
    return {
      ok: true,
      type: "stamps",
      previous_points: previousPoints,
      new_points: newPoints,
      points_deducted: cost,
      reward_label: resolved.label,
      message: "Récompense tampons utilisée.",
    };
  }

  let pointsToDeduct = Math.max(0, Math.floor(Number(opts.points) || 0));
  let tierIndex = Number.isInteger(opts.tierIndex) ? opts.tierIndex : null;
  let rewardLabel = null;

  if (tierIndex != null && tierIndex >= 0) {
    const resolved = resolvePointsRewardFromQr(business, {
      mode: "points",
      tierIndex,
      points: opts.points,
    });
    pointsToDeduct = resolved.pointsRequired;
    rewardLabel = resolved.label;
    if (pointsToDeduct <= 0) {
      return {
        ok: false,
        status: 400,
        code: "REDEEM_POINTS_OR_TIER",
        error: "Palier ou nombre de points invalide.",
      };
    }
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
