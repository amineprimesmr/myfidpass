/**
 * API administration plateforme (liste comptes, commerces, journal paiements).
 * Accès : JWT + `users.is_admin` (promotion via bootstrap one-shot, script CLI ou `ADMIN_EMAILS` au démarrage).
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware/auth.js";
import { requirePlatformAdmin } from "../middleware/admin.js";
import {
  countPlatformAdmins,
  ensurePlatformAdminAccount,
  getUserById,
  listUsersForAdmin,
  isUserAdmin,
} from "../db/users.js";
import {
  getBusinessById,
  getBusinessForAdminById,
  getBusinessesByUserId,
  listAllBusinessesForAdmin,
} from "../db/businesses.js";
import { isOrphanMerchantUser } from "../db/business-team.js";
import { provisionMerchantAccountByAdmin } from "../lib/admin-provision-merchant.js";
import { insertAdminEvent } from "../db/admin-events.js";
import {
  deleteBusinessCompletely,
  deleteUserAccount,
  purgeOrphanMerchantUserAccounts,
} from "../db/reset.js";
import {
  cancelBusinessSubscriptionBeforeDeletion,
  cancelPaidSubscriptionsBeforeAccountDeletion,
} from "../lib/account-deletion-billing.js";
import { invalidateAuthUserCache } from "../middleware/auth.js";
import { listAdminEvents } from "../db/admin-events.js";
import { getDb } from "../db/connection.js";
import { sendMail, isEmailConfigured } from "../email.js";
import { getQueueStats, requeueDeadJob } from "../lib/notification-job-queue.js";
import { getFlyerQueueStats } from "../lib/flyer-generation-jobs.js";
import { simulateMerchantEntitlementForUser } from "../lib/simulate-merchant-entitlement.js";

const db = getDb();
const ADMIN_DELETE_CONFIRM = "SUPPRIMER";

function adminApiBase() {
  return (process.env.PUBLIC_API_URL || process.env.API_URL || "https://api.myfidpass.fr").replace(/\/$/, "");
}

/** URLs médias commerçant pour la console admin (icône notif > logo carré > logo bandeau). */
function enrichAdminBusinessRow(row) {
  if (!row || typeof row !== "object") return row;
  const base = adminApiBase();
  const slug = encodeURIComponent(String(row.slug || ""));
  const logoUrl =
    Number(row.asset_logo_present) === 1 ? `${base}/api/businesses/${slug}/logo` : null;
  const logoIconUrl =
    Number(row.asset_logo_icon_present) === 1 ? `${base}/api/businesses/${slug}/logo-icon` : null;
  const notificationIconUrl =
    Number(row.asset_notification_icon_present) === 1
      ? `${base}/api/businesses/${slug}/notification-icon`
      : null;
  const displayLogoUrl = notificationIconUrl || logoIconUrl || logoUrl;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    organization_name: row.organization_name,
    user_id: row.user_id,
    created_at: row.created_at,
    dashboard_token: row.dashboard_token,
    owner_email: row.owner_email ?? null,
    member_count: Math.max(0, Number(row.member_count ?? 0)),
    owner_subscription_status: row.owner_subscription_status,
    owner_plan_id: row.owner_plan_id,
    logo_url: logoUrl,
    logo_updated_at: row.logo_updated_at ?? null,
    logo_icon_url: logoIconUrl,
    logo_icon_updated_at: row.logo_icon_updated_at ?? null,
    notification_icon_url: notificationIconUrl,
    notification_icon_updated_at: row.notification_icon_updated_at ?? null,
    display_logo_url: displayLogoUrl,
  };
}

const router = Router();

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: "Trop de requêtes." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { forwardedHeader: false },
});

const bootstrapLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: { error: "Trop de tentatives bootstrap admin." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { forwardedHeader: false },
});

/** Phrase interne (code source) — pas une variable Railway. Rate-limit + journalisation. */
const ADMIN_ENSURE_CONFIRM = "myfidpass-internal-admin-provision-v2026";

