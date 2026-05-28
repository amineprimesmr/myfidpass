/**
 * QR récompense caisse — associé à un palier (points ou tampons).
 * Format : MYFIDPASS_REDEEM:1:{memberId}:p:{tierIndex}:{points}
 *         MYFIDPASS_REDEEM:1:{memberId}:s
 */

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

/**
 * @param {string} raw
 * @returns {null | { memberId: string; mode: "points" | "stamps"; tierIndex?: number; points?: number }}
 */
export function parseRewardRedeemQrPayload(raw) {
  const s = String(raw || "").trim();
  if (!s.toUpperCase().startsWith(PREFIX)) return null;
  const rest = s.slice(PREFIX.length);
  const parts = rest.split(":");
  if (parts.length < 3) return null;
  const ver = Number(parts[0]);
  if (ver !== REWARD_REDEEM_QR_VERSION) return null;
  const memberId = String(parts[1] || "").trim();
  if (!memberId) return null;
  const mode = String(parts[2] || "").toLowerCase();
  if (mode === "s") {
    return { memberId, mode: "stamps" };
  }
  if (mode === "p" && parts.length >= 5) {
    const tierIndex = Math.floor(Number(parts[3]));
    const points = Math.floor(Number(parts[4]));
    if (!Number.isFinite(tierIndex) || tierIndex < 0) return null;
    if (!Number.isFinite(points) || points <= 0) return null;
    return { memberId, mode: "points", tierIndex, points };
  }
  return null;
}

/**
 * @param {string} raw
 * @returns {{ memberId: string; rewardRedeem: ReturnType<typeof parseRewardRedeemQrPayload> | null }}
 */
export function parseMerchantScanCode(raw) {
  const reward = parseRewardRedeemQrPayload(raw);
  if (reward) {
    return { memberId: reward.memberId, rewardRedeem: reward };
  }
  const uuidMatch = String(raw || "").trim().match(
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
  );
  const memberId = uuidMatch ? uuidMatch[0] : String(raw || "").trim();
  return { memberId, rewardRedeem: null };
}
