import { Router } from "express";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  getBusinessBySlug,
  getBusinessByDashboardToken,
  createBusiness,
  updateBusiness,
  createMember,
  getMemberForBusiness,
  addPoints,
  createTransaction,
  getDashboardStats,
  getDashboardEvolution,
  getMembersForBusiness,
  getTransactionsForBusiness,
  getWebPushSubscriptionsByBusiness,
  getPassKitPushTokensForBusiness,
  getPassKitRegistrationsCountForBusiness,
  getPushTokensForMember,
  removeTestPassKitDevices,
  logNotification,
  setLastBroadcastMessage,
  touchMemberLastVisit,
  ensureDefaultBusiness,
  canCreateBusiness,
} from "../db.js";
import { sendWebPush } from "../notifications.js";
import { sendPassKitUpdate } from "../apns.js";
import { requireAuth } from "../middleware/auth.js";
import { generatePass, getPassAuthenticationToken } from "../pass.js";
import { getGoogleWalletSaveUrl } from "../google-wallet.js";
import { randomUUID } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const businessAssetsDir = join(__dirname, "..", "assets", "businesses");

const router = Router();

/** Vérifie l'accès au dashboard : token valide pour ce commerce OU utilisateur connecté propriétaire. */
function canAccessDashboard(business, req) {
  if (!business) return false;
  const token = req.query.token || req.get("X-Dashboard-Token");
  const byToken = getBusinessByDashboardToken(token);
  if (byToken && byToken.id === business.id) return true;
  if (req.user && business.user_id === req.user.id) return true;
  return false;
}

/**
 * GET /api/businesses/:slug/dashboard/settings
 * Paramètres de personnalisation (couleurs, dos, nom) — token ou JWT propriétaire.
 */
router.get("/:slug/dashboard/settings", (req, res, next) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  res.json({
    organizationName: business.organization_name,
    backgroundColor: business.background_color ?? undefined,
    foregroundColor: business.foreground_color ?? undefined,
    labelColor: business.label_color ?? undefined,
    backTerms: business.back_terms ?? undefined,
    backContact: business.back_contact ?? undefined,
    locationLat: business.location_lat != null ? Number(business.location_lat) : undefined,
    locationLng: business.location_lng != null ? Number(business.location_lng) : undefined,
    locationRelevantText: business.location_relevant_text ?? undefined,
    locationRadiusMeters: business.location_radius_meters != null ? Number(business.location_radius_meters) : undefined,
  });
});

/**
 * GET /api/businesses/:slug/dashboard/stats
 * Stats pour le tableau de bord (token OU JWT propriétaire).
 */
router.get("/:slug/dashboard/stats", (req, res, next) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const stats = getDashboardStats(business.id);
  res.json({ ...stats, businessName: business.organization_name });
});

/**
 * GET /api/businesses/:slug/dashboard/members
 * Liste des membres (token OU JWT propriétaire). Query: search, limit, offset, filter (inactive30|inactive90|points50), sort (last_visit|points|name|created).
 */
router.get("/:slug/dashboard/members", (req, res, next) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const search = req.query.search ?? "";
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const filter = ["inactive30", "inactive90", "points50"].includes(req.query.filter) ? req.query.filter : null;
  const sort = ["last_visit", "points", "name", "created"].includes(req.query.sort) ? req.query.sort : "last_visit";
  const result = getMembersForBusiness(business.id, { search, limit, offset, filter, sort });
  res.json(result);
});

/**
 * GET /api/businesses/:slug/dashboard/transactions
 * Historique des transactions. Query: limit, offset, memberId, days (7|30|90), type (points_add|visit).
 */
router.get("/:slug/dashboard/transactions", (req, res, next) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const limit = Math.min(Number(req.query.limit) || 30, 200);
  const offset = Number(req.query.offset) || 0;
  const memberId = req.query.memberId || null;
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : null;
  const type = ["points_add", "visit"].includes(req.query.type) ? req.query.type : null;
  const result = getTransactionsForBusiness(business.id, { limit, offset, memberId, days, type });
  res.json(result);
});

/**
 * GET /api/businesses/:slug/dashboard/evolution
 * Données pour graphique (opérations / membres par semaine, 6 semaines).
 */
