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

/**
 * Ajoute des tampons (colonne `points` en programme tampons), plafonnés à `maxStamps`.
 * @returns {{ member: object | null, added: number }}
 */
export function addStampsCapped(memberId, delta, maxStamps) {
  const cap = Math.max(0, Math.floor(Number(maxStamps) || 0));
  const d = Math.max(0, Math.floor(Number(delta) || 0));
  const m0 = getMember(memberId);
  if (!m0) return { member: null, added: 0 };
  if (d <= 0) return { member: m0, added: 0 };
  const cur = Math.max(0, Math.floor(Number(m0.points) || 0));
  const next = cap > 0 ? Math.min(cap, cur + d) : cur + d;
  const added = next - cur;
  if (added <= 0) return { member: m0, added: 0 };
  db.prepare("UPDATE members SET points = ?, last_visit_at = datetime('now') WHERE id = ?").run(next, memberId);
  return { member: getMember(memberId), added };
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

/** Retourne les IDs des membres correspondant au segment (pour campagnes ciblées). */
export function getMemberIdsBySegment(businessId, segment) {
  let where = "business_id = ?";
  const params = [businessId];
  switch (segment) {
    case "inactive30":
      where += " AND (last_visit_at IS NULL OR last_visit_at < datetime('now', '-30 days'))";
      break;
    case "inactive90":
      where += " AND (last_visit_at IS NULL OR last_visit_at < datetime('now', '-90 days'))";
      break;
    case "new30":
      where += " AND created_at >= datetime('now', '-30 days')";
      break;
    case "points50":
      where += " AND points >= 50";
      break;
    case "recurrent":
      where += ` AND id IN (
        SELECT member_id FROM transactions WHERE business_id = ? AND created_at >= datetime('now', '-30 days')
        GROUP BY member_id HAVING COUNT(*) >= 2
      )`;
      params.push(businessId);
      break;
    default:
      return [];
  }
  const rows = db.prepare(`SELECT id FROM members WHERE ${where}`).all(...params);
  return rows.map((r) => r.id);
}
