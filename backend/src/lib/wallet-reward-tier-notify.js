/**
 * Notif Wallet (PassKit) au franchissement d’un palier points / tampons.
 */
import { getDb } from "../db/connection.js";
import { getMember } from "../db/members.js";
import {
  findNewlyUnlockedPointsTiers,
  normalizePointsRewardTiersForClient,
} from "./points-reward-tiers.js";
import {
  findNewlyUnlockedStampRewardTiers,
  pickStampUnlockNotificationLabel,
} from "./stamp-reward-tiers.js";
import { pushPassKitUpdateForMember } from "./passkit-member-push.js";
import { resolveSignupRewardLabelForBusiness } from "./signup-reward-label.js";

const db = getDb();

function markWalletTierUnlockPending(memberId, label) {
  const lab = String(label || "").trim();
  if (!lab) return false;
  try {
    db.prepare(
      "UPDATE members SET wallet_tier_unlock_pending = 1, wallet_tier_unlock_label = ? WHERE id = ?",
    ).run(lab.slice(0, 120), memberId);
  } catch (_) {
    db.prepare("UPDATE members SET wallet_tier_unlock_pending = 1 WHERE id = ?").run(memberId);
  }
  return true;
}

/**
 * Marque un palier fraîchement débloqué pour la prochaine génération .pkpass
 * (changeMessage « Nouvelle récompense » sur le verso).
 * @returns {boolean}
 */
export function markWalletTierUnlockPendingIfNeeded(business, memberId, previousBalance, newBalance) {
  if (!business?.id || !memberId) return false;
  const programType = String(business.program_type || "").toLowerCase();
  const prev = Math.max(0, Math.floor(Number(previousBalance) || 0));
  const next = Math.max(0, Math.floor(Number(newBalance) || 0));
  if (next <= prev) return false;

  if (programType === "stamps") {
    const unlocked = findNewlyUnlockedStampRewardTiers(business, prev, next);
    const label = pickStampUnlockNotificationLabel(unlocked);
    return label ? markWalletTierUnlockPending(memberId, label) : false;
  }

  const signupLabel = resolveSignupRewardLabelForBusiness(business.id);
  const tiers = normalizePointsRewardTiersForClient(business.points_reward_tiers, signupLabel);
  if (!tiers.length) return false;

  const unlocked = findNewlyUnlockedPointsTiers(tiers, prev, next);
  if (!unlocked.length) return false;
  const best = unlocked[unlocked.length - 1];
  return markWalletTierUnlockPending(memberId, best.label);
}

export function clearWalletTierUnlockPending(memberId) {
  if (!memberId) return;
  safeRunClear(memberId);
}

function safeRunClear(memberId) {
  try {
    db.prepare(
      "UPDATE members SET wallet_tier_unlock_pending = 0, wallet_tier_unlock_label = NULL WHERE id = ?",
    ).run(memberId);
  } catch (_) {
    try {
      db.prepare("UPDATE members SET wallet_tier_unlock_pending = 0 WHERE id = ?").run(memberId);
    } catch {
      /* colonne absente avant migration — ignoré */
    }
  }
}

/**
 * Après crédit / débit : palier éventuel + push PassKit silencieux.
 */
export async function pushPassKitAfterMemberBalanceChange({
  business,
  memberId,
  previousBalance,
  reason = "mutation",
}) {
  if (!business?.id || !memberId) return { tokens: 0, sent: 0 };

  if (previousBalance != null) {
    const member = getMember(memberId);
    const newBalance = member ? Number(member.points) || 0 : previousBalance;
    markWalletTierUnlockPendingIfNeeded(business, memberId, previousBalance, newBalance);
  }

  return pushPassKitUpdateForMember(business.id, memberId, reason);
}
