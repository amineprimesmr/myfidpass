/**
 * Pipeline unique d’envoi client : Web Push + PassKit + accusé app commerçant (APNs).
 */
import { randomUUID } from "crypto";
import {
  getWebPushSubscriptionsByBusinessFilteredExcludingPassKitOwners,
  getWebPushSubscriptionsByBusinessExcludingPassKitOwners,
  getPassKitPushTokensForBusinessFiltered,
  getPassKitPushTokensForBusiness,
  getBusinessById,
  getMemberForBusiness,
  getMembersForBusiness,
  isTechnicalMemberEmail,
  logNotification,
  createNotificationBatch,
  updateNotificationBatchSummary,
  deleteWebPushSubscriptionByEndpoint,
  touchMemberLastVisit as dbTouchMemberLastVisit,
  setLastBroadcastMessage,
  bumpBusinessPassRefreshTimestamp,
  getMerchantDeviceTokensForUser,
  deleteMerchantPushDeviceByToken,
  deletePassRegistrationsByPushToken,
  mergeBusinessAssetsForPass,
} from "../db.js";
import { sendWebPush } from "../notifications.js";
import { sendPassKitPushWaves } from "../passkit-push-waves.js";
import {
  sendMerchantAppAlert,
  isLikelyInvalidMerchantPushTokenError,
  isLikelyInvalidDeviceTokenApnsError,
} from "../merchant-app-push.js";
import { addGoogleWalletNotificationMessageForMember } from "../google-wallet.js";
import { syncNotificationTextsForCampaign } from "../lib/sync-notification-texts-for-campaign.js";
import { businessHasCustomNotificationIcon } from "../lib/notification-icon-gate.js";
import { getMemberForBusinessOrGroup } from "../lib/loyalty-group-resolve.js";
import { resolveMemberIdForPassSerial } from "../db/passes.js";
import logger from "../lib/logger.js";

/**
 * URL d’icône pour Web Push et APNs — uniquement si icône notif personnalisée (sinon pas d’envoi dispatch).
 * L’endpoint `/notification-icon` renvoie 404 sans icône dédiée (pas de repli logo).
 * `?v=` = timestamp + id de campagne + nonce aléatoire pour forcer un fetch frais à chaque envoi.
 *
 * POURQUOI LE NONCE EN PLUS DU batchId :
 *   Un client signalait qu'après un changement d'icône, la notification reçue affichait encore
 *   l'ancienne image. Le batchId seul (UUID par campagne) suffit normalement à invalider tous les
 *   caches HTTP, mais certains chemins (retry interne, push silencieux arrivant avant le push
 *   "contenu", Foundation URLCache dans l'extension) peuvent réutiliser des entrées proches.
 *   Ajouter un UUID v4 pur par APPEL à la construction d'URL garantit l'unicité absolue même en
 *   cas de réémission ou de duplication de payload.
 */
function buildNotificationIconUrl(apiBase, slug, businessRow, batchId) {
  const path = `${apiBase}/api/businesses/${encodeURIComponent(slug)}/notification-icon`;
  const base = businessRow?.notification_icon_updated_at || "0";
  const nonce = randomUUID();
  const v = batchId ? `${base}~${batchId}~${nonce}` : `${base}~${nonce}`;
  return `${path}?v=${encodeURIComponent(v)}`;
}

function targetedGoogleWalletMembers(businessId, memberIds, { allowTechnicalMembers = false } = {}) {
  if (memberIds !== null && memberIds.length === 0) return [];
  let rows;
  if (Array.isArray(memberIds) && memberIds.length > 0) {
    rows = memberIds
      .map((memberId) => getMemberForBusiness(memberId, businessId))
      .filter(Boolean);
  } else {
    const { members } = getMembersForBusiness(businessId, { limit: 100000, offset: 0, sort: "created_desc" });
    rows = members;
  }
  if (allowTechnicalMembers) return rows;
  return rows.filter((m) => !isTechnicalMemberEmail(m.email));
}

