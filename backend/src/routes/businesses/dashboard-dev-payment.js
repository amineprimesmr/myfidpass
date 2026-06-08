/**
 * Route de simulation de paiement — dev/test uniquement.
 * POST   /dashboard/dev-simulate-payment  → active l'abonnement fictif
 * DELETE /dashboard/dev-simulate-payment  → désactive l'abonnement fictif
 */
import { Router } from "express";
import { checkDashboardIdentity } from "./shared.js";
import { getBusinessBySlug } from "../../db.js";
import { getDefaultAllowedBusinessesFromLegacyPlan, getSubscriptionByUserId } from "../../db/subscriptions.js";
import { getDb } from "../../db/connection.js";
import { getUserById, isUserAdmin } from "../../db/users.js";
import {
  DEV_SIMULATED_SUB_ID,
  simulateMerchantEntitlementForUser,
} from "../../lib/simulate-merchant-entitlement.js";

const router = Router({ mergeParams: true });

import { isProductionEnvironment } from "../../lib/production-env.js";

router.use((req, res, next) => {
  if (!isProductionEnvironment()) return next();
  const dbUser = req.user?.id ? getUserById(req.user.id) : null;
  if (isUserAdmin(dbUser)) return next();
  return res.status(404).json({ error: "Not found" });
});

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
  const simulated = !!(sub && sub.stripe_subscription_id === DEV_SIMULATED_SUB_ID);
  const active = !!(sub && ["active", "trialing", "past_due"].includes(String(sub.status || "").toLowerCase()));
  return res.json({ simulated, active, status: sub?.status || null });
});

router.post("/", (req, res) => {
  const ctx = ensureOwner(req, res);
  if (!ctx) return;

  const requestedSlots = Math.floor(Number(req.body?.allowed_businesses ?? req.body?.allowedBusinesses) || 0);
  const allowedBusinesses =
    requestedSlots >= 1 && requestedSlots <= 5
      ? requestedSlots
      : isUserAdmin(req.user)
        ? 5
        : getDefaultAllowedBusinessesFromLegacyPlan("starter");
  return res.json(simulateMerchantEntitlementForUser(ctx.userId, allowedBusinesses));
});

router.delete("/", (req, res) => {
  const ctx = ensureOwner(req, res);
  if (!ctx) return;

  const sub = getSubscriptionByUserId(ctx.userId);
  if (sub && sub.stripe_subscription_id === DEV_SIMULATED_SUB_ID) {
    const db = getDb();
    db.prepare("DELETE FROM subscriptions WHERE user_id = ? AND stripe_subscription_id = ?")
      .run(ctx.userId, DEV_SIMULATED_SUB_ID);
  }

  return res.json({ ok: true, removed: true });
});

export default router;
