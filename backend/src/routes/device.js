import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { upsertMerchantDeviceToken, hasActiveSubscription } from "../db.js";
import { devPaymentBypass } from "../lib/dev-payment-bypass.js";

const router = Router();

/**
 * POST /api/device/register
 * Enregistre le token APNs de l'app commerçant (iOS). Body: { device_token }.
 * Auth: Bearer JWT requis.
 */
router.post("/register", requireAuth, (req, res) => {
  if (!devPaymentBypass(req) && !hasActiveSubscription(req.user.id)) {
    return res.status(403).json({
      error: "Abonnement actif requis pour utiliser cette fonctionnalité.",
      code: "subscription_required",
    });
  }
  const token = req.body?.device_token ?? req.body?.deviceToken ?? "";
  if (!token || typeof token !== "string" || !token.trim()) {
    return res.status(400).json({ error: "device_token requis" });
  }
  upsertMerchantDeviceToken(req.user.id, token.trim());
  res.status(204).send();
});

export default router;
