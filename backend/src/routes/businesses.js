import { Router } from "express";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  getBusinessBySlug,
  getBusinessByDashboardToken,
  createBusiness,
  updateBusiness,
  createMember,
  getMemberForBusiness,
  getMemberByEmailForBusiness,
  updateMember,
  addPoints,
  deductPoints,
  resetMemberPoints,
  createTransaction,
  getDashboardStats,
  getDashboardEvolution,
  getMembersForBusiness,
  getTransactionsForBusiness,
  getWebPushSubscriptionsByBusiness,
  getPassKitPushTokensForBusiness,
  getPassKitRegistrationsCountForBusiness,
  getPushTokensForMember,
  removeTestPassKitDevices,
  logNotification,
  setLastBroadcastMessage,
  touchMemberLastVisit,
  ensureDefaultBusiness,
  canCreateBusiness,
  getCategoriesForBusiness,
  createCategory,
  getCategoryById,
  updateCategory,
  deleteCategory,
  setMemberCategories,
  getPassKitPushTokensForBusinessFiltered,
  getWebPushSubscriptionsByBusinessFiltered,
  getMemberIdsInCategories,
} from "../db.js";
import { sendWebPush, getLogoIconBuffer } from "../notifications.js";
import { sendPassKitUpdate } from "../apns.js";
import { requireAuth } from "../middleware/auth.js";
import { generatePass, getPassAuthenticationToken } from "../pass.js";
import { getGoogleWalletSaveUrl } from "../google-wallet.js";
import { randomUUID } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const businessAssetsDir = join(__dirname, "..", "assets", "businesses");

const router = Router();

/** Vérifie l'accès au dashboard : token valide pour ce commerce OU utilisateur connecté propriétaire. */
function canAccessDashboard(business, req) {
  if (!business) return false;
  const token = req.query.token || req.get("X-Dashboard-Token");
  const byToken = getBusinessByDashboardToken(token);
  if (byToken && byToken.id === business.id) return true;
  if (req.user && business.user_id === req.user.id) return true;
  return false;
}

/**
 * GET /api/businesses/:slug/dashboard/settings
 * Paramètres de personnalisation (couleurs, dos, nom) — token ou JWT propriétaire.
 */
router.get("/:slug/dashboard/settings", (req, res, next) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const apiBase = (process.env.API_URL || "").replace(/\/$/, "") || (req.protocol + "://" + (req.get("host") || ""));
  // snake_case pour l'app iOS (keyDecodingStrategy .convertFromSnakeCase)
  let points_reward_tiers = business.points_reward_tiers;
  if (typeof points_reward_tiers === "string" && points_reward_tiers.trim()) {
    try {
      points_reward_tiers = JSON.parse(points_reward_tiers);
    } catch (_) {
      points_reward_tiers = undefined;
    }
  }
  res.json({
    organization_name: business.organization_name ?? undefined,
    background_color: business.background_color ?? undefined,
    foreground_color: business.foreground_color ?? undefined,
    label_color: business.label_color ?? undefined,
    back_terms: business.back_terms ?? undefined,
    back_contact: business.back_contact ?? undefined,
    location_lat: business.location_lat != null ? Number(business.location_lat) : undefined,
    location_lng: business.location_lng != null ? Number(business.location_lng) : undefined,
    location_relevant_text: business.location_relevant_text ?? undefined,
    location_radius_meters: business.location_radius_meters != null ? Number(business.location_radius_meters) : undefined,
    location_address: business.location_address ?? undefined,
    required_stamps: business.required_stamps != null ? Number(business.required_stamps) : undefined,
    stamp_emoji: business.stamp_emoji ?? undefined,
    stamp_reward_label: business.stamp_reward_label ?? undefined,
    points_per_euro: business.points_per_euro != null ? Number(business.points_per_euro) : undefined,
    points_per_visit: business.points_per_visit != null ? Number(business.points_per_visit) : undefined,
    program_type: business.program_type ?? undefined,
    points_min_amount_eur: business.points_min_amount_eur != null ? Number(business.points_min_amount_eur) : undefined,
    points_reward_tiers: points_reward_tiers ?? undefined,
    expiry_months: business.expiry_months != null ? Number(business.expiry_months) : undefined,
    sector: business.sector ?? undefined,
    logo_url: business.logo_base64 ? `${apiBase}/api/businesses/${encodeURIComponent(req.params.slug)}/logo` : undefined,
    logo_updated_at: business.logo_updated_at ?? undefined,
    has_card_background: !!(business.card_background_base64 && String(business.card_background_base64).trim()),
    strip_color: business.strip_color ?? undefined,
    strip_display_mode: business.strip_display_mode ?? "logo",
    strip_text: business.strip_text ?? undefined,
  });
});

/**
 * PATCH /api/businesses/:slug/dashboard/settings
 * Mise à jour des paramètres « Ma Carte » (app / SaaS). Accepte snake_case comme l'app iOS.
 * Body: organization_name?, background_color?, foreground_color?, required_stamps?
 * Couleurs en hex avec ou sans #. Réponse 200 (sans body obligatoire) ou 204.
 */
