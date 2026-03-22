/**
 * Repository member_categories et assignations. Référence : REFONTE-REGLES.md.
 */
import { randomUUID } from "crypto";
import { getDb } from "./connection.js";

const db = getDb();

export function getCategoriesForBusiness(businessId) {
  if (!businessId) return [];
  return db.prepare(
    "SELECT id, name, color_hex, sort_order FROM member_categories WHERE business_id = ? ORDER BY sort_order ASC, name ASC"
  ).all(businessId);
}

export function createCategory({ id: catId, businessId, name, colorHex, sortOrder = 0 }) {
  const id = catId || randomUUID();
  db.prepare(
    "INSERT INTO member_categories (id, business_id, name, color_hex, sort_order) VALUES (?, ?, ?, ?, ?)"
  ).run(id, businessId, String(name).trim(), colorHex ? String(colorHex).trim() : null, Number(sortOrder) || 0);
  return db.prepare("SELECT id, name, color_hex, sort_order FROM member_categories WHERE id = ?").get(id);
}

export function getCategoryById(categoryId) {
  if (!categoryId) return null;
  return db.prepare("SELECT id, business_id, name, color_hex, sort_order FROM member_categories WHERE id = ?").get(categoryId);
}

export function updateCategory(categoryId, { name, colorHex, sortOrder }) {
  const cat = getCategoryById(categoryId);
  if (!cat) return null;
  const updates = [];
  const values = [];
  if (name !== undefined) {
    updates.push("name = ?");
    values.push(String(name).trim());
  }
  if (colorHex !== undefined) {
    updates.push("color_hex = ?");
    values.push(colorHex ? String(colorHex).trim() : null);
  }
  if (sortOrder !== undefined) {
    updates.push("sort_order = ?");
    values.push(Number(sortOrder) || 0);
  }
  if (updates.length === 0) return cat;
  values.push(categoryId);
  db.prepare(`UPDATE member_categories SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  return getCategoryById(categoryId);
}

export function deleteCategory(categoryId) {
  if (!categoryId) return false;
  db.prepare("DELETE FROM member_category_assignments WHERE category_id = ?").run(categoryId);
  const r = db.prepare("DELETE FROM member_categories WHERE id = ?").run(categoryId);
  return r.changes > 0;
}

export function getCategoryIdsForMember(memberId) {
  if (!memberId) return [];
  const rows = db.prepare("SELECT category_id FROM member_category_assignments WHERE member_id = ?").all(memberId);
  return rows.map((r) => r.category_id);
}

/** Une requête pour tous les membres (évite N appels dans GET /dashboard/members). */
export function getCategoryIdsForMembers(memberIds) {
  if (!Array.isArray(memberIds) || memberIds.length === 0) return new Map();
  const placeholders = memberIds.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT member_id, category_id FROM member_category_assignments WHERE member_id IN (${placeholders})`)
    .all(...memberIds);
  const map = new Map();
  for (const id of memberIds) {
    map.set(id, []);
  }
  for (const r of rows) {
    const list = map.get(r.member_id);
    if (list) list.push(r.category_id);
  }
  return map;
}

export function setMemberCategories(memberId, categoryIds) {
  if (!memberId) return;
  db.prepare("DELETE FROM member_category_assignments WHERE member_id = ?").run(memberId);
  if (!Array.isArray(categoryIds) || categoryIds.length === 0) return;
  const stmt = db.prepare("INSERT INTO member_category_assignments (member_id, category_id) VALUES (?, ?)");
  for (const cid of categoryIds) {
    if (cid && getCategoryById(cid)) stmt.run(memberId, cid);
  }
}

export function getMemberIdsInCategories(businessId, categoryIds) {
  if (!businessId || !Array.isArray(categoryIds) || categoryIds.length === 0) return [];
  const cats = db.prepare(
    "SELECT id FROM member_categories WHERE business_id = ? AND id IN (" + categoryIds.map(() => "?").join(",") + ")"
  ).all(businessId, ...categoryIds);
  const validIds = cats.map((c) => c.id);
  if (validIds.length === 0) return [];
  const rows = db.prepare(
    "SELECT DISTINCT member_id FROM member_category_assignments WHERE category_id IN (" + validIds.map(() => "?").join(",") + ")"
  ).all(...validIds);
  return rows.map((r) => r.member_id);
}

export function setLastBroadcastMessage(businessId, message) {
  if (!businessId || message == null) return;
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  db.prepare("UPDATE businesses SET last_broadcast_message = ?, last_broadcast_at = ? WHERE id = ?").run(
    String(message).trim().slice(0, 500),
    now,
    businessId
  );
}
