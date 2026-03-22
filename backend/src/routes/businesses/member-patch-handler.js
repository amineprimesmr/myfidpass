/**
 * PATCH membre : nom, téléphone, ville, date de naissance (dashboard).
 * Push Wallet si champs visibles sur le pass changent.
 */
import {
  getMemberForBusiness,
  updateMember,
  getPushTokensForMember,
  businessUsesTicketBonuses,
} from "../../db.js";
import { sendPassKitUpdate } from "../../apns.js";
import { canAccessDashboard } from "./shared.js";

export async function patchMemberProfile(req, res) {
  const business = req.business;
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Accès non autorisé" });
  }
  const member = getMemberForBusiness(req.params.memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });

  const body = req.body || {};
  const updatePayload = {};
  if (body.name !== undefined) {
    const n = String(body.name ?? "").trim();
    if (!n) return res.status(400).json({ error: "Le nom ne peut pas être vide." });
    updatePayload.name = n;
  }
  if (body.phone !== undefined) {
    updatePayload.phone =
      body.phone === "" || body.phone == null ? null : String(body.phone).trim();
  }
  if (body.city !== undefined) {
    updatePayload.city =
      body.city === "" || body.city == null ? null : String(body.city).trim();
  }
  const bd = body.birth_date ?? body.birthDate;
  if (bd !== undefined) {
    updatePayload.birth_date = bd === "" || bd == null ? null : String(bd).trim();
  }

  if (Object.keys(updatePayload).length === 0) {
    return res.status(400).json({
      error: "Indiquez au moins un champ : name, phone, city, birth_date.",
    });
  }

  const updated = updateMember(member.id, updatePayload);
  if (!updated) return res.status(404).json({ error: "Membre introuvable" });

  const tokens = getPushTokensForMember(member.id);
  for (const token of tokens) {
    try {
      await sendPassKitUpdate(token);
    } catch (_) {
      /* ignore */
    }
  }

  res.json({
    id: updated.id,
    email: updated.email,
    name: updated.name,
    points: updated.points,
    last_visit_at: updated.last_visit_at || null,
    phone: updated.phone || null,
    city: updated.city || null,
    birth_date: updated.birth_date || null,
    profile_ticket_eligible: businessUsesTicketBonuses(business.id),
    profile_bonus_claimed: Number(updated.profile_ticket_bonus_granted) === 1,
  });
}