/**
 * POST /api/admin/ensure — crée ou met à jour un admin plateforme (sans variables d’environnement).
 * Body: { "email", "password", "name?", "confirm": "myfidpass-internal-admin-provision-v2026" }
 */
router.post("/ensure", bootstrapLimiter, (req, res) => {
  const confirm = String(req.body?.confirm ?? "").trim();
  if (confirm !== ADMIN_ENSURE_CONFIRM) {
    return res.status(403).json({ error: "Non autorisé.", code: "invalid_setup_confirm" });
  }
  const email = String(req.body?.email ?? "").trim();
  const password = String(req.body?.password ?? "");
  const name = String(req.body?.name ?? "Administrateur MyFidpass").trim() || "Administrateur MyFidpass";
  const result = ensurePlatformAdminAccount({ email, password, name });
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  console.info("[admin] ensure-platform-admin", { email: result.email, created: result.created, userId: result.userId });
  return res.status(result.created ? 201 : 200).json({
    ok: true,
    email: result.email,
    user_id: result.userId,
    created: result.created,
    password_updated: result.passwordUpdated,
    platform_admin_count: countPlatformAdmins(),
    message: "Compte administrateur prêt — connexion app : e-mail + code OTP ; API legacy : POST /api/auth/login.",
  });
});

/** GET /api/admin/bootstrap-status — indique si le bootstrap initial est encore autorisé (0 admin en base). */
router.get("/bootstrap-status", bootstrapLimiter, (_req, res) => {
  const adminCount = countPlatformAdmins();
  res.json({
    bootstrap_allowed: adminCount === 0,
    platform_admin_count: adminCount,
  });
});

/**
 * POST /api/admin/bootstrap — crée le **premier** compte admin plateforme (sans variables Railway).
 * Body: { "email": "…", "password": "…", "name": "…" } — désactivé dès qu’un admin existe.
 */
router.post("/bootstrap", bootstrapLimiter, (req, res) => {
  if (countPlatformAdmins() > 0) {
    return res.status(403).json({
      error: "Un administrateur plateforme existe déjà. Utilisez la connexion habituelle ou le script ensure-platform-admin.",
      code: "admin_bootstrap_closed",
    });
  }
  const email = String(req.body?.email ?? "").trim();
  const password = String(req.body?.password ?? "");
  const name = String(req.body?.name ?? "Administrateur").trim() || "Administrateur";
  const result = ensurePlatformAdminAccount({ email, password, name });
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(201).json({
    ok: true,
    email: result.email,
    user_id: result.userId,
    created: result.created,
    message: "Compte administrateur créé. Connectez-vous via POST /api/auth/login (app iOS ou web).",
  });
});

router.use(requireAuth, requirePlatformAdmin, adminLimiter);

/**
 * POST /api/admin/simulate-merchant-entitlement
 * Bouton TEST paywall iOS (admin) — quota multi-commerce sans Stripe / App Store.
 * Body: { allowed_businesses?: 1-5, user_id?: string }
 */
router.post("/simulate-merchant-entitlement", (req, res) => {
  const requestedSlots = Math.floor(Number(req.body?.allowed_businesses ?? req.body?.allowedBusinesses) || 0);
  const slots = requestedSlots >= 1 && requestedSlots <= 5 ? requestedSlots : 5;
  let targetUserId = String(req.body?.user_id ?? req.body?.userId ?? req.user.id).trim();
  if (!targetUserId) {
    return res.status(400).json({ error: "Compte cible introuvable" });
  }
  const target = getUserById(targetUserId);
  if (!target) {
    return res.status(404).json({ error: "Utilisateur introuvable" });
  }
  return res.json(simulateMerchantEntitlementForUser(targetUserId, slots));
});