router.get("/:slug/dashboard/evolution", (req, res, next) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const weeks = Math.min(Math.max(Number(req.query.weeks) || 6, 4), 12);
  const evolution = getDashboardEvolution(business.id, weeks);
  res.json({ evolution });
});

/**
 * GET /api/businesses/:slug/dashboard/members/export
 * Export CSV des membres (même filtres que liste).
 */
router.get("/:slug/dashboard/members/export", (req, res, next) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const search = req.query.search ?? "";
  const filter = ["inactive30", "inactive90", "points50"].includes(req.query.filter) ? req.query.filter : null;
  const sort = ["last_visit", "points", "name", "created"].includes(req.query.sort) ? req.query.sort : "last_visit";
  const { members } = getMembersForBusiness(business.id, { search, limit: 2000, offset: 0, filter, sort });
  const header = "Nom;Email;Points;Dernière visite;Inscrit le\n";
  const csv = header + members.map((m) => {
    const name = (m.name || "").replace(/;/g, ",").replace(/\n/g, " ");
    const email = (m.email || "").replace(/;/g, ",");
    const lastVisit = m.last_visit_at ? new Date(m.last_visit_at).toLocaleString("fr-FR") : "";
    const created = m.created_at ? new Date(m.created_at).toLocaleString("fr-FR") : "";
    return `${name};${email};${m.points};${lastVisit};${created}`;
  }).join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="membres-${business.slug}.csv"`);
  res.send("\uFEFF" + csv);
});

/**
 * GET /api/businesses/:slug/dashboard/transactions/export
 * Export CSV des transactions (même filtres que liste).
 */
router.get("/:slug/dashboard/transactions/export", (req, res, next) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : null;
  const type = ["points_add", "visit"].includes(req.query.type) ? req.query.type : null;
  const { transactions } = getTransactionsForBusiness(business.id, { limit: 2000, offset: 0, days, type });
  const header = "Client;Email;Type;Points;Date\n";
  const csv = header + transactions.map((t) => {
    const name = (t.member_name || "").replace(/;/g, ",").replace(/\n/g, " ");
    const email = (t.member_email || "").replace(/;/g, ",");
    const typeLabel = t.type === "points_add" ? (t.metadata && (t.metadata.includes("visit") ? "Passage" : "Points")) : t.type;
    const date = t.created_at ? new Date(t.created_at).toLocaleString("fr-FR") : "";
    return `${name};${email};${typeLabel};${t.points};${date}`;
  }).join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="transactions-${business.slug}.csv"`);
  res.send("\uFEFF" + csv);
});

/**
 * POST /api/businesses/:slug/notifications/send
 * Envoie une notification à tous les membres : Web Push (navigateur) + APNs (Apple Wallet).
 * Body: { title?, message (requis) }
 * Auth: token ou JWT.
 */
router.post("/:slug/notifications/send", async (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const { title, message } = req.body || {};
  const body = (message || "").trim();
  if (!body) {
    return res.status(400).json({ error: "Le message est obligatoire" });
  }
  const webSubscriptions = getWebPushSubscriptionsByBusiness(business.id);
  const passKitTokens = getPassKitPushTokensForBusiness(business.id);
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
  const payload = { title: (title || business.organization_name || "Myfidpass").trim(), body };
  const broadcastText = payload.title ? `${payload.title}: ${body}` : body;
  setLastBroadcastMessage(business.id, broadcastText);
  // Montage : même flux que l’ajout de points — toucher last_visit_at de chaque membre Wallet pour que le pass soit « modifié » et que l’iPhone refetch + affiche la notif
  const touchedMembers = new Set();
  for (const row of passKitTokens) {
    if (row.serial_number && !touchedMembers.has(row.serial_number)) {
      touchMemberLastVisit(row.serial_number);
      touchedMembers.add(row.serial_number);
    }
  }
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

/**
 * GET /api/businesses/:slug/notifications/stats
 * Nombre d'appareils pouvant recevoir les notifications (Web Push + Apple Wallet).
 */
router.get("/:slug/notifications/stats", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
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
    /** Pourquoi "Membres" affiche des gens mais "Notifications" affiche 0 appareil */
    membersVsDevicesExplanation: membersCount > 0 && subscriptionsCount === 0
      ? "Les membres apparaissent dès que le client remplit le formulaire (nom, email) et crée sa carte. Les « appareils » pour les notifications sont enregistrés par l’iPhone lui‑même quand le client ajoute le pass au Wallet — c’est Apple qui doit appeler notre serveur. Si cet appel n’arrive pas (réglages iPhone, réseau, certificat), le compteur reste à 0 alors que le membre est bien en base."
      : null,
  });
});

