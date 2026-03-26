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
  setLastBroadcastMessage,
  touchMemberLastVisit,
  removeTestPassKitDevices,
} from "../../db.js";
import { sendWebPush } from "../../notifications.js";
import { sendPassKitUpdate, getMerchantApnsUnavailableReason } from "../../apns.js";
import { getPassAuthenticationToken } from "../../pass.js";
import { getDashboardStats } from "../../db.js";
import { canAccessDashboard, getApiBase } from "./shared.js";

function businessHasNotificationLogo(business) {
  return (
    Number(business?.asset_notification_icon_present) === 1 ||
    Number(business?.asset_logo_icon_present) === 1 ||
    Number(business?.asset_logo_present) === 1 ||
    !!(business?.logo_icon_base64 || business?.logo_base64)
  );
}

/**
 * Envoi « test sur mon iPhone » uniquement : même pipeline que les clients (PassKit / carte Wallet),
 * filtré sur le membre dont l’e-mail est celui du compte commerçant. Aucune notif vers l’app Myfidpass,
 * pas de MERCHANT_APNS_* requis.
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

  const payloadTitle = (title || business.notification_title_override || business.organization_name || "Myfidpass").trim();
  const broadcastStored = payloadTitle ? `${payloadTitle}: ${bodyMessage}` : bodyMessage;
  setLastBroadcastMessage(business.id, broadcastStored);

  const touchedMembers = new Set();
  for (const row of passKitTokens) {
    if (row.serial_number && !touchedMembers.has(row.serial_number)) {
      touchMemberLastVisit(row.serial_number);
      touchedMembers.add(row.serial_number);
    }
  }
  for (const row of passKitTokens) {
    try {
      await sendPassKitUpdate(row.push_token);
    } catch (_) {
      /* ignore */
    }
  }
  await new Promise((r) => setTimeout(r, 2500));

  let sentPassKit = 0;
  const errors = [];
  for (const row of passKitTokens) {
    try {
      const result = await sendPassKitUpdate(row.push_token);
      if (result.sent) {
        sentPassKit++;
        logNotification({
          businessId: business.id,
          memberId: row.serial_number,
          title: payloadTitle,
          body: bodyMessage,
          type: "passkit_test_self",
        });
      } else if (result.error) {
        errors.push({ type: "passkit", memberId: row.serial_number, error: result.error });
      }
    } catch (err) {
      errors.push({ type: "passkit", memberId: row.serial_number, error: err?.message || String(err) });
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
    sentTotal: sentPassKit,
    testSelfOnly: true,
    message: "Test envoyé sur votre carte Apple Wallet uniquement (même système qu’une campagne). Aucun autre client n’a été notifié.",
  });
}