router.get("/overview", (_req, res) => {
  try {
    const usersCount = db.prepare("SELECT COUNT(*) as c FROM users").get()?.c ?? 0;
    const businessesCount = db.prepare("SELECT COUNT(*) as c FROM businesses").get()?.c ?? 0;
    const merchantOwnersCount =
      db.prepare("SELECT COUNT(DISTINCT user_id) as c FROM businesses").get()?.c ?? 0;
    const teamMemberAccountsCount =
      db.prepare(
        `SELECT COUNT(DISTINCT m.user_id) as c
         FROM business_team_members m
         WHERE m.status = 'active'
           AND NOT EXISTS (SELECT 1 FROM businesses b WHERE b.user_id = m.user_id)`,
      ).get()?.c ?? 0;
    const platformAdminAccountsCount =
      db.prepare("SELECT COUNT(*) as c FROM users WHERE is_admin = 1").get()?.c ?? 0;
    const orphanAccountsCount =
      db.prepare(
        `SELECT COUNT(*) as c FROM users u
         WHERE COALESCE(u.is_admin, 0) = 0
           AND NOT EXISTS (SELECT 1 FROM businesses b WHERE b.user_id = u.id)
           AND NOT EXISTS (
             SELECT 1 FROM business_team_members m
             WHERE m.user_id = u.id AND m.status = 'active'
           )`,
      ).get()?.c ?? 0;
    const activeSubscriptions = db.prepare(
      `SELECT COUNT(*) as c FROM subscriptions WHERE lower(trim(status)) IN ('active','trialing','past_due')`,
    ).get()?.c ?? 0;
    res.json({
      users_count: usersCount,
      businesses_count: businessesCount,
      merchant_owners_count: merchantOwnersCount,
      team_member_accounts_count: teamMemberAccountsCount,
      platform_admin_accounts_count: platformAdminAccountsCount,
      orphan_accounts_count: orphanAccountsCount,
      active_subscriptions_count: activeSubscriptions,
    });
  } catch (e) {
    console.error("[admin] overview:", e);
    res.status(500).json({ error: "Impossible de charger les statistiques." });
  }
});

/**
 * POST /api/admin/maintenance/purge-orphan-accounts
 * Body: { "confirm": "SUPPRIMER" } — comptes sans commerce ni équipe active (hors admins).
 */
router.post("/maintenance/purge-orphan-accounts", async (req, res) => {
  const confirm = String(req.body?.confirm ?? "").trim();
  if (confirm !== ADMIN_DELETE_CONFIRM) {
    return res.status(400).json({
      error: 'Confirmation requise : body { "confirm": "SUPPRIMER" }.',
      code: "confirm_required",
    });
  }
  try {
    const candidateIds = db
      .prepare(
        `SELECT id FROM users u
         WHERE COALESCE(u.is_admin, 0) = 0
           AND NOT EXISTS (SELECT 1 FROM businesses b WHERE b.user_id = u.id)
           AND NOT EXISTS (
             SELECT 1 FROM business_team_members m
             WHERE m.user_id = u.id AND m.status = 'active'
           )`,
      )
      .all()
      .map((r) => String(r.id || "").trim())
      .filter(Boolean);
    let stripeCanceled = 0;
    let hadAppleIap = false;
    for (const uid of candidateIds) {
      const billing = await cancelPaidSubscriptionsBeforeAccountDeletion(uid);
      stripeCanceled += billing.stripeCanceled;
      hadAppleIap = hadAppleIap || billing.hadAppleIap;
    }
    const deletedUserIds = purgeOrphanMerchantUserAccounts();
    for (const uid of deletedUserIds) invalidateAuthUserCache(uid);
    console.info("[admin] purge-orphan-accounts", {
      deletedUserIds,
      byAdminId: req.user?.id,
    });
    return res.json({
      ok: true,
      deleted_user_ids: deletedUserIds,
      deleted_count: deletedUserIds.length,
      stripe_subscriptions_canceled: stripeCanceled,
      apple_subscription_remains_on_apple_id: hadAppleIap,
    });
  } catch (e) {
    console.error("[admin] purge-orphan-accounts:", e);
    return res.status(500).json({ error: "Erreur lors du nettoyage des comptes orphelins." });
  }
});

