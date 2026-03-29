/**
 * Pipeline unique d’envoi client : Web Push + PassKit + accusé app commerçant (APNs).
 */
import {
  getWebPushSubscriptionsByBusinessFiltered,
  getWebPushSubscriptionsByBusiness,
  getPassKitPushTokensForBusinessFiltered,
  getPassKitPushTokensForBusiness,
  logNotification,
  createNotificationBatch,
  updateNotificationBatchSummary,
  deleteWebPushSubscriptionByEndpoint,
  touchMemberLastVisit,
  setLastBroadcastMessage,
  getMerchantDeviceTokensForUser,
  deleteMerchantPushDeviceByToken,
  deletePassRegistrationsByPushToken,
} from "../db.js";
import { sendWebPush } from "../notifications.js";
import { sendPassKitPushWaves } from "../passkit-push-waves.js";
import { sendMerchantAppAlert, isLikelyInvalidDeviceTokenApnsError } from "../apns.js";

function businessHasNotificationLogo(business) {
  return (
    Number(business?.asset_notification_icon_present) === 1 ||
    Number(business?.asset_logo_icon_present) === 1 ||
    Number(business?.asset_logo_present) === 1 ||
    !!(business?.logo_icon_base64 || business?.logo_base64)
  );
}

/**
 * @param {object} p
 * @param {import("../db/businesses.js").BusinessRow} p.business
 * @param {string} p.slug
 * @param {string} p.apiBase
 * @param {string[]|null} p.memberIds — null = tous les abonnés
 * @param {string|null} p.title
 * @param {string} p.bodyMessage
 * @param {string} [p.triggerName]
 * @param {string} [p.logTypePasskit]
 * @param {string|null} [p.merchantUserId] — accusé APNs commerçant
 * @param {boolean} [p.sendMerchantReceipt]
 */
