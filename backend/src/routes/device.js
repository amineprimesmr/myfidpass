import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { upsertMerchantDeviceToken } from "../db.js";

const router = Router();

import { classifyMerchantPushToken } from "../merchant-app-push.js";

/**
 * POST /api/device/register
 * Enregistre le token push de l'app commerçant (APNs iOS ou FCM Android). Body: { device_token }.
 * Auth: Bearer JWT requis. Freemium : autorisé sans abonnement (notifications à l’activation de l’offre).
 */
router.post("/register", requireAuth, (req, res) => {
  const token = req.body?.device_token ?? req.body?.deviceToken ?? req.body?.token ?? "";
  if (!token || typeof token !== "string" || !token.trim()) {
    return res.status(400).json({ error: "device_token requis" });
  }
  const trimmed = token.trim();
  if (classifyMerchantPushToken(trimmed) === "invalid") {
    return res.status(400).json({ error: "device_token invalide (token FCM/APNs requis)" });
  }
  upsertMerchantDeviceToken(req.user.id, trimmed);
  res.status(204).send();
});

export default router;
