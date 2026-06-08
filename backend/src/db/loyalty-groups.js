/**
 * Réseaux de fidélité partagés (ex. NBK Nord + NBK Sud = une carte, un solde).
 */
import { randomUUID } from "crypto";
import { getDb } from "./connection.js";
import { getBusinessById } from "./businesses.js";
import { nowUtcSqlWithMs } from "./datetime-sql.js";

const db = getDb();

export function getLoyaltyGroupById(id) {
  if (!id) return null;
  return db.prepare("SELECT * FROM loyalty_groups WHERE id = ?").get(id) || null;
}

export function listLoyaltyGroupsForUser(userId) {
  if (!userId) return [];
  return db
    .prepare(
      `SELECT g.*,
        (SELECT COUNT(*) FROM businesses b WHERE b.loyalty_group_id = g.id) AS business_count
       FROM loyalty_groups g
       WHERE g.owner_user_id = ?
       ORDER BY g.created_at DESC`,
    )
    .all(userId);
}

export function listBusinessesInLoyaltyGroup(groupId) {
  if (!groupId) return [];
  return db
    .prepare(
      `SELECT id, name, slug, organization_name, loyalty_group_id, program_type, required_stamps, created_at
       FROM businesses WHERE loyalty_group_id = ? ORDER BY created_at ASC`,
    )
    .all(groupId);
}