/**
 * GET /api/businesses/:slug/notifications/test-passkit
 * Retourne une commande curl pour tester si l'API d'enregistrement PassKit répond (diagnostic).
 */
router.get("/:slug/notifications/test-passkit", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
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

/**
 * POST /api/businesses/:slug/notifications/remove-test-device
 * Supprime l'appareil de test (curl) pour ce commerce.
 */
router.post("/:slug/notifications/remove-test-device", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const removed = removeTestPassKitDevices(business.id);
  res.json({ ok: true, removed, message: removed ? "Appareil de test supprimé." : "Aucun appareil de test à supprimer." });
});

/**
 * GET /api/businesses/:slug/integration/lookup
 * Intégration bornes / caisses : consulter un membre à partir du code-barres scanné.
 * Query: barcode (valeur lue = member id). Auth: token ou JWT.
 */
router.get("/:slug/integration/lookup", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token ou authentification requis" });
  }
  const barcode = (req.query.barcode || "").trim();
  if (!barcode) return res.status(400).json({ error: "Paramètre barcode requis" });
  const member = getMemberForBusiness(barcode, business.id);
  if (!member) {
    return res.status(404).json({ error: "Code non reconnu", code: "MEMBER_NOT_FOUND" });
  }
  res.json({
    member: {
      id: member.id,
      name: member.name,
      email: member.email,
      points: member.points,
      last_visit_at: member.last_visit_at || null,
    },
  });
});

/**
 * POST /api/businesses/:slug/integration/scan
 * Intégration bornes / caisses : un seul appel = scan + crédit de points.
 * Body: { barcode, amount_eur?, visit?, points? }. Auth: token ou JWT.
 * Le code-barres Fidpass contient l'identifiant membre (UUID).
 */
router.post("/:slug/integration/scan", async (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token ou authentification requis" });
  }
  const barcode = (req.body?.barcode || "").trim();
  if (!barcode) {
    return res.status(400).json({ error: "Champ barcode requis", code: "BARCODE_MISSING" });
  }
  const member = getMemberForBusiness(barcode, business.id);
  if (!member) {
    return res.status(404).json({
      error: "Code non reconnu pour ce commerce",
      code: "MEMBER_NOT_FOUND",
    });
  }
  const pointsDirect = Number(req.body?.points);
  const amountEur = Number(req.body?.amount_eur);
  const visit = req.body?.visit === true;
  const perEuro = Number(business.points_per_euro) || 1;
  const perVisit = Number(business.points_per_visit) || 0;
  let points = 0;
  if (Number.isInteger(pointsDirect) && pointsDirect > 0) points += pointsDirect;
  if (!Number.isNaN(amountEur) && amountEur > 0) points += Math.floor(amountEur * perEuro);
  if (visit && perVisit > 0) points += perVisit;
  if (points <= 0) {
    return res.status(400).json({
      error: "Indiquez amount_eur, visit: true, ou points. Règles : " + perEuro + " pt/€, " + perVisit + " pt/passage.",
      code: "NO_POINTS_SPECIFIED",
    });
  }
  const updated = addPoints(member.id, points);
  createTransaction({
    businessId: business.id,
    memberId: member.id,
    type: "points_add",
    points,
    metadata: amountEur > 0 || visit ? { amount_eur: amountEur || undefined, visit, source: "integration" } : { source: "integration" },
  });
  const tokens = getPushTokensForMember(member.id);
  if (tokens.length > 0) {
    console.log("[PassKit] Après scan: envoi push à", tokens.length, "appareil(s) pour membre", member.id.slice(0, 8) + "...");
    for (const token of tokens) {
      const result = await sendPassKitUpdate(token);
      if (result.sent) {
        console.log("[PassKit] Push envoyée OK (scan) pour membre", member.id.slice(0, 8) + "...");
      } else {
        console.warn("[PassKit] Push refusée (scan):", result.error || "inconnu");
      }
    }
  }
  res.json({
    member: {
      id: updated.id,
      name: member.name,
      email: member.email,
      points: updated.points,
    },
    points_added: points,
    new_balance: updated.points,
  });
});