function normalizeHexForPatch(v) {
  if (v == null || v === "") return null;
  const s = String(v).trim().replace(/^#/, "");
  if (/^[0-9A-Fa-f]{6}$/.test(s)) return `#${s}`;
  return null;
}
const MAX_LOGO_BASE64_BYTES = 4 * 1024 * 1024; // 4 Mo

router.patch("/:slug/dashboard/settings", async (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const body = req.body || {};
  const organization_name = body.organization_name ?? body.organizationName;
  const background_color = body.background_color ?? body.backgroundColor;
  const foreground_color = body.foreground_color ?? body.foregroundColor;
  const required_stamps = body.required_stamps ?? body.requiredStamps;
  const stamp_emoji = body.stamp_emoji ?? body.stampEmoji;
  const stamp_reward_label = body.stamp_reward_label ?? body.stampRewardLabel;
  const program_type = body.program_type ?? body.programType;
  const points_per_euro = body.points_per_euro ?? body.pointsPerEuro;
  const points_per_visit = body.points_per_visit ?? body.pointsPerVisit;
  const points_min_amount_eur = body.points_min_amount_eur ?? body.pointsMinAmountEur;
  const points_reward_tiers = body.points_reward_tiers ?? body.pointsRewardTiers;
  const expiry_months = body.expiry_months ?? body.expiryMonths;
  const sector = body.sector;
  const logo_base64 = body.logo_base64 ?? body.logoBase64;
  const card_background_base64 = body.card_background_base64 ?? body.cardBackgroundBase64;
  const strip_color = body.strip_color ?? body.stripColor;
  const strip_display_mode = body.strip_display_mode ?? body.stripDisplayMode;
  const strip_text = body.strip_text ?? body.stripText;
  const logo_url = (body.logo_url ?? body.logoUrl ?? "").trim();
  const location_address = body.location_address ?? body.locationAddress;
  const location_lat = body.location_lat ?? body.locationLat;
  const location_lng = body.location_lng ?? body.locationLng;
  const location_radius_meters = body.location_radius_meters ?? body.locationRadiusMeters;
  const location_relevant_text = body.location_relevant_text ?? body.locationRelevantText;
  const updates = {};
  if (organization_name !== undefined) updates.organization_name = organization_name ? String(organization_name).trim() : null;
  if (location_address !== undefined) updates.location_address = location_address ? String(location_address).trim() : null;
  if (location_lat !== undefined) updates.location_lat = location_lat === null || location_lat === "" ? null : Number(location_lat);
  if (location_lng !== undefined) updates.location_lng = location_lng === null || location_lng === "" ? null : Number(location_lng);
  if (location_radius_meters !== undefined) updates.location_radius_meters = location_radius_meters === null || location_radius_meters === "" ? null : Math.min(2000, Math.max(0, Number(location_radius_meters) || 500));
  if (location_relevant_text !== undefined) updates.location_relevant_text = location_relevant_text ? String(location_relevant_text).trim() : null;
  if (background_color !== undefined) {
    updates.background_color = normalizeHexForPatch(background_color);
    updates.strip_color = updates.background_color;
  }
  if (foreground_color !== undefined) updates.foreground_color = normalizeHexForPatch(foreground_color);
  if (program_type !== undefined) {
    const v = program_type === null || program_type === "" ? null : String(program_type).trim().toLowerCase();
    updates.program_type = (v === "points" || v === "stamps") ? v : null;
  }
  if (points_per_euro !== undefined) {
    const n = points_per_euro === null || points_per_euro === "" ? null : Number(points_per_euro);
    updates.points_per_euro = Number.isFinite(n) && n >= 0 ? String(n) : "1";
  }
  if (points_per_visit !== undefined) {
    const n = points_per_visit === null || points_per_visit === "" ? null : Number(points_per_visit);
    updates.points_per_visit = Number.isFinite(n) && n >= 0 ? String(n) : "0";
  }
  if (points_min_amount_eur !== undefined) {
    const n = points_min_amount_eur === null || points_min_amount_eur === "" ? null : Number(points_min_amount_eur);
    updates.points_min_amount_eur = Number.isFinite(n) && n >= 0 ? n : null;
  }
  if (points_reward_tiers !== undefined) {
    if (points_reward_tiers === null || points_reward_tiers === "") {
      updates.points_reward_tiers = null;
    } else if (Array.isArray(points_reward_tiers)) {
      updates.points_reward_tiers = JSON.stringify(points_reward_tiers);
    } else if (typeof points_reward_tiers === "string") {
      try {
        JSON.parse(points_reward_tiers);
        updates.points_reward_tiers = points_reward_tiers;
      } catch (_) {
        updates.points_reward_tiers = null;
      }
    }
  }
  if (expiry_months !== undefined) {
    const n = expiry_months === null || expiry_months === "" ? null : Number(expiry_months);
    updates.expiry_months = Number.isInteger(n) && n >= 0 ? n : null;
  }
  if (sector !== undefined) updates.sector = sector ? String(sector).trim().slice(0, 64) : null;
  if (required_stamps !== undefined) {
    const n = required_stamps === null || required_stamps === "" ? null : Number(required_stamps);
    updates.required_stamps = Number.isInteger(n) && n >= 0 ? n : null;
  }
  if (stamp_emoji !== undefined) {
    const v = stamp_emoji == null || stamp_emoji === "" ? null : String(stamp_emoji).trim().slice(0, 8);
    updates.stamp_emoji = v || null;
  }
  if (stamp_reward_label !== undefined) {
    const v = stamp_reward_label == null || stamp_reward_label === "" ? null : String(stamp_reward_label).trim().slice(0, 120);
    updates.stamp_reward_label = v || null;
  }
  if (logo_base64 !== undefined) {
    if (logo_base64 === null || (typeof logo_base64 === "string" && logo_base64.trim() === "")) {
      updates.logo_base64 = null;
    } else if (typeof logo_base64 === "string") {
      const base64Data = String(logo_base64).replace(/^data:image\/\w+;base64,/, "");
      const buf = Buffer.from(base64Data, "base64");
      if (buf.length > MAX_LOGO_BASE64_BYTES) {
        return res.status(400).json({ error: "Logo trop volumineux (max 4 Mo)." });
      }
      if (buf.length > 0) updates.logo_base64 = logo_base64.startsWith("data:") ? logo_base64 : `data:image/png;base64,${base64Data}`;
      else updates.logo_base64 = null;
    }
  }
  if (card_background_base64 !== undefined) {
    if (card_background_base64 === null || (typeof card_background_base64 === "string" && card_background_base64.trim() === "")) {
      updates.card_background_base64 = null;
    } else if (typeof card_background_base64 === "string") {
      const base64Data = String(card_background_base64).replace(/^data:image\/\w+;base64,/, "");
      const buf = Buffer.from(base64Data, "base64");
      if (buf.length > MAX_LOGO_BASE64_BYTES) {
        return res.status(400).json({ error: "Image de fond trop volumineuse (max 4 Mo)." });
      }
      updates.card_background_base64 = card_background_base64.startsWith("data:") ? card_background_base64 : `data:image/png;base64,${base64Data}`;
    }
  }
  if (strip_color !== undefined) {
    const v = strip_color === null || strip_color === "" ? null : normalizeHexForPatch(strip_color);
    updates.strip_color = v || null;
  }
  if (strip_display_mode !== undefined) {
    const v = strip_display_mode === "text" ? "text" : "logo";
    updates.strip_display_mode = v;
  }
  if (strip_text !== undefined) {
    updates.strip_text = strip_text == null || String(strip_text).trim() === "" ? null : String(strip_text).trim().slice(0, 120);
  }
  if (logo_url && (logo_url.startsWith("http://") || logo_url.startsWith("https://"))) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(logo_url, { signal: controller.signal, headers: { "User-Agent": "MyFidpass-Backend/1" } });
      clearTimeout(timeout);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length > MAX_LOGO_BASE64_BYTES) {
        return res.status(400).json({ error: "Image du logo trop volumineuse (max 4 Mo)." });
      }
      const contentType = resp.headers.get("Content-Type") || "image/png";
      const base64 = buf.toString("base64");
      updates.logo_base64 = `data:${contentType.split(";")[0]};base64,${base64}`;
    } catch (e) {
      return res.status(400).json({ error: "Impossible de récupérer l'image du logo. Vérifiez l'URL." });
    }
  }
  if (Object.keys(updates).length === 0) {
    return res.status(204).send();
  }
  const locationKeys = ["location_lat", "location_lng", "location_radius_meters", "location_relevant_text"];
  const locationUpdated = locationKeys.some((k) => updates[k] !== undefined);
  updateBusiness(business.id, updates);
  if (locationUpdated) {
    const passKitTokens = getPassKitPushTokensForBusiness(business.id);
    if (passKitTokens.length > 0) {
      setImmediate(() => {
        passKitTokens.forEach((row) => {
          sendPassKitUpdate(row.push_token).catch(() => {});
        });
      });
    }
  }
  return res.status(200).send();
});

/**
 * GET /api/businesses/:slug/dashboard/stats
 * Stats pour le tableau de bord (token OU JWT propriétaire).
 */
router.get("/:slug/dashboard/stats", (req, res, next) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const stats = getDashboardStats(business.id);
  // snake_case pour l'app iOS (keyDecodingStrategy .convertFromSnakeCase)
  res.json({
    members_count: stats.membersCount ?? 0,
    points_this_month: stats.pointsThisMonth ?? 0,
    transactions_this_month: stats.transactionsThisMonth ?? 0,
    new_members_last_7_days: stats.newMembersLast7Days ?? 0,
    new_members_last_30_days: stats.newMembersLast30Days ?? 0,
    inactive_members_30_days: stats.inactiveMembers30Days ?? 0,
    points_average_per_member: stats.pointsAveragePerMember ?? 0,
    business_name: business.organization_name ?? undefined,
  });
});

/**
 * GET /api/businesses/:slug/dashboard/members
 * Liste des membres (token OU JWT propriétaire). Query: search, limit, offset, filter (inactive30|inactive90|points50), sort (last_visit|points|name|created).
 */
router.get("/:slug/dashboard/members", (req, res, next) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const search = req.query.search ?? "";
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const filter = ["inactive30", "inactive90", "points50"].includes(req.query.filter) ? req.query.filter : null;
  const sort = ["last_visit", "points", "name", "created"].includes(req.query.sort) ? req.query.sort : "last_visit";
  const result = getMembersForBusiness(business.id, { search, limit, offset, filter, sort });
  res.json(result);
});

/**
 * GET /api/businesses/:slug/dashboard/categories
 * Liste des catégories de membres (pour classement et notifications ciblées).
 */
router.get("/:slug/dashboard/categories", (req, res, next) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const categories = getCategoriesForBusiness(business.id);
  res.json({ categories });
});

/**
 * POST /api/businesses/:slug/dashboard/categories
 * Créer une catégorie. Body: name, color_hex? (snake_case pour l'app iOS).
 */
router.post("/:slug/dashboard/categories", (req, res, next) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const name = (req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Le nom est obligatoire" });
  const colorHex = req.body?.color_hex ?? req.body?.colorHex ?? null;
  const sortOrder = req.body?.sort_order ?? req.body?.sortOrder ?? 0;
  const category = createCategory({ businessId: business.id, name, colorHex, sortOrder });
  res.status(201).json(category);
});

/**
 * PATCH /api/businesses/:slug/dashboard/categories/:categoryId
 */
