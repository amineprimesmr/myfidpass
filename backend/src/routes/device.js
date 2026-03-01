import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { upsertMerchantDeviceToken } from "../db.js";

const router = Router();

/**
 * POST /api/device/register
 * Enregistre le token APNs de l'app commerçant (iOS). Body: { device_token }.
 * Auth: Bearer JWT requis.
 */
router.post("/register", requireAuth, (req, res) => {
  const token = req.body?.device_token ?? req.body?.deviceToken ?? "";
  if (!token || typeof token !== "string" || !token.trim()) {
    return res.status(400).json({ error: "device_token requis" });
  }
  upsertMerchantDeviceToken(req.user.id, token.trim());
  res.status(204).send();
});

export default router;
