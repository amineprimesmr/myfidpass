/** Aligné backend `reward-redeem-qr.js` — QR caisse par palier. */

export const REWARD_REDEEM_QR_VERSION = 1;
const PREFIX = "MYFIDPASS_REDEEM:";

/**
 * @param {{ memberId: string; programType?: string; tierIndex?: number; points?: number }} p
 */
export function buildRewardRedeemQrPayload(p) {
  const memberId = String(p.memberId || "").trim();
  if (!memberId) return "";
  const pt = String(p.programType || "points").toLowerCase();
  if (pt === "stamps") {
    return `${PREFIX}${REWARD_REDEEM_QR_VERSION}:${memberId}:s`;
  }
  const tierIndex = Math.max(0, Math.floor(Number(p.tierIndex) || 0));
  const points = Math.max(1, Math.floor(Number(p.points) || 0));
  return `${PREFIX}${REWARD_REDEEM_QR_VERSION}:${memberId}:p:${tierIndex}:${points}`;
}
