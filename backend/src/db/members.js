/**
 * Repository members. Référence : REFONTE-REGLES.md.
 */
import { randomUUID } from "crypto";
import { getDb } from "./connection.js";
import { getCategoryIdsForMembers } from "./categories.js";
import { nowUtcSqlWithMs } from "./datetime-sql.js";
import { computeStampRolloverState, normalizeStampBalance } from "../lib/stamps-cycle-math.js";

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

export function updateMember(memberId, { name, points, phone, city, birth_date: birthDate }) {
  const m = getMember(memberId);
  if (!m) return null;
  if (name !== undefined) db.prepare("UPDATE members SET name = ? WHERE id = ?").run(String(name).trim(), memberId);
  if (Number.isFinite(Number(points)) && Number(points) >= 0) {
    db.prepare("UPDATE members SET points = ?, last_visit_at = ? WHERE id = ?").run(Number(points), nowUtcSqlWithMs(), memberId);
  }
  if (phone !== undefined) db.prepare("UPDATE members SET phone = ? WHERE id = ?").run(phone == null ? null : String(phone).trim(), memberId);
  if (city !== undefined) db.prepare("UPDATE members SET city = ? WHERE id = ?").run(city == null ? null : String(city).trim(), memberId);
  if (birthDate !== undefined) {
    db.prepare("UPDATE members SET birth_date = ? WHERE id = ?").run(birthDate == null ? null : String(birthDate).trim(), memberId);
  }
  return getMember(memberId);
}

export function addPoints(id, points) {
  const now = nowUtcSqlWithMs();
  db.prepare("UPDATE members SET points = points + ?, last_visit_at = ? WHERE id = ?").run(points, now, id);
  return getMember(id);
}

export { normalizeStampBalance, computeStampRolloverState } from "../lib/stamps-cycle-math.js";

/**
 * Ajoute des tampons (colonne `points`) avec boucle : à chaque Nᵉ tampon, récompense max atteinte → compteur repart à 0.
 * @returns {{ member: object | null, rawAdded: number, cycleCompletions: number }}
 */
export function addStampsWithCycleRollover(memberId, delta, cycleSize) {
  const m0 = getMember(memberId);
  if (!m0) return { member: null, rawAdded: 0, cycleCompletions: 0 };
  const { newBalance, cycleCompletions, rawAdded } = computeStampRolloverState(m0.points, delta, cycleSize);
  if (rawAdded <= 0) return { member: m0, rawAdded: 0, cycleCompletions: 0 };
  db.prepare("UPDATE members SET points = ?, last_visit_at = ? WHERE id = ?").run(
    newBalance,
    nowUtcSqlWithMs(),
    memberId,
  );
  return { member: getMember(memberId), rawAdded, cycleCompletions };
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
  db.prepare("UPDATE members SET points = ?, last_visit_at = ? WHERE id = ?").run(next, nowUtcSqlWithMs(), memberId);
  return { member: getMember(memberId), added };
}

export function deductPoints(id, pointsToDeduct) {
  const amount = Math.max(0, Math.floor(Number(pointsToDeduct) || 0));
  if (amount <= 0) return getMember(id);
  db.prepare("UPDATE members SET points = MAX(0, points - ?), last_visit_at = ? WHERE id = ?").run(amount, nowUtcSqlWithMs(), id);
  return getMember(id);
}

export function resetMemberPoints(id) {
  db.prepare("UPDATE members SET points = 0, last_visit_at = ? WHERE id = ?").run(nowUtcSqlWithMs(), id);
  return getMember(id);
}

