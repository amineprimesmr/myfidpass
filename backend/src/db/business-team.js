/**
 * Accès employés / équipe par commerce (owner, manager, staff).
 * Table : business_team_members.
 */
import { randomUUID } from "crypto";
import { getDb } from "./connection.js";
import { getUserByEmail } from "./users.js";

const db = getDb();

/**
 * Rôle d’équipe actif (null si pas d’accès).
 * @returns {null | 'manager' | 'staff'}
 */
export function getTeamRoleForUserAndBusiness(businessId, userId) {
  if (!businessId || !userId) return null;
  const row = db
    .prepare(
      "SELECT role FROM business_team_members WHERE business_id = ? AND user_id = ? AND status = 'active'",
    )
    .get(businessId, userId);
  if (!row) return null;
  const r = String(row.role || "staff").toLowerCase();
  if (r === "manager") return "manager";
  return "staff";
}

/**
 * @returns {Array<{ id: string, name: string, slug: string, organization_name: string|null, created_at: string|null, dashboard_token: string|null }>}
 */
export function getTeamBusinessesForUserId(userId) {
  if (!userId) return [];
  return db
    .prepare(
      `SELECT b.id, b.name, b.slug, b.organization_name, b.created_at, b.dashboard_token
       FROM business_team_members m
       JOIN businesses b ON b.id = m.business_id
       WHERE m.user_id = ? AND m.status = 'active'
       ORDER BY datetime(b.created_at) DESC`,
    )
    .all(userId);
}

export function listTeamMembersForBusiness(businessId) {
  if (!businessId) return [];
  return db
    .prepare(
      `SELECT m.id AS membership_id, m.user_id, u.email, u.name, u.staff_login, m.role, m.status, m.created_at
       FROM business_team_members m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.business_id = ? AND m.status != 'revoked'
       ORDER BY datetime(m.created_at) ASC`,
    )
    .all(businessId);
}

/** Propriétaire du commerce + membres d’équipe (hors compte proprio dupliqué). */
export function listTeamMembersForBusinessIncludingOwner(business) {
  const businessId = business?.id;
  if (!businessId) return [];
  const owner = db.prepare("SELECT id, email, name, staff_login FROM users WHERE id = ?").get(business.user_id);
  const rows = listTeamMembersForBusiness(businessId);
  const out = [];
  if (owner) {
    out.push({
      membership_id: null,
      user_id: owner.id,
      email: owner.email,
      staff_login: owner.staff_login ?? null,
      name: owner.name,
      role: "owner",
      status: "active",
      created_at: null,
    });
  }
  for (const r of rows) {
    if (owner && String(r.user_id) === String(owner.id)) continue;
    out.push(r);
  }
  return out;
}

export function addTeamMember({ businessId, userId, role, invitedBy }) {
  const id = randomUUID();
  const r = String(role || "staff").toLowerCase() === "manager" ? "manager" : "staff";
  db.prepare(
    `INSERT INTO business_team_members (id, business_id, user_id, role, status, invited_by, created_at)
     VALUES (?, ?, ?, ?, 'active', ?, datetime('now'))`,
  ).run(id, businessId, userId, r, invitedBy || null);
  return id;
}

export function removeTeamMemberById(membershipId) {
  if (!membershipId) return false;
  const q = db.prepare("DELETE FROM business_team_members WHERE id = ?");
  return q.run(membershipId).changes > 0;
}

export function removeTeamMemberByUserAndBusiness(businessId, userId) {
  if (!businessId || !userId) return false;
  const q = db.prepare("DELETE FROM business_team_members WHERE business_id = ? AND user_id = ?");
  return q.run(businessId, userId).changes > 0;
}

/**
 * Recherche un compte actif lié (staff/manager) pour un couple business / identifiant (membership_id ou user_id).
 */
export function findActiveTeamMembership(businessId, idOrUserId) {
  const raw = String(idOrUserId || "").trim();
  if (!businessId || !raw) return null;
  let row = db
    .prepare("SELECT * FROM business_team_members WHERE id = ? AND business_id = ? AND status = 'active'")
    .get(raw, businessId);
  if (row) return row;
  row = db
    .prepare("SELECT * FROM business_team_members WHERE business_id = ? AND user_id = ? AND status = 'active'")
    .get(businessId, raw);
  return row || null;
}

export function getFirstTeamBusinessOwnerId(userId) {
  const r = db
    .prepare(
      `SELECT b.user_id as owner_id FROM business_team_members m
      JOIN businesses b ON b.id = m.business_id
      WHERE m.user_id = ? AND m.status = 'active' LIMIT 1`,
    )
    .get(userId);
  return r?.owner_id || null;
}

export function isOnlyTeamUser(userId) {
  if (!userId) return false;
  const o = db.prepare("SELECT 1 FROM businesses WHERE user_id = ? LIMIT 1").get(userId);
  if (o) return false;
  const t = db.prepare("SELECT 1 FROM business_team_members WHERE user_id = ? AND status = 'active' LIMIT 1").get(userId);
  return !!t;
}

/**
 * Rôle d’espace commerçant pour l’app (`workspace_role`) : compte possédant un commerce = owner, sinon rôle d’équipe.
 */
export function getWorkspaceRoleForUser(userId) {
  if (!userId) return "owner";
  const own = db.prepare("SELECT 1 FROM businesses WHERE user_id = ? LIMIT 1").get(userId);
  if (own) return "owner";
  const row = db
    .prepare("SELECT role FROM business_team_members WHERE user_id = ? AND status = 'active' LIMIT 1")
    .get(userId);
  if (!row) return "owner";
  const r = String(row.role || "staff").toLowerCase();
  return r === "manager" ? "manager" : "staff";
}

export { getUserByEmail };
