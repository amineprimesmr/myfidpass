/**
 * Avant envoi campagne : optionnellement aligner le **titre** périmètre pass (`notification_title_override`)
 * quand le commerçant en fournit un dans l’UI d’envoi.
 *
 * IMPORTANT : on n’écrase plus `notification_change_message` avec le **corps** de la campagne.
 * Ce corps doit vivre uniquement dans `last_broadcast_message` (valeur du champ verso `lastMessage`).
 * Si le modèle changeMessage change à chaque envoi, Wallet / APNs peuvent livrer les alertes de façon
 * erratique (retard, silence) alors que le premier message semble « parfait ».
 *
 * Le commerçant peut laisser le gabarit par défaut `%@` (texte de l’alerte = corps de campagne seul).
 * Seule la valeur du champ `lastMessage` change à chaque envoi → alertes répétées fiables.
 *
 * Si `notification_change_message` ne contient pas `%@`, ce n’est pas un gabarit PassKit valide
 * (souvent texte périmètre ou ancien corps recopié). À l’envoi on le remet à null pour que le pass
 * utilise `%@` seul — évite « vieux préfixe + nouveau corps » (ex. « Allo » + « L’app est prête »).
 */
import { getBusinessById, updateBusiness } from "../db.js";
import {
  DEFAULT_PASSKIT_CHANGE_MESSAGE,
  normalizePassKitChangeMessageStored,
} from "./passkit-change-message-template.js";

export { DEFAULT_PASSKIT_CHANGE_MESSAGE, normalizePassKitChangeMessageStored };

export function syncNotificationTextsForCampaign(businessId, title, messageBody) {
  void messageBody;
  const trimmedTitle = title != null ? String(title).trim() : "";
  const business = getBusinessById(businessId);
  const cur = (business?.notification_change_message ?? "").trim();
  const shouldClearStaleTemplate = cur.length > 0 && !cur.includes("%@");

  const updates = {};
  if (trimmedTitle) {
    updates.notification_title_override = trimmedTitle.slice(0, 80);
  }
  if (shouldClearStaleTemplate) {
    updates.notification_change_message = null;
  }

  if (Object.keys(updates).length > 0) {
    updateBusiness(businessId, updates);
  }
  return getBusinessById(businessId);
}

/**
 * Garantit un modèle `changeMessage` valide (doit contenir `%@`) avant push PassKit campagne.
 * Le corps de la campagne vit dans `last_broadcast_message`, pas dans ce champ.
 */
export function ensurePassKitChangeMessageTemplate(businessId) {
  const business = getBusinessById(businessId);
  const cur = (business?.notification_change_message ?? "").trim();
  const normalized = normalizePassKitChangeMessageStored(cur) ?? DEFAULT_PASSKIT_CHANGE_MESSAGE;
  if (cur === normalized) return business;
  updateBusiness(businessId, { notification_change_message: normalized });
  return getBusinessById(businessId);
}
