/**
 * POST /:memberId/claim-identity — finalise un compte invité (email @guest.invalid) après le jeu.
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { claimGuestMemberIdentity, getMemberForBusiness } from "../../db.js";
import { grantWelcomeBonusIfEligible } from "../../db/welcome-bonus.js";
import { validate, schemas } from "../../lib/validate.js";
import { scheduleMerchantDashboardSyncForBusiness } from "../../lib/merchant-dashboard-sync-push.js";

const router = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Trop de tentatives. Réessayez dans 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { forwardedHeader: false },
});

router.post("/:memberId/claim-identity", limiter, validate(schemas.claimGuestIdentity), (req, res) => {
  const business = req.business;
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });

  const memberId = String(req.params.memberId || "").trim();
  const { name, email } = req.body || {};
  const result = claimGuestMemberIdentity(business.id, memberId, { name, email });

  if (result.ok) {
    const welcome_bonus_granted = grantWelcomeBonusIfEligible(business, memberId, {
      source: "web_qr_claim",
    });
    const fresh = getMemberForBusiness(memberId, business.id) || result.member;
    try {
      scheduleMerchantDashboardSyncForBusiness(business.id, "member_updated");
    } catch (_) {}
    return res.status(200).json({
      ok: true,
      member: {
        id: fresh.id,
        email: fresh.email,
        name: fresh.name,
        points: fresh.points,
      },
      welcome_bonus_granted: welcome_bonus_granted ?? undefined,
    });
  }

  const code = result.code || "ERROR";
  const status =
    code === "NOT_FOUND" ? 404 : code === "EMAIL_TAKEN" || code === "VALIDATION" ? 400 : code === "NOT_GUEST" ? 409 : 400;
  return res.status(status).json({ error: result.error, code });
});

export default router;