export async function deliverCustomerBroadcast({
  business,
  slug,
  apiBase,
  memberIds,
  title,
  bodyMessage,
  triggerName = "campaign_manual",
  logTypePasskit = "passkit",
  merchantUserId = null,
  sendMerchantReceipt = true,
}) {
  const webSubscriptions =
    memberIds !== null && memberIds.length > 0
      ? getWebPushSubscriptionsByBusinessFiltered(business.id, memberIds)
      : memberIds !== null && memberIds.length === 0
        ? []
        : getWebPushSubscriptionsByBusiness(business.id);
  const passKitTokens =
    memberIds !== null && memberIds.length > 0
      ? getPassKitPushTokensForBusinessFiltered(business.id, memberIds)
      : memberIds !== null && memberIds.length === 0
        ? []
        : getPassKitPushTokensForBusiness(business.id);

  if (webSubscriptions.length === 0 && passKitTokens.length === 0) {
    return {
      sent: 0,
      sentWebPush: 0,
      sentPassKit: 0,
      sentMerchantApp: 0,
      failed: 0,
      errors: [],
      batchId: null,
    };
  }

  const batchId = createNotificationBatch({
    businessId: business.id,
    triggerName,
    summary: { started_at: new Date().toISOString() },
  });

  const iconUrl = businessHasNotificationLogo(business)
    ? `${apiBase}/api/businesses/${encodeURIComponent(slug)}/notification-icon`
    : null;
  const payloadTitle = (title || business.notification_title_override || business.organization_name || "Myfidpass").trim();
  const payload = {
    title: payloadTitle,
    body: bodyMessage,
    ...(iconUrl && { icon: iconUrl }),
  };
  const errors = [];

  const webPushResults = await Promise.all(
    webSubscriptions.map(async (sub) => {
      try {
        await sendWebPush({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        logNotification({
          businessId: business.id,
          memberId: sub.member_id,
          title: payloadTitle,
          body: bodyMessage,
          type: "web_push",
          batchId,
          channel: "web_push",
          triggerName,
          countsForMemberCooldown: 1,
          status: "sent",
        });
        return { ok: true };
      } catch (err) {
        const status = err?.statusCode ?? err?.status;
        if (status === 410 || status === 404) {
          deleteWebPushSubscriptionByEndpoint(sub.endpoint);
        } else {
          errors.push({ type: "web_push", memberId: sub.member_id, error: err.message || String(err) });
        }
        logNotification({
          businessId: business.id,
          memberId: sub.member_id,
          title: payloadTitle,
          body: bodyMessage,
          type: "web_push",
          batchId,
          channel: "web_push",
          triggerName,
          countsForMemberCooldown: 1,
          status: "failed",
          errorDetail: err.message || String(err),
        });
        return { ok: false };
      }
    })
  );
  const sentWebPush = webPushResults.filter((r) => r.ok).length;

  setLastBroadcastMessage(business.id, bodyMessage);
  let sentPassKit = 0;
  if (passKitTokens.length > 0) {
    const touchedMembers = new Set();
    for (const row of passKitTokens) {
      if (row.serial_number && !touchedMembers.has(row.serial_number)) {
        touchMemberLastVisit(row.serial_number);
        touchedMembers.add(row.serial_number);
      }
    }
    const waveResults = await sendPassKitPushWaves(passKitTokens);
    for (const { row, result } of waveResults) {
      if (result.sent) {
        sentPassKit++;
        logNotification({
          businessId: business.id,
          memberId: row.serial_number,
          title: payloadTitle,
          body: bodyMessage,
          type: logTypePasskit,
          batchId,
          channel: "passkit",
          triggerName,
          countsForMemberCooldown: 1,
          status: "sent",
        });
      } else if (result.error) {
        errors.push({ type: "passkit", memberId: row.serial_number, error: result.error });
        logNotification({
          businessId: business.id,
          memberId: row.serial_number,
          title: payloadTitle,
          body: bodyMessage,
          type: logTypePasskit,
          batchId,
          channel: "passkit",
          triggerName,
          countsForMemberCooldown: 1,
          status: "failed",
          errorDetail: result.error,
        });
        if (isLikelyInvalidDeviceTokenApnsError({ message: result.error })) {
          deletePassRegistrationsByPushToken(row.push_token);
        }
      }
    }
  }

  const sent = sentWebPush + sentPassKit;
  let sentMerchantApp = 0;

  const summary = {
    sent,
    sentWebPush,
    sentPassKit,
    sentMerchantApp: 0,
    failed: errors.length,
    errors: errors.length > 0 ? errors : undefined,
    batch_id: batchId,
  };

  if (sendMerchantReceipt && merchantUserId) {
    const tokens = getMerchantDeviceTokensForUser(merchantUserId);
    const receiptTitle = "Campagne envoyée";
    const receiptBody = `Wallet: ${sentPassKit} · Web: ${sentWebPush}${errors.length ? ` · ${errors.length} erreur(s)` : ""}`;
    for (const tok of tokens) {
      const r = await sendMerchantAppAlert(tok, {
        title: receiptTitle,
        body: receiptBody,
        category: "MYFIDPASS_CAMPAIGN",
        data: {
          myfidpass_action: "campaign_receipt",
          batch_id: batchId,
          business_id: business.id,
        },
      });
      if (r.sent) {
        sentMerchantApp++;
        logNotification({
          businessId: business.id,
          memberId: null,
          title: receiptTitle,
          body: receiptBody,
          type: "merchant_receipt",
          batchId,
          channel: "merchant_app",
          triggerName: "merchant_receipt",
          countsForMemberCooldown: 0,
          status: "sent",
        });
      } else if (r.error) {
        if (isLikelyInvalidDeviceTokenApnsError({ message: r.error })) {
          deleteMerchantPushDeviceByToken(tok);
        }
        logNotification({
          businessId: business.id,
          memberId: null,
          title: receiptTitle,
          body: receiptBody,
          type: "merchant_receipt",
          batchId,
          channel: "merchant_app",
          triggerName: "merchant_receipt",
          countsForMemberCooldown: 0,
          status: "failed",
          errorDetail: r.error,
        });
      }
    }
    summary.sentMerchantApp = sentMerchantApp;
  }

  updateNotificationBatchSummary(batchId, summary);
  return { ...summary, batchId };
}
