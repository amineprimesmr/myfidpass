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
import { classifyDeliveryDevices } from "./notification-deliverability.js";

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
  // Réconcilier avec le filtre dispatch : vrais clients (deliverable) vs carte d'aperçu (preview).
  const deliverability = businessId
    ? classifyDeliveryDevices(business, { passKitTokens, webSubscriptions })
    : { deliverableDevices: 0, previewDevices: 0 };
  const deliverableDevices = deliverability.deliverableDevices;
  const previewDevices = deliverability.previewDevices;
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
  /** Aperçu seulement : prêt pour l'auto-test mais 0 vrai client → la campagne ne touchera personne. */
  let previewOnly = false;
  let deliveryHint = null;

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
  } else if (deliverableDevices === 0 && previewDevices > 0) {
    // Reste "ready" pour autoriser l'auto-test, mais signale clairement l'absence de vrais clients.
    previewOnly = true;
    deliveryHint =
      "Aperçu seulement : seule ta carte test est enregistrée. Partage le lien de ta carte pour que de vrais clients l’ajoutent à Apple Wallet.";
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
    /** Vrais clients que la campagne touchera (filtre technique appliqué, = dispatch). */
    deliverable_devices: deliverableDevices,
    /** Carte d'aperçu du commerçant : testable via auto-test, hors campagne réelle. */
    preview_devices: previewDevices,
    preview_only: previewOnly,
    delivery_hint: deliveryHint,
    members_count: membersCount ?? 0,
    /** Comptes techniques exclus du décompte « clients » mais peuvent avoir un Wallet enregistré. */
    members_count_excludes_technical: true,
    subscription_ok: subscriptionOk,
    ready,
    block_code: blockCode,
    block_message: blockMessage,
  };
}