router.get("/users", (req, res) => {
  try {
    const users = listUsersForAdmin({
      limit: req.query.limit,
      offset: req.query.offset,
      q: req.query.q,
    });
    res.json({ users });
  } catch (e) {
    console.error("[admin] users:", e);
    res.status(500).json({ error: "Erreur liste utilisateurs." });
  }
});

router.get("/businesses", (req, res) => {
  try {
    const businesses = listAllBusinessesForAdmin({
      limit: req.query.limit,
      offset: req.query.offset,
      q: req.query.q,
    }).map(enrichAdminBusinessRow);
    res.json({ businesses });
  } catch (e) {
    console.error("[admin] businesses:", e);
    res.status(500).json({ error: "Erreur liste commerces." });
  }
});

/**
 * POST /api/admin/merchant-accounts
 * Crée un compte commerçant (ou réutilise l’e-mail existant) + un commerce.
 * Body: { email, business_name, owner_name?, slug?, organization_name?, password? }
 */
router.post("/merchant-accounts", async (req, res) => {
  try {
    const result = await provisionMerchantAccountByAdmin({
      email: req.body?.email,
      ownerName: req.body?.owner_name ?? req.body?.ownerName,
      businessName: req.body?.business_name ?? req.body?.businessName,
      slug: req.body?.slug,
      organizationName: req.body?.organization_name ?? req.body?.organizationName,
      password: req.body?.password,
    });
    if (!result.ok) {
      const status =
        result.code === "slug_taken" || result.code === "email_taken" ? 409 : 400;
      return res.status(status).json({ error: result.error, code: result.code });
    }

    const adminRow = getBusinessForAdminById(result.business.id);
    const businessPayload = enrichAdminBusinessRow(adminRow ?? result.business);

    insertAdminEvent({
      eventType: "admin_provision_merchant",
      payloadJson: {
        user_id: result.user?.id,
        user_created: result.user_created,
        business_id: result.business.id,
        slug: result.business.slug,
        by_admin_id: req.user?.id,
      },
    });

    console.info("[admin] provision-merchant", {
      userId: result.user?.id,
      userCreated: result.user_created,
      businessId: result.business.id,
      slug: result.business.slug,
      byAdminId: req.user?.id,
    });

    return res.status(201).json({
      ok: true,
      user_created: result.user_created,
      user: {
        id: result.user?.id,
        email: result.user?.email,
        name: result.user?.name ?? null,
      },
      business: businessPayload,
    });
  } catch (e) {
    console.error("[admin] merchant-accounts:", e);
    return res.status(500).json({ error: "Erreur lors de la création du compte commerçant." });
  }
});

router.get("/events", (req, res) => {
  try {
    const lim = Math.min(500, Math.max(1, parseInt(String(req.query.limit || "100"), 10) || 100));
    let events = listAdminEvents(lim);
    const filter = String(req.query.filter || "")
      .trim()
      .toLowerCase();
    if (filter === "payments") {
      events = events.filter((e) => String(e.event_type || "").toLowerCase().includes("stripe"));
    }
    res.json({ events });
  } catch (e) {
    console.error("[admin] events:", e);
    res.status(500).json({ error: "Erreur journal événements." });
  }
});

/**
 * POST /api/admin/test-email — envoi un e-mail de test (diagnostic Resend/SMTP).
 * Body: { "to": "vous@exemple.com" } — comptes admin plateforme uniquement.
 */