export function createLoyaltyGroup({ ownerUserId, name }) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const label = String(name || "").trim() || "Réseau fidélité";
  db.prepare(
    `INSERT INTO loyalty_groups (id, owner_user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, ownerUserId, label, now, now);
  return getLoyaltyGroupById(id);
}

export function updateLoyaltyGroupName(groupId, name) {
  const label = String(name || "").trim();
  if (!label) return getLoyaltyGroupById(groupId);
  const now = new Date().toISOString();
  db.prepare("UPDATE loyalty_groups SET name = ?, updated_at = ? WHERE id = ?").run(label, now, groupId);
  return getLoyaltyGroupById(groupId);
}

export function deleteLoyaltyGroup(groupId) {
  db.prepare("UPDATE businesses SET loyalty_group_id = NULL WHERE loyalty_group_id = ?").run(groupId);
  db.prepare("UPDATE members SET loyalty_group_member_id = NULL WHERE loyalty_group_member_id IN (SELECT id FROM loyalty_group_members WHERE loyalty_group_id = ?)").run(groupId);
  db.prepare("DELETE FROM loyalty_group_members WHERE loyalty_group_id = ?").run(groupId);
  db.prepare("DELETE FROM loyalty_groups WHERE id = ?").run(groupId);
}

function assertUserOwnsGroup(groupId, userId) {
  const g = getLoyaltyGroupById(groupId);
  if (!g) return { ok: false, error: "Réseau introuvable", status: 404 };
  if (g.owner_user_id !== userId) return { ok: false, error: "Accès refusé", status: 403 };
  return { ok: true, group: g };
}

function assertUserOwnsBusiness(businessId, userId) {
  const b = getBusinessById(businessId);
  if (!b) return { ok: false, error: "Commerce introuvable", status: 404 };
  if (b.user_id !== userId) return { ok: false, error: "Vous devez être propriétaire de ce commerce", status: 403 };
  return { ok: true, business: b };
}

/** Vérifie compatibilité programme (points vs tampons, taille cycle). */
export function validateBusinessesProgramCompatibility(businesses) {
  if (!businesses?.length) return { ok: true };
  const ref = businesses[0];
  const refType = (ref.program_type || "points").toLowerCase();
  const refStamps = ref.required_stamps != null ? Number(ref.required_stamps) : null;
  for (const b of businesses.slice(1)) {
    const t = (b.program_type || "points").toLowerCase();
    if (t !== refType) {
      return {
        ok: false,
        error: "Les commerces d’un même réseau doivent avoir le même type de programme (points ou tampons).",
        code: "LOYALTY_GROUP_PROGRAM_MISMATCH",
      };
    }
    if (refType === "stamps") {
      const n = b.required_stamps != null ? Number(b.required_stamps) : null;
      if (refStamps != null && n != null && refStamps !== n) {
        return {
          ok: false,
          error: "Les commerces tampons d’un réseau doivent avoir le même nombre de tampons requis.",
          code: "LOYALTY_GROUP_STAMPS_MISMATCH",
        };
      }
    }
  }
  return { ok: true };
}

export function linkBusinessToLoyaltyGroup({ businessId, groupId, userId }) {
  const own = assertUserOwnsBusiness(businessId, userId);
  if (!own.ok) return own;
  const grp = assertUserOwnsGroup(groupId, userId);
  if (!grp.ok) return grp;

  const existingInGroup = listBusinessesInLoyaltyGroup(groupId);
  const toValidate = [...existingInGroup, own.business];
  const compat = validateBusinessesProgramCompatibility(toValidate);
  if (!compat.ok) return { ok: false, ...compat, status: 422 };

  if (own.business.loyalty_group_id && own.business.loyalty_group_id !== groupId) {
    return {
      ok: false,
      error: "Ce commerce appartient déjà à un autre réseau. Retirez-le d’abord.",
      code: "LOYALTY_GROUP_ALREADY_LINKED",
      status: 409,
    };
  }

  db.prepare("UPDATE businesses SET loyalty_group_id = ? WHERE id = ?").run(groupId, businessId);
  reconcileBusinessMembersIntoGroup(businessId, groupId);
  return { ok: true, business: getBusinessById(businessId), group: getLoyaltyGroupById(groupId) };
}

/** Fusionne les fiches locales existantes dans le solde réseau (même e-mail). */
function reconcileBusinessMembersIntoGroup(businessId, groupId) {
  const locals = db
    .prepare("SELECT * FROM members WHERE business_id = ? AND (loyalty_group_member_id IS NULL OR loyalty_group_member_id = '')")
    .all(businessId);
  for (const local of locals) {
    const email = local.email ? String(local.email).trim().toLowerCase() : "";
    if (!email) continue;
    let gm = getLoyaltyGroupMemberByEmail(groupId, email);
    const localPts = Math.max(0, Math.floor(Number(local.points) || 0));
    if (!gm) {
      gm = createLoyaltyGroupMember({
        groupId,
        email,
        name: local.name,
        points: localPts,
      });
    } else {
      const gmPts = Math.max(0, Math.floor(Number(gm.points) || 0));
      if (localPts > gmPts) setLoyaltyGroupMemberPoints(gm.id, localPts);
    }
    linkMemberToGroupMember(local.id, gm.id);
  }
}

export function unlinkBusinessFromLoyaltyGroup({ businessId, userId }) {
  const own = assertUserOwnsBusiness(businessId, userId);
  if (!own.ok) return own;
  db.prepare("UPDATE businesses SET loyalty_group_id = NULL WHERE id = ?").run(businessId);
  db.prepare("UPDATE members SET loyalty_group_member_id = NULL WHERE business_id = ?").run(businessId);
  return { ok: true, business: getBusinessById(businessId) };
}

export function createLoyaltyGroupWithBusinesses({ ownerUserId, name, businessIds = [] }) {
  const group = createLoyaltyGroup({ ownerUserId, name });
  const linked = [];
  for (const bid of businessIds) {
    const r = linkBusinessToLoyaltyGroup({ businessId: bid, groupId: group.id, userId: ownerUserId });
    if (r.ok) linked.push(r.business);
  }
  return { group, businesses: linked };
}

// —— Membres réseau ——

export function getLoyaltyGroupMember(id) {
  if (!id) return null;
  return db.prepare("SELECT * FROM loyalty_group_members WHERE id = ?").get(id) || null;
}

export function getLoyaltyGroupMemberByEmail(groupId, email) {
  if (!groupId || !email) return null;
  const norm = String(email).trim().toLowerCase();
  if (!norm) return null;
  return (
    db
      .prepare(
        `SELECT * FROM loyalty_group_members
         WHERE loyalty_group_id = ? AND LOWER(TRIM(email)) = ?`,
      )
      .get(groupId, norm) || null
  );
}

export function getLoyaltyGroupMemberInGroup(memberOrGroupMemberId, groupId) {
  if (!memberOrGroupMemberId || !groupId) return null;
  const direct = db
    .prepare("SELECT * FROM loyalty_group_members WHERE id = ? AND loyalty_group_id = ?")
    .get(memberOrGroupMemberId, groupId);
  if (direct) return direct;
  const viaLocal = db
    .prepare(
      `SELECT gm.* FROM loyalty_group_members gm
       INNER JOIN members m ON m.loyalty_group_member_id = gm.id
       WHERE m.id = ? AND gm.loyalty_group_id = ?`,
    )
    .get(memberOrGroupMemberId, groupId);
  return viaLocal || null;
}

export function createLoyaltyGroupMember({ id, groupId, email, name, points = 0, phone, city, birth_date }) {
  const mid = id || randomUUID();
  const now = nowUtcSqlWithMs();
  const pts = Math.max(0, Math.floor(Number(points) || 0));
  db.prepare(
    `INSERT INTO loyalty_group_members
      (id, loyalty_group_id, email, name, points, phone, city, birth_date, created_at, last_visit_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    mid,
    groupId,
    email ? String(email).trim().toLowerCase() : null,
    name ? String(name).trim() : null,
    pts,
    phone ?? null,
    city ?? null,
    birth_date ?? null,
    now,
    now,
  );
  return getLoyaltyGroupMember(mid);
}