router.patch("/:slug/dashboard/categories/:categoryId", (req, res, next) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const cat = getCategoryById(req.params.categoryId);
  if (!cat || cat.business_id !== business.id) return res.status(404).json({ error: "Catégorie introuvable" });
  const name = req.body?.name != null ? String(req.body.name).trim() : undefined;
  const colorHex = req.body?.color_hex !== undefined ? (req.body.color_hex ? String(req.body.color_hex).trim() : null) : undefined;
  const sortOrder = req.body?.sort_order !== undefined ? Number(req.body.sort_order) : undefined;
  const updated = updateCategory(req.params.categoryId, { name, colorHex, sortOrder });
  res.json(updated);
});

/**
 * DELETE /api/businesses/:slug/dashboard/categories/:categoryId
 */
router.delete("/:slug/dashboard/categories/:categoryId", (req, res, next) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const cat = getCategoryById(req.params.categoryId);
  if (!cat || cat.business_id !== business.id) return res.status(404).json({ error: "Catégorie introuvable" });
  deleteCategory(req.params.categoryId);
  res.status(204).end();
});

/**
 * POST /api/businesses/:slug/dashboard/members/:memberId/categories
 * Met à jour les catégories d'un membre (liste complète). Body: category_ids (tableau).
 */
router.post("/:slug/dashboard/members/:memberId/categories", (req, res, next) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const member = getMemberForBusiness(req.params.memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });
  const categoryIds = Array.isArray(req.body?.category_ids) ? req.body.category_ids : (req.body?.categoryIds || []);
  const ids = categoryIds.filter((id) => id && getCategoryById(id)?.business_id === business.id);
  setMemberCategories(req.params.memberId, ids);
  res.status(200).json({ ok: true });
});

/**
 * GET /api/businesses/:slug/dashboard/transactions
 * Historique des transactions. Query: limit, offset, memberId, days (7|30|90), type (points_add|visit).
 */
router.get("/:slug/dashboard/transactions", (req, res, next) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const limit = Math.min(Number(req.query.limit) || 30, 200);
  const offset = Number(req.query.offset) || 0;
  const memberId = req.query.memberId || null;
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : null;
  const type = ["points_add", "visit"].includes(req.query.type) ? req.query.type : null;
  const result = getTransactionsForBusiness(business.id, { limit, offset, memberId, days, type });
  res.json(result);
});

/**
 * GET /api/businesses/:slug/dashboard/evolution
 * Données pour graphique (opérations / membres par semaine, 6 semaines).
 */
router.get("/:slug/dashboard/evolution", (req, res, next) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const weeks = Math.min(Math.max(Number(req.query.weeks) || 6, 4), 12);
  const evolution = getDashboardEvolution(business.id, weeks);
  res.json({ evolution });
});

/**
 * GET /api/businesses/:slug/dashboard/members/export
 * Export CSV des membres (même filtres que liste).
 */
router.get("/:slug/dashboard/members/export", (req, res, next) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const search = req.query.search ?? "";
  const filter = ["inactive30", "inactive90", "points50"].includes(req.query.filter) ? req.query.filter : null;
  const sort = ["last_visit", "points", "name", "created"].includes(req.query.sort) ? req.query.sort : "last_visit";
  const { members } = getMembersForBusiness(business.id, { search, limit: 2000, offset: 0, filter, sort });
  const header = "Nom;Email;Points;Dernière visite;Inscrit le\n";
  const csv = header + members.map((m) => {
    const name = (m.name || "").replace(/;/g, ",").replace(/\n/g, " ");
    const email = (m.email || "").replace(/;/g, ",");
    const lastVisit = m.last_visit_at ? new Date(m.last_visit_at).toLocaleString("fr-FR") : "";
    const created = m.created_at ? new Date(m.created_at).toLocaleString("fr-FR") : "";
    return `${name};${email};${m.points};${lastVisit};${created}`;
  }).join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="membres-${business.slug}.csv"`);
  res.send("\uFEFF" + csv);
});

/**
 * GET /api/businesses/:slug/dashboard/transactions/export
 * Export CSV des transactions (même filtres que liste).
 */
router.get("/:slug/dashboard/transactions/export", (req, res, next) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : null;
  const type = ["points_add", "visit"].includes(req.query.type) ? req.query.type : null;
  const { transactions } = getTransactionsForBusiness(business.id, { limit: 2000, offset: 0, days, type });
  const header = "Client;Email;Type;Points;Date\n";
  const csv = header + transactions.map((t) => {
    const name = (t.member_name || "").replace(/;/g, ",").replace(/\n/g, " ");
    const email = (t.member_email || "").replace(/;/g, ",");
    const typeLabel = t.type === "points_add" ? (t.metadata && (t.metadata.includes("visit") ? "Passage" : "Points")) : t.type;
    const date = t.created_at ? new Date(t.created_at).toLocaleString("fr-FR") : "";
    return `${name};${email};${typeLabel};${t.points};${date}`;
  }).join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="transactions-${business.slug}.csv"`);
  res.send("\uFEFF" + csv);
});

/**
 * POST /api/businesses/:slug/notify
 * Alias pour l'app iOS : body { message, category_ids? }. Envoie la notif aux clients (Web Push + PassKit).
 * Si category_ids est fourni et non vide, envoi uniquement aux membres ayant au moins une de ces catégories.
 */
