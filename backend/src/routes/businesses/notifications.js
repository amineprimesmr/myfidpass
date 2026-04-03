/**
 * Notifications : notify (alias iOS), send, stats, test-passkit, remove-test-device.
 * Référence : REFONTE-REGLES.md — max 15 routes par fichier.
 */
import { Router } from "express";
import {
  getMemberIdsInCategories,
  getMemberIdsBySegment,
  getWebPushSubscriptionsByBusiness,
  getWebPushSubscriptionsByBusinessFiltered,
  getPassKitPushTokensForBusiness,
  getPassKitPushTokensForBusinessFiltered,
  getPassKitRegistrationsCountForBusiness,
  getMembersForBusiness,
  getUserById,
  getMemberByEmailForBusiness,
  logNotification,
  createNotificationBatch,
  setLastBroadcastMessage,
  touchMemberLastVisit,
  removeTestPassKitDevices,
  getCampaignSegmentCounts,
  getNotificationBatchesForBusiness,
  getNotificationLogRecentForBusiness,
} from "../../db.js";
import { deletePassRegistrationsByPushToken } from "../../db/passes.js";
import { sendPassKitPushWaves, passKitWaveGapMsForDiagnostics } from "../../passkit-push-waves.js";
import { deliverCustomerBroadcast } from "../../notifications/dispatch.js";
import { getMerchantApnsUnavailableReason, isLikelyInvalidDeviceTokenApnsError } from "../../apns.js";
import { getPassAuthenticationToken } from "../../pass.js";
import { ensureDashboardAccess, getApiBase } from "./shared.js";
import logger from "../../lib/logger.js";
import { syncNotificationTextsForCampaign } from "../../lib/sync-notification-texts-for-campaign.js";

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

/**
 * Envoi « test sur mon iPhone » uniquement : même pipeline que les clients (PassKit / carte Wallet),
 * filtré sur le membre dont l’e-mail est celui du compte commerçant.
 */
async function handleMerchantSelfTestSend(req, res, business, title, bodyMessage) {
  if (!req.user) {
    return res.status(401).json({
      error:
        "Connectez-vous avec le compte commerçant (e-mail / mot de passe) dans l’app pour utiliser le mode test. Le lien avec jeton seul ne suffit pas.",
    });
  }
  if (business.user_id !== req.user.id) {
    return res.status(403).json({ error: "Seul le propriétaire du commerce peut utiliser ce mode test." });
  }

  const user = getUserById(req.user.id);
  const userEmail = user?.email?.trim();
  if (!userEmail) {
    return res.status(400).json({ error: "Compte sans e-mail.", code: "USER_EMAIL_MISSING" });
  }

  const member = getMemberByEmailForBusiness(business.id, userEmail);
  if (!member) {
    return res.status(400).json({
      error:
        "Aucun membre pour ce commerce avec l’e-mail de votre compte. Créez une carte (fidélité) avec le même e-mail que votre compte commerçant, puis ajoutez-la dans Apple Wallet pour tester.",
      code: "MERCHANT_MEMBER_NOT_FOUND",
    });
  }

  const passKitTokens = getPassKitPushTokensForBusinessFiltered(business.id, [member.id]);
  if (passKitTokens.length === 0) {
    return res.status(400).json({
      error:
        "Aucune carte Apple Wallet enregistrée pour cet e-mail. Ajoutez votre carte sur cet iPhone (lien « Partager ») avec le même e-mail que votre compte, puis réessayez.",
      code: "MERCHANT_PASSKIT_TOKEN_MISSING",
    });
  }

  const bSync = syncNotificationTextsForCampaign(business.id, title, bodyMessage);
  const payloadTitle = (
    (title != null && String(title).trim() !== "" ? String(title).trim() : null) ||
    bSync.notification_title_override ||
    bSync.organization_name ||
    "Myfidpass"
  ).trim();
  setLastBroadcastMessage(business.id, bodyMessage);

  const batchId = createNotificationBatch({
    businessId: business.id,
    triggerName: "passkit_test_self",
    summary: { test_self: true },
  });

  const touchedMembers = new Set();
  for (const row of passKitTokens) {
    if (row.serial_number && !touchedMembers.has(row.serial_number)) {
      touchMemberLastVisit(row.serial_number);
      touchedMembers.add(row.serial_number);
    }
  }

  const waveResults = await sendPassKitPushWaves(passKitTokens);
  let sentPassKit = 0;
  const errors = [];
  for (const { row, result } of waveResults) {
    if (result.sent) {
      sentPassKit++;
      logNotification({
        businessId: business.id,
        memberId: row.serial_number,
        title: payloadTitle,
        body: bodyMessage,
        type: "passkit_test_self",
        batchId,
        channel: "passkit",
        triggerName: "passkit_test_self",
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
        type: "passkit_test_self",
        batchId,
        channel: "passkit",
        triggerName: "passkit_test_self",
        countsForMemberCooldown: 1,
        status: "failed",
        errorDetail: result.error,
      });
      if (isLikelyInvalidDeviceTokenApnsError({ message: result.error })) {
        deletePassRegistrationsByPushToken(row.push_token);
      }
    }
  }

  const firstError = errors.length > 0 ? errors[0].error : null;
  if (sentPassKit === 0 && firstError) {
    return res.status(200).json({
      ok: true,
      sent: 0,
      sentWebPush: 0,
      sentPassKit: 0,
      sentMerchantApp: 0,
      batch_id: batchId,
      testSelfOnly: true,
      message: `Échec PassKit (même canal que les clients) : ${firstError}`,
    });
  }

  return res.json({
    ok: true,
    sent: sentPassKit,
    sentWebPush: 0,
    sentPassKit: sentPassKit,
    sentMerchantApp: 0,
    batch_id: batchId,
    sentTotal: sentPassKit,
    testSelfOnly: true,
    message: "Test envoyé sur votre carte Apple Wallet uniquement (même système qu’une campagne). Aucun autre client n’a été notifié.",
  });
}

