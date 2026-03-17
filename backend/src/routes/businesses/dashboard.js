/**
 * Routes dashboard (/:slug/dashboard/*). Utilise req.business et canAccessDashboard (shared).
 * Dérogation limite 400 lignes (REFONTE-REGLES) : découpage prévu en sous-fichiers — 2025-03.
 */
import { Router } from "express";
import {
  updateBusiness,
  getBusinessGames,
  updateBusinessGameConfig,
  getGameRewardsForBusiness,
  replaceGameRewardsForBusiness,
  getEngagementRewards,
  getEngagementCompletionsForBusiness,
  approveEngagementCompletion,
  rejectEngagementCompletion,
  getPushTokensForMember,
  getPassKitPushTokensForBusiness,
  getDashboardStats,
  getDashboardEvolution,
  getMembersForBusiness,
  getTransactionsForBusiness,
  getCategoriesForBusiness,
  createCategory,
  getCategoryById,
  updateCategory,
  deleteCategory,
  getMemberForBusiness,
  setMemberCategories,
} from "../../db.js";
import { sendPassKitUpdate } from "../../apns.js";
import { canAccessDashboard, getApiBase, normalizeHexForPatch, MAX_LOGO_BASE64_BYTES } from "./shared.js";

const router = Router();

function requireDashboard(req, res, next) {
  if (!req.business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(req.business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  next();
}

router.use(requireDashboard);

// ——— Settings ———
router.get("/settings", (req, res) => {
  const business = req.business;
  const apiBase = getApiBase(req);
  const slug = req.params.slug ?? business.slug;
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
    loyalty_mode: business.loyalty_mode ?? "points_cash",
    points_per_ticket: business.points_per_ticket != null ? Number(business.points_per_ticket) : 10,
    points_min_amount_eur: business.points_min_amount_eur != null ? Number(business.points_min_amount_eur) : undefined,
    points_reward_tiers: points_reward_tiers ?? undefined,
    sector: business.sector ?? undefined,
    logo_url: business.logo_base64 ? `${apiBase}/api/businesses/${encodeURIComponent(slug)}/logo` : undefined,
    logo_updated_at: business.logo_updated_at ?? undefined,
    has_card_background: !!(business.card_background_base64 && String(business.card_background_base64).trim()),
    strip_color: business.strip_color ?? undefined,
    strip_display_mode: business.strip_display_mode ?? "logo",
    strip_text: business.strip_text ?? undefined,
    label_restants: business.label_restants ?? undefined,
    label_member: business.label_member ?? undefined,
    header_right_text: business.header_right_text ?? undefined,
    notification_title_override: business.notification_title_override ?? undefined,
    notification_change_message: business.notification_change_message ?? undefined,
    has_stamp_icon: !!(business.stamp_icon_base64 && String(business.stamp_icon_base64).trim()),
    stamp_icon_url: business.stamp_icon_base64 ? `${apiBase}/api/businesses/${encodeURIComponent(slug)}/stamp-icon` : undefined,
    engagement_rewards: getEngagementRewards(business.id),
  });
});

