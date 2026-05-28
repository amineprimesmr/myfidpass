/**
 * Push PassKit silencieux après mutation membre (scan, crédit, etc.).
 * Aucun push tant qu’aucune icône de notification personnalisée (évite icône logo / logonotif figée).
 */
import { getBusinessById } from "../db/businesses.js";
import { bumpBusinessPassRefreshTimestamp } from "../db/businesses.js";
import { getPushTokensForMember } from "../db/passes.js";
import { sendPassKitUpdate } from "../apns.js";
import { businessAllowsWalletCustomerAlerts } from "./notification-icon-gate.js";
import logger from "./logger.js";

/**
 * Push PassKit uniquement si le commerce a une icône notif dédiée.
 * @param {import("../db/businesses.js").BusinessRow | null | undefined} business
 * @param {string} deviceToken
 * @param {{ collapseId?: string }} [opts]
 */
export function sendPassKitUpdateIfCustomerAlertsAllowed(business, deviceToken, opts = {}) {
  if (!businessAllowsWalletCustomerAlerts(business)) {
    return Promise.resolve({ sent: false, skipped: true, reason: "notification_icon_required" });
  }
  return sendPassKitUpdate(deviceToken, opts);
}

/**
 * @param {string} businessId
 * @param {string} memberId — serial_number PassKit (= id membre)
 * @param {string} [reason] — raison métier pour logs / compatibilité d'appel
 * @returns {Promise<{ tokens: number, sent: number, skipped?: boolean }>}
 */
export async function pushPassKitUpdateForMember(businessId, memberId, reason = "mutation") {
  if (!memberId) return { tokens: 0, sent: 0 };
  const business = businessId ? getBusinessById(businessId) : null;
  if (!businessAllowsWalletCustomerAlerts(business)) {
    logger.info(
      { businessId, memberId, reason },
      "[passkit-member-push] ignoré — icône de notification personnalisée absente"
    );
    return { tokens: 0, sent: 0, skipped: true };
  }
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