export function touchMemberLastVisit(memberId) {
  if (!memberId) return;
  db.prepare("UPDATE members SET last_visit_at = ? WHERE id = ?").run(nowUtcSqlWithMs(), memberId);
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
  if (filter === "inactive14") {
    where += " AND (last_visit_at IS NULL OR last_visit_at < datetime('now', '-14 days'))";
  } else if (filter === "inactive30") {
    where += " AND (last_visit_at IS NULL OR last_visit_at < datetime('now', '-30 days'))";
  } else if (filter === "inactive60") {
    where += " AND (last_visit_at IS NULL OR last_visit_at < datetime('now', '-60 days'))";
  } else if (filter === "inactive90") {
    where += " AND (last_visit_at IS NULL OR last_visit_at < datetime('now', '-90 days'))";
  } else if (filter === "points50") {
    where += " AND points >= 50";
  } else if (filter === "pointsNear50") {
    where += " AND points >= 40 AND points < 50";
  } else if (filter === "welcomeNew") {
    where += " AND created_at >= datetime('now', '-14 days') AND last_visit_at IS NULL";
  }
  const stmt = db.prepare(
    `SELECT id, name, email, phone, city, birth_date, points, created_at, last_visit_at FROM members WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
  );
  const countStmt = db.prepare(`SELECT COUNT(*) as n FROM members WHERE ${where}`);
  const rows = stmt.all(...params, limit, offset);
  const total = countStmt.get(...params)?.n ?? 0;
  const catMap = getCategoryIdsForMembers(rows.map((m) => m.id));
  const members = rows.map((m) => ({ ...m, category_ids: catMap.get(m.id) ?? [] }));
  return { members, total };
}

/** Retourne les IDs des membres correspondant au segment (pour campagnes ciblées). */
export function getMemberIdsBySegment(businessId, segment) {
  let where = "business_id = ?";
  const params = [businessId];
  switch (segment) {
    case "inactive14":
      where += " AND (last_visit_at IS NULL OR last_visit_at < datetime('now', '-14 days'))";
      break;
    case "inactive30":
      where += " AND (last_visit_at IS NULL OR last_visit_at < datetime('now', '-30 days'))";
      break;
    case "inactive60":
      where += " AND (last_visit_at IS NULL OR last_visit_at < datetime('now', '-60 days'))";
      break;
    case "inactive90":
      where += " AND (last_visit_at IS NULL OR last_visit_at < datetime('now', '-90 days'))";
      break;
    case "new7":
      where += " AND created_at >= datetime('now', '-7 days')";
      break;
    case "new30":
      where += " AND created_at >= datetime('now', '-30 days')";
      break;
    /** Inscrits ≤ 14 j sans aucune visite enregistrée (première visite attendue). */
    case "welcomeNew":
      where += " AND created_at >= datetime('now', '-14 days') AND last_visit_at IS NULL";
      break;
    case "pointsNear50":
      where += " AND points >= 40 AND points < 50";
      break;
    case "points50":
      where += " AND points >= 50";
      break;
    case "recurrent":
      // Fidèles : ≥ 10 passages (transactions) sur le **mois civil en cours** (aligné produit « +10 visites / mois »).
      where += ` AND id IN (
        SELECT member_id FROM transactions WHERE business_id = ?
        AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
        GROUP BY member_id HAVING COUNT(*) >= 10
      )`;
      params.push(businessId);
      break;
    /** Profil complété + date de naissance : même critère que la validation profil (tél., ville, birth_date). */
    case "birthdayToday":
      where +=
        " AND birth_date IS NOT NULL AND TRIM(birth_date) != ''" +
        " AND phone IS NOT NULL AND TRIM(phone) != ''" +
        " AND city IS NOT NULL AND TRIM(city) != ''" +
        " AND strftime('%m-%d', birth_date) = strftime('%m-%d', 'now')";
      break;
    default:
      return [];
  }
  const rows = db.prepare(`SELECT id FROM members WHERE ${where}`).all(...params);
  return rows.map((r) => r.id);
}

/** Email réservé aux sessions invitées avant finalisation (parcours QR → roue). */
const GUEST_EMAIL_SUFFIX = "@guest.invalid";

export function isGuestPlaceholderEmail(email) {
  return typeof email === "string" && email.toLowerCase().endsWith(GUEST_EMAIL_SUFFIX);
}

/**
 * Remplace l’email invité par les vrais identifiants (une seule fois).
 * @returns {{ ok: true, member: object } | { error: string, code?: string }}
 */
export function claimGuestMemberIdentity(businessId, memberId, { name, email }) {
  const member = getMemberForBusiness(memberId, businessId);
  if (!member) return { error: "Membre introuvable", code: "NOT_FOUND" };
  if (!isGuestPlaceholderEmail(member.email)) {
    return { error: "Ce compte est déjà finalisé.", code: "NOT_GUEST" };
  }
  const normEmail = String(email || "").trim().toLowerCase();
  const normName = String(name || "").trim();
  if (!normEmail || !normName) return { error: "Nom et email requis", code: "VALIDATION" };
  const existing = getMemberByEmailForBusiness(businessId, normEmail);
  if (existing && existing.id !== memberId) {
    return { error: "Un compte existe déjà avec cet email.", code: "EMAIL_TAKEN" };
  }
  db.prepare("UPDATE members SET email = ?, name = ?, last_visit_at = ? WHERE id = ? AND business_id = ?").run(
    normEmail,
    normName,
    nowUtcSqlWithMs(),
    memberId,
    businessId,
  );
  return { ok: true, member: getMember(memberId) };
}