/**
 * GET /api/businesses/:slug/logo
 * Logo du commerce (pour affichage dans le dashboard). Token ou JWT requis.
 */
router.get("/:slug/logo", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  if (business.logo_base64) {
    const base64Data = String(business.logo_base64).replace(/^data:image\/\w+;base64,/, "");
    const buf = Buffer.from(base64Data, "base64");
    if (buf.length > 0) {
      const isPng = business.logo_base64.includes("image/png");
      res.setHeader("Content-Type", isPng ? "image/png" : "image/jpeg");
      res.setHeader("Cache-Control", "private, max-age=3600");
      return res.send(buf);
    }
  }
  return res.status(404).send();
});

/**
 * GET /api/businesses/:slug
 * Infos publiques d'une entreprise (pour la page d'inscription).
 */
router.get("/:slug", (req, res) => {
  let business = getBusinessBySlug(req.params.slug);
  if (!business && req.params.slug === "demo") {
    business = ensureDefaultBusiness();
  }
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  res.json({
    id: business.id,
    name: business.name,
    slug: business.slug,
    organizationName: business.organization_name,
    backgroundColor: business.background_color ?? undefined,
    foregroundColor: business.foreground_color ?? undefined,
    labelColor: business.label_color ?? undefined,
  });
});

/**
 * POST /api/businesses/:slug/members
 * Créer un membre (carte fidélité) pour cette entreprise.
 * Body: { email, name }
 */
router.post("/:slug/members", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });

  const { email, name } = req.body || {};
  if (!email || !name) {
    return res.status(400).json({ error: "email et name requis" });
  }

  try {
    const member = createMember({
      id: randomUUID(),
      businessId: business.id,
      email: email.trim(),
      name: name.trim(),
    });
    res.status(201).json({
      memberId: member.id,
      member: {
        id: member.id,
        email: member.email,
        name: member.name,
        points: member.points,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur création membre" });
  }
});

/**
 * GET /api/businesses/:slug/members/:memberId
 * Infos d'un membre (vérifie qu'il appartient à cette entreprise).
 */
router.get("/:slug/members/:memberId", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });

  const member = getMemberForBusiness(req.params.memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });

  res.json({
    id: member.id,
    email: member.email,
    name: member.name,
    points: member.points,
    last_visit_at: member.last_visit_at || null,
  });
});

/**
 * POST /api/businesses/:slug/members/:memberId/points
 * Ajouter des points (caisse). Nécessite token ou JWT propriétaire.
 */
router.post("/:slug/members/:memberId/points", async (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Accès non autorisé" });
  }

  const member = getMemberForBusiness(req.params.memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });

  const pointsDirect = Number(req.body?.points);
  const amountEur = Number(req.body?.amount_eur);
  const visit = req.body?.visit === true;
  const perEuro = Number(business.points_per_euro) || 1;
  const perVisit = Number(business.points_per_visit) || 0;

  let points = 0;
  if (Number.isInteger(pointsDirect) && pointsDirect > 0) {
    points += pointsDirect;
  }
  if (!Number.isNaN(amountEur) && amountEur > 0) {
    points += Math.floor(amountEur * perEuro);
  }
  if (visit && perVisit > 0) {
    points += perVisit;
  }

  if (points <= 0) {
    return res.status(400).json({
      error: "Indiquez points, amount_eur (montant en €), ou visit: true (1 passage). Règles: " + perEuro + " pt/€, " + perVisit + " pt/passage.",
    });
  }

  const updated = addPoints(member.id, points);
  createTransaction({
    businessId: business.id,
    memberId: member.id,
    type: "points_add",
    points,
    metadata: amountEur > 0 || visit ? { amount_eur: amountEur || undefined, visit } : undefined,
  });
  const tokens = getPushTokensForMember(member.id);
  if (tokens.length > 0) {
    console.log("[PassKit] Après points: envoi push à", tokens.length, "appareil(s) pour membre", member.id.slice(0, 8) + "...");
    for (const token of tokens) {
      const result = await sendPassKitUpdate(token);
      if (result.sent) {
        console.log("[PassKit] Push envoyée OK (points) pour membre", member.id.slice(0, 8) + "...");
      } else {
        console.warn("[PassKit] Push refusée (points):", result.error || "inconnu");
      }
    }
  } else {
    console.log("[PassKit] Aucun appareil enregistré pour ce membre — pas de push après points.");
  }
  res.json({
    id: updated.id,
    points: updated.points,
    points_added: points,
  });
});