router.post("/:slug/notify", async (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const message = (req.body?.message ?? "").trim();
  if (!message) return res.status(400).json({ error: "Le message est obligatoire" });
  const categoryIds = Array.isArray(req.body?.category_ids) ? req.body.category_ids.filter(Boolean) : null;
  const memberIds = categoryIds && categoryIds.length > 0 ? getMemberIdsInCategories(business.id, categoryIds) : null;
  const webSubscriptions = memberIds !== null
    ? getWebPushSubscriptionsByBusinessFiltered(business.id, memberIds)
    : getWebPushSubscriptionsByBusiness(business.id);
  const passKitTokens = memberIds !== null
    ? getPassKitPushTokensForBusinessFiltered(business.id, memberIds)
    : getPassKitPushTokensForBusiness(business.id);
  const totalDevices = webSubscriptions.length + passKitTokens.length;
  if (totalDevices === 0) {
    return res.status(200).json({ ok: true, sent: 0, sentWebPush: 0, sentPassKit: 0 });
  }
  const apiBase = (process.env.API_URL || "").replace(/\/$/, "") || (req.protocol + "://" + (req.get("host") || ""));
  const iconUrl = business.logo_base64
    ? `${apiBase}/api/businesses/${encodeURIComponent(req.params.slug)}/notification-icon`
    : null;
  const payload = {
    title: (business.organization_name || "Myfidpass").trim(),
    body: message,
    ...(iconUrl && { icon: iconUrl }),
  };
  let sentWebPush = 0;
  let sentPassKit = 0;

  // Web Push : envoi immédiat
  for (const sub of webSubscriptions) {
    try {
      await sendWebPush({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      sentWebPush++;
      logNotification({ businessId: business.id, memberId: sub.member_id, title: payload.title, body: message, type: "web_push" });
    } catch (_) {}
  }

  // PassKit : double push pour que l’icône de notif soit à jour après changement de logo
  // 1) Première push → l’iPhone refetch le pass (nouveau logo si changé), sans afficher de notif (message pas encore mis à jour)
  if (passKitTokens.length > 0) {
    for (const row of passKitTokens) {
      try {
        await sendPassKitUpdate(row.push_token);
      } catch (_) {}
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  setLastBroadcastMessage(business.id, payload.title ? `${payload.title}: ${message}` : message);
  const touchedMembers = new Set();
  for (const row of passKitTokens) {
    if (row.serial_number && !touchedMembers.has(row.serial_number)) {
      touchMemberLastVisit(row.serial_number);
      touchedMembers.add(row.serial_number);
    }
  }
  // 2) Deuxième push → l’iPhone refetch le pass (message à jour) et affiche la notif avec la bonne icône
  for (const row of passKitTokens) {
    try {
      const result = await sendPassKitUpdate(row.push_token);
      if (result.sent) {
        sentPassKit++;
        logNotification({ businessId: business.id, memberId: row.serial_number, title: payload.title, body: message, type: "passkit" });
      }
    } catch (_) {}
  }
  res.status(200).json({ ok: true, sent: sentWebPush + sentPassKit, sentWebPush, sentPassKit });
});

/**
 * POST /api/businesses/:slug/notifications/send
 * Envoie une notification aux membres : Web Push (navigateur) + APNs (Apple Wallet).
 * Body: { title?, message (requis), category_ids? }. Si category_ids fourni et non vide, ciblage par catégorie.
 * Auth: token ou JWT.
 */
router.post("/:slug/notifications/send", async (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const { title, message, category_ids: reqCategoryIds } = req.body || {};
  const body = (message || "").trim();
  if (!body) {
    return res.status(400).json({ error: "Le message est obligatoire" });
  }
  const categoryIds = Array.isArray(reqCategoryIds) ? reqCategoryIds.filter(Boolean) : null;
  const memberIds = categoryIds && categoryIds.length > 0 ? getMemberIdsInCategories(business.id, categoryIds) : null;
  const webSubscriptions = memberIds !== null
    ? getWebPushSubscriptionsByBusinessFiltered(business.id, memberIds)
    : getWebPushSubscriptionsByBusiness(business.id);
  const passKitTokens = memberIds !== null
    ? getPassKitPushTokensForBusinessFiltered(business.id, memberIds)
    : getPassKitPushTokensForBusiness(business.id);
  const totalDevices = webSubscriptions.length + passKitTokens.length;
  if (totalDevices === 0) {
    return res.json({
      ok: true,
      sent: 0,
      sentWebPush: 0,
      sentPassKit: 0,
      message: "Aucun appareil enregistré. Les clients qui ajoutent la carte (Apple Wallet ou navigateur) pourront recevoir les notifications.",
    });
  }
  const apiBase = (process.env.API_URL || "").replace(/\/$/, "") || (req.protocol + "://" + (req.get("host") || ""));
  const iconUrl = business.logo_base64
    ? `${apiBase}/api/businesses/${encodeURIComponent(req.params.slug)}/notification-icon`
    : null;
  const payload = {
    title: (title || business.organization_name || "Myfidpass").trim(),
    body,
    ...(iconUrl && { icon: iconUrl }),
  };
  const broadcastText = payload.title ? `${payload.title}: ${body}` : body;
  let sentWebPush = 0;
  let sentPassKit = 0;
  const errors = [];
  for (const sub of webSubscriptions) {
    try {
      await sendWebPush(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      sentWebPush++;
      logNotification({ businessId: business.id, memberId: sub.member_id, title: payload.title, body, type: "web_push" });
    } catch (err) {
      errors.push({ type: "web_push", memberId: sub.member_id, error: err.message || String(err) });
    }
  }
  if (passKitTokens.length > 0) {
    for (const row of passKitTokens) {
      try { await sendPassKitUpdate(row.push_token); } catch (_) {}
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  setLastBroadcastMessage(business.id, broadcastText);
  const touchedMembers = new Set();
  for (const row of passKitTokens) {
    if (row.serial_number && !touchedMembers.has(row.serial_number)) {
      touchMemberLastVisit(row.serial_number);
      touchedMembers.add(row.serial_number);
    }
  }
  for (const row of passKitTokens) {
    try {
      const result = await sendPassKitUpdate(row.push_token);
      if (result.sent) {
        sentPassKit++;
        logNotification({ businessId: business.id, memberId: row.serial_number, title: payload.title, body, type: "passkit" });
      } else if (result.error) {
        errors.push({ type: "passkit", memberId: row.serial_number, error: result.error });
      }
    } catch (err) {
      errors.push({ type: "passkit", memberId: row.serial_number, error: err.message || String(err) });
    }
  }
  const sent = sentWebPush + sentPassKit;
  const firstError = errors.length > 0 ? errors[0].error : null;
  res.json({
    ok: true,
    sent,
    sentWebPush,
    sentPassKit,
    total: totalDevices,
    failed: errors.length,
    errors: errors.length > 0 ? errors : undefined,
    message:
      sent === 0 && totalDevices > 0 && firstError
        ? `Aucun appareil n'a reçu la notification. Erreur : ${firstError}`
        : undefined,
  });
});

/**
 * GET /api/businesses/:slug/notifications/stats
 * Nombre d'appareils pouvant recevoir les notifications (Web Push + Apple Wallet).
 */
router.get("/:slug/notifications/stats", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const webSubscriptions = getWebPushSubscriptionsByBusiness(business.id);
  const passKitTokens = getPassKitPushTokensForBusiness(business.id);
  const passKitRegistrationsCount = getPassKitRegistrationsCountForBusiness(business.id);
  const subscriptionsCount = webSubscriptions.length + passKitRegistrationsCount;
  const passKitUrlConfigured = !!(process.env.PASSKIT_WEB_SERVICE_URL || process.env.API_URL);
  const noDeviceButConfigured = subscriptionsCount === 0 && !!(process.env.PASSKIT_WEB_SERVICE_URL || process.env.API_URL);
  const { members: membersList, total: membersCount } = getMembersForBusiness(business.id, { limit: 1 });
  const member = membersList && membersList[0];
  let testPasskitCurl = null;
  if (noDeviceButConfigured && member) {
      const baseUrl = (process.env.PASSKIT_WEB_SERVICE_URL || process.env.API_URL || "https://api.myfidpass.fr").replace(/\/$/, "");
      const passTypeId = process.env.PASS_TYPE_ID || "pass.com.example.fidelity";
      const token = getPassAuthenticationToken(member.id);
      const url = `${baseUrl}/api/v1/devices/test-device-123/registrations/${encodeURIComponent(passTypeId)}/${encodeURIComponent(member.id)}`;
      testPasskitCurl = `curl -X POST "${url}" -H "Authorization: ApplePass ${token}" -H "Content-Type: application/json" -d '{"pushToken":"test"}' -w "\\nHTTP %{http_code}"`;
  }
  res.json({
    subscriptionsCount,
    membersCount: membersCount ?? 0,
    webPushCount: webSubscriptions.length,
    passKitCount: passKitRegistrationsCount,
    passKitWithTokenCount: passKitTokens.length,
    membersWithNotifications: new Set(webSubscriptions.map((s) => s.member_id)).size + new Set(passKitTokens.map((p) => p.serial_number)).size,
    passKitUrlConfigured,
    diagnostic: !passKitUrlConfigured
      ? "PASSKIT_WEB_SERVICE_URL non défini sur le backend. Les passes sont générés sans URL d'enregistrement, donc l'iPhone ne contacte jamais le serveur. Ajoutez sur Railway : PASSKIT_WEB_SERVICE_URL = https://api.myfidpass.fr (sans slash final), puis redéployez. Ensuite, supprimez la carte du Wallet et ré-ajoutez-la depuis le lien partagé."
      : null,
    helpWhenNoDevice: noDeviceButConfigured
      ? "1) Supprime la carte du Wallet sur ton iPhone. 2) Ouvre le lien de ta carte (copié dans « Partager ») en navigation privée. 3) Clique « Apple Wallet » pour télécharger un pass neuf. 4) Ajoute la carte au Wallet. 5) Attends 30 secondes puis rafraîchis cette page."
      : null,
    testPasskitCurl: testPasskitCurl || undefined,
    paradoxExplanation: membersCount > 0 && subscriptionsCount === 0 && passKitUrlConfigured
      ? "Si tu as pu scanner la carte du client et lui ajouter des points, sa carte est bien dans son Wallet — mais notre serveur n'a jamais reçu l'appel d'enregistrement de son iPhone. Soit le pass qu'il a ajouté a été généré sans URL d'enregistrement (ancien lien ou cache), soit l'iPhone ou le réseau empêche l'appel. À faire : le client supprime la carte du Wallet, rouvre le lien partagé (depuis « Partager »), clique « Apple Wallet », ajoute la carte à nouveau (pass neuf). Tester en 4G si le WiFi bloque, et vérifier Réglages → Wallet sur l'iPhone."
      : null,
    dataDirHint: membersCount > 0 && passKitRegistrationsCount === 0 && process.env.NODE_ENV === "production"
      ? "Si les logs Railway montrent des « Requête reçue: POST » mais 0 appareil ici : vérifie que le volume Railway est bien monté (Mount path = /data) et que la variable DATA_DIR=/data est définie. Sinon les enregistrements sont perdus à chaque redémarrage du conteneur. Voir docs/CONNEXION-ET-DONNEES.md."
      : null,
    /** Pourquoi "Membres" affiche des gens mais "Notifications" affiche 0 appareil */
    membersVsDevicesExplanation: membersCount > 0 && subscriptionsCount === 0
      ? "Les membres apparaissent dès que le client remplit le formulaire (nom, email) et crée sa carte. Les « appareils » pour les notifications sont enregistrés par l’iPhone lui‑même quand le client ajoute le pass au Wallet — c’est Apple qui doit appeler notre serveur. Si cet appel n’arrive pas (réglages iPhone, réseau, certificat), le compteur reste à 0 alors que le membre est bien en base."
      : null,
  });
});

/**
 * GET /api/businesses/:slug/notifications/test-passkit
 * Retourne une commande curl pour tester si l'API d'enregistrement PassKit répond (diagnostic).
 */
router.get("/:slug/notifications/test-passkit", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const { members: membersList } = getMembersForBusiness(business.id, { limit: 1 });
  const member = membersList && membersList[0];
  if (!member) {
    return res.json({
      ok: false,
      message: "Aucun membre pour ce commerce. Créez d'abord une carte (page fidélité) puis réessayez.",
    });
  }
  const baseUrl = (process.env.PASSKIT_WEB_SERVICE_URL || process.env.API_URL || "https://api.myfidpass.fr").replace(/\/$/, "");
  const passTypeId = process.env.PASS_TYPE_ID || "pass.com.example.fidelity";
  const token = getPassAuthenticationToken(member.id);
  const url = `${baseUrl}/api/v1/devices/test-device-123/registrations/${encodeURIComponent(passTypeId)}/${encodeURIComponent(member.id)}`;
  const curl = `curl -X POST "${url}" -H "Authorization: ApplePass ${token}" -H "Content-Type: application/json" -d '{"pushToken":"test"}' -w "\\nHTTP %{http_code}"`;
  res.json({
    ok: true,
    message: "Exécute cette commande dans un terminal. Si tu obtiens HTTP 201, l'API d'enregistrement fonctionne (le problème vient alors de l'iPhone ou du réseau). Si tu obtiens 401/404/500 ou une erreur de connexion, le souci est côté serveur.",
    curl,
    memberId: member.id,
  });
});

/**
 * POST /api/businesses/:slug/notifications/remove-test-device
 * Supprime l'appareil de test (curl) pour ce commerce.
 */
router.post("/:slug/notifications/remove-test-device", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const removed = removeTestPassKitDevices(business.id);
  res.json({ ok: true, removed, message: removed ? "Appareil de test supprimé." : "Aucun appareil de test à supprimer." });
});

/** Extrait l'ID membre (UUID) du code scanné : brut ou contenu dans une URL. */
function normalizeBarcodeToMemberId(raw) {
  const s = (raw || "").trim();
  if (!s) return null;
  const uuidMatch = s.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  if (uuidMatch) return uuidMatch[0];
  if (/^[0-9a-fA-F-]{36}$/.test(s)) return s;
  return s;
}

/**
 * GET /api/businesses/:slug/integration/lookup
 * Intégration bornes / caisses : consulter un membre à partir du code-barres scanné.
 * Query: barcode (valeur lue = member id ou chaîne contenant l'UUID). Auth: token ou JWT.
 */
router.get("/:slug/integration/lookup", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token ou authentification requis" });
  }
  const raw = (req.query.barcode || "").trim();
  if (!raw) return res.status(400).json({ error: "Paramètre barcode requis" });
  const barcode = normalizeBarcodeToMemberId(raw);
  const member = getMemberForBusiness(barcode, business.id);
  if (!member) {
    return res.status(404).json({
      error: "Code non reconnu pour ce commerce. Scannez le QR affiché sur la carte dans le Wallet du client (pas le lien « Ajouter à Wallet »).",
      code: "MEMBER_NOT_FOUND",
    });
  }
  res.json({
    member: {
      id: member.id,
      name: member.name,
      email: member.email,
      points: member.points,
      last_visit_at: member.last_visit_at || null,
    },
  });
});

/**
 * POST /api/businesses/:slug/integration/scan
 * Intégration bornes / caisses : un seul appel = scan + crédit de points.
 * Body: { barcode, amount_eur?, visit?, points? }. Auth: token ou JWT.
 * Le code-barres Fidpass contient l'identifiant membre (UUID).
 */
router.post("/:slug/integration/scan", async (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token ou authentification requis" });
  }
  const raw = (req.body?.barcode || "").trim();
  if (!raw) {
    return res.status(400).json({ error: "Champ barcode requis", code: "BARCODE_MISSING" });
  }
  const barcode = normalizeBarcodeToMemberId(raw);
  const member = getMemberForBusiness(barcode, business.id);
  if (!member) {
    return res.status(404).json({
      error: "Code non reconnu pour ce commerce. Scannez le QR de la carte dans le Wallet du client.",
      code: "MEMBER_NOT_FOUND",
    });
  }
  const pointsDirect = Number(req.body?.points);
  const amountEur = Number(req.body?.amount_eur);
  const visit = req.body?.visit === true;
  const perEuro = Number(business.points_per_euro) || 1;
  const perVisit = Number(business.points_per_visit) || 0;
  const minAmount = business.points_min_amount_eur != null ? Number(business.points_min_amount_eur) : null;
  const programType = (business.program_type || "").toLowerCase();
  let points = 0;
  if (Number.isInteger(pointsDirect) && pointsDirect > 0) points += pointsDirect;
  if (!Number.isNaN(amountEur) && amountEur > 0) {
    if (minAmount == null || amountEur >= minAmount) {
      points += Math.floor(amountEur * perEuro);
    }
  }
  if (visit && perVisit > 0) points += perVisit;
  // En mode tampons, « 1 passage » = 1 tampon même si points_per_visit = 0
  if (visit && programType === "stamps" && points === 0) points = 1;
  if (points <= 0) {
    const minHint = minAmount != null ? ` Achat minimum ${minAmount} € pour gagner des points.` : "";
    const msg = perVisit === 0 && programType !== "stamps"
      ? `Vos règles : 0 point par passage. Saisissez un montant en € pour créditer des points.${minHint}`
      : `Saisissez le montant du panier en € ou cliquez sur « 1 passage ». Règles : ${perEuro} pt/€, ${perVisit} pt/passage.${minHint}`;
    return res.status(400).json({
      error: msg,
      code: "NO_POINTS_SPECIFIED",
    });
  }
  const updated = addPoints(member.id, points);
  createTransaction({
    businessId: business.id,
    memberId: member.id,
    type: "points_add",
    points,
    metadata: amountEur > 0 || visit ? { amount_eur: amountEur || undefined, visit, source: "integration" } : { source: "integration" },
  });
  const tokens = getPushTokensForMember(member.id);
  if (tokens.length > 0) {
    console.log("[PassKit] Après scan: envoi push à", tokens.length, "appareil(s) pour membre", member.id.slice(0, 8) + "...");
    for (const token of tokens) {
      const result = await sendPassKitUpdate(token);
      if (result.sent) {
        console.log("[PassKit] Push envoyée OK (scan) pour membre", member.id.slice(0, 8) + "...");
      } else {
        console.warn("[PassKit] Push refusée (scan):", result.error || "inconnu");
      }
    }
  }
  res.json({
    member: {
      id: updated.id,
      name: member.name,
      email: member.email,
      points: updated.points,
    },
    points_added: points,
    new_balance: updated.points,
  });
});

/**
 * GET /api/businesses/:slug/notification-icon
 * Icône publique (96×96 PNG) pour les notifications push. Pas d’auth : le navigateur charge cette URL à l’affichage.
 * Utiliser cette URL dans le payload push pour éviter les limites de taille (ex. 4 Ko FCM).
 */
router.get("/:slug/notification-icon", async (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business || !business.logo_base64) return res.status(404).send();
  const buffer = await getLogoIconBuffer(business.logo_base64);
  if (!buffer) return res.status(404).send();
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(buffer);
});

