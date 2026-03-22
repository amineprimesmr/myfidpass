/**
 * POST /:memberId/profile-complete — bonus ticket + infos pour le commerce.
 * Fichier séparé : members.js dépasse la limite de lignes (REFONTE-REGLES.md).
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { completeMemberProfileForTicket, businessUsesTicketBonuses } from "../../db.js";

const router = Router();

const profileBonusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Trop de tentatives. Réessayez dans 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { forwardedHeader: false },
});

router.post("/:memberId/profile-complete", profileBonusLimiter, (req, res) => {
  const business = req.business;
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });

  const memberId = req.params.memberId;
  const body = req.body || {};
  const result = completeMemberProfileForTicket(business.id, memberId, {
    phone: body.phone,
    city: body.city,
    birth_date: body.birth_date ?? body.birthDate,
  });

  if (result.error) {
    const code = result.code === "NOT_FOUND" ? 404 : 400;
    return res.status(code).json({ error: result.error, code: result.code });
  }

  return res.status(200).json({
    ok: true,
    ticket_granted: result.ticket_granted,
    already_done: result.already_done,
    member: {
      id: result.member.id,
      email: result.member.email,
      name: result.member.name,
      points: result.member.points,
      phone: result.member.phone || null,
      city: result.member.city || null,
      birth_date: result.member.birth_date || null,
      profile_bonus_claimed: Number(result.member.profile_ticket_bonus_granted) === 1,
      profile_ticket_eligible: businessUsesTicketBonuses(business.id),
    },
  });
});

export default router;
