import { SIGNUP_REWARD_POINTS, STAMP_START_GAME_THRESHOLD } from "./tier-progress.js";

/**
 * @param {{ stamp_start_game_used?: boolean; signup_cycles_redeemed?: number; signup_tier_used?: boolean } | null | undefined} usage
 * @param {{ threshold: number; isStartGame?: boolean }} tier
 * @param {string} programType
 * @param {number} balance
 */
export function isProgramRewardTierUsed(usage, tier, programType, balance) {
  if (!usage) return false;
  const pt = String(programType || "points").toLowerCase();
  if (pt === "stamps") {
    if (tier.isStartGame || tier.threshold === STAMP_START_GAME_THRESHOLD) {
      return usage.stamp_start_game_used === true;
    }
    return false;
  }
  if (tier.threshold === SIGNUP_REWARD_POINTS) {
    if (usage.signup_tier_used === true) return true;
    const redeemed = Math.max(0, Math.floor(Number(usage.signup_cycles_redeemed) || 0));
    const pts = Math.max(0, Math.floor(Number(balance) || 0));
    const allowance = pts >= SIGNUP_REWARD_POINTS ? Math.floor(pts / SIGNUP_REWARD_POINTS) : 0;
    if (redeemed <= 0) return false;
    if (allowance <= 0) return true;
    return redeemed >= allowance;
  }
  return false;
}
