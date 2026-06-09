/**
 * Notifications : notify (alias iOS), send, stats, batches, history.
 * Référence : REFONTE-REGLES.md — max 15 routes par fichier.
 */
import { Router } from "express";
import {
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
  getNotificationCampaignInsightsForBusiness,
  getWalletPreviewMemberForBusiness,
  getPushTokensForMember,
} from "../../db.js";
import { passKitWaveGapMsForDiagnostics } from "../../passkit-push-waves.js";
import { deliverCustomerBroadcast } from "../../notifications/dispatch.js";
import { classifyDeliveryDevices } from "../../lib/notification-deliverability.js";
import { getMerchantApnsUnavailableReason } from "../../apns.js";
import {
  assertOperationalSubscription,
  ensureDashboardAccess,
  blockStaffDashboardWrites,
  getApiBase,
  checkDashboardIdentity,
} from "./shared.js";
import { getBusinessBySlug } from "../../db/businesses.js";
import logger from "../../lib/logger.js";
import { syncNotificationTextsForCampaign } from "../../lib/sync-notification-texts-for-campaign.js";
import { enqueueNotificationJob } from "../../lib/notification-job-queue.js";
import {
  assertCustomNotificationIconForBroadcast,
  notificationIconRequiredHttpBody,
  NOTIFICATION_ICON_REQUIRED_CODE,
} from "../../lib/notification-icon-gate.js";
import { getBusinessNotificationReadiness } from "../../lib/notification-readiness.js";

/**
 * Compte réel des canaux livrables (Web Push + PassKit) — sans gonfler avec tous les membres Google Wallet.
 * `deliverableDevices` exclut les comptes techniques (aperçu/invités) EXACTEMENT comme `dispatch.js`,
 * pour que readiness/POST send n'annoncent plus un succès alors que la campagne ne touche personne.
 * @param {import("../../db/businesses.js").BusinessRow} business
 */
function countNotificationDeliveryTargets(business, memberIds) {
  const businessId = business.id;
  const webSubscriptions =
    memberIds !== null && memberIds.length > 0
      ? getWebPushSubscriptionsByBusinessFilteredExcludingPassKitOwners(businessId, memberIds)
      : memberIds !== null && memberIds.length === 0
        ? []
        : getWebPushSubscriptionsByBusinessExcludingPassKitOwners(businessId);
  const passKitTokens =
    memberIds !== null && memberIds.length > 0
      ? getPassKitPushTokensForBusinessFiltered(businessId, memberIds)
      : memberIds !== null && memberIds.length === 0
        ? []
        : getPassKitPushTokensForBusiness(businessId);
  const breakdown = classifyDeliveryDevices(business, { passKitTokens, webSubscriptions });
  return {
    webSubscriptions,
    passKitTokens,
    totalDevices: breakdown.totalDevices,
    deliverableDevices: breakdown.deliverableDevices,
    previewDevices: breakdown.previewDevices,
  };
}

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
    allowTechnicalMembers = false,
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
    allowTechnicalMembers,
  });
}

/**
 * Auto-test : envoie la notification UNIQUEMENT sur la carte d'aperçu Wallet du commerçant
 * (`wallet-apercu.{slug}@example.com`), en bypassant le filtre technique de dispatch.
 * Applique la pleine sémantique campagne (setLastBroadcastMessage + changeMessage) → vraie bannière.
 */
