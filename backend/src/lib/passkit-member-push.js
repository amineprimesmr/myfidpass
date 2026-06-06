/**
 * Push PassKit silencieux après mutation membre (scan, crédit, etc.).
 * Toujours envoyé pour rafraîchir le solde sur la carte Wallet.
 * Les alertes écran verrouillé (`changeMessage`) restent gated dans pass/generate.js.
 */
import { getBusinessById } from "../db/businesses.js";
import { bumpBusinessPassRefreshTimestamp } from "../db/businesses.js";
import { getPassKitPushTokensForBusiness, getPushTokensForMember } from "../db/passes.js";
import { sendPassKitUpdate } from "../apns.js";
import { businessAllowsWalletCustomerAlerts } from "./notification-icon-gate.js";
import logger from "./logger.js";

/**
 * Push PassKit uniquement si le commerce a une icône notif dédiée.
 * Réservé aux cas où une alerte client explicite est attendue (ex. bascule programme).
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
 * @returns {Promise<{ tokens: number, sent: number, lockScreenAlerts?: boolean }>}
 */
export async function pushPassKitUpdateForMember(businessId, memberId, reason = "mutation") {
  if (!memberId) return { tokens: 0, sent: 0 };
  const business = businessId ? getBusinessById(businessId) : null;
  const lockScreenAlerts = businessAllowsWalletCustomerAlerts(business);

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

  if (!lockScreenAlerts && tokens.length > 0) {
    logger.info(
      { businessId, memberId, reason, sent, tokens: tokens.length },
      "[passkit-member-push] push solde Wallet (sans changeMessage écran verrouillé — icône notif absente)"
    );
  }

  return { tokens: tokens.length, sent, lockScreenAlerts };
}

/**
 * Push PassKit silencieux pour tous les passes enregistrés d’un commerce (bascule programme, etc.).
 * @param {string} businessId
 * @param {string} [reason]
 * @param {{ limit?: number }} [opts]
 */
export async function pushPassKitUpdateForAllBusinessPasses(businessId, reason = "mutation", opts = {}) {
  if (!businessId) return { tokens: 0, sent: 0 };
  const limit = Math.max(1, Math.min(Number(opts.limit) || 300, 2000));
  bumpBusinessPassRefreshTimestamp(businessId);
  const collapseId = `mf-${String(reason || "m").slice(0, 24)}-${Date.now()}`.slice(0, 64);
  const rows = getPassKitPushTokensForBusiness(businessId).slice(0, limit);
  let sent = 0;
  for (const row of rows) {
    if (!row?.push_token) continue;
    try {
      const result = await sendPassKitUpdate(row.push_token, { collapseId });
      if (result.sent) sent++;
    } catch (err) {
      logger.warn({ businessId, reason, err }, "[passkit-member-push] push bulk exception");
    }
  }
  return { tokens: rows.length, sent };
}