/**
 * GET /api/businesses/:slug/logo
 * Logo du commerce (pour affichage dans le dashboard). Token ou JWT requis.
 */
router.get("/:slug/logo", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  if (business.logo_base64) {
    const base64Data = String(business.logo_base64).replace(/^data:image\/\w+;base64,/, "");
    const buf = Buffer.from(base64Data, "base64");
    if (buf.length > 0) {
      const isPng = business.logo_base64.includes("image/png");
      res.setHeader("Content-Type", isPng ? "image/png" : "image/jpeg");
      // Pas de cache : logo modifiable depuis l'app et le logiciel, toujours afficher la dernière version
      res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      return res.send(buf);
    }
  }
  return res.status(404).send();
});

/**
 * GET /api/businesses/:slug/card-background
 * Image de fond de carte (bandeau) pour l'aperçu personnalisation. Token ou JWT requis.
 */
router.get("/:slug/card-background", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  if (business.card_background_base64) {
    const base64Data = String(business.card_background_base64).replace(/^data:image\/\w+;base64,/, "");
    const buf = Buffer.from(base64Data, "base64");
    if (buf.length > 0) {
      const isPng = business.card_background_base64.includes("image/png");
      res.setHeader("Content-Type", isPng ? "image/png" : "image/jpeg");
      res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      return res.send(buf);
    }
  }
  return res.status(404).send();
});

