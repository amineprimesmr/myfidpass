/**
 * Repository businesses. Référence : REFONTE-REGLES.md.
 */
import { randomUUID } from "crypto";
import { getDb } from "./connection.js";

const db = getDb();

function generateToken() {
  return randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "").slice(0, 16);
}

export function getBusinessBySlug(slug) {
  if (!slug || typeof slug !== "string") return null;
  const row = db.prepare("SELECT * FROM businesses WHERE LOWER(TRIM(slug)) = LOWER(TRIM(?))").get(slug);
  return row || null;
}

export function getBusinessesByUserId(userId) {
  return db.prepare(
    "SELECT id, name, slug, organization_name, created_at, dashboard_token FROM businesses WHERE user_id = ? ORDER BY created_at DESC"
  ).all(userId);
}

export function getBusinessById(id) {
  const row = db.prepare("SELECT * FROM businesses WHERE id = ?").get(id);
  return row || null;
}

export function createBusiness({
  id,
  name,
  slug,
  organizationName,
  backTerms,
  backContact,
  backgroundColor,
  foregroundColor,
  labelColor,
  pointsPerEuro,
  pointsPerVisit,
  dashboardToken,
  userId,
}) {
  const bid = id || randomUUID();
  const token = dashboardToken || generateToken();
  const perEuro = pointsPerEuro != null ? String(pointsPerEuro) : "1";
  const perVisit = pointsPerVisit != null ? String(pointsPerVisit) : "1";
  db.prepare(
    `INSERT INTO businesses (id, name, slug, organization_name, back_terms, back_contact, background_color, foreground_color, label_color, points_per_euro, points_per_visit, dashboard_token, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    bid,
    name,
    slug,
    organizationName || name,
    backTerms || null,
    backContact || null,
    backgroundColor || null,
    foregroundColor || null,
    labelColor || null,
    perEuro,
    perVisit,
    token,
    userId || null
  );
  return getBusinessById(bid);
}

export function updateBusiness(businessId, updates) {
  const b = getBusinessById(businessId);
  if (!b) return null;
  const allowed = [
    "slug", "organization_name", "back_terms", "back_contact", "background_color", "foreground_color", "label_color",
    "logo_base64", "logo_updated_at", "card_background_base64", "strip_color", "strip_display_mode", "strip_text",
    "location_lat", "location_lng", "location_relevant_text", "location_radius_meters", "location_address",
    "required_stamps", "stamp_emoji", "points_per_euro", "points_per_visit", "program_type", "loyalty_mode",
    "points_per_ticket", "stamp_reward_label", "stamp_mid_reward_label", "points_min_amount_eur", "points_reward_tiers", "expiry_months",
    "sector", "engagement_rewards",
  ];
  const numericCols = ["location_lat", "location_lng", "location_radius_meters", "required_stamps", "points_min_amount_eur", "expiry_months", "points_per_ticket"];
  const setClauses = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    const col = key.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
    if (allowed.includes(col) && value !== undefined) {
      setClauses.push(`${col} = ?`);
      if (col === "logo_base64" || col === "card_background_base64") {
        values.push(value === null || value === "" ? null : String(value));
      } else if (col === "points_reward_tiers" || col === "engagement_rewards") {
        values.push(value == null || value === "" ? null : (typeof value === "string" ? value : JSON.stringify(value)));
      } else if (numericCols.includes(col)) {
        const n = value === null || value === "" ? null : Number(value);
        values.push(Number.isFinite(n) ? n : null);
      } else {
        values.push(value === null || value === "" ? null : String(value).trim());
      }
    }
  }
  if (setClauses.length === 0) return b;
  if (updates.logo_base64 !== undefined) {
    setClauses.push("logo_updated_at = ?");
    values.push(new Date().toISOString());
  }
  values.push(businessId);
  db.prepare(`UPDATE businesses SET ${setClauses.join(", ")} WHERE id = ?`).run(...values);
  return getBusinessById(businessId);
}

export function getBusinessByDashboardToken(token) {
  if (!token) return null;
  const row = db.prepare("SELECT * FROM businesses WHERE dashboard_token = ?").get(token);
  return row || null;
}

/** Garantit que la business "demo" existe (utilisé par certaines routes). */
export function ensureDefaultBusiness() {
  let b = getBusinessBySlug("demo");
  if (!b) {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO businesses (id, name, slug, organization_name, back_terms, back_contact)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, "Demo Fast-Food", "demo", "Demo Fast-Food", "1 point = 1 € de réduction. Valable en magasin.", "contact@example.com");
    b = getBusinessBySlug("demo");
  }
  return b;
}
