/**
 * Notifications : notify (alias iOS), send, stats, batches, history.
 * Référence : REFONTE-REGLES.md — max 15 routes par fichier.
 */
import { Router } from "express";
import {
  getMemberIdsInCategories,
  getMemberIdsBySegment,
  getWebPushSubscriptionsByBusiness,
  getWebPushSubscriptionsByBusinessFiltered,
  getWebPushSubscriptionsByBusinessExcludingPassKitOwners,
  getWebPushSubscriptionsByBusinessFilteredExcludingPassKitOwners,
  getPassKitPushTokensForBusiness,
  getPassKitPushTokensForBusinessFiltered,
  getPassKitRegistrationsCountForBusiness,
  getMembersForBusiness,
  getCampaignSegmentCounts,
  getNotificationBatchesForBusiness,
  getNotificationLogRecentForBusiness,
} from "../../db.js";
import { passKitWaveGapMsForDiagnostics } from "../../passkit-push-waves.js";
import { deliverCustomerBroadcast } from "../../notifications/dispatch.js";
import { getMerchantApnsUnavailableReason } from "../../apns.js";
import { assertOperationalSubscription, ensureDashboardAccess, blockStaffDashboardWrites, getApiBase } from "./shared.js";
import logger from "../../lib/logger.js";
import { syncNotificationTextsForCampaign } from "../../lib/sync-notification-texts-for-campaign.js";
import { enqueueNotificationJob } from "../../lib/notification-job-queue.js";
import {
  assertCustomNotificationIconForBroadcast,
  notificationIconRequiredHttpBody,
} from "../../lib/notification-icon-gate.js";

/** Segments autorisés pour POST .../notifications/send (campagne manuelle ou auto). */
export const CAMPAIGN_SEGMENT_KEYS = [
  "inactive14",
  "inactive30",
  "inactive60",
  "inactive90",
  "new7",
  "new30",
  "welcomeNew",
  "pointsNear50",
  "points50",
  "recurrent",
  /** Profil complet (tél., ville, date de naissance) et anniversaire le jour J (UTC serveur). */
  "birthdayToday",
];

/**
 * @param {object} [options]
 * @param {string} [options.triggerName]
 * @param {string|null} [options.merchantUserId]
 * @param {boolean} [options.sendMerchantReceipt]
 */
export async function deliverDashboardBroadcast(
  business,
  slug,
  apiBase,
  memberIds,
  title,
  bodyMessage,
  logTypePasskit = "passkit",
  options = {}
) {
  const {
    triggerName = "campaign_manual",
    merchantUserId = null,
    sendMerchantReceipt = true,
    touchMemberLastVisit = true,
  } = options || {};
  return deliverCustomerBroadcast({
    business,
    slug,
    apiBase,
    memberIds,
    title,
    bodyMessage,
    triggerName,
    logTypePasskit,
    merchantUserId,
    sendMerchantReceipt,
    touchMemberLastVisit,
  });
}