/** Un seul envoi « test sur moi » à la fois par commerce (évite courses DB + APNs empilés si double tap / 2 appareils). */
const merchantTestSendTail = new Map();

function enqueueMerchantTestSend(businessId, fn) {
  const prev = merchantTestSendTail.get(businessId) || Promise.resolve();
  const next = prev.then(fn).catch((err) => {
    console.error("[notifications] merchant test send queue:", err?.message || err);
  });
  merchantTestSendTail.set(businessId, next);
  return next;
}

export async function notifyHandler(req, res) {
  const business = req.business;
  if (!ensureDashboardAccess(req, res, business)) return;
  const message = (req.body?.message ?? "").trim();
  if (!message) return res.status(400).json({ error: "Le message est obligatoire" });
  const categoryIds = Array.isArray(req.body?.category_ids) ? req.body.category_ids.filter(Boolean) : null;
  const memberIds = categoryIds && categoryIds.length > 0 ? getMemberIdsInCategories(business.id, categoryIds) : null;
  const apiBase = getApiBase(req);
  const slug = req.params.slug;

  const webSubscriptions =
    memberIds !== null
      ? getWebPushSubscriptionsByBusinessFiltered(business.id, memberIds)
      : getWebPushSubscriptionsByBusiness(business.id);
  const passKitTokens =
    memberIds !== null
      ? getPassKitPushTokensForBusinessFiltered(business.id, memberIds)
      : getPassKitPushTokensForBusiness(business.id);
  const totalDevices = webSubscriptions.length + passKitTokens.length;
  if (totalDevices === 0) {
    return res.status(200).json({ ok: true, sent: 0, sentWebPush: 0, sentPassKit: 0, sentMerchantApp: 0, batch_id: null });
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
    sentMerchantApp: result.sentMerchantApp ?? 0,
    batch_id: result.batchId,
    failed: result.failed ?? 0,
    errors: result.errors,
  });
}

const router = Router();

