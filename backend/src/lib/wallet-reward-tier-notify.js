/**
 * Notif Wallet (PassKit) au franchissement d’un palier points configuré par le commerçant.
 */
import { getDb } from "../db/connection.js";
import { getMember } from "../db/members.js";
import {
  findNewlyUnlockedPointsTiers,
  normalizePointsRewardTiersForClient,
} from "./points-reward-tiers.js";
import { pushPassKitUpdateForMember } from "./passkit-member-push.js";
import { resolveSignupRewardLabelForBusiness } from "./signup-reward-label.js";

const db = getDb();

/**
 * Marque un palier fraîchement débloqué pour la prochaine génération .pkpass
 * (évite la double notif « X points » + « Nouvelle récompense » sur le même scan).
 * @returns {boolean}
 */
export function markWalletTierUnlockPendingIfNeeded(business, memberId, previousBalance, newBalance) {
  if (!business?.id || !memberId) return false;
  const programType = String(business.program_type || "").toLowerCase();
  if (programType === "stamps") return false;

  const signupLabel = resolveSignupRewardLabelForBusiness(business.id);
  const tiers = normalizePointsRewardTiersForClient(business.points_reward_tiers, signupLabel);
  if (!tiers.length) return false;

  const unlocked = findNewlyUnlockedPointsTiers(tiers, previousBalance, newBalance);
  if (!unlocked.length) return false;

  db.prepare("UPDATE members SET wallet_tier_unlock_pending = 1 WHERE id = ?").run(memberId);
  return true;
}

export function clearWalletTierUnlockPending(memberId) {
  if (!memberId) return;
  safeRunClear(memberId);
}

function safeRunClear(memberId) {
  try {
    db.prepare("UPDATE members SET wallet_tier_unlock_pending = 0 WHERE id = ?").run(memberId);
  } catch (_) {
    /* colonne absente avant migration — ignoré */
  }
}

/**
 * Après crédit / débit de points : palier éventuel + push PassKit silencieux.
 */
export async function pushPassKitAfterMemberBalanceChange({
  business,
  memberId,
  previousBalance,
  reason = "mutation",
}) {
  if (!business?.id || !memberId) return { tokens: 0, sent: 0 };

  const programType = String(business.program_type || "").toLowerCase();
  if (programType !== "stamps" && previousBalance != null) {
    const member = getMember(memberId);
    const newBalance = member ? Number(member.points) || 0 : previousBalance;
    markWalletTierUnlockPendingIfNeeded(business, memberId, previousBalance, newBalance);
  }

  return pushPassKitUpdateForMember(business.id, memberId, reason);
}
