/**
 * Aligne `notification_title_override` + `notification_change_message` sur le titre / corps
 * **de l’envoi en cours** avant push PassKit. Sans ça, un envoi manuel laisse un préfixe dans
 * `notification_change_message` alors que `last_broadcast_message` est mis à jour par l’auto
 * → Wallet affiche « texte manuel %@ » avec %@ = message auto (double contenu).
 */
import { getBusinessById, updateBusiness, bumpBusinessPassRefreshTimestamp } from "../db.js";

export function syncNotificationTextsForCampaign(businessId, title, messageBody) {
  const trimmedTitle = title != null ? String(title).trim() : "";
  const msg = messageBody != null ? String(messageBody).trim() : "";
  updateBusiness(businessId, {
    notification_title_override: trimmedTitle ? trimmedTitle.slice(0, 80) : null,
    notification_change_message: msg ? msg.slice(0, 200) : null,
  });
  bumpBusinessPassRefreshTimestamp(businessId);
  return getBusinessById(businessId);
}
