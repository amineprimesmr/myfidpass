/**
 * Push APNs silencieux vers l’app commerçant pour déclencher une sync (tableau de bord, transactions).
 * Aucune alerte visible — voir `sendMerchantSilentDashboard` dans apns.js.
 */
import logger from "./logger.js";
import { getDb } from "../db/connection.js";
import {
  getMerchantDeviceTokensForUser,
  deleteMerchantPushDeviceByToken,
} from "../db/passes.js";
import {
  sendMerchantSilentDashboardSync,
  isLikelyInvalidDeviceTokenApnsError,
} from "../apns.js";

const db = getDb();

function getUserIdForBusiness(businessId) {
  if (!businessId) return null;
  const row = db.prepare("SELECT user_id FROM businesses WHERE id = ?").get(businessId);
  const u = row?.user_id;
  if (u == null) return null;
  const s = String(u).trim();
  return s.length ? s : null;
}

/**
 * Enfile un envoi non bloquant (microtask) pour ne pas retarder la réponse HTTP.
 * @param {string} businessId
 * @param {string} [reason] — métadonnée payload (ex. transaction, wallet_register).
 */
export function scheduleMerchantDashboardSyncForBusiness(businessId, reason = "activity") {
  const userId = getUserIdForBusiness(businessId);
  if (!userId) return;
  queueMicrotask(() => {
    void sendSilentSyncToMerchantDevices(userId, reason).catch((err) => {
      logger.warn({ err, businessId, reason }, "[merchant-dash-sync] push batch failed");
    });
  });
}

async function sendSilentSyncToMerchantDevices(userId, reason) {
  const tokens = getMerchantDeviceTokensForUser(userId);
  if (tokens.length === 0) return;
  for (const t of tokens) {
    const r = await sendMerchantSilentDashboardSync(t, { reason });
    if (!r.sent && r.rawError != null && isLikelyInvalidDeviceTokenApnsError(r.rawError)) {
      deleteMerchantPushDeviceByToken(t);
    }
  }
}
