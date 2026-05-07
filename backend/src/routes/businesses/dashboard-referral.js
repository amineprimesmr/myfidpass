/**
 * GET /:slug/dashboard/referral — infos de parrainage du commerçant connecté.
 * Accès : abonnement actif requis (pas pendant l'essai gratuit).
 */
import { Router } from "express";
import { ensureDashboardAccess } from "./shared.js";
import { hasStripeBackedActiveSubscription } from "../../db/subscriptions.js";
import { getOrCreateReferralCode, getReferralInfo } from "../../db/referrals.js";

const router = Router({ mergeParams: true });

const SITE_URL = (process.env.APP_SITE_URL || process.env.FRONTEND_URL || "").replace(/\/$/, "");

router.get("/", ensureDashboardAccess, (req, res) => {
  const userId = req.user?.id ? String(req.user.id) : null;
  if (!userId) return res.status(401).json({ error: "Non authentifié" });

  if (!hasStripeBackedActiveSubscription(userId)) {
    return res.status(403).json({
      error: "Le parrainage est disponible dès votre premier mois à 1 €.",
      code: "subscription_required",
    });
  }

  try {
    const code = getOrCreateReferralCode(userId);
    const info = getReferralInfo(userId);
    const base = SITE_URL || `${req.protocol}://${req.get("host")}`;
    return res.json({
      code,
      referral_url: `${base}/?ref=${code}`,
      total_referrals: info.total,
      converted_referrals: info.converted,
      discounts: info.discounts,
    });
  } catch (err) {
    console.error("[dashboard/referral] error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