/**
 * GET /api/businesses/:slug
 * Infos publiques d'une entreprise (pour la page d'inscription).
 */
router.get("/:slug", (req, res) => {
  let business = getBusinessBySlug(req.params.slug);
  if (!business && req.params.slug === "demo") {
    business = ensureDefaultBusiness();
  }
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  res.json({
    id: business.id,
    name: business.name,
    slug: business.slug,
    organizationName: business.organization_name,
    backgroundColor: business.background_color ?? undefined,
    foregroundColor: business.foreground_color ?? undefined,
    labelColor: business.label_color ?? undefined,
  });
});

/**
 * POST /api/businesses/:slug/members
 * Créer un membre (carte fidélité) pour cette entreprise.
 * Body: { email, name }
 */
router.post("/:slug/members", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });

  const { email, name } = req.body || {};
  if (!email || !name) {
    return res.status(400).json({ error: "email et name requis" });
  }

  try {
    const member = createMember({
      id: randomUUID(),
      businessId: business.id,
      email: email.trim(),
      name: name.trim(),
    });
    res.status(201).json({
      memberId: member.id,
      member: {
        id: member.id,
        email: member.email,
        name: member.name,
        points: member.points,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur création membre" });
  }
});

/**
 * POST /api/businesses/:slug/members/import
 * Import en masse de membres (base client existante).
 * Body: { members: [ { email, name, points? } ], onDuplicate?: "skip" | "update" }
 * Auth: token ou JWT. onDuplicate: "skip" = ignorer, "update" = mettre à jour nom/points (défaut: "skip").
 */
router.post("/:slug/members/import", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token ou authentification requis" });
  }
  const { members: rawMembers, onDuplicate = "skip" } = req.body || {};
  if (!Array.isArray(rawMembers) || rawMembers.length === 0) {
    return res.status(400).json({ error: "Body doit contenir un tableau 'members' non vide (ex: [{ email, name, points? }])" });
  }
  const limit = 5000;
  if (rawMembers.length > limit) {
    return res.status(400).json({ error: `Maximum ${limit} membres par import. Découpez en plusieurs appels si besoin.` });
  }
  const created = [];
  const updated = [];
  const skipped = [];
  const errors = [];
  for (let i = 0; i < rawMembers.length; i++) {
    const row = rawMembers[i];
    const email = (row.email != null ? String(row.email).trim() : "").toLowerCase();
    const name = row.name != null ? String(row.name).trim() : "";
    const points = Number.isFinite(Number(row.points)) && Number(row.points) >= 0 ? Number(row.points) : 0;
    if (!email) {
      errors.push({ row: i + 1, email: row.email, reason: "email manquant ou vide" });
      continue;
    }
    if (!name) {
      errors.push({ row: i + 1, email, reason: "name manquant ou vide" });
      continue;
    }
    const existing = getMemberByEmailForBusiness(business.id, email);
    if (existing) {
      if (onDuplicate === "update") {
        updateMember(existing.id, { name, points });
        updated.push({ email, name, id: existing.id });
      } else {
        skipped.push({ email, reason: "déjà existant" });
      }
      continue;
    }
    try {
      const member = createMember({
        businessId: business.id,
        email,
        name,
        points,
      });
      created.push({ email, name, id: member.id });
    } catch (e) {
      errors.push({ row: i + 1, email, reason: e.message || "Erreur création" });
    }
  }
  res.status(200).json({
    created: created.length,
    updated: updated.length,
    skipped: skipped.length,
    errors: errors.length,
    createdIds: created.map((c) => c.id),
    details: errors.length ? { errors } : undefined,
  });
});

/**
 * GET /api/businesses/:slug/members/:memberId
 * Infos d'un membre (vérifie qu'il appartient à cette entreprise).
 */
router.get("/:slug/members/:memberId", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });

  const member = getMemberForBusiness(req.params.memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });

  res.json({
    id: member.id,
    email: member.email,
    name: member.name,
    points: member.points,
    last_visit_at: member.last_visit_at || null,
  });
});

/**
 * POST /api/businesses/:slug/members/:memberId/points
 * Ajouter des points (caisse). Nécessite token ou JWT propriétaire.
 */
router.post("/:slug/members/:memberId/points", async (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Accès non autorisé" });
  }

  const member = getMemberForBusiness(req.params.memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });

  const pointsDirect = Number(req.body?.points);
  const amountEur = Number(req.body?.amount_eur);
  const visit = req.body?.visit === true;
  const perEuro = Number(business.points_per_euro) || 1;
  const perVisit = Number(business.points_per_visit) || 0;
  const minAmount = business.points_min_amount_eur != null ? Number(business.points_min_amount_eur) : null;
  const programType = (business.program_type || "").toLowerCase();

  let points = 0;
  if (Number.isInteger(pointsDirect) && pointsDirect > 0) {
    points += pointsDirect;
  }
  if (!Number.isNaN(amountEur) && amountEur > 0) {
    if (minAmount == null || amountEur >= minAmount) {
      points += Math.floor(amountEur * perEuro);
    }
  }
  if (visit && perVisit > 0) {
    points += perVisit;
  }
  if (visit && programType === "stamps" && points === 0) points = 1;

  if (points <= 0) {
    const minHint = minAmount != null ? ` Achat minimum ${minAmount} € pour gagner des points.` : "";
    const msg = perVisit === 0 && programType !== "stamps"
      ? `Vos règles : 0 point par passage. Saisissez un montant en € ou un nombre de points pour créditer.${minHint}`
      : `Saisissez le montant du panier en € ou cliquez sur « 1 passage ». Règles : ${perEuro} pt/€, ${perVisit} pt/passage.${minHint}`;
    return res.status(400).json({
      error: msg,
    });
  }

  const updated = addPoints(member.id, points);
  createTransaction({
    businessId: business.id,
    memberId: member.id,
    type: "points_add",
    points,
    metadata: amountEur > 0 || visit ? { amount_eur: amountEur || undefined, visit } : undefined,
  });
  const tokens = getPushTokensForMember(member.id);
  if (tokens.length > 0) {
    console.log("[PassKit] Après points: envoi push à", tokens.length, "appareil(s) pour membre", member.id.slice(0, 8) + "...");
    for (const token of tokens) {
      const result = await sendPassKitUpdate(token);
      if (result.sent) {
        console.log("[PassKit] Push envoyée OK (points) pour membre", member.id.slice(0, 8) + "...");
      } else {
        console.warn("[PassKit] Push refusée (points):", result.error || "inconnu");
      }
    }
  } else {
    console.log("[PassKit] Aucun appareil enregistré pour ce membre — pas de push après points.");
  }
  res.json({
    id: updated.id,
    points: updated.points,
    points_added: points,
  });
});

/**
 * POST /api/businesses/:slug/members/:memberId/redeem
 * Utiliser une récompense : tampons → remise à 0, ou points → déduction d'un palier.
 * Body: { type: "stamps" } | { type: "points", points: 100 } | { type: "points", tier_index: 0 }
 */
