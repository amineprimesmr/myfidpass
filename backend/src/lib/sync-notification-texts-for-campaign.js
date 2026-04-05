/**
 * Avant envoi campagne : optionnellement aligner le **titre** périmètre pass (`notification_title_override`)
 * quand le commerçant en fournit un dans l’UI d’envoi.
 *
 * IMPORTANT : on n’écrase plus `notification_change_message` avec le **corps** de la campagne.
 * Ce corps doit vivre uniquement dans `last_broadcast_message` (valeur du champ verso `lastMessage`).
 * Si le modèle changeMessage change à chaque envoi, Wallet / APNs peuvent livrer les alertes de façon
 * erratique (retard, silence) alors que le premier message semble « parfait ».
 *
 * Le commerçant règle un modèle stable dans le SaaS / app (ex. « Nouveau message : %@ ») ; seule la
 * valeur du champ change à chaque campagne → comportement fiable comme au premier envoi.
 */
import { getBusinessById, updateBusiness, bumpBusinessPassRefreshTimestamp } from "../db.js";

export function syncNotificationTextsForCampaign(businessId, title, messageBody) {
  void messageBody;
  const trimmedTitle = title != null ? String(title).trim() : "";
  if (trimmedTitle) {
    updateBusiness(businessId, {
      notification_title_override: trimmedTitle.slice(0, 80),
    });
    bumpBusinessPassRefreshTimestamp(businessId);
  }
  return getBusinessById(businessId);
}