router.post("/send", async (req, res) => {
  const business = req.business;
  if (!ensureDashboardAccess(req, res, business)) return;
  const { title, message, category_ids: reqCategoryIds, segment } = req.body || {};
  const testSelfOnly = req.body?.test_self_only === true || req.body?.testSelfOnly === true;
  const body = (message || "").trim();
  if (!body) {
    return res.status(400).json({ error: "Le message est obligatoire" });
  }
  if (testSelfOnly) {
    await enqueueMerchantTestSend(business.id, () => handleMerchantSelfTestSend(req, res, business, title, body));
    return;
  }
  let memberIds;
  if (segment && CAMPAIGN_SEGMENT_KEYS.includes(segment)) {
    memberIds = getMemberIdsBySegment(business.id, segment);
  } else {
    const categoryIds = Array.isArray(reqCategoryIds) ? reqCategoryIds.filter(Boolean) : null;
    memberIds = categoryIds && categoryIds.length > 0 ? getMemberIdsInCategories(business.id, categoryIds) : null;
  }
  const apiBase = getApiBase(req);
  const slug = req.params.slug;
  const webSubscriptions =
    memberIds !== null
      ? getWebPushSubscriptionsByBusinessFiltered(business.id, memberIds)
      : getWebPushSubscriptionsByBusiness(business.id);
  const passKitTokens =
    memberIds !== null
      ? getPassKitPushTokensForBusinessFiltered(business.id, memberIds)
      : getPassKitPushTokensForBusiness(business.id);
  const totalDevices = webSubscriptions.length + passKitTokens.length;
  if (totalDevices === 0) {
    return res.json({
      ok: true,
      sent: 0,
      sentWebPush: 0,
      sentPassKit: 0,
      sentMerchantApp: 0,
      batch_id: null,
      message: "Aucun appareil enregistré. Les clients qui ajoutent la carte (Apple Wallet ou navigateur) pourront recevoir les notifications.",
    });
  }

  const triggerName =
    segment && CAMPAIGN_SEGMENT_KEYS.includes(segment)
      ? `campaign_segment_${segment}`
      : Array.isArray(reqCategoryIds) && reqCategoryIds.filter(Boolean).length > 0
        ? "campaign_manual_categories"
        : "campaign_manual";

  const businessForSend = syncNotificationTextsForCampaign(business.id, title, body);
  const isBehavioralSegment = segment && CAMPAIGN_SEGMENT_KEYS.includes(segment);

  /**
   * Envoi **hors** la durée de vie de la requête HTTP : évite timeouts iOS / proxy / Railway
   * (« Application failed to respond ») sur « tous les inscrits » avec beaucoup de PassKit.
   * Le détail (sent, erreurs) est dans `notification_batches` + logs.
   */
  res.status(202).json({
    ok: true,
    accepted: true,
    async_delivery: true,
    sent: null,
    sent_web_push: null,
    sent_pass_kit: null,
    sent_merchant_app: null,
    batch_id: null,
    total: totalDevices,
    message: `Envoi lancé vers ${totalDevices} appareil(s). Vous pouvez fermer l’écran : la campagne continue sur le serveur. Consultez l’historique des campagnes pour le résultat.`,
  });

  const slugForJob = slug;
  const titleForJob = title;
  const bodyForJob = body;
  const memberIdsForJob = memberIds;
  const triggerForJob = triggerName;
  const merchantUserIdForJob = req.user?.id ?? null;
  const touchVisitForJob = !isBehavioralSegment;

  setImmediate(() => {
    deliverDashboardBroadcast(businessForSend, slugForJob, apiBase, memberIdsForJob, titleForJob, bodyForJob, "passkit", {
      triggerName: triggerForJob,
      merchantUserId: merchantUserIdForJob,
      touchMemberLastVisit: touchVisitForJob,
    }).catch((err) => {
      logger.error({ err, businessId: business.id, slug: slugForJob }, "[notifications/send] envoi asynchrone échoué");
    });
  });
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
  const noDeviceButConfigured = subscriptionsCount === 0 && !!(process.env.PASSKIT_WEB_SERVICE_URL || process.env.API_URL);
  const { members: membersList, total: membersCount } = getMembersForBusiness(business.id, { limit: 1 });
  const member = membersList && membersList[0];
  let testPasskitCurl = null;
  if (noDeviceButConfigured && member) {
    const baseUrl = (process.env.PASSKIT_WEB_SERVICE_URL || process.env.API_URL || "https://api.myfidpass.fr").replace(/\/$/, "");
    const passTypeId = process.env.PASS_TYPE_ID || "pass.com.example.fidelity";
    const token = getPassAuthenticationToken(member.id);
    const url = `${baseUrl}/api/v1/devices/test-device-123/registrations/${encodeURIComponent(passTypeId)}/${encodeURIComponent(member.id)}`;
    testPasskitCurl = `curl -X POST "${url}" -H "Authorization: ApplePass ${token}" -H "Content-Type: application/json" -d '{"pushToken":"test"}' -w "\\nHTTP %{http_code}"`;
  }
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
    testPasskitCurl: testPasskitCurl || undefined,
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

router.get("/test-passkit", (req, res) => {
  const business = req.business;
  if (!ensureDashboardAccess(req, res, business)) return;
  const { members: membersList } = getMembersForBusiness(business.id, { limit: 1 });
  const member = membersList && membersList[0];
  if (!member) {
    return res.json({
      ok: false,
      message: "Aucun membre pour ce commerce. Créez d'abord une carte (page fidélité) puis réessayez.",
    });
  }
  const baseUrl = (process.env.PASSKIT_WEB_SERVICE_URL || process.env.API_URL || "https://api.myfidpass.fr").replace(/\/$/, "");
  const passTypeId = process.env.PASS_TYPE_ID || "pass.com.example.fidelity";
  const token = getPassAuthenticationToken(member.id);
  const url = `${baseUrl}/api/v1/devices/test-device-123/registrations/${encodeURIComponent(passTypeId)}/${encodeURIComponent(member.id)}`;
  const curl = `curl -X POST "${url}" -H "Authorization: ApplePass ${token}" -H "Content-Type: application/json" -d '{"pushToken":"test"}' -w "\\nHTTP %{http_code}"`;
  res.json({
    ok: true,
    message: "Exécute cette commande dans un terminal. Si tu obtiens HTTP 201, l'API d'enregistrement fonctionne (le problème vient alors de l'iPhone ou du réseau). Si tu obtiens 401/404/500 ou une erreur de connexion, le souci est côté serveur.",
    curl,
    memberId: member.id,
  });
});

router.post("/remove-test-device", (req, res) => {
  const business = req.business;
  if (!ensureDashboardAccess(req, res, business)) return;
  const removed = removeTestPassKitDevices(business.id);
  res.json({ ok: true, removed, message: removed ? "Appareil de test supprimé." : "Aucun appareil de test à supprimer." });
});

export const notificationsRouter = router;