async function handleSelfTestBroadcast(req, res, business, { title, body }) {
  const slug = req.params.slug ?? business.slug;
  const readiness = getBusinessNotificationReadiness(business);
  if (!readiness.subscription_ok) {
    return res.status(403).json({ ok: false, code: "subscription_required", message: readiness.block_message });
  }
  if (!readiness.has_notification_icon) {
    return res.status(422).json({
      ...notificationIconRequiredHttpBody(),
      message:
        "Ajoute d’abord une icône de notification (onglet Notifications) : sans elle, la bannière écran verrouillé n’apparaît pas, même en test.",
    });
  }

  const previewMember = getWalletPreviewMemberForBusiness(business.id);
  if (!previewMember?.id) {
    return res.status(200).json({
      ok: true,
      accepted: false,
      self_test: true,
      code: "no_preview_card",
      sent: 0,
      message:
        "Aucune carte d’aperçu trouvée. Ouvre « Ma carte » puis « Aperçu Wallet » pour ajouter ta carte test à Apple Wallet, et réessaie.",
    });
  }

  const tokens = getPushTokensForMember(previewMember.id);
  if (!tokens || tokens.length === 0) {
    return res.status(200).json({
      ok: true,
      accepted: false,
      self_test: true,
      code: "no_preview_device",
      sent: 0,
      message:
        "Ta carte d’aperçu n’est pas encore enregistrée sur cet iPhone. Ajoute-la à Apple Wallet, attends ~30 s, puis relance le test.",
    });
  }

  const apiBase = getApiBase(req);
  const result = await deliverDashboardBroadcast(
    business,
    slug,
    apiBase,
    [previewMember.id],
    title,
    body,
    "passkit_self_test",
    {
      triggerName: "campaign_self_test",
      merchantUserId: req.user?.id ?? null,
      sendMerchantReceipt: false,
      touchMemberLastVisit: false,
      allowTechnicalMembers: true,
    },
  );

  const sentPassKit = result?.sentPassKit ?? 0;
  return res.status(200).json({
    ok: true,
    accepted: sentPassKit > 0,
    self_test: true,
    code: sentPassKit > 0 ? "self_test_sent" : "self_test_failed",
    sent: result?.sent ?? 0,
    sent_pass_kit: sentPassKit,
    message:
      sentPassKit > 0
        ? "Notification test envoyée sur ta carte Wallet. Verrouille ton écran ~10 s : la bannière doit apparaître."
        : "Le push n’a pas pu partir vers ta carte d’aperçu (token Apple expiré ?). Supprime puis ré-ajoute la carte au Wallet, attends ~30 s et réessaie.",
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
  const memberIds = null;
  const apiBase = getApiBase(req);
  const slug = req.params.slug ?? business.slug;

  const { totalDevices } = countNotificationDeliveryTargets(business, memberIds);
  if (totalDevices === 0) {
    return res.status(200).json({
      ok: true,
      sent: 0,
      sentWebPush: 0,
      sentPassKit: 0,
      sentGoogleWallet: 0,
      sentMerchantApp: 0,
      batch_id: null,
      message:
        "Aucun client ciblé. Les clients qui ajoutent la carte (Apple Wallet ou navigateur) pourront recevoir les notifications.",
    });
  }

  syncNotificationTextsForCampaign(business.id, null, message);

  const jobId = enqueueNotificationJob({
    businessId: business.id,
    slug,
    apiBase,
    memberIds,
    title: null,
    body: message,
    triggerName: "notify_clients",
    merchantUserId: req.user?.id ?? null,
    touchMemberLastVisit: false,
  });

  res.status(202).json({
    ok: true,
    accepted: true,
    async_delivery: true,
    sent: null,
    sentWebPush: null,
    sentPassKit: null,
    sentGoogleWallet: null,
    sentMerchantApp: null,
    job_id: jobId,
    batch_id: null,
    total: totalDevices,
    message: `Envoi lancé vers ${totalDevices} appareil(s). La campagne continue sur le serveur (job_id: ${jobId}).`,
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

function normalizeBusinessSlugsList(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((s) => String(s ?? "").trim()).filter(Boolean))];
}

function resolveCampaignTargets(req, business, requestedSlugs) {
  const slugs = normalizeBusinessSlugsList(requestedSlugs);
  if (slugs.length === 0) {
    return [{ business, slug: business.slug, access: "ok" }];
  }
  const out = [];
  for (const slug of slugs) {
    const target = getBusinessBySlug(slug);
    if (!target) {
      out.push({ slug, access: "not_found" });
      continue;
    }
    const access = checkDashboardIdentity(target, req);
    if (access !== "ok") {
      out.push({ slug: target.slug, access });
      continue;
    }
    out.push({ business: target, slug: target.slug, access: "ok" });
  }
  return out;
}

/**
 * Envoie une campagne vers un commerce (job SQLite). Retourne un objet résultat par slug.
 */
function enqueueCampaignForBusiness(req, business, slug, { title, body, segment }) {
  const readiness = getBusinessNotificationReadiness(business);
  if (!readiness.subscription_ok) {
    return {
      slug,
      ok: false,
      code: "subscription_required",
      message: readiness.block_message,
      total_devices: 0,
    };
  }
  if (!readiness.has_notification_icon) {
    return {
      slug,
      ok: false,
      code: NOTIFICATION_ICON_REQUIRED_CODE,
      message: readiness.block_message,
      total_devices: 0,
      business_name: readiness.name,
    };
  }

  const memberIds =
    segment && CAMPAIGN_SEGMENT_KEYS.includes(segment)
      ? getMemberIdsBySegment(business.id, segment)
      : null;
  const { totalDevices, deliverableDevices, previewDevices } = countNotificationDeliveryTargets(
    business,
    memberIds,
  );
  // 0 vrai client mais une carte d'aperçu existe : ne plus simuler un succès silencieux.
  if (deliverableDevices === 0 && previewDevices > 0) {
    return {
      slug,
      ok: false,
      code: "no_real_clients",
      message:
        "Aucun vrai client n’a encore ajouté la carte pour ce commerce. Utilise « Tester sur mon téléphone » pour valider, puis partage le lien de ta carte à tes clients.",
      total_devices: 0,
      deliverable_devices: 0,
      preview_devices: previewDevices,
      business_name: readiness.name,
      members_count: readiness.members_count,
    };
  }
  if (deliverableDevices === 0) {
    return {
      slug,
      ok: false,
      code: totalDevices > 0 ? "no_real_clients" : "no_devices",
      message: readiness.block_message,
      total_devices: 0,
      deliverable_devices: 0,
      preview_devices: previewDevices,
      business_name: readiness.name,
      members_count: readiness.members_count,
    };
  }

  const triggerName =
    segment && CAMPAIGN_SEGMENT_KEYS.includes(segment)
      ? `campaign_segment_${segment}`
      : "campaign_manual";
  const apiBase = getApiBase(req);
  syncNotificationTextsForCampaign(business.id, title, body);
  const isBehavioralSegment = segment && CAMPAIGN_SEGMENT_KEYS.includes(segment);
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

  return {
    slug,
    ok: true,
    accepted: true,
    job_id: jobId,
    total_devices: deliverableDevices,
    deliverable_devices: deliverableDevices,
    preview_devices: previewDevices,
    business_name: readiness.name,
    message: `Envoi lancé vers ${deliverableDevices} client(s) pour ${readiness.name}.`,
  };
}

router.get("/readiness", (req, res) => {
  const business = req.business;
  if (!ensureDashboardAccess(req, res, business)) return;
  res.json({ ok: true, readiness: getBusinessNotificationReadiness(business) });
});

router.post("/send", async (req, res) => {
  try {
  const business = req.business;
  if (!ensureDashboardAccess(req, res, business)) return;
  const { title, message, segment, business_slugs: businessSlugsRaw } = req.body || {};
  if (!assertOperationalSubscription(req, res, business)) return;
  const body = (message || "").trim();
  if (!body) {
    return res.status(400).json({ error: "Le message est obligatoire" });
  }

  // Auto-test commerçant : livre uniquement sur SA carte d'aperçu Wallet (bypass filtre technique).
  if (req.body?.test_self_only === true) {
    return await handleSelfTestBroadcast(req, res, business, { title, body });
  }

  const targets = resolveCampaignTargets(req, business, businessSlugsRaw);
  const accessible = targets.filter((t) => t.access === "ok" && t.business);
  if (accessible.length === 0) {
    const first = targets[0];
    if (first?.access === "not_found") {
      return res.status(404).json({ error: "Commerce introuvable", slug: first.slug });
    }
    return res.status(403).json({ error: "Accès refusé à un ou plusieurs commerces." });
  }

  const isMulti = normalizeBusinessSlugsList(businessSlugsRaw).length > 1;
  const results = accessible.map((t) =>
    enqueueCampaignForBusiness(req, t.business, t.slug, { title, body, segment }),
  );

  const launched = results.filter((r) => r.ok);
  const skipped = results.filter((r) => !r.ok);
  const totalDevices = launched.reduce((sum, r) => sum + (r.total_devices ?? 0), 0);

  if (launched.length === 0) {
    const firstBlock = skipped[0];
    if (firstBlock?.code === NOTIFICATION_ICON_REQUIRED_CODE) {
      return res.status(422).json({
        ...notificationIconRequiredHttpBody(),
        multi: isMulti,
        results,
        message: firstBlock.message,
      });
    }
    const blockCode = skipped.find((r) => r.code === "no_real_clients")
      ? "no_real_clients"
      : firstBlock?.code ?? null;
    return res.json({
      ok: true,
      accepted: false,
      async_delivery: false,
      multi: isMulti,
      code: blockCode,
      sent: 0,
      total: 0,
      results,
      message:
        skipped.map((r) => `${r.business_name ?? r.slug} : ${r.message}`).join("\n") ||
        "Aucun commerce n’a pu être notifié.",
    });
  }

  const summaryParts = [];
  if (launched.length > 0) {
    summaryParts.push(
      `Envoi lancé vers ${launched.length} commerce(s) (${totalDevices} appareil(s) au total).`,
    );
  }
  if (skipped.length > 0) {
    summaryParts.push(
      `${skipped.length} commerce(s) ignoré(s) : ${skipped.map((r) => r.business_name ?? r.slug).join(", ")}.`,
    );
  }

  res.status(202).json({
    ok: true,
    accepted: true,
    async_delivery: true,
    multi: isMulti,
    sent: null,
    sent_web_push: null,
    sent_pass_kit: null,
    sent_google_wallet: null,
    sent_merchant_app: null,
    job_id: launched.length === 1 ? launched[0].job_id : null,
    batch_id: null,
    total: totalDevices,
    results,
    message: summaryParts.join(" "),
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

  const notificationCampaigns = getNotificationCampaignInsightsForBusiness(business.id, { limit: 24 });

  res.json({
    notification_campaigns: notificationCampaigns,
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