export async function notifyHandler(req, res) {
  try {
  const business = req.business;
  if (!ensureDashboardAccess(req, res, business)) return;
  if (!assertOperationalSubscription(req, res, business)) return;
  const message = (req.body?.message ?? "").trim();
  if (!message) return res.status(400).json({ error: "Le message est obligatoire" });
  try {
    assertCustomNotificationIconForBroadcast(business);
  } catch (e) {
    return res.status(e.statusCode || 422).json(notificationIconRequiredHttpBody());
  }
  const categoryIds = Array.isArray(req.body?.category_ids) ? req.body.category_ids.filter(Boolean) : null;
  const memberIds = categoryIds && categoryIds.length > 0 ? getMemberIdsInCategories(business.id, categoryIds) : null;
  const apiBase = getApiBase(req);
  const slug = req.params.slug ?? business.slug;

  const webSubscriptions =
    memberIds !== null
      ? getWebPushSubscriptionsByBusinessFilteredExcludingPassKitOwners(business.id, memberIds)
      : getWebPushSubscriptionsByBusinessExcludingPassKitOwners(business.id);
  const passKitTokens =
    memberIds !== null
      ? getPassKitPushTokensForBusinessFiltered(business.id, memberIds)
      : getPassKitPushTokensForBusiness(business.id);
  const googleWalletCandidates =
    memberIds !== null
      ? memberIds.length
      : (getMembersForBusiness(business.id, { limit: 1 })?.total ?? 0);
  const totalDevices = webSubscriptions.length + passKitTokens.length + googleWalletCandidates;
  if (totalDevices === 0) {
    return res.status(200).json({ ok: true, sent: 0, sentWebPush: 0, sentPassKit: 0, sentGoogleWallet: 0, sentMerchantApp: 0, batch_id: null });
  }

  const result = await deliverCustomerBroadcast({
    business,
    slug,
    apiBase,
    memberIds,
    title: null,
    bodyMessage: message,
    triggerName: "notify_clients",
    logTypePasskit: "passkit",
    merchantUserId: req.user?.id ?? null,
  });

  res.status(200).json({
    ok: true,
    sent: result.sent,
    sentWebPush: result.sentWebPush,
    sentPassKit: result.sentPassKit,
    sentGoogleWallet: result.sentGoogleWallet ?? 0,
    sentMerchantApp: result.sentMerchantApp ?? 0,
    batch_id: result.batchId,
    failed: result.failed ?? 0,
    errors: result.errors,
  });
  } catch (err) {
    logger.error({ err, businessId: req.business?.id }, "[notifications] notifyHandler error");
    if (!res.headersSent) res.status(500).json({ error: "Erreur interne lors de l'envoi." });
  }
}

// mergeParams: true — sans ça, req.params.slug est undefined dans ce sous-router
// (Express 4 ne propage pas les params du parent sans cette option).
const router = Router({ mergeParams: true });

router.use((req, res, next) => {
  if (!blockStaffDashboardWrites(req, res, req.business)) return;
  next();
});