router.post("/test-email", async (req, res) => {
  if (!isEmailConfigured()) {
    return res.status(503).json({
      error: "Aucun transport e-mail (RESEND_API_KEY ou SMTP) sur ce serveur.",
      transactionalEmailReady: false,
    });
  }
  const to = String(req.body?.to || "")
    .trim()
    .toLowerCase();
  if (!to || !to.includes("@")) {
    return res.status(400).json({ error: "Body JSON : { \"to\": \"email@valide.com\" } requis." });
  }
  const subject = "Test d'envoi — MyFidpass (API admin)";
  const text =
    "Si vous recevez ce message, la chaîne Resend (ou SMTP) est opérationnelle. Vérifiez aussi les courriers indésirables.";
  const html = `<p>Si vous recevez ce message, la chaîne <strong>Resend</strong> (ou SMTP) est opérationnelle.</p><p>Pensez à vérifier les <strong>spams</strong>.</p>`;
  try {
    const r = await sendMail({ to, subject, text, html });
    return res.json({
      sent: r.sent,
      resendId: r.resendId ?? null,
      error: r.error ?? null,
      provider: r.provider ?? null,
      hints: r.sent
        ? [
            "Ouvrez Resend → Logs pour l'id ci-dessus (livraison / bounce).",
            "Sans domaine vérifié, seuls certains destinataires reçoivent (voir docs/EMAIL-TRANSACTIONNEL.md).",
          ]
        : [
            "Lire l'erreur ; souvent : domaine / expéditeur non vérifié, ou clé Resend invalide.",
            "Vérifier Railway → RESEND_API_KEY (une seule ligne, sans guillemets ni retour à la ligne).",
          ],
    });
  } catch (e) {
    console.error("[admin] test-email:", e);
    return res.status(500).json({ error: e?.message || "Échec envoi test" });
  }
});

/**
 * GET /api/admin/queues — stats temps réel des files notif/flyer pour audit/monitoring.
 */
router.get("/queues", (_req, res) => {
  try {
    res.json({
      notifications: getQueueStats(),
      flyer: getFlyerQueueStats(),
    });
  } catch (e) {
    console.error("[admin] queues:", e);
    res.status(500).json({ error: e?.message || "Impossible de lire les files" });
  }
});

/**
 * POST /api/admin/notifications/jobs/:id/requeue — relance un job campagne mort (DLQ).
 * Body vide. Utilisé par le support pour relancer une campagne échouée 4×.
 */

/**
 * DELETE /api/admin/businesses/:businessId
 * Body: { "confirm": "SUPPRIMER" } — admin plateforme uniquement (pas de ressaisie slug).
 */
router.delete("/businesses/:businessId", async (req, res) => {
  const confirm = String(req.body?.confirm ?? "").trim();
  if (confirm !== ADMIN_DELETE_CONFIRM) {
    return res.status(400).json({
      error: 'Confirmation requise : body { "confirm": "SUPPRIMER" }.',
      code: "confirm_required",
    });
  }
  const businessId = String(req.params.businessId ?? "").trim();
  if (!businessId) return res.status(400).json({ error: "Commerce introuvable." });
  const business = getBusinessById(businessId);
  if (!business) return res.status(404).json({ error: "Commerce introuvable.", code: "business_not_found" });
  const ownerId = String(business.user_id || "").trim();
  const teamUserIds = db
    .prepare("SELECT DISTINCT user_id FROM business_team_members WHERE business_id = ?")
    .all(business.id)
    .map((r) => String(r.user_id || "").trim())
    .filter(Boolean);
  try {
    const billing = await cancelBusinessSubscriptionBeforeDeletion(business.user_id, business.id);
    const deleted = deleteBusinessCompletely(business.id);
    if (!deleted) {
      return res.status(404).json({ error: "Commerce déjà supprimé.", code: "business_already_deleted" });
    }

    const deletedUserIds = [];
    const accountsToDelete = new Set();
    if (ownerId) {
      const owner = getUserById(ownerId);
      if (owner && !isUserAdmin(owner) && getBusinessesByUserId(ownerId).length === 0) {
        accountsToDelete.add(ownerId);
      }
    }
    for (const uid of teamUserIds) {
      if (uid === ownerId) continue;
      const u = getUserById(uid);
      if (!u || isUserAdmin(u)) continue;
      if (isOrphanMerchantUser(uid)) accountsToDelete.add(uid);
    }

    let stripeAccountsCanceled = billing.stripeCanceled;
    let hadAppleIap = billing.hadAppleIap;
    for (const uid of accountsToDelete) {
      const accountBilling = await cancelPaidSubscriptionsBeforeAccountDeletion(uid);
      stripeAccountsCanceled += accountBilling.stripeCanceled;
      hadAppleIap = hadAppleIap || accountBilling.hadAppleIap;
      if (deleteUserAccount(uid)) {
        invalidateAuthUserCache(uid);
        deletedUserIds.push(uid);
      }
    }

    console.info("[admin] delete-business", {
      businessId: business.id,
      slug: business.slug,
      byAdminId: req.user?.id,
      deletedUserIds,
    });
    return res.json({
      ok: true,
      deleted_business_id: business.id,
      slug: business.slug,
      deleted_user_ids: deletedUserIds,
      stripe_subscriptions_canceled: stripeAccountsCanceled,
      apple_subscription_remains_on_apple_id: hadAppleIap,
    });
  } catch (e) {
    console.error("[admin] delete-business:", e);
    return res.status(500).json({ error: "Erreur lors de la suppression du commerce." });
  }
});