router.post("/:slug/members/:memberId/redeem", async (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Accès non autorisé" });
  }
  const member = getMemberForBusiness(req.params.memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });

  const body = req.body || {};
  const type = (body.type || "").toLowerCase();
  const requiredStamps = business.required_stamps != null ? Number(business.required_stamps) : 10;

  if (type === "stamps") {
    const current = Number(member.points) || 0;
    if (current < requiredStamps) {
      return res.status(400).json({
        error: `Le client n'a pas assez de tampons (${current}/${requiredStamps}). Récompense non utilisable.`,
        code: "NOT_ENOUGH_STAMPS",
      });
    }
    resetMemberPoints(member.id);
    createTransaction({
      businessId: business.id,
      memberId: member.id,
      type: "reward_redeem",
      points: -current,
      metadata: { subtype: "stamps", required_stamps: requiredStamps },
    });
    const tokens = getPushTokensForMember(member.id);
    for (const token of tokens) {
      try { await sendPassKitUpdate(token); } catch (_) {}
    }
    return res.json({
      ok: true,
      type: "stamps",
      previous_points: current,
      new_points: 0,
      message: "Récompense tampons utilisée.",
    });
  }

  if (type === "points") {
    let pointsToDeduct = 0;
    const pointsParam = body.points != null ? Number(body.points) : null;
    const tierIndex = body.tier_index != null ? Number(body.tier_index) : null;

    if (Number.isInteger(pointsParam) && pointsParam > 0) {
      pointsToDeduct = pointsParam;
    } else if (Number.isInteger(tierIndex) && tierIndex >= 0) {
      let tiers = business.points_reward_tiers;
      if (typeof tiers === "string" && tiers.trim()) {
        try { tiers = JSON.parse(tiers); } catch (_) { tiers = []; }
      }
      if (!Array.isArray(tiers) || tierIndex >= tiers.length) {
        return res.status(400).json({ error: "Palier invalide.", code: "INVALID_TIER" });
      }
      const tier = tiers[tierIndex];
      pointsToDeduct = Number(tier?.points) || 0;
    }
    if (pointsToDeduct <= 0) {
      return res.status(400).json({
        error: "Indiquez points (nombre à déduire) ou tier_index (palier).",
        code: "REDEEM_POINTS_OR_TIER",
      });
    }
    const current = Number(member.points) || 0;
    if (current < pointsToDeduct) {
      return res.status(400).json({
        error: `Solde insuffisant (${current} pts). Nécessite ${pointsToDeduct} pts pour ce palier.`,
        code: "NOT_ENOUGH_POINTS",
      });
    }
    const updated = deductPoints(member.id, pointsToDeduct);
    createTransaction({
      businessId: business.id,
      memberId: member.id,
      type: "reward_redeem",
      points: -pointsToDeduct,
      metadata: { subtype: "points", points_deducted: pointsToDeduct },
    });
    const tokens = getPushTokensForMember(member.id);
    for (const token of tokens) {
      try { await sendPassKitUpdate(token); } catch (_) {}
    }
    return res.json({
      ok: true,
      type: "points",
      points_deducted: pointsToDeduct,
      previous_points: current,
      new_points: updated.points,
      message: "Récompense points utilisée.",
    });
  }

  return res.status(400).json({
    error: 'Body doit contenir type: "stamps" ou type: "points" (avec points ou tier_index).',
    code: "INVALID_REDEEM_TYPE",
  });
});

/**
 * GET /api/businesses/:slug/members/:memberId/pass
 * Télécharger le .pkpass pour ce membre (carte aux couleurs de l'entreprise).
 */
router.get("/:slug/members/:memberId/pass", async (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });

  const member = getMemberForBusiness(req.params.memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });

  const template = req.query.template || "classic";
  const opts = { template };
  if (req.query.organization_name != null) opts.organizationName = req.query.organization_name;
  opts.background_color = req.query.background_color ?? business?.background_color ?? undefined;
  opts.backgroundColor = opts.background_color;
  const stripFromQuery = (req.query.strip_color ?? "").toString().trim();
  opts.strip_color = stripFromQuery || opts.background_color || business?.strip_color || undefined;
  opts.stripColor = opts.strip_color;
  opts.foreground_color = req.query.foreground_color ?? business?.foreground_color ?? undefined;
  opts.foregroundColor = opts.foreground_color;
  const programTypeQuery = (req.query.program_type || "").toLowerCase();
  opts.program_type = programTypeQuery === "points" || programTypeQuery === "stamps" ? programTypeQuery : (business?.program_type ?? undefined);
  opts.stamp_emoji = req.query.stamp_emoji ?? business.stamp_emoji ?? undefined;
  if (req.query.required_stamps != null) {
    const n = parseInt(req.query.required_stamps, 10);
    if (Number.isInteger(n) && n > 0) opts.required_stamps = n;
  }
  if (business?.card_background_base64) opts.card_background_base64 = business.card_background_base64;
  const stripDisplayMode = (req.query.strip_display_mode ?? business?.strip_display_mode ?? "logo").toString().toLowerCase();
  opts.strip_display_mode = stripDisplayMode === "text" ? "text" : "logo";
  opts.strip_text = req.query.strip_text ?? business?.strip_text ?? undefined;

  try {
    const buffer = await generatePass(member, business, opts);
    const filename = `fidelity-${business.slug}-${member.id.slice(0, 8)}.pkpass`;
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    // "inline" permet à Safari sur iOS d'ouvrir le pass directement dans Wallet au lieu de tenter un téléchargement
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error("Génération pass:", err);
    const msg = err?.message || "";
    const isCert = /certificat|PASS_TYPE_ID|TEAM_ID|manquant|WWDR|SIGNER/i.test(msg);
    const userMessage = isCert
      ? "Configuration Wallet manquante ou invalide sur le serveur. Vérifiez les certificats (Railway → Variables, voir docs/APPLE-WALLET-SETUP.md)."
      : "Impossible de générer la carte. Réessayez dans un instant.";
    res.status(500).json({
      error: userMessage,
      detail: msg,
    });
  }
});

/**
 * GET /api/businesses/:slug/members/:memberId/google-wallet-url
 * Retourne l'URL "Add to Google Wallet" pour ce membre (Android).
 * 200 { url } ou 503 si Google Wallet non configuré.
 */
router.get("/:slug/members/:memberId/google-wallet-url", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });

  const member = getMemberForBusiness(req.params.memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });

  const frontendOrigin = req.get("Origin") || req.get("Referer")?.replace(/\/[^/]*$/, "") || process.env.FRONTEND_URL;
  const result = getGoogleWalletSaveUrl(member, business, frontendOrigin);
  if (!result) {
    return res.status(503).json({
      error: "Google Wallet non configuré",
      code: "google_wallet_unavailable",
    });
  }
  res.json(result);
});

/**
 * POST /api/businesses (création d'une entreprise — compte et abonnement requis)
 * Body: { name, slug, organizationName?, backTerms?, backContact?, backgroundColor?, foregroundColor?, labelColor?, logoBase64? }
 */
