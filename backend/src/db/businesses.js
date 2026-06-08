/**
 * Repository businesses. Référence : REFONTE-REGLES.md.
 */
import { randomUUID } from "crypto";
import { getDb } from "./connection.js";
import { getTeamBusinessesForUserId } from "./business-team.js";
import { setBusinessAssetData } from "./business-assets.js";
import {
  DEMO_LOYALTY_MODE,
  DEMO_POINTS_REWARD_TIERS_JSON,
  DEMO_ENGAGEMENT_REWARDS_JSON,
} from "./demo-business-defaults.js";
import { nowUtcSqlWithMs } from "./datetime-sql.js";
import { sqlExcludeTechnicalMembers } from "./member-segment-sql.js";

const db = getDb();

const adminMemberCountSql = `(SELECT COUNT(*) FROM members m WHERE m.business_id = b.id AND ${sqlExcludeTechnicalMembers("m.email")})`;

const adminBusinessesFromSql = `
    FROM businesses b
    LEFT JOIN users u ON u.id = b.user_id
    LEFT JOIN (
      SELECT user_id, status, plan_id
      FROM subscriptions
      WHERE rowid IN (SELECT MAX(rowid) FROM subscriptions GROUP BY user_id)
    ) sub ON sub.user_id = b.user_id
  `;

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
    "SELECT id, name, slug, organization_name, created_at, dashboard_token, loyalty_group_id FROM businesses WHERE user_id = ? ORDER BY created_at DESC"
  ).all(userId);
}

/**
 * Commerces gérés + commerces en accès **équipe** (owner + staff/manager).
 */
export function getBusinessesForUserId(userId) {
  if (!userId) return [];
  const owned = getBusinessesByUserId(userId);
  const fromTeam = getTeamBusinessesForUserId(userId);
  const seen = new Set(owned.map((b) => b.id));
  const out = [...owned];
  for (const b of fromTeam) {
    if (b && b.id && !seen.has(b.id)) {
      seen.add(b.id);
      out.push(b);
    }
  }
  return out;
}

export function getBusinessById(id) {
  const row = db.prepare("SELECT * FROM businesses WHERE id = ?").get(id);
  return row || null;
}

/**
 * Liste tous les commerces (admin plateforme) avec email propriétaire.
 * @param {{ limit?: number, offset?: number, q?: string }} p
 */
export function listAllBusinessesForAdmin(p = {}) {
  const limit = Math.min(Math.max(1, Number(p.limit) || 100), 500);
  const offset = Math.max(0, Number(p.offset) || 0);
  const q = String(p.q ?? "")
    .trim()
    .toLowerCase()
    .replace(/%/g, "");
  const adminBizSelect = `
    SELECT b.id, b.slug, b.name, b.organization_name, b.user_id, b.created_at, b.dashboard_token,
      b.asset_logo_present, b.logo_updated_at,
      b.asset_logo_icon_present, b.logo_icon_updated_at,
      b.asset_notification_icon_present, b.notification_icon_updated_at,
      u.email AS owner_email,
      ${adminMemberCountSql} AS member_count,
      sub.status AS owner_subscription_status,
      sub.plan_id AS owner_plan_id
    ${adminBusinessesFromSql}
  `;
  if (q) {
    const like = `%${q}%`;
    return db
      .prepare(
        `${adminBizSelect}
         WHERE lower(b.slug) LIKE ? OR lower(b.name) LIKE ? OR lower(b.organization_name) LIKE ?
            OR lower(COALESCE(u.email,'')) LIKE ?
         ORDER BY datetime(b.created_at) DESC LIMIT ? OFFSET ?`,
      )
      .all(like, like, like, like, limit, offset);
  }
  return db
    .prepare(`${adminBizSelect} ORDER BY datetime(b.created_at) DESC LIMIT ? OFFSET ?`)
    .all(limit, offset);
}

/** Une ligne commerce pour la console admin (même projection que `listAllBusinessesForAdmin`). */
export function getBusinessForAdminById(businessId) {
  const id = String(businessId ?? "").trim();
  if (!id) return null;
  return (
    db
      .prepare(
        `SELECT b.id, b.slug, b.name, b.organization_name, b.user_id, b.created_at, b.dashboard_token,
      b.asset_logo_present, b.logo_updated_at,
      b.asset_logo_icon_present, b.logo_icon_updated_at,
      b.asset_notification_icon_present, b.notification_icon_updated_at,
      u.email AS owner_email,
      ${adminMemberCountSql} AS member_count,
      sub.status AS owner_subscription_status,
      sub.plan_id AS owner_plan_id
    ${adminBusinessesFromSql}
    WHERE b.id = ?`,
      )
      .get(id) || null
  );
}