router.patch("/settings", async (req, res) => {
  const business = req.business;
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
  const loyalty_mode = body.loyalty_mode ?? body.loyaltyMode;
  const points_per_ticket = body.points_per_ticket ?? body.pointsPerTicket;
  const points_min_amount_eur = body.points_min_amount_eur ?? body.pointsMinAmountEur;
  const points_reward_tiers = body.points_reward_tiers ?? body.pointsRewardTiers;
  const sector = body.sector;
  const logo_base64 = body.logo_base64 ?? body.logoBase64;
  const card_background_base64 = body.card_background_base64 ?? body.cardBackgroundBase64;
  const stamp_icon_base64 = body.stamp_icon_base64 ?? body.stampIconBase64;
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
  if (loyalty_mode !== undefined) {
    const mode = String(loyalty_mode || "").trim().toLowerCase();
    updates.loyalty_mode = mode === "points_game_tickets" ? "points_game_tickets" : "points_cash";
  }
  if (points_per_ticket !== undefined) {
    const n = Number(points_per_ticket);
    updates.points_per_ticket = Number.isInteger(n) && n > 0 ? n : 10;
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
  const MAX_STAMP_ICON_BYTES = 512 * 1024;
  if (stamp_icon_base64 !== undefined) {
    if (stamp_icon_base64 === null || (typeof stamp_icon_base64 === "string" && stamp_icon_base64.trim() === "")) {
      updates.stamp_icon_base64 = null;
    } else if (typeof stamp_icon_base64 === "string") {
      const base64Data = String(stamp_icon_base64).replace(/^data:image\/\w+;base64,/, "");
      const buf = Buffer.from(base64Data, "base64");
      if (buf.length > MAX_STAMP_ICON_BYTES) {
        return res.status(400).json({ error: "Icône tampon trop volumineuse (max 512 Ko)." });
      }
      if (buf.length > 0) updates.stamp_icon_base64 = stamp_icon_base64.startsWith("data:") ? stamp_icon_base64 : `data:image/png;base64,${base64Data}`;
      else updates.stamp_icon_base64 = null;
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
  const label_restants = body.label_restants ?? body.labelRestants;
  const label_member = body.label_member ?? body.labelMember;
  if (label_restants !== undefined) {
    updates.label_restants = label_restants == null || String(label_restants).trim() === "" ? null : String(label_restants).trim().slice(0, 64);
  }
  if (label_member !== undefined) {
    updates.label_member = label_member == null || String(label_member).trim() === "" ? null : String(label_member).trim().slice(0, 64);
  }
  const header_right_text = body.header_right_text ?? body.headerRightText;
  if (header_right_text !== undefined) {
    updates.header_right_text = header_right_text == null || String(header_right_text).trim() === "" ? null : String(header_right_text).trim().slice(0, 64);
  }
  const notification_title_override = body.notification_title_override ?? body.notificationTitleOverride;
  if (notification_title_override !== undefined) {
    updates.notification_title_override = notification_title_override == null ? null : String(notification_title_override).trim().slice(0, 80);
  }
  const notification_change_message = body.notification_change_message ?? body.notificationChangeMessage;
  if (notification_change_message !== undefined) {
    updates.notification_change_message = notification_change_message == null ? null : String(notification_change_message).trim().slice(0, 200);
  }
  const engagement_rewards = body.engagement_rewards ?? body.engagementRewards;
  if (engagement_rewards !== undefined) {
    if (engagement_rewards === null || (typeof engagement_rewards === "object" && Object.keys(engagement_rewards).length === 0)) {
      updates.engagement_rewards = null;
    } else if (typeof engagement_rewards === "object") {
      updates.engagement_rewards = JSON.stringify(engagement_rewards);
    } else if (typeof engagement_rewards === "string") {
      try {
        JSON.parse(engagement_rewards);
        updates.engagement_rewards = engagement_rewards;
      } catch (_) {
        updates.engagement_rewards = null;
      }
    }
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
      process.nextTick(() => {
        passKitTokens.forEach((row) => {
          sendPassKitUpdate(row.push_token).catch(() => {});
        });
      });
    }
  }
  return res.status(200).send();
});

// ——— Games ———
router.get("/games", (req, res) => {
  const games = getBusinessGames(req.business.id);
  return res.json({ games });
});

router.patch("/games/:gameCode", (req, res) => {
  const body = req.body || {};
  const game = updateBusinessGameConfig(req.business.id, req.params.gameCode, {
    enabled: body.enabled,
    ticket_cost: body.ticket_cost ?? body.ticketCost,
    daily_spin_limit: body.daily_spin_limit ?? body.dailySpinLimit,
    cooldown_seconds: body.cooldown_seconds ?? body.cooldownSeconds,
    weight_profile_json: body.weight_profile_json ?? body.weightProfile,
  });
  if (!game) return res.status(404).json({ error: "Jeu introuvable" });
  return res.json({ ok: true, game });
});

router.get("/games/:gameCode/rewards", (req, res) => {
  const rewards = getGameRewardsForBusiness(req.business.id, req.params.gameCode);
  return res.json({ rewards });
});

router.put("/games/:gameCode/rewards", (req, res) => {
  const rewardsInput = Array.isArray(req.body?.rewards) ? req.body.rewards : [];
  const rewards = replaceGameRewardsForBusiness(req.business.id, req.params.gameCode, rewardsInput);
  return res.json({ ok: true, rewards });
});

// ——— Engagement completions ———
router.get("/engagement-completions", (req, res) => {
  const status = ["pending", "pending_review", "approved", "rejected"].includes(req.query.status) ? req.query.status : null;
  const completions = getEngagementCompletionsForBusiness(req.business.id, { status, limit: 100 });
  res.json({ completions });
});

router.patch("/engagement-completions/:id/approve", (req, res) => {
  const updated = approveEngagementCompletion(req.params.id, req.business.id);
  if (!updated) return res.status(404).json({ error: "Demande introuvable ou déjà traitée" });
  if (updated.points_granted > 0) {
    const tokens = getPushTokensForMember(updated.member_id);
    process.nextTick(() => {
      tokens.forEach((token) => sendPassKitUpdate(token).catch(() => {}));
    });
  }
  res.json({ completion: updated });
});

router.patch("/engagement-completions/:id/reject", (req, res) => {
  const updated = rejectEngagementCompletion(req.params.id, req.business.id);
  if (!updated) return res.status(404).json({ error: "Demande introuvable ou déjà traitée" });
  res.json({ completion: updated });
});

// ——— Stats ———
router.get("/stats", (req, res) => {
  const business = req.business;
  const period = ["7d", "30d", "this_month", "6m"].includes(req.query.period) ? req.query.period : "this_month";
  const stats = getDashboardStats(business.id, period);
  res.json({
    period: stats.period,
    period_key: stats.periodKey,
    members_count: stats.membersCount ?? 0,
    points_this_month: stats.pointsThisMonth ?? 0,
    transactions_this_month: stats.transactionsThisMonth ?? 0,
    new_members_last_7_days: stats.newMembersLast7Days ?? 0,
    new_members_last_30_days: stats.newMembersLast30Days ?? 0,
    inactive_members_30_days: stats.inactiveMembers30Days ?? 0,
    points_average_per_member: stats.pointsAveragePerMember ?? 0,
    estimated_revenue_eur: stats.estimatedRevenueEur ?? 0,
    active_members_in_period: stats.activeMembersInPeriod ?? 0,
    retention_pct: stats.retentionPct ?? 0,
    recurrent_members_in_period: stats.recurrentMembersInPeriod ?? 0,
    business_name: business.organization_name ?? undefined,
  });
});

// ——— Members (liste + export) ———
router.get("/members/export", (req, res) => {
  const business = req.business;
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

router.get("/members", (req, res) => {
  const search = req.query.search ?? "";
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const filter = ["inactive30", "inactive90", "points50"].includes(req.query.filter) ? req.query.filter : null;
  const sort = ["last_visit", "points", "name", "created"].includes(req.query.sort) ? req.query.sort : "last_visit";
  const result = getMembersForBusiness(req.business.id, { search, limit, offset, filter, sort });
  res.json(result);
});

// ——— Categories ———
router.get("/categories", (req, res) => {
  const categories = getCategoriesForBusiness(req.business.id);
  res.json({ categories });
});

router.post("/categories", (req, res) => {
  const name = (req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Le nom est obligatoire" });
  const colorHex = req.body?.color_hex ?? req.body?.colorHex ?? null;
  const sortOrder = req.body?.sort_order ?? req.body?.sortOrder ?? 0;
  const category = createCategory({ businessId: req.business.id, name, colorHex, sortOrder });
  res.status(201).json(category);
});

router.patch("/categories/:categoryId", (req, res) => {
  const cat = getCategoryById(req.params.categoryId);
  if (!cat || cat.business_id !== req.business.id) return res.status(404).json({ error: "Catégorie introuvable" });
  const name = req.body?.name != null ? String(req.body.name).trim() : undefined;
  const colorHex = req.body?.color_hex !== undefined ? (req.body.color_hex ? String(req.body.color_hex).trim() : null) : undefined;
  const sortOrder = req.body?.sort_order !== undefined ? Number(req.body.sort_order) : undefined;
  const updated = updateCategory(req.params.categoryId, { name, colorHex, sortOrder });
  res.json(updated);
});

router.delete("/categories/:categoryId", (req, res) => {
  const cat = getCategoryById(req.params.categoryId);
  if (!cat || cat.business_id !== req.business.id) return res.status(404).json({ error: "Catégorie introuvable" });
  deleteCategory(req.params.categoryId);
  res.status(204).end();
});

router.post("/members/:memberId/categories", (req, res) => {
  const member = getMemberForBusiness(req.params.memberId, req.business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });
  const categoryIds = Array.isArray(req.body?.category_ids) ? req.body.category_ids : (req.body?.categoryIds || []);
  const ids = categoryIds.filter((id) => id && getCategoryById(id)?.business_id === req.business.id);
  setMemberCategories(req.params.memberId, ids);
  res.status(200).json({ ok: true });
});

// ——— Transactions + export ———
router.get("/transactions/export", (req, res) => {
  const business = req.business;
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

router.get("/transactions", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 200);
  const offset = Number(req.query.offset) || 0;
  const memberId = req.query.memberId || null;
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : null;
  const type = ["points_add", "visit"].includes(req.query.type) ? req.query.type : null;
  const result = getTransactionsForBusiness(req.business.id, { limit, offset, memberId, days, type });
  res.json(result);
});

// ——— Evolution ———
router.get("/evolution", (req, res) => {
  let weeks = Number(req.query.weeks);
  if (!Number.isFinite(weeks) && req.query.period) {
    const p = req.query.period;
    if (p === "7d") weeks = 1;
    else if (p === "30d") weeks = 4;
    else if (p === "this_month") weeks = 4;
    else if (p === "6m") weeks = 26;
    else weeks = 6;
  }
  if (!Number.isFinite(weeks)) weeks = 6;
  weeks = Math.min(Math.max(weeks, 1), 26);
  const evolution = getDashboardEvolution(req.business.id, weeks);
  res.json({ evolution });
});

export default router;