async function mapWithConcurrency(items, limit, mapper) {
  const out = [];
  let next = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (next < items.length) {
        const index = next++;
        out[index] = await mapper(items[index], index);
      }
    }),
  );
  return out;
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
 * @param {boolean} [p.allowTechnicalMembers] — auto-test : autorise la carte d'aperçu (`wallet-apercu.*`)
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
  touchMemberLastVisit = true,
  allowTechnicalMembers = false,
  existingBatchId = null,
}) {
  if (!businessHasCustomNotificationIcon(business)) {
    logger.warn(
      { businessId: business.id, slug, triggerName },
      "[dispatch] envoi bloqué — icône de notification personnalisée absente"
    );
    return {
      sent: 0,
      sentWebPush: 0,
      sentPassKit: 0,
      sentGoogleWallet: 0,
      sentMerchantApp: 0,
      failed: 0,
      errors: [],
      batchId: null,
      candidateCount: 0,
    };
  }

  const webSubscriptionsRaw =
    memberIds !== null && memberIds.length > 0
      ? getWebPushSubscriptionsByBusinessFilteredExcludingPassKitOwners(business.id, memberIds)
      : memberIds !== null && memberIds.length === 0
        ? []
        : getWebPushSubscriptionsByBusinessExcludingPassKitOwners(business.id);
  const passKitTokensRaw =
    memberIds !== null && memberIds.length > 0
      ? getPassKitPushTokensForBusinessFiltered(business.id, memberIds)
      : memberIds !== null && memberIds.length === 0
        ? []
        : getPassKitPushTokensForBusiness(business.id);
  const googleWalletMembers = targetedGoogleWalletMembers(business.id, memberIds, { allowTechnicalMembers });

  const isDeliverableMember = (memberOrSerial) => {
    const mid = String(memberOrSerial ?? "").trim();
    if (!mid) return false;
    const row = getMemberForBusinessOrGroup(mid, business) ?? getMemberForBusiness(mid, business.id);
    if (!row) return false;
    // Auto-test commerçant : on cible volontairement la carte d'aperçu technique.
    if (allowTechnicalMembers) return true;
    return !isTechnicalMemberEmail(row.email);
  };

  const webSubscriptionsRawFiltered = webSubscriptionsRaw.filter((w) => isDeliverableMember(w.member_id));
  const passKitTokensRawFiltered = passKitTokensRaw.filter((r) => isDeliverableMember(r.serial_number));

  /** Filet de sécurité si le SQL d’exclusion Web Push a raté (UUID, casse, etc.). */
  const passKitMemberKeys = new Set(
    passKitTokensRawFiltered.map((r) => String(r.serial_number ?? "").trim().toLowerCase()).filter(Boolean)
  );
  const webSubscriptions = webSubscriptionsRawFiltered.filter((w) => {
    const mid = String(w.member_id ?? "").trim().toLowerCase();
    return !passKitMemberKeys.has(mid);
  });

  const pushTokenSeen = new Set();
  const passKitTokens = passKitTokensRawFiltered.filter((r) => {
    const t = String(r.push_token ?? "").trim();
    if (!t || pushTokenSeen.has(t)) return false;
    pushTokenSeen.add(t);
    return true;
  });

  const candidateCount =
    webSubscriptions.length + passKitTokens.length + googleWalletMembers.length;

  if (candidateCount === 0) {
    return {
      sent: 0,
      sentWebPush: 0,
      sentPassKit: 0,
      sentGoogleWallet: 0,
      sentMerchantApp: 0,
      failed: 0,
      errors: [],
      batchId: null,
      candidateCount: 0,
    };
  }

  /** Membres distincts réellement touchés (1 entrée par membre, pas par appareil). */
  const touchedMemberIds = new Set();

  const dispatchStartedAt = Date.now();
  logger.info(
    {
      businessId: business.id,
      slug,
      triggerName,
      webPushCount: webSubscriptions.length,
      passKitCount: passKitTokens.length,
      googleWalletCandidates: googleWalletMembers.length,
      memberFilter: memberIds === null ? "all" : `${memberIds.length} ids`,
    },
    "[dispatch] début de campagne"
  );

  // Web Push : déjà filtré en SQL (voir getWebPushSubscriptionsByBusiness*ExcludingPassKitOwners) :
  // un membre avec Apple Wallet actif ne reçoit pas aussi la PWA/Safari pour la même campagne.

  // Titre d’envoi optionnel → `notification_title_override` (stable). Le corps de campagne ne doit pas
  // écraser `notification_change_message` : voir `sync-notification-texts-for-campaign.js`.
  const businessAfterSync = syncNotificationTextsForCampaign(business.id, title, bodyMessage);

  let batchId = existingBatchId || null;
  if (batchId) {
    updateNotificationBatchSummary(batchId, {
      delivery_status: "sending",
      status: "sending",
      started_at: new Date().toISOString(),
      notification_title: title != null ? String(title).trim() || null : null,
      title: title != null ? String(title).trim() || null : null,
      message: bodyMessage,
      body: bodyMessage,
    });
  } else {
    batchId = createNotificationBatch({
      businessId: business.id,
      triggerName,
      summary: {
        delivery_status: "sending",
        status: "sending",
        started_at: new Date().toISOString(),
        notification_title: title != null ? String(title).trim() || null : null,
        title: title != null ? String(title).trim() || null : null,
        message: bodyMessage,
        body: bodyMessage,
      },
    });
  }

  // Relire la ligne commerce : évite une ligne `req.business` ou un snapshot légèrement vieux si icône
  // vient d’être PATCH juste avant l’envoi ; les timestamps alimentent le `?v=` ci-dessous.
  const businessFresh = getBusinessById(business.id) || businessAfterSync || business;
  const googleWalletBusiness = mergeBusinessAssetsForPass(businessFresh);
  const iconSource = businessAfterSync || businessFresh;
  // Toujours inclure l'URL — l'endpoint retourne logonotif quand aucune icône custom n'est configurée.
  const iconUrl = slug && apiBase
    ? buildNotificationIconUrl(apiBase, slug, iconSource, batchId)
    : null;
  const titleTrim = title != null ? String(title).trim() : "";
  const payloadTitle = (
    (titleTrim ? titleTrim : null) ||
    (businessAfterSync?.notification_title_override && String(businessAfterSync.notification_title_override).trim()) ||
    (businessAfterSync?.organization_name && String(businessAfterSync.organization_name).trim()) ||
    "Myfidpass"
  ).trim();
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
        const mid = String(sub.member_id ?? "").trim().toLowerCase();
        if (mid) touchedMemberIds.add(mid);
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
  // Toujours pousser `notification_pass_layout_at` au moment de l’envoi : sinon le `Last-Modified`
  // du pass peut rester cohérent avec un ancien envoi alors que l’icône notif vient d’être changée
  // (max(timestamp) ne bat pas le cache Wallet / refetch).
  bumpBusinessPassRefreshTimestamp(business.id);
  // Relire la ligne commerce APRÈS bump → on capture `pass_last_modified_ms` frais pour le tag
  // PassKit. APNs peut coalescer les invalidations ; le webservice doit donc porter l'état exact.
  const businessAfterBump = getBusinessById(business.id) || businessFresh;
  const passMs = Number(businessAfterBump?.pass_last_modified_ms) || Date.now();
  // Conservé pour compatibilité d'appel ; sendPassKitUpdate l'ignore côté Wallet pour laisser APNs coalescer.
  const broadcastCollapseId = `bcast-${passMs}`;
  let sentPassKit = 0;
  if (passKitTokens.length > 0) {
    if (touchMemberLastVisit) {
      const touchedMembers = new Set();
      for (const row of passKitTokens) {
        const visitId = resolveMemberIdForPassSerial(row.serial_number, business.id);
        if (visitId && !touchedMembers.has(visitId)) {
          dbTouchMemberLastVisit(visitId);
          touchedMembers.add(visitId);
        }
      }
    }
    // Journaliser AVANT l’APNs : le refetch PassKit (souvent < 1 s) lit `memberHasDeliveredCampaignNotification`
    // pour attacher `changeMessage`. Sans ce log optimiste, seule la 1ʳᵉ campagne affiche une bannière
    // fiable ; les suivantes dépendent d’une course avec `recentCampaignBroadcast` (< 15 min).
    const passKitLogSeen = new Set();
    for (const row of passKitTokens) {
      const logMemberId = resolveMemberIdForPassSerial(row.serial_number, business.id);
      const logKey = `${logMemberId}:${row.push_token ?? ""}`;
      if (!logMemberId || passKitLogSeen.has(logKey)) continue;
      passKitLogSeen.add(logKey);
      logNotification({
        businessId: business.id,
        memberId: logMemberId,
        title: payloadTitle,
        body: bodyMessage,
        type: logTypePasskit,
        batchId,
        channel: "passkit",
        triggerName,
        countsForMemberCooldown: 1,
        status: "sent",
      });
    }
    const waveResults = await sendPassKitPushWaves(passKitTokens, { collapseId: broadcastCollapseId });
    for (const { row, result } of waveResults) {
      const logMemberId = resolveMemberIdForPassSerial(row.serial_number, business.id);
      if (result.sent) {
        sentPassKit++;
        const mid = String(logMemberId ?? row.serial_number ?? "").trim().toLowerCase();
        if (mid) touchedMemberIds.add(mid);
      } else if (result.error) {
        errors.push({ type: "passkit", memberId: logMemberId ?? row.serial_number, error: result.error });
        logNotification({
          businessId: business.id,
          memberId: logMemberId ?? row.serial_number,
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

  let sentGoogleWallet = 0;
  let skippedGoogleWallet = 0;
  let failedGoogleWallet = 0;
  if (googleWalletMembers.length > 0) {
    const googleResults = await mapWithConcurrency(googleWalletMembers, 5, async (member) => {
      try {
        const result = await addGoogleWalletNotificationMessageForMember(member, googleWalletBusiness, {
          title: payloadTitle,
          body: bodyMessage,
          batchId,
        });
        if (result.sent > 0) {
          const mid = String(member.id ?? "").trim().toLowerCase();
          if (mid) touchedMemberIds.add(mid);
          logNotification({
            businessId: business.id,
            memberId: member.id,
            title: payloadTitle,
            body: bodyMessage,
            type: "google_wallet",
            batchId,
            channel: "google_wallet",
            triggerName,
            countsForMemberCooldown: 1,
            status: "sent",
          });
          return { ok: true, sent: result.sent, skipped: result.skipped || 0, failed: 0 };
        }
        if (result.failed > 0) {
          const detail = result.errors?.[0]?.error?.message || result.errors?.[0]?.error || result.error || "Google Wallet addMessage failed";
          logNotification({
            businessId: business.id,
            memberId: member.id,
            title: payloadTitle,
            body: bodyMessage,
            type: "google_wallet",
            batchId,
            channel: "google_wallet",
            triggerName,
            countsForMemberCooldown: 1,
            status: "failed",
            errorDetail: typeof detail === "string" ? detail : JSON.stringify(detail),
          });
          errors.push({ type: "google_wallet", memberId: member.id, error: typeof detail === "string" ? detail : JSON.stringify(detail) });
          return { ok: false, sent: 0, skipped: result.skipped || 0, failed: result.failed || 1 };
        }
        return { ok: true, sent: 0, skipped: result.skipped || 1, failed: 0 };
      } catch (err) {
        const detail = err?.message || String(err);
        logNotification({
          businessId: business.id,
          memberId: member.id,
          title: payloadTitle,
          body: bodyMessage,
          type: "google_wallet",
          batchId,
          channel: "google_wallet",
          triggerName,
          countsForMemberCooldown: 1,
          status: "failed",
          errorDetail: detail,
        });
        errors.push({ type: "google_wallet", memberId: member.id, error: detail });
        return { ok: false, sent: 0, skipped: 0, failed: 1 };
      }
    });
    sentGoogleWallet = googleResults.reduce((sum, r) => sum + (r?.sent || 0), 0);
    skippedGoogleWallet = googleResults.reduce((sum, r) => sum + (r?.skipped || 0), 0);
    failedGoogleWallet = googleResults.reduce((sum, r) => sum + (r?.failed || 0), 0);
  }

  const sent = sentWebPush + sentPassKit + sentGoogleWallet;
  let sentMerchantApp = 0;

  const recipientsDistinct = touchedMemberIds.size;
  const deliveryStatus =
    sent === 0
      ? candidateCount > 0
        ? "failed"
        : "no_targets"
      : errors.length > 0
        ? "partial"
        : "delivered";
  const summary = {
    sent,
    sent_total: sent,
    sentWebPush,
    sentPassKit,
    sentGoogleWallet,
    skippedGoogleWallet,
    failedGoogleWallet,
    sentMerchantApp: 0,
    recipients_distinct: recipientsDistinct,
    distinct_recipients: recipientsDistinct,
    failed: errors.length,
    errors: errors.length > 0 ? errors : undefined,
    batch_id: batchId,
    candidateCount,
    delivery_status: deliveryStatus,
    status: "completed",
    completed_at: new Date().toISOString(),
    notification_title: payloadTitle,
    title: payloadTitle,
    message: bodyMessage,
    body: bodyMessage,
  };

  if (sendMerchantReceipt && merchantUserId) {
    const tokens = getMerchantDeviceTokensForUser(merchantUserId);
    const receiptTitle = "Campagne envoyée";
    const receiptBody = "Notification envoyée";
    for (const tok of tokens) {
      // Toujours inclure l'URL avec ?v= pour cache-busting — l'endpoint sert logonotif si pas d'icône custom.
      const merchantIconUrl = slug && apiBase
        ? buildNotificationIconUrl(apiBase, slug, businessFresh, batchId)
        : null;
      const r = await sendMerchantAppAlert(tok, {
        title: receiptTitle,
        body: receiptBody,
        category: "MYFIDPASS_CAMPAIGN",
        data: {
          myfidpass_action: "campaign_receipt",
          batch_id: batchId,
          business_id: business.id,
          ...(merchantIconUrl ? { notification_icon_url: merchantIconUrl } : {}),
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
        if (isLikelyInvalidMerchantPushTokenError({ message: r.error }, tok)) {
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

  const elapsedMs = Date.now() - dispatchStartedAt;
  logger.info(
    {
      businessId: business.id,
      slug,
      batchId,
      sent,
      sentWebPush,
      sentPassKit,
      sentGoogleWallet,
      skippedGoogleWallet,
      failedGoogleWallet,
      sentMerchantApp,
      failed: errors.length,
      elapsedMs,
      // Métrique utile : nombre de subs invalides qui ont été GC pendant ce batch
      // (= différence entre rows initiaux et envois tentés). Approximation.
    },
    "[dispatch] campagne terminée"
  );

  return { ...summary, batchId };
}
