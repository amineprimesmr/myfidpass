/**
 * Push PassKit silencieux après mutation membre (scan, crédit, etc.).
 * Bump `pass_last_modified_ms` + collapse-id unique pour éviter la fusion APNs.
 */
import { bumpBusinessPassRefreshTimestamp } from "../db/businesses.js";
import { getPushTokensForMember } from "../db/passes.js";
import { sendPassKitUpdate } from "../apns.js";
import logger from "./logger.js";

/**
 * @param {string} businessId
 * @param {string} memberId — serial_number PassKit (= id membre)
 * @param {string} [reason] — préfixe collapse-id (scan, points_add, …)
 * @returns {Promise<{ tokens: number, sent: number }>}
 */
export async function pushPassKitUpdateForMember(businessId, memberId, reason = "mutation") {
  if (!memberId) return { tokens: 0, sent: 0 };
  if (businessId) bumpBusinessPassRefreshTimestamp(businessId);
  const collapseId = `mf-${String(reason || "m").slice(0, 24)}-${Date.now()}`.slice(0, 64);
  const tokens = getPushTokensForMember(memberId);
  let sent = 0;
  for (const token of tokens) {
    try {
      const result = await sendPassKitUpdate(token, { collapseId });
      if (result.sent) sent++;
      else if (result.error) {
        logger.warn(
          { memberId, reason, error: result.error },
          "[passkit-member-push] push refusée"
        );
      }
    } catch (err) {
      logger.warn({ memberId, reason, err }, "[passkit-member-push] push exception");
    }
  }
  return { tokens: tokens.length, sent };
}
