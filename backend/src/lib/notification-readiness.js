/**
 * Diagnostic par commerce : pourquoi les notifications manuelles peuvent échouer en multi-commerce.
 */
import {
  getPassKitPushTokensForBusiness,
  getPassKitRegistrationsCountForBusiness,
  getWebPushSubscriptionsByBusinessExcludingPassKitOwners,
  getMembersForBusiness,
} from "../db.js";
import { businessHasCustomNotificationIcon } from "./notification-icon-gate.js";
import { hasOperationalMerchantAccess } from "../db/subscriptions.js";
import { hasMerchantScanBenchOperationalBypass } from "./merchant-scan-bench-access.js";

/**
 * @param {import("../db/businesses.js").BusinessRow} business
 * @param {{ ownerUserId?: string | null }} [opts]
 */
export function getBusinessNotificationReadiness(business, opts = {}) {
  const slug = String(business?.slug ?? "").trim();
  const businessId = business?.id;
  const name =
    String(business?.organization_name ?? business?.name ?? "").trim() || slug || "Commerce";

  const passKitTokens = businessId ? getPassKitPushTokensForBusiness(businessId) : [];
  const webSubscriptions = businessId
    ? getWebPushSubscriptionsByBusinessExcludingPassKitOwners(businessId)
    : [];
  const passKitRegistrationsCount = businessId
    ? getPassKitRegistrationsCountForBusiness(businessId)
    : 0;
  const { total: membersCount } = businessId
    ? getMembersForBusiness(businessId, { limit: 1 })
    : { total: 0 };

  const hasIcon = businessHasCustomNotificationIcon(business);
  const totalDevices = passKitTokens.length + webSubscriptions.length;
  const loyaltyGroupId =
    business?.loyalty_group_id != null ? String(business.loyalty_group_id).trim() : "";

  let subscriptionOk = true;
  const ownerId = opts.ownerUserId ?? business?.user_id;
  if (ownerId) {
    subscriptionOk =
      hasMerchantScanBenchOperationalBypass(business) || hasOperationalMerchantAccess(ownerId);
  }

  let ready = true;
  let blockCode = null;
  let blockMessage = null;

  if (!subscriptionOk) {
    ready = false;
    blockCode = "subscription_required";
    blockMessage =
      "Abonnement actif requis sur le compte propriétaire pour envoyer des campagnes.";
  } else if (!hasIcon) {
    ready = false;
    blockCode = "notification_icon_required";
    blockMessage =
      "Ajoutez une icône de notification pour ce commerce (onglet Notifications) avant d’envoyer.";
  } else if (totalDevices === 0) {
    ready = false;
    blockCode = "no_devices";
    if ((membersCount ?? 0) > 0) {
      blockMessage =
        loyaltyGroupId
          ? "Des clients sont enregistrés ici mais aucun appareil Wallet n’est lié à CE commerce. En réseau fidélité, faites scanner ou attribuer des points sur ce point de vente, ou demandez aux clients de ré-ajouter la carte depuis le lien de ce commerce."
          : "Des clients sont enregistrés mais aucun appareil Wallet / navigateur n’est enregistré pour ce commerce. Les clients doivent ajouter la carte depuis le lien partagé de CE commerce.";
    } else {
      blockMessage =
        "Aucun client avec carte Wallet ou navigateur pour ce commerce. Partagez le lien de ce commerce pour que les clients ajoutent la carte.";
    }
  }

  return {
    slug,
    business_id: businessId,
    name,
    organization_name: business?.organization_name ?? null,
    loyalty_group_id: loyaltyGroupId || null,
    has_notification_icon: hasIcon,
    passkit_device_count: passKitTokens.length,
    passkit_registration_count: passKitRegistrationsCount,
    web_push_count: webSubscriptions.length,
    total_devices: totalDevices,
    members_count: membersCount ?? 0,
    subscription_ok: subscriptionOk,
    ready,
    block_code: blockCode,
    block_message: blockMessage,
  };
}
