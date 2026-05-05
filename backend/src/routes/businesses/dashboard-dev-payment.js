/**
 * Route de simulation de paiement — dev/test uniquement.
 * POST   /dashboard/dev-simulate-payment  → active l'abonnement fictif
 * DELETE /dashboard/dev-simulate-payment  → désactive l'abonnement fictif
 */
import { Router } from "express";
import { checkDashboardIdentity } from "./shared.js";
import { getBusinessBySlug } from "../../db.js";
import { createOrUpdateSubscription, getSubscriptionByUserId } from "../../db/subscriptions.js";
import { getDb } from "../../db/connection.js";

const router = Router({ mergeParams: true });

const DEV_SUB_ID = "dev_simulated";

function ensureOwner(req, res) {
  const business = getBusinessBySlug(req.params.slug);
  const r = checkDashboardIdentity(business, req);
  if (r !== "ok") {
    res.status(r === "no_business" ? 404 : 401).json({ error: "Accès refusé" });
    return null;
  }
  if (!req.user?.id) {
    res.status(401).json({ error: "Authentification requise" });
    return null;
  }
  return { business, userId: String(req.user.id) };
}

router.get("/", (req, res) => {
  const ctx = ensureOwner(req, res);
  if (!ctx) return;
  const sub = getSubscriptionByUserId(ctx.userId);
  const simulated = !!(sub && sub.stripe_subscription_id === DEV_SUB_ID);
  const active = !!(sub && ["active", "trialing", "past_due"].includes(String(sub.status || "").toLowerCase()));
  return res.json({ simulated, active, status: sub?.status || null });
});

router.post("/", (req, res) => {
  const ctx = ensureOwner(req, res);
  if (!ctx) return;

  createOrUpdateSubscription({
    userId: ctx.userId,
    stripeCustomerId: "cus_dev_simulated",
    stripeSubscriptionId: DEV_SUB_ID,
    planId: "starter",
    status: "active",
    currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  });

  const sub = getSubscriptionByUserId(ctx.userId);
  return res.json({ ok: true, status: sub?.status, simulated: true });
});

router.delete("/", (req, res) => {
  const ctx = ensureOwner(req, res);
  if (!ctx) return;

  const sub = getSubscriptionByUserId(ctx.userId);
  if (sub && sub.stripe_subscription_id === DEV_SUB_ID) {
    const db = getDb();
    db.prepare("DELETE FROM subscriptions WHERE user_id = ? AND stripe_subscription_id = ?")
      .run(ctx.userId, DEV_SUB_ID);
  }

  return res.json({ ok: true, removed: true });
});

export default router;