export function syncGroupBalanceToLocalMembers(groupMemberId) {
  const gm = getLoyaltyGroupMember(groupMemberId);
  if (!gm) return;
  const pts = Math.max(0, Math.floor(Number(gm.points) || 0));
  const now = nowUtcSqlWithMs();
  db.prepare(
    `UPDATE members SET points = ?, last_visit_at = COALESCE(last_visit_at, ?)
     WHERE loyalty_group_member_id = ?`,
  ).run(pts, now, groupMemberId);
}

export function addPointsToLoyaltyGroupMember(groupMemberId, delta) {
  const d = Math.floor(Number(delta) || 0);
  if (d === 0) return getLoyaltyGroupMember(groupMemberId);
  const now = nowUtcSqlWithMs();
  db.prepare(
    `UPDATE loyalty_group_members SET points = points + ?, last_visit_at = ? WHERE id = ?`,
  ).run(d, now, groupMemberId);
  syncGroupBalanceToLocalMembers(groupMemberId);
  return getLoyaltyGroupMember(groupMemberId);
}

export function setLoyaltyGroupMemberPoints(groupMemberId, points) {
  const pts = Math.max(0, Math.floor(Number(points) || 0));
  const now = nowUtcSqlWithMs();
  db.prepare("UPDATE loyalty_group_members SET points = ?, last_visit_at = ? WHERE id = ?").run(pts, now, groupMemberId);
  syncGroupBalanceToLocalMembers(groupMemberId);
  return getLoyaltyGroupMember(groupMemberId);
}

export function deductLoyaltyGroupMemberPoints(groupMemberId, amount) {
  const a = Math.max(0, Math.floor(Number(amount) || 0));
  if (a <= 0) return getLoyaltyGroupMember(groupMemberId);
  const now = nowUtcSqlWithMs();
  db.prepare(
    `UPDATE loyalty_group_members SET points = MAX(0, points - ?), last_visit_at = ? WHERE id = ?`,
  ).run(a, now, groupMemberId);
  syncGroupBalanceToLocalMembers(groupMemberId);
  return getLoyaltyGroupMember(groupMemberId);
}

function getMemberRow(id) {
  return db.prepare("SELECT * FROM members WHERE id = ?").get(id) || null;
}

function getMemberByEmailForBusinessRow(businessId, email) {
  if (!businessId || !email) return null;
  const norm = String(email).trim().toLowerCase();
  if (!norm) return null;
  return (
    db.prepare("SELECT * FROM members WHERE business_id = ? AND LOWER(TRIM(email)) = ?").get(businessId, norm) || null
  );
}

export function linkMemberToGroupMember(memberId, groupMemberId) {
  db.prepare("UPDATE members SET loyalty_group_member_id = ? WHERE id = ?").run(groupMemberId, memberId);
  syncGroupBalanceToLocalMembers(groupMemberId);
  return getMemberRow(memberId);
}

/**
 * Crée ou réutilise la fiche locale pour un membre réseau dans un commerce donné.
 */
export function ensureLocalMemberForGroupMember(business, groupMember) {
  if (!business?.id || !groupMember?.id) return null;
  const existing = db
    .prepare(
      `SELECT * FROM members WHERE business_id = ? AND loyalty_group_member_id = ?`,
    )
    .get(business.id, groupMember.id);
  if (existing) {
    syncGroupBalanceToLocalMembers(groupMember.id);
    return getMemberRow(existing.id);
  }
  if (groupMember.email) {
    const byEmail = getMemberByEmailForBusinessRow(business.id, groupMember.email);
    if (byEmail) {
      linkMemberToGroupMember(byEmail.id, groupMember.id);
      return getMemberRow(byEmail.id);
    }
  }
  const localId = randomUUID();
  const pts = Math.max(0, Math.floor(Number(groupMember.points) || 0));
  db.prepare(
    `INSERT INTO members (id, business_id, email, name, points, phone, city, birth_date, loyalty_group_member_id, created_at, last_visit_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    localId,
    business.id,
    groupMember.email,
    groupMember.name,
    pts,
    groupMember.phone,
    groupMember.city,
    groupMember.birth_date,
    groupMember.id,
    groupMember.created_at || nowUtcSqlWithMs(),
    groupMember.last_visit_at || nowUtcSqlWithMs(),
  );
  return getMemberRow(localId);
}

/** ID canonique du QR / pass Wallet (réseau → id groupe membre). */
export function canonicalMemberBarcode(member) {
  if (!member) return null;
  return member.loyalty_group_member_id || member.id;
}

export function getEffectiveMemberPoints(member) {
  if (!member) return 0;
  if (member.loyalty_group_member_id) {
    const gm = getLoyaltyGroupMember(member.loyalty_group_member_id);
    if (gm) return Math.max(0, Math.floor(Number(gm.points) || 0));
  }
  return Math.max(0, Math.floor(Number(member.points) || 0));
}