router.post("/", requireAuth, (req, res) => {
  const {
    name,
    slug,
    organizationName,
    backTerms,
    backContact,
    backgroundColor,
    foregroundColor,
    labelColor,
    logoBase64,
  } = req.body || {};
  if (!name || !slug) {
    return res.status(400).json({ error: "name et slug requis" });
  }
  const devBypass =
    process.env.DEV_BYPASS_PAYMENT === "true" && req.get("X-Dev-Bypass-Payment") === "1";
  if (!devBypass && !canCreateBusiness(req.user.id)) {
    return res.status(403).json({
      error: "Abonnement requis ou limite de cartes atteinte",
      code: "subscription_required",
    });
  }
  const normalizedSlug = String(slug).trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  if (!normalizedSlug) return res.status(400).json({ error: "slug invalide" });

  if (getBusinessBySlug(normalizedSlug)) {
    return res.status(409).json({ error: "Une entreprise avec ce slug existe déjà" });
  }

  const userId = req.user.id;

  try {
    const business = createBusiness({
      name: name.trim(),
      slug: normalizedSlug,
      organizationName: (organizationName || name).trim(),
      backTerms: backTerms ? String(backTerms).trim() : null,
      backContact: backContact ? String(backContact).trim() : null,
      backgroundColor: normalizeHex(backgroundColor),
      foregroundColor: normalizeHex(foregroundColor),
      labelColor: normalizeHex(labelColor),
      userId,
    });
    const dir = join(businessAssetsDir, business.id);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    if (logoBase64 && typeof logoBase64 === "string") {
      const base64Data = logoBase64.replace(/^data:image\/\w+;base64,/, "");
      try {
        const buf = Buffer.from(base64Data, "base64");
        if (buf.length > 0 && buf.length < 5 * 1024 * 1024) {
          writeFileSync(join(dir, "logo.png"), buf);
          writeFileSync(join(dir, "logo@2x.png"), buf);
          const stored = logoBase64.startsWith("data:") ? logoBase64 : `data:image/jpeg;base64,${base64Data}`;
          updateBusiness(business.id, { logo_base64: stored });
        }
      } catch (err) {
        console.warn("Logo save failed:", err.message);
      }
    }

    const baseUrl = process.env.FRONTEND_URL || "https://myfidpass.fr";
    const dashboardUrl = `${baseUrl.replace(/\/$/, "")}/dashboard?slug=${business.slug}&token=${business.dashboard_token}`;

    res.status(201).json({
      id: business.id,
      name: business.name,
      slug: business.slug,
      organizationName: business.organization_name,
      link: `/fidelity/${business.slug}`,
      assetsPath: `backend/assets/businesses/${business.id}/`,
      dashboardUrl,
      dashboardToken: business.dashboard_token,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur création entreprise" });
  }
});

function normalizeHex(value) {
  if (!value || typeof value !== "string") return null;
  const v = value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v;
  if (/^[0-9A-Fa-f]{6}$/.test(v)) return `#${v}`;
  return null;
}

/**
 * PATCH /api/businesses/:slug — Mise à jour design + règles de la carte — token ou JWT propriétaire.
 * Body: { organizationName?, backTerms?, backContact?, backgroundColor?, ... programType?, pointsPerEuro?, requiredStamps?, stampRewardLabel?, ... }
 */
router.patch("/:slug", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const body = req.body || {};
  const {
    organizationName,
    backTerms,
    backContact,
    backgroundColor,
    foregroundColor,
    labelColor,
    logoBase64,
    locationLat,
    locationLng,
    locationRelevantText,
    locationRadiusMeters,
    locationAddress,
  } = body;
  const updates = {};
  if (organizationName !== undefined) updates.organization_name = organizationName ? String(organizationName).trim() : null;
  if (backTerms !== undefined) updates.back_terms = backTerms ? String(backTerms).trim() : null;
  if (backContact !== undefined) updates.back_contact = backContact ? String(backContact).trim() : null;
  if (backgroundColor !== undefined) {
    updates.background_color = normalizeHex(backgroundColor);
    updates.strip_color = updates.background_color;
  }
  if (foregroundColor !== undefined) updates.foreground_color = normalizeHex(foregroundColor);
  if (labelColor !== undefined) updates.label_color = normalizeHex(labelColor);
  if (locationAddress !== undefined) updates.location_address = locationAddress ? String(locationAddress).trim() : null;
  if (locationLat !== undefined) updates.location_lat = locationLat === null || locationLat === "" ? null : Number(locationLat);
  if (locationLng !== undefined) updates.location_lng = locationLng === null || locationLng === "" ? null : Number(locationLng);
  if (locationRelevantText !== undefined) updates.location_relevant_text = locationRelevantText ? String(locationRelevantText).trim() : null;
  if (locationRadiusMeters !== undefined) updates.location_radius_meters = locationRadiusMeters === null || locationRadiusMeters === "" ? null : Math.min(2000, Math.max(0, Number(locationRadiusMeters) || 500));
  if (logoBase64 !== undefined && logoBase64 !== null && typeof logoBase64 === "string") {
    const base64Data = logoBase64.replace(/^data:image\/\w+;base64,/, "");
    const buf = Buffer.from(base64Data, "base64");
    if (buf.length === 0 || buf.length > 4 * 1024 * 1024) {
      return res.status(400).json({ error: "Logo invalide ou trop volumineux (max 4 Mo)." });
    }
    updates.logo_base64 = logoBase64;
  }
  const cardBackgroundBase64 = body.card_background_base64 ?? body.cardBackgroundBase64;
  if (cardBackgroundBase64 !== undefined) {
    if (cardBackgroundBase64 === null || (typeof cardBackgroundBase64 === "string" && cardBackgroundBase64.trim() === "")) {
      updates.card_background_base64 = null;
    } else if (typeof cardBackgroundBase64 === "string") {
      const base64Data = String(cardBackgroundBase64).replace(/^data:image\/\w+;base64,/, "");
      const buf = Buffer.from(base64Data, "base64");
      if (buf.length > 4 * 1024 * 1024) {
        return res.status(400).json({ error: "Image de fond trop volumineuse (max 4 Mo)." });
      }
      if (buf.length > 0) {
        updates.card_background_base64 = cardBackgroundBase64.startsWith("data:") ? cardBackgroundBase64 : `data:image/png;base64,${base64Data}`;
      } else {
        updates.card_background_base64 = null;
      }
    }
  }
  const programType = body.programType ?? body.program_type;
  if (programType !== undefined) {
    const v = programType === null || programType === "" ? null : String(programType).trim().toLowerCase();
    updates.program_type = (v === "points" || v === "stamps") ? v : null;
  }
  const pointsPerEuro = body.pointsPerEuro ?? body.points_per_euro;
  if (pointsPerEuro !== undefined) {
    const n = pointsPerEuro === null || pointsPerEuro === "" ? null : Number(pointsPerEuro);
    updates.points_per_euro = Number.isFinite(n) && n >= 0 ? String(n) : "1";
  }
  const pointsPerVisit = body.pointsPerVisit ?? body.points_per_visit;
  if (pointsPerVisit !== undefined) {
    const n = pointsPerVisit === null || pointsPerVisit === "" ? null : Number(pointsPerVisit);
    updates.points_per_visit = Number.isFinite(n) && n >= 0 ? String(n) : "0";
  }
  const pointsMinAmountEur = body.pointsMinAmountEur ?? body.points_min_amount_eur;
  if (pointsMinAmountEur !== undefined) {
    const n = pointsMinAmountEur === null || pointsMinAmountEur === "" ? null : Number(pointsMinAmountEur);
    updates.points_min_amount_eur = Number.isFinite(n) && n >= 0 ? n : null;
  }
  const pointsRewardTiers = body.pointsRewardTiers ?? body.points_reward_tiers;
  if (pointsRewardTiers !== undefined) {
    if (pointsRewardTiers === null || pointsRewardTiers === "") updates.points_reward_tiers = null;
    else if (Array.isArray(pointsRewardTiers)) updates.points_reward_tiers = JSON.stringify(pointsRewardTiers);
    else if (typeof pointsRewardTiers === "string") {
      try { JSON.parse(pointsRewardTiers); updates.points_reward_tiers = pointsRewardTiers; } catch (_) { updates.points_reward_tiers = null; }
    }
  }
  const expiryMonths = body.expiryMonths ?? body.expiry_months;
  if (expiryMonths !== undefined) {
    const n = expiryMonths === null || expiryMonths === "" ? null : Number(expiryMonths);
    updates.expiry_months = Number.isInteger(n) && n >= 0 ? n : null;
  }
  const sector = body.sector;
  if (sector !== undefined) updates.sector = sector ? String(sector).trim().slice(0, 64) : null;
  const requiredStamps = body.requiredStamps ?? body.required_stamps;
  if (requiredStamps !== undefined) {
    const n = requiredStamps === null || requiredStamps === "" ? null : Number(requiredStamps);
    updates.required_stamps = Number.isInteger(n) && n >= 0 ? n : null;
  }
  const stampEmoji = body.stampEmoji ?? body.stamp_emoji;
  if (stampEmoji !== undefined) {
    const v = stampEmoji == null || stampEmoji === "" ? null : String(stampEmoji).trim().slice(0, 8);
    updates.stamp_emoji = v || null;
  }
  const stampRewardLabel = body.stampRewardLabel ?? body.stamp_reward_label;
  if (stampRewardLabel !== undefined) {
    const v = stampRewardLabel == null || stampRewardLabel === "" ? null : String(stampRewardLabel).trim().slice(0, 120);
    updates.stamp_reward_label = v || null;
  }
  const stripColor = body.stripColor ?? body.strip_color;
  if (stripColor !== undefined) {
    updates.strip_color = stripColor === null || stripColor === "" ? null : normalizeHex(stripColor);
  }

  const updated = updateBusiness(business.id, updates);
  if (!updated) return res.status(500).json({ error: "Erreur mise à jour" });

  res.json({
    id: updated.id,
    name: updated.name,
    slug: updated.slug,
    organizationName: updated.organization_name,
    backgroundColor: updated.background_color ?? undefined,
    foregroundColor: updated.foreground_color ?? undefined,
    labelColor: updated.label_color ?? undefined,
    locationLat: updated.location_lat != null ? Number(updated.location_lat) : undefined,
    locationLng: updated.location_lng != null ? Number(updated.location_lng) : undefined,
    locationRelevantText: updated.location_relevant_text ?? undefined,
    locationRadiusMeters: updated.location_radius_meters != null ? Number(updated.location_radius_meters) : undefined,
    locationAddress: updated.location_address ?? undefined,
  });
});

export default router;
