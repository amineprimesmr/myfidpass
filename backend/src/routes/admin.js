/**
 * API administration plateforme (liste comptes, commerces, journal paiements).
 * Accès : JWT + `users.is_admin` (promotion via variable `ADMIN_EMAILS` au démarrage).
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware/auth.js";
import { requirePlatformAdmin } from "../middleware/admin.js";
import { listUsersForAdmin } from "../db/users.js";
import { listAllBusinessesForAdmin } from "../db/businesses.js";
import { listAdminEvents } from "../db/admin-events.js";
import { getDb } from "../db/connection.js";
import { sendMail, isEmailConfigured } from "../email.js";
import { getQueueStats, requeueDeadJob } from "../lib/notification-job-queue.js";
import { getFlyerQueueStats } from "../lib/flyer-generation-jobs.js";

const db = getDb();

const router = Router();

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: "Trop de requêtes." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { forwardedHeader: false },
});

router.use(requireAuth, requirePlatformAdmin, adminLimiter);

router.get("/overview", (_req, res) => {
  try {
    const usersCount = db.prepare("SELECT COUNT(*) as c FROM users").get()?.c ?? 0;
    const businessesCount = db.prepare("SELECT COUNT(*) as c FROM businesses").get()?.c ?? 0;
    const activeSubscriptions = db.prepare(
      `SELECT COUNT(*) as c FROM subscriptions WHERE lower(trim(status)) IN ('active','trialing','past_due')`,
    ).get()?.c ?? 0;
    res.json({
      users_count: usersCount,
      businesses_count: businessesCount,
      active_subscriptions_count: activeSubscriptions,
    });
  } catch (e) {
    console.error("[admin] overview:", e);
    res.status(500).json({ error: "Impossible de charger les statistiques." });
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
    });
    res.json({ businesses });
  } catch (e) {
    console.error("[admin] businesses:", e);
    res.status(500).json({ error: "Erreur liste commerces." });
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