router.post("/send", async (req, res) => {
  try {
  const business = req.business;
  if (!ensureDashboardAccess(req, res, business)) return;
  const { title, message, category_ids: reqCategoryIds, segment } = req.body || {};
  if (!assertOperationalSubscription(req, res, business)) return;
  const body = (message || "").trim();
  if (!body) {
    return res.status(400).json({ error: "Le message est obligatoire" });
  }
  try {
    assertCustomNotificationIconForBroadcast(business);
  } catch (e) {
    return res.status(e.statusCode || 422).json(notificationIconRequiredHttpBody());
  }
  let memberIds;
  if (segment && CAMPAIGN_SEGMENT_KEYS.includes(segment)) {
    memberIds = getMemberIdsBySegment(business.id, segment);
  } else {
    const categoryIds = Array.isArray(reqCategoryIds) ? reqCategoryIds.filter(Boolean) : null;
    memberIds = categoryIds && categoryIds.length > 0 ? getMemberIdsInCategories(business.id, categoryIds) : null;
  }
  const apiBase = getApiBase(req);
  const slug = req.params.slug ?? business.slug;
  const webSubscriptions =
    memberIds !== null
      ? getWebPushSubscriptionsByBusinessFilteredExcludingPassKitOwners(business.id, memberIds)
      : getWebPushSubscriptionsByBusinessExcludingPassKitOwners(business.id);
  const passKitTokens =
    memberIds !== null
      ? getPassKitPushTokensForBusinessFiltered(business.id, memberIds)
      : getPassKitPushTokensForBusiness(business.id);
  const googleWalletCandidates =
    memberIds !== null
      ? memberIds.length
      : (getMembersForBusiness(business.id, { limit: 1 })?.total ?? 0);
  const totalDevices = webSubscriptions.length + passKitTokens.length + googleWalletCandidates;
  if (totalDevices === 0) {
    return res.json({
      ok: true,
      sent: 0,
      sentWebPush: 0,
      sentPassKit: 0,
      sentGoogleWallet: 0,
      sentMerchantApp: 0,
      batch_id: null,
      message: "Aucun client ciblé. Les clients qui ajoutent la carte (Apple Wallet, Google Wallet ou navigateur) pourront recevoir les notifications.",
    });
  }

  const triggerName =
    segment && CAMPAIGN_SEGMENT_KEYS.includes(segment)
      ? `campaign_segment_${segment}`
      : Array.isArray(reqCategoryIds) && reqCategoryIds.filter(Boolean).length > 0
        ? "campaign_manual_categories"
        : "campaign_manual";

  // Synchronise les textes de notification AVANT de créer le job, pour que le pass
  // refetché par les iPhones contienne déjà le bon changeMessage.
  syncNotificationTextsForCampaign(business.id, title, body);
  const isBehavioralSegment = segment && CAMPAIGN_SEGMENT_KEYS.includes(segment);

  /**
   * Envoi persistant via la file de travaux SQLite.
   *
   * POURQUOI : `setImmediate()` seul perdait la campagne si Railway redémarrait le
   * conteneur entre le 202 et l’exécution de la microtask (déploiement, OOM, crash).
   * Désormais, le job est écrit en base AVANT le 202 ; même sans setImmediate,
   * le worker de notification-job-queue.js le reprend au prochain démarrage.
   *
   * job_id retourné dans la réponse : le client peut l’utiliser pour tracker l’envoi
   * via GET /notifications/batches (le batch_id sera mis à jour une fois l’envoi terminé).
   */
  const jobId = enqueueNotificationJob({
    businessId: business.id,
    slug,
    apiBase,
    memberIds,
    title: title ?? null,
    body,
    triggerName,
    merchantUserId: req.user?.id ?? null,
    touchMemberLastVisit: !isBehavioralSegment,
  });

  res.status(202).json({
    ok: true,
    accepted: true,
    async_delivery: true,
    sent: null,
    sent_web_push: null,
    sent_pass_kit: null,
    sent_google_wallet: null,
    sent_merchant_app: null,
    job_id: jobId,
    batch_id: null, // sera disponible dans /notifications/batches une fois terminé
    total: totalDevices,
    message: `Envoi lancé vers ${totalDevices} appareil(s). Vous pouvez fermer l’écran : la campagne continue sur le serveur. Consultez l’historique des campagnes pour le résultat (job_id: ${jobId}).`,
  });
  } catch (err) {
    logger.error({ err, businessId: req.business?.id }, "[notifications] POST /send error");
    if (!res.headersSent) res.status(500).json({ error: "Erreur interne lors de l'envoi de la notification. Réessayez." });
  }
});

router.get("/campaign-segments", (req, res) => {
  const business = req.business;
  if (!ensureDashboardAccess(req, res, business)) return;
  const c = getCampaignSegmentCounts(business.id);
  res.json({
    inactive14: c.inactive14,
    inactive30: c.inactive30,
    inactive60: c.inactive60,
    inactive90: c.inactive90,
    new7: c.new7,
    new30: c.new30,
    welcomeNew: c.welcomeNew,
    pointsNear50: c.pointsNear50,
    points50: c.points50,
    recurrent: c.recurrent,
    birthdayToday: c.birthdayToday,
  });
});

router.get("/batches", (req, res) => {
  const business = req.business;
  if (!ensureDashboardAccess(req, res, business)) return;
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const rows = getNotificationBatchesForBusiness(business.id, { limit });
  const parsed = rows.map((r) => ({
    id: r.id,
    business_id: r.business_id,
    trigger_name: r.trigger_name,
    created_at: r.created_at,
    summary: safeJsonParse(r.summary_json),
  }));
  res.json({ ok: true, batches: parsed });
});

router.get("/history", (req, res) => {
  const business = req.business;
  if (!ensureDashboardAccess(req, res, business)) return;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const rows = getNotificationLogRecentForBusiness(business.id, { limit });
  res.json({ ok: true, entries: rows });
});

function safeJsonParse(s) {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
}

