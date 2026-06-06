/**
 * Verrou métier : aucune notification client (campagnes, automatisations, notify)
 * tant qu’aucune icône de notification personnalisée n’est configurée pour le commerce.
 */
import { getBusinessAssetData } from "../db/business-assets.js";

export const NOTIFICATION_ICON_REQUIRED_CODE = "notification_icon_required";
export const NOTIFICATION_ICON_REQUIRED_MESSAGE =
  "Ajoutez une icône de notification (image) dans l’onglet Notifications avant d’envoyer des messages aux clients.";

export function businessHasCustomNotificationIcon(business) {
  if (!business) return false;
  if (Number(business.asset_notification_icon_present) === 1) return true;
  const rowB64 =
    business.notification_icon_base64 && String(business.notification_icon_base64).trim();
  if (rowB64) return true;
  if (business.id != null) {
    const asset = getBusinessAssetData(String(business.id), "notification_icon");
    if (asset && String(asset).trim()) return true;
  }
  return false;
}

/** Alertes écran verrouillé Wallet (`changeMessage` dans pass/generate.js). Le push PassKit silencieux (solde) n’est pas gated ici. */
export function businessAllowsWalletCustomerAlerts(business) {
  return businessHasCustomNotificationIcon(business);
}

export function notificationIconRequiredHttpBody() {
  return {
    error: NOTIFICATION_ICON_REQUIRED_MESSAGE,
    code: NOTIFICATION_ICON_REQUIRED_CODE,
  };
}

/**
 * @param {import("../db/businesses.js").BusinessRow} business
 */
export function assertCustomNotificationIconForBroadcast(business) {
  if (!businessHasCustomNotificationIcon(business)) {
    const err = new Error(NOTIFICATION_ICON_REQUIRED_MESSAGE);
    err.code = NOTIFICATION_ICON_REQUIRED_CODE;
    err.statusCode = 422;
    throw err;
  }
}

/**
 * Désactive toutes les règles d’automatisation si pas d’icône (persistance PATCH dashboard).
 */
export function campaignAutomationConfigWithIconGate(business, config) {
  if (!config || typeof config !== "object") return config;
  if (businessHasCustomNotificationIcon(business)) return config;
  const out = { ...config, rules: { ...(config.rules || {}) } };
  for (const key of Object.keys(out.rules)) {
    const row = out.rules[key];
    if (row && typeof row === "object") {
      out.rules[key] = { ...row, enabled: false };
    }
  }
  return out;
}