/**
 * DELETE /api/admin/users/:userId
 * Body: { "confirm": "SUPPRIMER" } — admin plateforme uniquement (pas de ressaisie e-mail).
 */
router.delete("/users/:userId", async (req, res) => {
  const confirm = String(req.body?.confirm ?? "").trim();
  if (confirm !== ADMIN_DELETE_CONFIRM) {
    return res.status(400).json({
      error: 'Confirmation requise : body { "confirm": "SUPPRIMER" }.',
      code: "confirm_required",
    });
  }
  const userId = String(req.params.userId ?? "").trim();
  if (!userId) return res.status(400).json({ error: "Compte introuvable." });
  if (userId === String(req.user?.id || "")) {
    return res.status(400).json({
      error: "Utilisez la déconnexion pour quitter votre propre session admin.",
      code: "cannot_delete_self",
    });
  }
  const user = getUserById(userId);
  if (!user) return res.status(404).json({ error: "Compte introuvable.", code: "user_not_found" });
  if (isUserAdmin(user)) {
    return res.status(403).json({
      error: "Impossible de supprimer un compte administrateur plateforme.",
      code: "cannot_delete_platform_admin",
    });
  }
  try {
    const billing = await cancelPaidSubscriptionsBeforeAccountDeletion(userId);
    const deleted = deleteUserAccount(userId);
    invalidateAuthUserCache(userId);
    if (!deleted) {
      return res.status(404).json({ error: "Compte déjà supprimé.", code: "user_already_deleted" });
    }
    console.info("[admin] delete-user", { userId, email: user.email, byAdminId: req.user?.id });
    return res.json({
      ok: true,
      deleted_user_id: userId,
      stripe_subscriptions_canceled: billing.stripeCanceled,
      apple_subscription_remains_on_apple_id: billing.hadAppleIap,
    });
  } catch (e) {
    console.error("[admin] delete-user:", e);
    return res.status(500).json({ error: "Erreur lors de la suppression du compte." });
  }
});

router.post("/notifications/jobs/:id/requeue", (req, res) => {
  const jobId = String(req.params.id || "").trim();
  if (!jobId) return res.status(400).json({ error: "id manquant" });
  try {
    const ok = requeueDeadJob(jobId);
    if (!ok) return res.status(404).json({ error: "Job introuvable" });
    return res.json({ ok: true, jobId });
  } catch (e) {
    console.error("[admin] requeue:", e);
    return res.status(500).json({ error: e?.message || "Échec requeue" });
  }
});

export default router;
