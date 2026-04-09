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

export default router;
