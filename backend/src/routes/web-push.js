import { Router } from "express";
import { getBusinessBySlug, getMemberForBusiness, saveWebPushSubscription } from "../db.js";
import { getVapidPublicKey } from "../notifications.js";

const router = Router();

/**
 * GET /api/web-push/vapid-public
 * Retourne la clé publique VAPID pour que le front puisse s'abonner aux push.
 */
router.get("/vapid-public", (req, res) => {
  const key = getVapidPublicKey();
  if (!key) return res.status(503).json({ error: "Notifications non configurées" });
  res.json({ publicKey: key });
});

/**
 * POST /api/web-push/subscribe
 * Enregistre une subscription Web Push pour un membre (page fidélité après inscription).
 * Body: { slug, memberId, subscription: { endpoint, keys: { p256dh, auth } } }
 */
router.post("/subscribe", (req, res) => {
  const { slug, memberId, subscription } = req.body || {};
  if (!slug || !memberId || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return res.status(400).json({ error: "slug, memberId et subscription (endpoint, keys) requis" });
  }
  const business = getBusinessBySlug(slug);
  if (!business) return res.status(404).json({ error: "Commerce introuvable" });
  const member = getMemberForBusiness(memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable pour ce commerce" });
  try {
    saveWebPushSubscription({
      businessId: business.id,
      memberId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("web-push subscribe:", err);
    res.status(500).json({ error: "Impossible d'enregistrer l'abonnement" });
  }
});

export default router;
