/**
 * Repository members. Référence : REFONTE-REGLES.md.
 */
import { randomUUID } from "crypto";
import { getDb } from "./connection.js";
import { getCategoryIdsForMember } from "./categories.js";

const db = getDb();

const MEMBER_ORDER = { last_visit: "COALESCE(last_visit_at, '') DESC", points: "points DESC", name: "name ASC", created: "created_at DESC" };

export function createMember({ id, businessId, email, name, points = 0 }) {
  const mid = id || randomUUID();
  const pts = Number.isFinite(Number(points)) && Number(points) >= 0 ? Number(points) : 0;
  db.prepare("INSERT INTO members (id, business_id, email, name, points) VALUES (?, ?, ?, ?, ?)").run(mid, businessId, email, name, pts);
  return getMember(mid);
}

export function getMember(id) {
  const row = db.prepare("SELECT * FROM members WHERE id = ?").get(id);
  return row || null;
}

export function getMemberForBusiness(memberId, businessId) {
  const row = db.prepare("SELECT * FROM members WHERE id = ? AND business_id = ?").get(memberId, businessId);
  return row || null;
}

export function getMemberByEmailForBusiness(businessId, email) {
  if (!businessId || !email) return null;
  const norm = String(email).trim().toLowerCase();
  if (!norm) return null;
  return db.prepare("SELECT * FROM members WHERE business_id = ? AND LOWER(TRIM(email)) = ?").get(businessId, norm) || null;
}

export function updateMember(memberId, { name, points }) {
  const m = getMember(memberId);
  if (!m) return null;
  if (name !== undefined) db.prepare("UPDATE members SET name = ? WHERE id = ?").run(String(name).trim(), memberId);
  if (Number.isFinite(Number(points)) && Number(points) >= 0) db.prepare("UPDATE members SET points = ? WHERE id = ?").run(Number(points), memberId);
  return getMember(memberId);
}

export function addPoints(id, points) {
  db.prepare("UPDATE members SET points = points + ?, last_visit_at = datetime('now') WHERE id = ?").run(points, id);
  return getMember(id);
}

export function deductPoints(id, pointsToDeduct) {
  const amount = Math.max(0, Math.floor(Number(pointsToDeduct) || 0));
  if (amount <= 0) return getMember(id);
  db.prepare("UPDATE members SET points = MAX(0, points - ?), last_visit_at = datetime('now') WHERE id = ?").run(amount, id);
  return getMember(id);
}

export function resetMemberPoints(id) {
  db.prepare("UPDATE members SET points = 0, last_visit_at = datetime('now') WHERE id = ?").run(id);
  return getMember(id);
}

export function touchMemberLastVisit(memberId) {
  if (!memberId) return;
  db.prepare("UPDATE members SET last_visit_at = datetime('now') WHERE id = ?").run(memberId);
}

export function getMembersForBusiness(businessId, { search = "", limit = 50, offset = 0, filter = null, sort = "last_visit" } = {}) {
  const q = search.trim() ? "%" + search.trim().replace(/%/g, "") + "%" : null;
  const orderBy = MEMBER_ORDER[sort] || MEMBER_ORDER.last_visit;
  let where = "business_id = ?";
  const params = [businessId];
  if (q) {
    where += " AND (name LIKE ? OR email LIKE ?)";
    params.push(q, q);
  }
  if (filter === "inactive30") {
    where += " AND (last_visit_at IS NULL OR last_visit_at < datetime('now', '-30 days'))";
  } else if (filter === "inactive90") {
    where += " AND (last_visit_at IS NULL OR last_visit_at < datetime('now', '-90 days'))";
  } else if (filter === "points50") {
    where += " AND points >= 50";
  }
  const stmt = db.prepare(
    `SELECT id, name, email, points, created_at, last_visit_at FROM members WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
  );
  const countStmt = db.prepare(`SELECT COUNT(*) as n FROM members WHERE ${where}`);
  const rows = stmt.all(...params, limit, offset);
  const total = countStmt.get(...params)?.n ?? 0;
  const members = rows.map((m) => ({ ...m, category_ids: getCategoryIdsForMember(m.id) }));
  return { members, total };
}
