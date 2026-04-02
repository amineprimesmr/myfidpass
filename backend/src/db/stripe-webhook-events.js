/**
 * Idempotence webhooks Stripe : un même événement ne doit pas créditer deux fois.
 * En cas d’échec du traitement, l’entrée est supprimée pour permettre un retry Stripe.
 */
import { getDb } from "./connection.js";

const db = getDb();

/**
 * Réserve l’événement (insert). Retourne false si déjà traité avec succès auparavant.
 * @param {string} stripeEventId
 * @returns {boolean}
 */
export function tryBeginStripeWebhookEvent(stripeEventId) {
  if (!stripeEventId || typeof stripeEventId !== "string") return false;
  const r = db.prepare("INSERT OR IGNORE INTO stripe_webhook_events (id) VALUES (?)").run(stripeEventId);
  return r.changes > 0;
}

/**
 * @param {string} stripeEventId
 */
export function rollbackStripeWebhookEvent(stripeEventId) {
  if (!stripeEventId) return;
  db.prepare("DELETE FROM stripe_webhook_events WHERE id = ?").run(stripeEventId);
}
