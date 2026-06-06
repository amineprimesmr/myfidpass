/** Aligné backend `reward-redeem-qr.js` — QR caisse par palier. */

export const REWARD_REDEEM_QR_VERSION = 1;
/** Palier « Début du jeu » encodé `:s:0` (distinct de `:s` = carte complète). */
export const STAMP_START_GAME_QR_THRESHOLD = 0;
const PREFIX = "MYFIDPASS_REDEEM:";

/**
 * @param {{ memberId: string; programType?: string; tierIndex?: number; points?: number; stampThreshold?: number }} p
 */
export function buildRewardRedeemQrPayload(p) {
  const memberId = String(p.memberId || "").trim();
  if (!memberId) return "";
  const pt = String(p.programType || "points").toLowerCase();
  if (pt === "stamps") {
    if (p.stampThreshold === STAMP_START_GAME_QR_THRESHOLD) {
      return `${PREFIX}${REWARD_REDEEM_QR_VERSION}:${memberId}:s:0`;
    }
    const th = Math.floor(Number(p.stampThreshold ?? p.points));
    if (Number.isFinite(th) && th > 0) {
      return `${PREFIX}${REWARD_REDEEM_QR_VERSION}:${memberId}:s:${th}`;
    }
    return `${PREFIX}${REWARD_REDEEM_QR_VERSION}:${memberId}:s`;
  }
  const tierIndex = Math.max(0, Math.floor(Number(p.tierIndex) || 0));
  const points = Math.max(1, Math.floor(Number(p.points) || 0));
  return `${PREFIX}${REWARD_REDEEM_QR_VERSION}:${memberId}:p:${tierIndex}:${points}`;
}
