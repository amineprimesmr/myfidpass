/**
 * Résolution scan / pass : membre local ou membre réseau (carte unique multi-adresses).
 */
import { getDb } from "../db/connection.js";
import { getBusinessById } from "../db/businesses.js";
import { getMember, getMemberForBusiness } from "../db/members.js";
import {
  getLoyaltyGroupMember,
  getLoyaltyGroupMemberInGroup,
  ensureLocalMemberForGroupMember,
  getEffectiveMemberPoints,
} from "../db/loyalty-groups.js";

/**
 * Résout un code scanné pour un commerce (lookup + scan caisse).
 * @returns {{ member: object, groupMember: object | null, barcodeId: string } | null}
 */
export function resolveMemberForBusinessScan(barcode, business) {
  if (!barcode || !business?.id) return null;
  const id = String(barcode).trim();
  if (!id) return null;

  let member = getMemberForBusiness(id, business.id);
  if (member) {
    return {
      member,
      groupMember: member.loyalty_group_member_id
        ? getLoyaltyGroupMember(member.loyalty_group_member_id)
        : null,
      barcodeId: member.loyalty_group_member_id || member.id,
    };
  }

  const groupId = business.loyalty_group_id;
  if (!groupId) return null;

  const groupMember = getLoyaltyGroupMemberInGroup(id, groupId);
  if (!groupMember) return null;

  member = ensureLocalMemberForGroupMember(business, groupMember);
  if (!member) return null;

  return { member, groupMember, barcodeId: groupMember.id };
}

/**
 * PassKit / génération pass : serial = member.id ou loyalty_group_member.id.
 */
export function resolveMemberBySerial(serialNumber, businessIdHint = null) {
  if (!serialNumber) return null;
  const id = String(serialNumber).trim();

  let member = getMember(id);
  if (member) {
    const business = getBusinessById(member.business_id);
    return { member, business, groupMember: member.loyalty_group_member_id ? getLoyaltyGroupMember(member.loyalty_group_member_id) : null };
  }

  const groupMember = getLoyaltyGroupMember(id);
  if (!groupMember) return null;

  if (businessIdHint) {
    const business = getBusinessById(businessIdHint);
    if (business?.loyalty_group_id === groupMember.loyalty_group_id) {
      member = ensureLocalMemberForGroupMember(business, groupMember);
      if (member) return { member, business, groupMember };
    }
  }

  const row = dbFirstLocalMemberForGroup(groupMember.id);
  if (!row) return { member: null, business: null, groupMember };
  member = getMember(row.id);
  const business = getBusinessById(row.business_id);
  return { member, business, groupMember };
}

const db = getDb();

function dbFirstLocalMemberForGroup(groupMemberId) {
  return (
    db
      .prepare(
        `SELECT id, business_id FROM members WHERE loyalty_group_member_id = ? ORDER BY created_at ASC LIMIT 1`,
      )
      .get(groupMemberId) || null
  );
}

/** Membre avec solde effectif (réseau si lié). */
export function memberWithEffectiveBalance(member) {
  if (!member) return null;
  return { ...member, points: getEffectiveMemberPoints(member) };
}

/** Remplace getMemberForBusiness quand le commerce peut faire partie d’un réseau. */
export function getMemberForBusinessOrGroup(memberId, business) {
  const direct = getMemberForBusiness(memberId, business?.id);
  if (direct) return memberWithEffectiveBalance(direct);
  const resolved = resolveMemberForBusinessScan(memberId, business);
  return resolved?.member ? memberWithEffectiveBalance(resolved.member) : null;
}