router.get("/stats", (req, res) => {
  const business = req.business;
  if (!ensureDashboardAccess(req, res, business)) return;
  const webSubscriptions = getWebPushSubscriptionsByBusiness(business.id);
  const passKitTokens = getPassKitPushTokensForBusiness(business.id);
  const passKitRegistrationsCount = getPassKitRegistrationsCountForBusiness(business.id);
  const subscriptionsCount = webSubscriptions.length + passKitRegistrationsCount;
  const passKitUrlConfigured = !!(process.env.PASSKIT_WEB_SERVICE_URL || process.env.API_URL);
  const noDeviceButConfigured = subscriptionsCount === 0 && passKitUrlConfigured;
  const { total: membersCount } = getMembersForBusiness(business.id, { limit: 1 });
  const merchantApnsReason = getMerchantApnsUnavailableReason();
  const recentBatches = getNotificationBatchesForBusiness(business.id, { limit: 3 });
  const lastBatch = recentBatches[0]
    ? {
        id: recentBatches[0].id,
        trigger_name: recentBatches[0].trigger_name,
        created_at: recentBatches[0].created_at,
        summary: safeJsonParse(recentBatches[0].summary_json),
      }
    : null;

  res.json({
    passkit_wave_gap_ms: passKitWaveGapMsForDiagnostics(),
    subscriptionsCount,
    membersCount: membersCount ?? 0,
    webPushCount: webSubscriptions.length,
    passKitCount: passKitRegistrationsCount,
    passKitWithTokenCount: passKitTokens.length,
    merchant_app_push_configured: !merchantApnsReason,
    merchant_app_push_detail: merchantApnsReason || undefined,
    membersWithNotifications: new Set(webSubscriptions.map((s) => s.member_id)).size + new Set(passKitTokens.map((p) => p.serial_number)).size,
    passKitUrlConfigured,
    last_batch: lastBatch,
    diagnostic: !passKitUrlConfigured
      ? "PASSKIT_WEB_SERVICE_URL non défini sur le backend. Les passes sont générés sans URL d'enregistrement, donc l'iPhone ne contacte jamais le serveur. Ajoutez sur Railway : PASSKIT_WEB_SERVICE_URL = https://api.myfidpass.fr (sans slash final), puis redéployez. Ensuite, supprimez la carte du Wallet et ré-ajoutez-la depuis le lien partagé."
      : null,
    helpWhenNoDevice: noDeviceButConfigured
      ? "1) Supprime la carte du Wallet sur ton iPhone. 2) Ouvre le lien de ta carte (copié dans « Partager ») en navigation privée. 3) Clique « Apple Wallet » pour télécharger un pass neuf. 4) Ajoute la carte au Wallet. 5) Attends 30 secondes puis rafraîchis cette page."
      : null,
    paradoxExplanation: membersCount > 0 && subscriptionsCount === 0 && passKitUrlConfigured
      ? "Si tu as pu scanner la carte du client et lui ajouter des points, sa carte est bien dans son Wallet — mais notre serveur n'a jamais reçu l'appel d'enregistrement de son iPhone. Soit le pass qu'il a ajouté a été généré sans URL d'enregistrement (ancien lien ou cache), soit l'iPhone ou le réseau empêche l'appel. À faire : le client supprime la carte du Wallet, rouvre le lien partagé (depuis « Partager »), clique « Apple Wallet », ajoute la carte à nouveau (pass neuf). Tester en 4G si le WiFi bloque, et vérifier Réglages → Wallet sur l'iPhone."
      : null,
    dataDirHint: membersCount > 0 && passKitRegistrationsCount === 0 && process.env.NODE_ENV === "production"
      ? "Si les logs Railway montrent des « Requête reçue: POST » mais 0 appareil ici : vérifie que le volume Railway est bien monté (Mount path = /data) et que la variable DATA_DIR=/data est définie. Sinon les enregistrements sont perdus à chaque redémarrage du conteneur. Voir docs/CONNEXION-ET-DONNEES.md."
      : null,
    membersVsDevicesExplanation: membersCount > 0 && subscriptionsCount === 0
      ? "Les membres apparaissent dès que le client remplit le formulaire (nom, email) et crée sa carte. Les « appareils » pour les notifications sont enregistrés par l'iPhone lui‑même quand le client ajoute le pass au Wallet — c'est Apple qui doit appeler notre serveur. Si cet appel n'arrive pas (réglages iPhone, réseau, certificat), le compteur reste à 0 alors que le membre est bien en base."
      : null,
  });
});

export const notificationsRouter = router;
