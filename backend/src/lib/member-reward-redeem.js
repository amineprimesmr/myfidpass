/**
 * Utilisation récompense (points ou tampons) — partagé routes membre + scan intégration.
 */
import { deductPoints, resetMemberPoints, createTransaction } from "../db.js";
import { getDb } from "../db/connection.js";
import { normalizeStampBalance } from "./stamps-cycle-math.js";
import { resolvePointsRewardFromQr, resolveStampRewardFromQr, stampCycleSize } from "./reward-redeem-qr.js";
import { SIGNUP_REWARD_POINTS } from "./points-reward-tiers.js";

const db = getDb();

/** Nombre de récompenses « cycle 10 pts » déjà utilisées (solde conservé après usage). */
export function countSignupCycleRedemptions(memberId, businessId) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM transactions
       WHERE member_id = ? AND business_id = ? AND type = 'reward_redeem'
         AND json_valid(metadata) = 1
         AND json_extract(metadata, '$.signup_cycle') = 1`,
    )
    .get(memberId, businessId);
  return Math.max(0, Number(row?.c) || 0);
}

function isSignupPointsTier(pointsRequired, tierIndex) {
  if (Math.floor(Number(pointsRequired) || 0) !== SIGNUP_REWARD_POINTS) return false;
  if (tierIndex == null) return true;
  return Math.floor(Number(tierIndex) || 0) === 0;
}

function validateMinPurchase(minPurchaseEur, amountEur) {
  const min = minPurchaseEur != null ? Number(minPurchaseEur) : null;
  if (min == null || min <= 0) return null;
  const amount = Number(amountEur);
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      ok: false,
      status: 400,
      code: "MIN_PURCHASE_REQUIRED",
      error: `Panier minimum requis : ${min.toFixed(2).replace(".", ",")} € pour cette récompense.`,
      min_purchase_eur: min,
    };
  }
  if (amount + 0.0001 < min) {
    return {
      ok: false,
      status: 400,
      code: "MIN_PURCHASE_NOT_MET",
      error: `Panier insuffisant (${amount.toFixed(2).replace(".", ",")} €). Minimum : ${min.toFixed(2).replace(".", ",")} €.`,
      min_purchase_eur: min,
      amount_eur: amount,
    };
  }
  return null;
}

/**
 * @param {object} business
 * @param {object} member
 * @param {{ mode: "points" | "stamps"; tierIndex?: number; points?: number; stampThreshold?: number; amountEur?: number; actorUserId?: string | null; source?: string }} opts
 */
export function executeMemberRewardRedeem(business, member, opts) {
  const mode = opts.mode;
  const source = opts.source || "merchant_scan";
  const actorUserId = opts.actorUserId ?? null;
  const amountEur = opts.amountEur ?? opts.amount_eur;

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
  let minPurchaseEur = null;

  if (tierIndex != null && tierIndex >= 0) {
    const resolved = resolvePointsRewardFromQr(business, {
      mode: "points",
      tierIndex,
      points: opts.points,
    });
    pointsToDeduct = resolved.pointsRequired;
    rewardLabel = resolved.label;
    minPurchaseEur = resolved.minPurchaseEur ?? null;
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
  const signupCycle = isSignupPointsTier(pointsToDeduct, tierIndex);

  if (signupCycle) {
    const redeemCount = countSignupCycleRedemptions(member.id, business.id);
    const allowance = Math.floor(current / SIGNUP_REWARD_POINTS);
    if (allowance <= redeemCount) {
      const needMore = Math.max(0, (redeemCount + 1) * SIGNUP_REWARD_POINTS - current);
      return {
        ok: false,
        status: 400,
        code: "NOT_ENOUGH_POINTS",
        error:
          needMore > 0
            ? `Encore ${needMore} pt${needMore > 1 ? "s" : ""} à cumuler avant la prochaine récompense.`
            : `Récompense déjà utilisée pour ce cycle de ${SIGNUP_REWARD_POINTS} pts.`,
        points_required: SIGNUP_REWARD_POINTS,
        points_balance: current,
      };
    }
    const minErr = validateMinPurchase(minPurchaseEur, amountEur);
    if (minErr) return minErr;

    createTransaction({
      businessId: business.id,
      memberId: member.id,
      type: "reward_redeem",
      points: 0,
      metadata: {
        subtype: "points",
        signup_cycle: true,
        points_threshold: SIGNUP_REWARD_POINTS,
        tier_index: tierIndex ?? 0,
        reward_label: rewardLabel || `Récompense ${SIGNUP_REWARD_POINTS} pts`,
        source,
        min_purchase_eur: minPurchaseEur ?? undefined,
        amount_eur: amountEur != null ? Number(amountEur) : undefined,
      },
      actorUserId,
    });

    return {
      ok: true,
      type: "points",
      points_deducted: 0,
      previous_points: current,
      new_points: current,
      tier_index: tierIndex ?? 0,
      reward_label: rewardLabel || `Récompense ${SIGNUP_REWARD_POINTS} pts`,
      signup_cycle: true,
      message: `Récompense utilisée : ${rewardLabel || `Récompense ${SIGNUP_REWARD_POINTS} pts`}.`,
    };
  }

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

  const minErr = validateMinPurchase(minPurchaseEur, amountEur);
  if (minErr) return minErr;

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
      min_purchase_eur: minPurchaseEur ?? undefined,
      amount_eur: amountEur != null ? Number(amountEur) : undefined,
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
