/**
 * Bonus ticket après complétion du profil (téléphone, ville, date de naissance).
 */
import { getDb } from "./connection.js";
import { getMemberForBusiness, updateMember } from "./members.js";
import { businessUsesTicketBonuses, addTicketsForProfileComplete } from "./games-helpers.js";
import { validateMemberProfilePayload } from "../lib/member-profile-validation.js";

/**
 * @param {string} businessId
 * @param {string} memberId
 * @param {{ phone?: string, city?: string, birth_date?: string }} payload
 * @returns {{ error: string, code?: string } | { member: object, ticket_granted: number, already_done: boolean }}
 */
export function completeMemberProfileForTicket(businessId, memberId, payload) {
  const m0 = getMemberForBusiness(memberId, businessId);
  if (!m0) return { error: "Membre introuvable", code: "NOT_FOUND" };

  const v = validateMemberProfilePayload(payload);
  if (!v.ok) return { error: v.error, code: v.code || "VALIDATION" };

  const alreadyGranted = Number(m0.profile_ticket_bonus_granted) === 1;
  const db = getDb();

  const run = db.transaction(() => {
    updateMember(memberId, { phone: v.phone, city: v.city, birth_date: v.birth_date });
    if (alreadyGranted) {
      return { ticket_granted: 0, already_done: true };
    }
    if (businessUsesTicketBonuses(businessId)) {
      addTicketsForProfileComplete(businessId, memberId, 1);
      db.prepare("UPDATE members SET profile_ticket_bonus_granted = 1 WHERE id = ?").run(memberId);
      return { ticket_granted: 1, already_done: false };
    }
    return { ticket_granted: 0, already_done: false };
  });

  const { ticket_granted: ticketGranted, already_done: alreadyDone } = run();
  const member = getMemberForBusiness(memberId, businessId);
  return { member, ticket_granted: ticketGranted, already_done: alreadyDone };
}