/**
 * GET /api/businesses/:slug/members/:memberId/pass
 * Télécharger le .pkpass pour ce membre (carte aux couleurs de l'entreprise).
 */
router.get("/:slug/members/:memberId/pass", async (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });

  const member = getMemberForBusiness(req.params.memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });

  const template = req.query.template || "classic";

  try {
    const buffer = await generatePass(member, business, { template });
    const filename = `fidelity-${business.slug}-${member.id.slice(0, 8)}.pkpass`;
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    // "inline" permet à Safari sur iOS d'ouvrir le pass directement dans Wallet au lieu de tenter un téléchargement
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error("Génération pass:", err);
    res.status(500).json({
      error: "Impossible de générer la carte. Vérifiez les certificats (voir docs/APPLE-WALLET-SETUP.md).",
      detail: err.message,
    });
  }
});

/**
 * GET /api/businesses/:slug/members/:memberId/google-wallet-url
 * Retourne l'URL "Add to Google Wallet" pour ce membre (Android).
 * 200 { url } ou 503 si Google Wallet non configuré.
 */
router.get("/:slug/members/:memberId/google-wallet-url", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });

  const member = getMemberForBusiness(req.params.memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });

  const frontendOrigin = req.get("Origin") || req.get("Referer")?.replace(/\/[^/]*$/, "") || process.env.FRONTEND_URL;
  const result = getGoogleWalletSaveUrl(member, business, frontendOrigin);
  if (!result) {
    return res.status(503).json({
      error: "Google Wallet non configuré",
      code: "google_wallet_unavailable",
    });
  }
  res.json(result);
});

/**
 * POST /api/businesses (création d'une entreprise — compte et abonnement requis)
 * Body: { name, slug, organizationName?, backTerms?, backContact?, backgroundColor?, foregroundColor?, labelColor?, logoBase64? }
 */
