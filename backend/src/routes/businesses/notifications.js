/**
 * Notifications : notify (alias iOS), send, stats, test-passkit, remove-test-device.
 * Référence : REFONTE-REGLES.md — max 15 routes par fichier.
 */
import { Router } from "express";
import {
  getMemberIdsInCategories,
  getWebPushSubscriptionsByBusiness,
  getWebPushSubscriptionsByBusinessFiltered,
  getPassKitPushTokensForBusiness,
  getPassKitPushTokensForBusinessFiltered,
  getPassKitRegistrationsCountForBusiness,
  getMembersForBusiness,
  logNotification,
  setLastBroadcastMessage,
  touchMemberLastVisit,
  removeTestPassKitDevices,
} from "../../db.js";
import { sendWebPush } from "../../notifications.js";
import { sendPassKitUpdate } from "../../apns.js";
import { getPassAuthenticationToken } from "../../pass.js";
import { canAccessDashboard, getApiBase } from "./shared.js";

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
  const iconUrl = business.logo_base64
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
    } catch (_) {}
  }

  if (passKitTokens.length > 0) {
    for (const row of passKitTokens) {
      try {
        await sendPassKitUpdate(row.push_token);
      } catch (_) {}
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  setLastBroadcastMessage(business.id, payload.title ? `${payload.title}: ${message}` : message);
  const touchedMembers = new Set();
  for (const row of passKitTokens) {
    if (row.serial_number && !touchedMembers.has(row.serial_number)) {
      touchMemberLastVisit(row.serial_number);
      touchedMembers.add(row.serial_number);
    }
  }
  for (const row of passKitTokens) {
    try {
      const result = await sendPassKitUpdate(row.push_token);
      if (result.sent) {
        sentPassKit++;
        logNotification({ businessId: business.id, memberId: row.serial_number, title: payload.title, body: message, type: "passkit" });
      }
    } catch (_) {}
  }
  res.status(200).json({ ok: true, sent: sentWebPush + sentPassKit, sentWebPush, sentPassKit });
}

const router = Router();

router.post("/send", async (req, res) => {
  const business = req.business;
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const { title, message, category_ids: reqCategoryIds } = req.body || {};
  const body = (message || "").trim();
  if (!body) {
    return res.status(400).json({ error: "Le message est obligatoire" });
  }
  const categoryIds = Array.isArray(reqCategoryIds) ? reqCategoryIds.filter(Boolean) : null;
  const memberIds = categoryIds && categoryIds.length > 0 ? getMemberIdsInCategories(business.id, categoryIds) : null;
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
  const iconUrl = business.logo_base64
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
  if (passKitTokens.length > 0) {
    for (const row of passKitTokens) {
      try { await sendPassKitUpdate(row.push_token); } catch (_) {}
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  setLastBroadcastMessage(business.id, broadcastText);
  const touchedMembers = new Set();
  for (const row of passKitTokens) {
    if (row.serial_number && !touchedMembers.has(row.serial_number)) {
      touchMemberLastVisit(row.serial_number);
      touchedMembers.add(row.serial_number);
    }
  }
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
  res.json({
    subscriptionsCount,
    membersCount: membersCount ?? 0,
    webPushCount: webSubscriptions.length,
    passKitCount: passKitRegistrationsCount,
    passKitWithTokenCount: passKitTokens.length,
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
