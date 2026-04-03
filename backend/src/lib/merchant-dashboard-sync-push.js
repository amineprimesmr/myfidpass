/**
 * Push APNs silencieux vers l’app commerçant pour déclencher une sync (tableau de bord, transactions).
 * Aucune alerte visible — voir `sendMerchantSilentDashboardSync` dans apns.js.
 *
 * DEBOUNCE (2 secondes par commerce) : si 5 mutations arrivent en 1 seconde (scan de masse,
 * ajout de points en lot), un seul push silencieux est envoyé au lieu de 5. Cela évite de
 * spammer l’APNs et de consommer inutilement la quota de push silencieux d’iOS (qui peut
 * throttler l’app commerçant si elle reçoit trop de content-available en peu de temps).
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

/** Délai de debounce : regroupe les mutations rapides en un seul push (ms). */
const DEBOUNCE_MS = 2_000;

/**
 * Map<businessId, { timer: NodeJS.Timeout, reason: string }>
 * Contient les timers de debounce en cours, un par commerce.
 */
const pendingDebounce = new Map();

function getUserIdForBusiness(businessId) {
  if (!businessId) return null;
  const row = db.prepare("SELECT user_id FROM businesses WHERE id = ?").get(businessId);
  const u = row?.user_id;
  if (u == null) return null;
  const s = String(u).trim();
  return s.length ? s : null;
}

/**
 * Planifie un push silencieux vers l’app commerçant du commerce donné.
 *
 * Debounce : si plusieurs mutations arrivent en rafale (ex. scan de masse), un seul
 * push est envoyé, 2 secondes après la DERNIÈRE mutation — ce qui déclenche une seule
 * sync côté iOS au lieu de déclencher une sync par mutation.
 *
 * @param {string} businessId
 * @param {string} [reason] — métadonnée payload transmise à l’app (ex. "transaction", "wallet_register").
 */
export function scheduleMerchantDashboardSyncForBusiness(businessId, reason = "activity") {
  if (!businessId) return;

  // Annuler le timer précédent pour ce commerce (debounce).
  const existing = pendingDebounce.get(businessId);
  if (existing) {
    clearTimeout(existing.timer);
  }

  const timer = setTimeout(() => {
    pendingDebounce.delete(businessId);
    const userId = getUserIdForBusiness(businessId);
    if (!userId) return;
    void sendSilentSyncToMerchantDevices(userId, reason).catch((err) => {
      logger.warn({ err, businessId, reason }, "[merchant-dash-sync] push batch failed");
    });
  }, DEBOUNCE_MS);

  pendingDebounce.set(businessId, { timer, reason });
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