router.post("/", requireAuth, (req, res) => {
  const {
    name,
    slug,
    organizationName,
    backTerms,
    backContact,
    backgroundColor,
    foregroundColor,
    labelColor,
    logoBase64,
  } = req.body || {};
  if (!name || !slug) {
    return res.status(400).json({ error: "name et slug requis" });
  }
  const devBypass =
    process.env.DEV_BYPASS_PAYMENT === "true" && req.get("X-Dev-Bypass-Payment") === "1";
  if (!devBypass && !canCreateBusiness(req.user.id)) {
    return res.status(403).json({
      error: "Abonnement requis ou limite de cartes atteinte",
      code: "subscription_required",
    });
  }
  const normalizedSlug = String(slug).trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  if (!normalizedSlug) return res.status(400).json({ error: "slug invalide" });

  if (getBusinessBySlug(normalizedSlug)) {
    return res.status(409).json({ error: "Une entreprise avec ce slug existe déjà" });
  }

  const userId = req.user.id;

  try {
    const business = createBusiness({
      name: name.trim(),
      slug: normalizedSlug,
      organizationName: (organizationName || name).trim(),
      backTerms: backTerms ? String(backTerms).trim() : null,
      backContact: backContact ? String(backContact).trim() : null,
      backgroundColor: normalizeHex(backgroundColor),
      foregroundColor: normalizeHex(foregroundColor),
      labelColor: normalizeHex(labelColor),
      userId,
    });
    const dir = join(businessAssetsDir, business.id);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    if (logoBase64 && typeof logoBase64 === "string") {
      const base64Data = logoBase64.replace(/^data:image\/\w+;base64,/, "");
      try {
        const buf = Buffer.from(base64Data, "base64");
        if (buf.length > 0 && buf.length < 5 * 1024 * 1024) {
          writeFileSync(join(dir, "logo.png"), buf);
          writeFileSync(join(dir, "logo@2x.png"), buf);
        }
      } catch (err) {
        console.warn("Logo save failed:", err.message);
      }
    }

    const baseUrl = process.env.FRONTEND_URL || "https://myfidpass.fr";
    const dashboardUrl = `${baseUrl.replace(/\/$/, "")}/dashboard?slug=${business.slug}&token=${business.dashboard_token}`;

    res.status(201).json({
      id: business.id,
      name: business.name,
      slug: business.slug,
      organizationName: business.organization_name,
      link: `/fidelity/${business.slug}`,
      assetsPath: `backend/assets/businesses/${business.id}/`,
      dashboardUrl,
      dashboardToken: business.dashboard_token,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur création entreprise" });
  }
});

function normalizeHex(value) {
  if (!value || typeof value !== "string") return null;
  const v = value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v;
  if (/^[0-9A-Fa-f]{6}$/.test(v)) return `#${v}`;
  return null;
}

/**
 * PATCH /api/businesses/:slug — Mise à jour design (couleurs, dos, logo) — token ou JWT propriétaire.
 * Body: { organizationName?, backTerms?, backContact?, backgroundColor?, foregroundColor?, labelColor?, logoBase64? }
 */
router.patch("/:slug", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const {
    organizationName,
    backTerms,
    backContact,
    backgroundColor,
    foregroundColor,
    labelColor,
    logoBase64,
    locationLat,
    locationLng,
    locationRelevantText,
    locationRadiusMeters,
  } = req.body || {};
  const updates = {};
  if (organizationName !== undefined) updates.organization_name = organizationName ? String(organizationName).trim() : null;
  if (backTerms !== undefined) updates.back_terms = backTerms ? String(backTerms).trim() : null;
  if (backContact !== undefined) updates.back_contact = backContact ? String(backContact).trim() : null;
  if (backgroundColor !== undefined) updates.background_color = normalizeHex(backgroundColor);
  if (foregroundColor !== undefined) updates.foreground_color = normalizeHex(foregroundColor);
  if (labelColor !== undefined) updates.label_color = normalizeHex(labelColor);
  if (locationLat !== undefined) updates.location_lat = locationLat === null || locationLat === "" ? null : Number(locationLat);
  if (locationLng !== undefined) updates.location_lng = locationLng === null || locationLng === "" ? null : Number(locationLng);
  if (locationRelevantText !== undefined) updates.location_relevant_text = locationRelevantText ? String(locationRelevantText).trim() : null;
  if (locationRadiusMeters !== undefined) updates.location_radius_meters = locationRadiusMeters === null || locationRadiusMeters === "" ? null : Math.min(2000, Math.max(0, Number(locationRadiusMeters) || 500));
  if (logoBase64 !== undefined && logoBase64 !== null && typeof logoBase64 === "string") {
    const base64Data = logoBase64.replace(/^data:image\/\w+;base64,/, "");
    const buf = Buffer.from(base64Data, "base64");
    if (buf.length === 0 || buf.length > 4 * 1024 * 1024) {
      return res.status(400).json({ error: "Logo invalide ou trop volumineux (max 4 Mo)." });
    }
    updates.logo_base64 = logoBase64;
  }

  const updated = updateBusiness(business.id, updates);
  if (!updated) return res.status(500).json({ error: "Erreur mise à jour" });

  res.json({
    id: updated.id,
    name: updated.name,
    slug: updated.slug,
    organizationName: updated.organization_name,
    backgroundColor: updated.background_color ?? undefined,
    foregroundColor: updated.foreground_color ?? undefined,
    labelColor: updated.label_color ?? undefined,
    locationLat: updated.location_lat != null ? Number(updated.location_lat) : undefined,
    locationLng: updated.location_lng != null ? Number(updated.location_lng) : undefined,
    locationRelevantText: updated.location_relevant_text ?? undefined,
    locationRadiusMeters: updated.location_radius_meters != null ? Number(updated.location_radius_meters) : undefined,
  });
});

export default router;
