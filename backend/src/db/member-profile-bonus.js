/**
 * Bonus ticket ou tampon après complétion du profil (téléphone, ville, date de naissance).
 */
import { getDb } from "./connection.js";
import { getMemberForBusiness, updateMember, addStampsWithCycleRollover } from "./members.js";
import { getBusinessById, resolveBusinessProgramType } from "./businesses.js";
import { businessUsesTicketBonuses, addTicketsForProfileComplete } from "./games-helpers.js";
import { validateMemberProfilePayload } from "../lib/member-profile-validation.js";

/** Tickets crédités en mode points + roue (historique produit). */
export const PROFILE_COMPLETE_TICKET_BONUS = 5;
/** Tampons crédités directement sur la carte en mode tampons. */
export const PROFILE_COMPLETE_STAMP_BONUS = 1;

/**
 * @param {string} businessId
 * @param {string} memberId
 * @param {{ phone?: string, city?: string, birth_date?: string }} payload
 * @returns {{ error: string, code?: string } | { member: object, ticket_granted: number, stamps_granted: number, already_done: boolean }}
 */
export function completeMemberProfileForTicket(businessId, memberId, payload) {
  const m0 = getMemberForBusiness(memberId, businessId);
  if (!m0) return { error: "Membre introuvable", code: "NOT_FOUND" };

  const v = validateMemberProfilePayload(payload);
  if (!v.ok) return { error: v.error, code: v.code || "VALIDATION" };

  const alreadyGranted = Number(m0.profile_ticket_bonus_granted) === 1;
  const business = getBusinessById(businessId);
  const programType = business ? resolveBusinessProgramType(business) : "points";
  const db = getDb();

  const run = db.transaction(() => {
    updateMember(memberId, { phone: v.phone, city: v.city, birth_date: v.birth_date });
    if (alreadyGranted) {
      return { ticket_granted: 0, stamps_granted: 0, already_done: true };
    }
    if (!businessUsesTicketBonuses(businessId)) {
      return { ticket_granted: 0, stamps_granted: 0, already_done: false };
    }
    if (programType === "stamps") {
      const cycle = Math.max(1, Math.floor(Number(business?.required_stamps) || 10));
      addStampsWithCycleRollover(memberId, PROFILE_COMPLETE_STAMP_BONUS, cycle);
      db.prepare("UPDATE members SET profile_ticket_bonus_granted = 1 WHERE id = ?").run(memberId);
      return {
        ticket_granted: 0,
        stamps_granted: PROFILE_COMPLETE_STAMP_BONUS,
        already_done: false,
      };
    }
    addTicketsForProfileComplete(businessId, memberId, PROFILE_COMPLETE_TICKET_BONUS);
    db.prepare("UPDATE members SET profile_ticket_bonus_granted = 1 WHERE id = ?").run(memberId);
    return {
      ticket_granted: PROFILE_COMPLETE_TICKET_BONUS,
      stamps_granted: 0,
      already_done: false,
    };
  });

  const { ticket_granted: ticketGranted, stamps_granted: stampsGranted, already_done: alreadyDone } = run();
  const member = getMemberForBusiness(memberId, businessId);
  return {
    member,
    ticket_granted: ticketGranted,
    stamps_granted: stampsGranted,
    already_done: alreadyDone,
  };
}