export async function notifyHandler(req, res) {
  const business = req.business;
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const message = (req.body?.message ?? "").trim();
  if (!message) return res.status(400).json({ error: "Le message est obligatoire" });
  const categoryIds = Array.isArray(req.body?.category_ids) ? req.body.category_ids.filter(Boolean) : null;
  const memberIds = categoryIds && categoryIds.length > 0 ? getMemberIdsInCategories(business.id, categoryIds) : null;
  const webSubscriptions = memberIds !== null
    ? getWebPushSubscriptionsByBusinessFiltered(business.id, memberIds)
    : getWebPushSubscriptionsByBusiness(business.id);
  const passKitTokens = memberIds !== null
    ? getPassKitPushTokensForBusinessFiltered(business.id, memberIds)
    : getPassKitPushTokensForBusiness(business.id);
  const totalDevices = webSubscriptions.length + passKitTokens.length;
  if (totalDevices === 0) {
    return res.status(200).json({ ok: true, sent: 0, sentWebPush: 0, sentPassKit: 0 });
  }
  const apiBase = getApiBase(req);
  const slug = req.params.slug;
  const iconUrl = businessHasNotificationLogo(business)
    ? `${apiBase}/api/businesses/${encodeURIComponent(slug)}/notification-icon`
    : null;
  const payload = {
    title: (business.organization_name || "Myfidpass").trim(),
    body: message,
    ...(iconUrl && { icon: iconUrl }),
  };
  let sentWebPush = 0;
  let sentPassKit = 0;

  for (const sub of webSubscriptions) {
    try {
      await sendWebPush({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      sentWebPush++;
      logNotification({ businessId: business.id, memberId: sub.member_id, title: payload.title, body: message, type: "web_push" });
    } catch (_) { /* ignore */ }
  }

  const broadcastStored = payload.title ? `${payload.title}: ${message}` : message;
  setLastBroadcastMessage(business.id, broadcastStored);
  if (passKitTokens.length > 0) {
    const touchedMembers = new Set();
    for (const row of passKitTokens) {
      if (row.serial_number && !touchedMembers.has(row.serial_number)) {
        touchMemberLastVisit(row.serial_number);
        touchedMembers.add(row.serial_number);
      }
    }
    for (const row of passKitTokens) {
      try {
        await sendPassKitUpdate(row.push_token);
      } catch (_) { /* ignore */ }
    }
    await new Promise((r) => setTimeout(r, 2500));
    for (const row of passKitTokens) {
      try {
        const result = await sendPassKitUpdate(row.push_token);
        if (result.sent) {
          sentPassKit++;
          logNotification({ businessId: business.id, memberId: row.serial_number, title: payload.title, body: message, type: "passkit" });
        }
      } catch (_) { /* ignore */ }
    }
  }
  res.status(200).json({ ok: true, sent: sentWebPush + sentPassKit, sentWebPush, sentPassKit });
}

const router = Router();

router.post("/send", async (req, res) => {
  const business = req.business;
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const { title, message, category_ids: reqCategoryIds, segment } = req.body || {};
  const testSelfOnly = req.body?.test_self_only === true || req.body?.testSelfOnly === true;
  const body = (message || "").trim();
  if (!body) {
    return res.status(400).json({ error: "Le message est obligatoire" });
  }
  if (testSelfOnly) {
    return handleMerchantSelfTestSend(req, res, business, title, body);
  }
  let memberIds;
  if (segment && ["inactive30", "inactive90", "new30", "recurrent", "points50"].includes(segment)) {
    memberIds = getMemberIdsBySegment(business.id, segment);
  } else {
    const categoryIds = Array.isArray(reqCategoryIds) ? reqCategoryIds.filter(Boolean) : null;
    memberIds = categoryIds && categoryIds.length > 0 ? getMemberIdsInCategories(business.id, categoryIds) : null;
  }
  const webSubscriptions = memberIds !== null
    ? getWebPushSubscriptionsByBusinessFiltered(business.id, memberIds)
    : getWebPushSubscriptionsByBusiness(business.id);
  const passKitTokens = memberIds !== null
    ? getPassKitPushTokensForBusinessFiltered(business.id, memberIds)
    : getPassKitPushTokensForBusiness(business.id);
  const totalDevices = webSubscriptions.length + passKitTokens.length;
  if (totalDevices === 0) {
    return res.json({
      ok: true,
      sent: 0,
      sentWebPush: 0,
      sentPassKit: 0,
      message: "Aucun appareil enregistré. Les clients qui ajoutent la carte (Apple Wallet ou navigateur) pourront recevoir les notifications.",
    });
  }
  const apiBase = getApiBase(req);
  const slug = req.params.slug;
  const iconUrl = businessHasNotificationLogo(business)
    ? `${apiBase}/api/businesses/${encodeURIComponent(slug)}/notification-icon`
    : null;
  const payload = {
    title: (title || business.notification_title_override || business.organization_name || "Myfidpass").trim(),
    body,
    ...(iconUrl && { icon: iconUrl }),
  };
  const broadcastText = body;
  let sentWebPush = 0;
  let sentPassKit = 0;
  const errors = [];
  for (const sub of webSubscriptions) {
    try {
      await sendWebPush(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      sentWebPush++;
      logNotification({ businessId: business.id, memberId: sub.member_id, title: payload.title, body, type: "web_push" });
    } catch (err) {
      errors.push({ type: "web_push", memberId: sub.member_id, error: err.message || String(err) });
    }
  }
  setLastBroadcastMessage(business.id, broadcastText);
  if (passKitTokens.length > 0) {
    const touchedMembers = new Set();
    for (const row of passKitTokens) {
      if (row.serial_number && !touchedMembers.has(row.serial_number)) {
        touchMemberLastVisit(row.serial_number);
        touchedMembers.add(row.serial_number);
      }
    }
    for (const row of passKitTokens) {
      try {
        await sendPassKitUpdate(row.push_token);
      } catch (_) { /* ignore */ }
    }
    await new Promise((r) => setTimeout(r, 2500));
    for (const row of passKitTokens) {
      try {
        const result = await sendPassKitUpdate(row.push_token);
        if (result.sent) {
          sentPassKit++;
          logNotification({ businessId: business.id, memberId: row.serial_number, title: payload.title, body, type: "passkit" });
        } else if (result.error) {
          errors.push({ type: "passkit", memberId: row.serial_number, error: result.error });
        }
      } catch (err) {
        errors.push({ type: "passkit", memberId: row.serial_number, error: err.message || String(err) });
      }
    }
  }
  const sent = sentWebPush + sentPassKit;
  const firstError = errors.length > 0 ? errors[0].error : null;
  res.json({
    ok: true,
    sent,
    sentWebPush,
    sentPassKit,
    total: totalDevices,
    failed: errors.length,
    errors: errors.length > 0 ? errors : undefined,
    message:
      sent === 0 && totalDevices > 0 && firstError
        ? `Aucun appareil n'a reçu la notification. Erreur : ${firstError}`
        : undefined,
  });
});

router.get("/campaign-segments", (req, res) => {
  const business = req.business;
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const stats = getDashboardStats(business.id, "30d");
  res.json({
    inactive30: stats.inactiveMembers30Days ?? 0,
    inactive90: stats.inactiveMembers90Days ?? 0,
    new30: stats.newMembersLast30Days ?? 0,
    recurrent: stats.recurrentMembersInPeriod ?? 0,
    points50: stats.membersWithPoints50 ?? 0,
  });
});

router.get("/stats", (req, res) => {
  const business = req.business;
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
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
  res.json({
    subscriptionsCount,
    membersCount: membersCount ?? 0,
    webPushCount: webSubscriptions.length,
    passKitCount: passKitRegistrationsCount,
    passKitWithTokenCount: passKitTokens.length,
    merchant_app_push_configured: !merchantApnsReason,
    merchant_app_push_detail: merchantApnsReason || undefined,
    membersWithNotifications: new Set(webSubscriptions.map((s) => s.member_id)).size + new Set(passKitTokens.map((p) => p.serial_number)).size,
    passKitUrlConfigured,
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
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
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
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const removed = removeTestPassKitDevices(business.id);
  res.json({ ok: true, removed, message: removed ? "Appareil de test supprimé." : "Aucun appareil de test à supprimer." });
});

export const notificationsRouter = router;