/**
 * Programme fidélité effectif (points vs tampons), aligné sur la logique du pass et du dashboard.
 * Source de vérité : `program_type` explicite. Les commerces historiques avec seulement `required_stamps`
 * sont migrés une fois (migrations v21) vers `program_type = stamps`.
 */
export function resolveBusinessProgramType(business) {
  if (!business) return "points";
  let pt = String(business.program_type ?? "").trim().toLowerCase();
  if (pt === "tampons" || pt === "tampon" || pt === "stamp") pt = "stamps";
  if (pt === "point") pt = "points";
  if (pt === "points" || pt === "stamps") return pt;
  return "points";
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

/**
 * Invalide le cache PassKit après enregistrement des textes campagne (titre / modèle de notif),
 * sans toucher à `last_broadcast_at` (sinon le champ verso « Message » change de suffixe → alerte Wallet en boucle).
 */
/**
 * Logique pure du bump monotone à la seconde — extraite pour test unitaire.
 *
 * CRITIQUE — garantie à la **seconde** (pas seulement au ms) :
 *   L'en-tête HTTP `Last-Modified` du `.pkpass` est formaté en RFC 1123 (`new Date(ts).toUTCString()`),
 *   ce qui **écrête** la précision à la seconde. Si deux bumps tombent dans la même seconde UTC, le
 *   `Last-Modified` est identique d'une requête à l'autre → Apple Wallet (`passd`) considère le pass
 *   inchangé côté cache et **recycle la miniature de bannière** générée à partir de l'ANCIENNE icône,
 *   même si le fichier `icon.png` du `.pkpass` a bien été remplacé sur disque.
 *
 * Symptôme utilisateur avant correctif :
 *   Upload icône A → envoi notif 1 (icône A affichée) → upload icône B → envoi notif 2 →
 *   la bannière affiche toujours l'icône A car les deux mutations (upload + send) tombent dans
 *   la même seconde UTC.
 *
 * Correctif : on garantit que `Math.floor(next/1000) > Math.floor(prev/1000)`. Ainsi chaque bump
 * avance le `Last-Modified` HTTP d'au moins une seconde, ce qui force Wallet à invalider la
 * miniature cachée et à régénérer la bannière à partir du nouvel `icon.png`.
 *
 * @param {number | string | null | undefined} prevMsRaw - valeur courante en base
 * @param {number} nowMs - Date.now() au moment de l'appel (injecté pour les tests)
 * @returns {number} nouvelle valeur à stocker
 */
export function computeNextPassLastModifiedMs(prevMsRaw, nowMs) {
  const prevNum = Number(prevMsRaw);
  const prevMs = Number.isFinite(prevNum) && prevNum > 0 ? prevNum : 0;
  const minNextFloorSec = Math.floor(prevMs / 1000) + 1;
  const nowFloorSec = Math.floor(nowMs / 1000);
  // On garde les millisecondes « réelles » quand on a déjà changé de seconde (précision pour les logs),
  // sinon on saute explicitement au début de la seconde suivante pour garantir Last-Modified distinct.
  return nowFloorSec >= minNextFloorSec ? nowMs : minNextFloorSec * 1000;
}

/**
 * Incrémente un horodatage strictement croissant pour invalider PassKit (liste « passes à jour »
 * + en-tête HTTP `Last-Modified`) même quand plusieurs mutations tombent dans la même seconde UTC.
 * Voir {@link computeNextPassLastModifiedMs} pour le rationnel détaillé du saut à la seconde.
 */
export function touchPassLastModifiedMs(businessId) {
  if (!businessId) return;
  const row = db.prepare("SELECT pass_last_modified_ms FROM businesses WHERE id = ?").get(businessId);
  const next = computeNextPassLastModifiedMs(row?.pass_last_modified_ms, Date.now());
  db.prepare("UPDATE businesses SET pass_last_modified_ms = ? WHERE id = ?").run(next, businessId);
}

export function bumpBusinessPassRefreshTimestamp(businessId) {
  if (!businessId) return;
  db.prepare("UPDATE businesses SET notification_pass_layout_at = ? WHERE id = ?").run(nowUtcSqlWithMs(), businessId);
  touchPassLastModifiedMs(businessId);
}

/** Dernier message broadcast campagne (séquence + horodatage pass). */
export function setLastBroadcastMessage(businessId, message) {
  if (!businessId || message == null) return;
  const now = nowUtcSqlWithMs();
  db.prepare(
    "UPDATE businesses SET last_broadcast_message = ?, last_broadcast_at = ?, broadcast_send_seq = COALESCE(broadcast_send_seq, 0) + 1 WHERE id = ?"
  ).run(String(message).trim().slice(0, 500), now, businessId);
  touchPassLastModifiedMs(businessId);
}

export function updateBusiness(businessId, updates) {
  const b = getBusinessById(businessId);
  if (!b) return null;

  const u = { ...updates };
  if (u.logo_base64 !== undefined) {
    setBusinessAssetData(businessId, "logo", u.logo_base64 === null || u.logo_base64 === "" ? null : String(u.logo_base64));
    u.logo_updated_at =
      u.logo_base64 == null || u.logo_base64 === "" ? null : new Date().toISOString();
    delete u.logo_base64;
  }
  if (u.logo_icon_base64 !== undefined) {
    setBusinessAssetData(
      businessId,
      "logo_icon",
      u.logo_icon_base64 === null || u.logo_icon_base64 === "" ? null : String(u.logo_icon_base64),
    );
    u.logo_icon_updated_at =
      u.logo_icon_base64 == null || u.logo_icon_base64 === "" ? null : new Date().toISOString();
    delete u.logo_icon_base64;
  }
  if (u.notification_icon_base64 !== undefined) {
    const iconPayload =
      u.notification_icon_base64 === null || u.notification_icon_base64 === ""
        ? null
        : String(u.notification_icon_base64);
    setBusinessAssetData(businessId, "notification_icon", iconPayload);
    u.notification_icon_updated_at = iconPayload == null ? null : new Date().toISOString();
    delete u.notification_icon_base64;
    if (iconPayload != null) {
      queueMicrotask(() => {
        import("../lib/notification-icon-recovery.js")
          .then((m) => m.recoverNotificationsAfterIconUpload(businessId))
          .catch((e) => console.warn("[notification-icon-recovery] failed:", e?.message || String(e)));
      });
    }
  }
  if (u.card_background_base64 !== undefined) {
    setBusinessAssetData(
      businessId,
      "card_background",
      u.card_background_base64 === null || u.card_background_base64 === "" ? null : String(u.card_background_base64),
    );
    u.card_background_updated_at =
      u.card_background_base64 == null || u.card_background_base64 === "" ? null : new Date().toISOString();
    delete u.card_background_base64;
  }
  if (u.stamp_icon_base64 !== undefined) {
    setBusinessAssetData(
      businessId,
      "stamp_icon",
      u.stamp_icon_base64 === null || u.stamp_icon_base64 === "" ? null : String(u.stamp_icon_base64),
    );
    delete u.stamp_icon_base64;
  }
  if (u.fidelity_page_background_base64 !== undefined) {
    setBusinessAssetData(
      businessId,
      "fidelity_page_background",
      u.fidelity_page_background_base64 === null || u.fidelity_page_background_base64 === ""
        ? null
        : String(u.fidelity_page_background_base64),
    );
    u.fidelity_page_background_updated_at =
      u.fidelity_page_background_base64 === null || u.fidelity_page_background_base64 === ""
        ? null
        : new Date().toISOString();
    delete u.fidelity_page_background_base64;
  }

  const allowed = [
    "slug", "organization_name", "back_terms", "back_contact", "background_color", "foreground_color", "label_color",
    "logo_updated_at",
    "logo_icon_updated_at",
    "notification_icon_updated_at",
    "card_background_updated_at",
    "fidelity_page_background_updated_at",
    "strip_color",
    "strip_display_mode",
    "strip_text",
    "location_lat", "location_lng", "location_relevant_text", "location_radius_meters", "location_address",
    "wallet_pass_include_locations",
    "required_stamps", "stamp_emoji", "points_per_euro", "points_per_visit", "program_type", "loyalty_mode",
    "points_per_ticket", "stamp_reward_label", "stamp_mid_reward_label", "start_game_reward_label", "points_min_amount_eur", "baseline_avg_basket_eur", "points_reward_tiers", "expiry_months",
    "sector", "engagement_rewards",
    /** Hypothèses export comptable (valorisation, taux) — JSON objet, max ~32 Ko côté route PATCH. */
    "accounting_prefs_json",
    "flyer_prefs_json", "flyer_prefs_updated_at",
    /** Générations flyer IA consommées sur le mois `flyer_ai_billing_month` (UTC). */
    "flyer_ai_generations_used",
    /** Mois UTC courant du compteur flyer IA (YYYY-MM). */
    "flyer_ai_billing_month",
    /** 1 = générations flyer IA illimitées (équipe / test). */
    "flyer_ai_unlimited",
    /** Générations flyer achetées (pack Stripe) — cumulables, non remises à zéro au changement de mois UTC. */
    "flyer_ai_generations_bonus",
    /** Règles campagnes auto (JSON) — version, règles on/off, messages, cooldown. */
    "campaign_automation_json",
    /** Textes notif. pass / campagnes (doit être persisté — sinon le Wallet garde l’ancien titre affiché sur la bannière). */
    "notification_title_override",
    "notification_change_message",
    "label_restants",
    "label_member",
    "header_right_text",
    /** Accroche h1 page jeu QR (invité) — null = texte par défaut côté client. */
    "fidelity_qr_hero_title",
    /** 0 ou NULL = illimité : crédits points_add max / client / jour (UTC). */
    "scan_max_passes_per_member_per_day",
    /** 0 ou NULL = illimité : plafond de points par opération de crédit. */
    "scan_max_points_per_transaction",
    "require_receipt_qr_validation",
    "receipt_qr_tolerance_cents",
    "delivery_receipt_claims_enabled",
    "delivery_receipt_max_age_days",
    "delivery_receipt_auto_max_amount_eur",
    "delivery_receipt_auto_min_confidence",
    "delivery_receipt_max_per_member_per_day",
    "delivery_receipt_max_per_member_per_month",
  ];
  const numericCols = [
    "location_lat",
    "location_lng",
    "location_radius_meters",
    "required_stamps",
    "points_min_amount_eur",
    "baseline_avg_basket_eur",
    "expiry_months",
    "points_per_ticket",
    "wallet_pass_include_locations",
    "flyer_ai_generations_used",
    "flyer_ai_unlimited",
    "flyer_ai_generations_bonus",
    "scan_max_passes_per_member_per_day",
    "scan_max_points_per_transaction",
    "require_receipt_qr_validation",
    "receipt_qr_tolerance_cents",
    "delivery_receipt_claims_enabled",
    "delivery_receipt_max_age_days",
    "delivery_receipt_auto_max_amount_eur",
    "delivery_receipt_auto_min_confidence",
    "delivery_receipt_max_per_member_per_day",
    "delivery_receipt_max_per_member_per_month",
  ];
  const setClauses = [];
  const values = [];
  for (const [key, value] of Object.entries(u)) {
    const col = key.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
    if (allowed.includes(col) && value !== undefined) {
      setClauses.push(`${col} = ?`);
      if (
        col === "points_reward_tiers" ||
        col === "engagement_rewards" ||
        col === "campaign_automation_json" ||
        col === "accounting_prefs_json"
      ) {
        values.push(value == null || value === "" ? null : (typeof value === "string" ? value : JSON.stringify(value)));
      } else if (numericCols.includes(col)) {
        const n = value === null || value === "" ? null : Number(value);
        values.push(Number.isFinite(n) ? n : null);
      } else {
        values.push(value === null || value === "" ? null : String(value).trim());
      }
    }
  }
  if (setClauses.length === 0) return getBusinessById(businessId);
  values.push(businessId);
  db.prepare(`UPDATE businesses SET ${setClauses.join(", ")} WHERE id = ?`).run(...values);
  touchPassLastModifiedMs(businessId);
  return getBusinessById(businessId);
}

/**
 * Ajoute des générations flyer « bonus » (achat Stripe). Ne modifie pas `flyer_ai_generations_used`.
 * @param {string} businessId
 * @param {number} delta
 */
export function incrementFlyerAiGenerationsBonus(businessId, delta) {
  const b = getBusinessById(businessId);
  if (!b) return null;
  const current = Math.max(0, Math.floor(Number(b.flyer_ai_generations_bonus) || 0));
  const add = Math.max(0, Math.floor(Number(delta) || 0));
  if (add <= 0) return b;
  return updateBusiness(businessId, { flyer_ai_generations_bonus: current + add });
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
      `INSERT INTO businesses (id, name, slug, organization_name, back_terms, back_contact, loyalty_mode, points_reward_tiers, engagement_rewards)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      "Demo Fast-Food",
      "demo",
      "Demo Fast-Food",
      "1 point = 1 € de réduction. Valable en magasin.",
      "contact@example.com",
      DEMO_LOYALTY_MODE,
      DEMO_POINTS_REWARD_TIERS_JSON,
      DEMO_ENGAGEMENT_REWARDS_JSON,
    );
    b = getBusinessBySlug("demo");
  }
  return b;
}
