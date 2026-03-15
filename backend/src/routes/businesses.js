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
  getBusinessGames,
  updateBusinessGameConfig,
  getGameRewardsForBusiness,
  replaceGameRewardsForBusiness,
  getMemberTicketWallet,
  getMemberTicketHistory,
  convertPointsToTickets,
  spinGameForMember,
  getMemberRewards,
  markRewardGrantClaimed,
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
  getEngagementRewards,
  createEngagementCompletion,
  getEngagementCompletionsForBusiness,
  approveEngagementCompletion,
  rejectEngagementCompletion,
  getEngagementCompletionsForMember,
  createEngagementProof,
  getEngagementProofByTokenHash,
  markEngagementProofReturned,
  incrementEngagementProofAttempts,
  finalizeEngagementProof,
  countRecentEngagementProofStarts,
} from "../db.js";
import { sendWebPush, getLogoIconBuffer } from "../notifications.js";
import { sendPassKitUpdate } from "../apns.js";
import { requireAuth } from "../middleware/auth.js";
import { generatePass, getPassAuthenticationToken } from "../pass.js";
import { getGoogleWalletSaveUrl } from "../google-wallet.js";
import { randomUUID } from "crypto";
import {
  buildIpHash,
  buildDeviceHash,
  hashValue,
  signProofToken,
  verifyProofToken,
  getProofTtlSeconds,
  computeProofScore,
} from "../services/engagement-proof.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const businessAssetsDir = join(__dirname, "..", "assets", "businesses");

const router = Router();
const START_RATE_BUCKET = new Map();

function getApiBase(req) {
  return (process.env.API_URL || "").replace(/\/$/, "") || (req.protocol + "://" + (req.get("host") || ""));
}

function checkStartRateLimit(ipHash) {
  if (!ipHash) return true;
  const now = Date.now();
  const key = `start:${ipHash}`;
  const windowMs = 60 * 1000;
  const maxCalls = 20;
  const row = START_RATE_BUCKET.get(key) || { count: 0, ts: now };
  if (now - row.ts > windowMs) {
    START_RATE_BUCKET.set(key, { count: 1, ts: now });
    return true;
  }
  if (row.count >= maxCalls) return false;
  row.count += 1;
  START_RATE_BUCKET.set(key, row);
  return true;
}

function getClientIp(req) {
  const hdr = req.get("x-forwarded-for") || req.get("x-real-ip");
  const ip = (hdr || req.ip || "").toString().split(",")[0].trim();
  return ip || "";
}

function getIdempotencyKey(req) {
  const key = (req.get("Idempotency-Key") || "").trim();
  if (!key) return null;
  return key.slice(0, 120);
}

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
    loyalty_mode: business.loyalty_mode ?? "points_cash",
    points_per_ticket: business.points_per_ticket != null ? Number(business.points_per_ticket) : 10,
    points_min_amount_eur: business.points_min_amount_eur != null ? Number(business.points_min_amount_eur) : undefined,
    points_reward_tiers: points_reward_tiers ?? undefined,
    sector: business.sector ?? undefined,
    logo_url: business.logo_base64 ? `${apiBase}/api/businesses/${encodeURIComponent(req.params.slug)}/logo` : undefined,
    logo_updated_at: business.logo_updated_at ?? undefined,
    has_card_background: !!(business.card_background_base64 && String(business.card_background_base64).trim()),
    strip_color: business.strip_color ?? undefined,
    strip_display_mode: business.strip_display_mode ?? "logo",
    strip_text: business.strip_text ?? undefined,
    label_restants: business.label_restants ?? undefined,
    label_member: business.label_member ?? undefined,
    header_right_text: business.header_right_text ?? undefined,
    engagement_rewards: getEngagementRewards(business.id),
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
  const loyalty_mode = body.loyalty_mode ?? body.loyaltyMode;
  const points_per_ticket = body.points_per_ticket ?? body.pointsPerTicket;
  const points_min_amount_eur = body.points_min_amount_eur ?? body.pointsMinAmountEur;
  const points_reward_tiers = body.points_reward_tiers ?? body.pointsRewardTiers;
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
      setImmediate(() => {
        passKitTokens.forEach((row) => {
          sendPassKitUpdate(row.push_token).catch(() => {});
        });
      });
    }
  }
  return res.status(200).send();
});

router.get("/:slug/dashboard/games", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const games = getBusinessGames(business.id);
  return res.json({ games });
});

router.patch("/:slug/dashboard/games/:gameCode", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const body = req.body || {};
  const game = updateBusinessGameConfig(business.id, req.params.gameCode, {
    enabled: body.enabled,
    ticket_cost: body.ticket_cost ?? body.ticketCost,
    daily_spin_limit: body.daily_spin_limit ?? body.dailySpinLimit,
    cooldown_seconds: body.cooldown_seconds ?? body.cooldownSeconds,
    weight_profile_json: body.weight_profile_json ?? body.weightProfile,
  });
  if (!game) return res.status(404).json({ error: "Jeu introuvable" });
  return res.json({ ok: true, game });
});

router.get("/:slug/dashboard/games/:gameCode/rewards", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const rewards = getGameRewardsForBusiness(business.id, req.params.gameCode);
  return res.json({ rewards });
});

router.put("/:slug/dashboard/games/:gameCode/rewards", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const rewardsInput = Array.isArray(req.body?.rewards) ? req.body.rewards : [];
  const rewards = replaceGameRewardsForBusiness(business.id, req.params.gameCode, rewardsInput);
  return res.json({ ok: true, rewards });
});

/**
 * GET /api/businesses/:slug/engagement-actions
 * Public : liste des actions engagement (avis Google, follow) avec URLs pour la page client.
 */
router.get("/:slug/engagement-actions", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  const rewards = getEngagementRewards(business.id);
  const actions = [];
  if (rewards.google_review?.enabled && rewards.google_review?.place_id && rewards.google_review?.points > 0) {
    actions.push({
      action_type: "google_review",
      label: "Laisser un avis Google",
      points: Math.floor(Number(rewards.google_review.points)) || 50,
      url: `https://search.google.com/local/writereview?placeid=${encodeURIComponent(rewards.google_review.place_id.trim())}`,
      require_approval: !!rewards.google_review.require_approval,
      auto_verify_enabled: rewards.google_review.auto_verify_enabled !== false,
    });
  }
  ["instagram_follow", "tiktok_follow", "facebook_follow"].forEach((key) => {
    const c = rewards[key];
    if (c?.enabled && c?.url && c?.points > 0) {
      const labels = { instagram_follow: "Nous suivre sur Instagram", tiktok_follow: "Nous suivre sur TikTok", facebook_follow: "Nous suivre sur Facebook" };
      actions.push({
        action_type: key,
        label: labels[key] || key,
        points: Math.floor(Number(c.points)) || 10,
        url: String(c.url).trim(),
      });
    }
  });
  res.json({ actions });
});

/**
 * POST /api/businesses/:slug/engagement/start
 * Démarre un flow de preuve pour une action engagement (V1: google_review).
 * Body: { memberId, action_type, client_fingerprint? }
 */
router.post("/:slug/engagement/start", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  const { memberId, action_type: actionType, client_fingerprint: clientFingerprint } = req.body || {};
  if (!memberId || !actionType) {
    return res.status(400).json({ error: "memberId et action_type requis" });
  }
  if (actionType !== "google_review") {
    return res.status(400).json({ error: "Action non supportée en auto-vérification V1." });
  }
  const member = getMemberForBusiness(memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });

  const rewards = getEngagementRewards(business.id);
  const cfg = rewards?.google_review || {};
  if (!cfg.enabled || !cfg.place_id) {
    return res.status(400).json({ error: "Action Google non activée pour ce commerce." });
  }
  if (cfg.auto_verify_enabled === false) {
    return res.status(400).json({ error: "Auto-vérification désactivée par le commerce." });
  }

  const ipHash = buildIpHash(req);
  if (!checkStartRateLimit(ipHash)) {
    return res.status(429).json({ error: "Trop de tentatives. Réessayez dans 1 minute." });
  }
  const recentStarts = countRecentEngagementProofStarts({
    businessId: business.id,
    memberId,
    actionType,
    sinceMinutes: 5,
  });
  if (recentStarts >= 5) {
    return res.status(429).json({ error: "Trop de tentatives rapprochées pour cette action." });
  }

  const proofId = randomUUID();
  const nonce = randomUUID().replace(/-/g, "");
  const issuedAt = Date.now();
  const ttlSeconds = getProofTtlSeconds();
  const expiresAtIso = new Date(issuedAt + ttlSeconds * 1000).toISOString();
  const payload = {
    pid: proofId,
    bid: business.id,
    mid: memberId,
    act: actionType,
    nonce,
    iat: issuedAt,
  };
  const proofToken = signProofToken(payload);
  const tokenHash = hashValue(proofToken);
  const deviceHash = buildDeviceHash(clientFingerprint);
  createEngagementProof({
    id: proofId,
    businessId: business.id,
    memberId,
    actionType,
    nonce,
    tokenHash,
    expiresAt: expiresAtIso,
    startIpHash: ipHash,
    startDeviceHash: deviceHash,
  });

  const apiBase = getApiBase(req);
  const openUrl = `${apiBase}/api/businesses/${encodeURIComponent(req.params.slug)}/engagement/return?token=${encodeURIComponent(proofToken)}`;
  res.status(201).json({
    proof_token: proofToken,
    open_url: openUrl,
    expires_in_sec: ttlSeconds,
    action_type: actionType,
  });
});

/**
 * GET /api/businesses/:slug/engagement/return
 * Endpoint de passage avant redirection Google (preuve de clic + nonce signé).
 */
router.get("/:slug/engagement/return", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).send("Entreprise introuvable");
  const token = (req.query.token || "").toString();
  const parsed = verifyProofToken(token);
  if (!parsed || parsed.bid !== business.id || parsed.act !== "google_review" || !parsed.pid) {
    return res.status(400).send("Lien de vérification invalide.");
  }
  const tokenHash = hashValue(token);
  const proof = getEngagementProofByTokenHash(tokenHash);
  if (!proof || proof.id !== parsed.pid || proof.business_id !== business.id) {
    return res.status(400).send("Preuve introuvable.");
  }
  const expiresAtMs = Date.parse(String(proof.expires_at || ""));
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) {
    return res.status(410).send("Lien expiré. Recommencez l’action depuis votre carte.");
  }
  markEngagementProofReturned(proof.id, buildIpHash(req));
  const rewards = getEngagementRewards(business.id);
  const placeId = rewards?.google_review?.place_id;
  if (!placeId) return res.status(400).send("Place ID Google manquant.");
  const googleUrl = `https://search.google.com/local/writereview?placeid=${encodeURIComponent(String(placeId).trim())}`;
  return res.redirect(302, googleUrl);
});

/**
 * POST /api/businesses/:slug/engagement/claim-auto
 * Vérifie la preuve + score anti-fraude, puis auto-crédite ou passe en pending_review.
 * Body: { memberId, action_type, proof_token, client_fingerprint? }
 */
router.post("/:slug/engagement/claim-auto", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  const { memberId, action_type: actionType, proof_token: proofToken, client_fingerprint: clientFingerprint } = req.body || {};
  if (!memberId || !actionType || !proofToken) {
    return res.status(400).json({ error: "memberId, action_type et proof_token requis" });
  }
  if (actionType !== "google_review") {
    return res.status(400).json({ error: "Action non supportée en auto-vérification V1." });
  }
  const member = getMemberForBusiness(memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });

  const parsed = verifyProofToken(proofToken);
  if (!parsed || parsed.bid !== business.id || parsed.mid !== memberId || parsed.act !== actionType) {
    return res.status(400).json({ error: "Preuve invalide." });
  }
  const tokenHash = hashValue(proofToken);
  const proof = getEngagementProofByTokenHash(tokenHash);
  if (!proof || proof.id !== parsed.pid || proof.business_id !== business.id || proof.member_id !== memberId) {
    return res.status(400).json({ error: "Preuve introuvable." });
  }
  if (proof.status === "claimed_approved" || proof.status === "claimed_pending_review") {
    return res.status(400).json({ error: "Cette preuve a déjà été utilisée." });
  }
  const expiresAtMs = Date.parse(String(proof.expires_at || ""));
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) {
    return res.status(410).json({ error: "Preuve expirée. Recommencez l’action.", code: "proof_expired" });
  }

  const proofAfterAttempt = incrementEngagementProofAttempts(proof.id);
  const claimIpHash = buildIpHash(req);
  const claimDeviceHash = buildDeviceHash(clientFingerprint);
  const scored = computeProofScore({
    proof: proofAfterAttempt || proof,
    claimIpHash,
    claimDeviceHash,
    nowMs: Date.now(),
  });

  const statusOverride = scored.verdict === "approved" ? "approved" : "pending_review";
  const completionResult = createEngagementCompletion(business.id, memberId, actionType, {
    statusOverride,
    proofId: proof.id,
    proofScore: scored.score,
  });
  if (completionResult.error === "already_done") {
    finalizeEngagementProof({
      proofId: proof.id,
      status: "claimed_rejected",
      score: scored.score,
      reasons: [...scored.reasons, "already_done"],
      claimIpHash,
      claimDeviceHash,
    });
    return res.status(400).json({ error: "Action déjà réalisée récemment.", code: "already_done" });
  }
  if (completionResult.error) {
    return res.status(400).json({ error: "Impossible de traiter la demande." });
  }

  const proofStatus = statusOverride === "approved" ? "claimed_approved" : "claimed_pending_review";
  finalizeEngagementProof({
    proofId: proof.id,
    status: proofStatus,
    score: scored.score,
    reasons: scored.reasons,
    completionId: completionResult.completion.id,
    claimIpHash,
    claimDeviceHash,
  });

  const responseStatus = completionResult.status;
  const ticketsGranted = completionResult.ticketsGranted ?? 0;
  return res.status(201).json({
    completion_id: completionResult.completion.id,
    status: responseStatus,
    points_granted: completionResult.pointsGranted ?? 0,
    tickets_granted: ticketsGranted,
    score: scored.score,
    message:
      responseStatus === "approved"
        ? (ticketsGranted > 0 ? `${ticketsGranted} ticket${ticketsGranted > 1 ? "s" : ""} ajouté${ticketsGranted > 1 ? "s" : ""} automatiquement.` : "C'est enregistré.")
        : "Vérification complémentaire requise.",
  });
});

/**
 * POST /api/businesses/:slug/engagement/claim
 * Public : le client déclare avoir fait une action (avis Google, follow). memberId = membre qui a la carte.
 */
router.post("/:slug/engagement/claim", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  const { memberId, action_type: actionType } = req.body || {};
  if (!memberId || !actionType) {
    return res.status(400).json({ error: "memberId et action_type requis" });
  }
  const member = getMemberForBusiness(memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });
  const result = createEngagementCompletion(business.id, memberId, actionType, { statusOverride: "approved" });
  if (result.error === "action_disabled") {
    return res.status(400).json({ error: "Cette action n'est pas activée." });
  }
  if (result.error === "already_done") {
    return res.status(400).json({ error: "Vous avez déjà effectué cette action.", code: "already_done" });
  }
  const ticketsGranted = result.ticketsGranted ?? 0;
  res.status(201).json({
    completion_id: result.completion.id,
    status: result.status,
    points_granted: result.pointsGranted ?? 0,
    tickets_granted: ticketsGranted,
    message:
      result.status === "approved"
        ? (ticketsGranted > 0 ? `${ticketsGranted} ticket${ticketsGranted > 1 ? "s" : ""} ajouté${ticketsGranted > 1 ? "s" : ""} à ta carte.` : "C'est enregistré.")
        : "Votre avis sera vérifié par le commerce.",
  });
});

/**
 * GET /api/businesses/:slug/dashboard/engagement-completions
 * Liste des demandes d'engagement (pending, pending_review, approved, rejected). Token ou JWT.
 */
router.get("/:slug/dashboard/engagement-completions", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const status = ["pending", "pending_review", "approved", "rejected"].includes(req.query.status) ? req.query.status : null;
  const completions = getEngagementCompletionsForBusiness(business.id, { status, limit: 100 });
  res.json({ completions });
});

/**
 * PATCH /api/businesses/:slug/dashboard/engagement-completions/:id/approve
 * Valider une demande (avis Google etc.) et créditer les points.
 */
router.patch("/:slug/dashboard/engagement-completions/:id/approve", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const updated = approveEngagementCompletion(req.params.id, business.id);
  if (!updated) return res.status(404).json({ error: "Demande introuvable ou déjà traitée" });
  if (updated.points_granted > 0) {
    const tokens = getPushTokensForMember(updated.member_id);
    setImmediate(() => {
      tokens.forEach((token) => sendPassKitUpdate(token).catch(() => {}));
    });
  }
  res.json({ completion: updated });
});

/**
 * PATCH /api/businesses/:slug/dashboard/engagement-completions/:id/reject
 * Rejeter une demande.
 */
router.patch("/:slug/dashboard/engagement-completions/:id/reject", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const updated = rejectEngagementCompletion(req.params.id, business.id);
  if (!updated) return res.status(404).json({ error: "Demande introuvable ou déjà traitée" });
  res.json({ completion: updated });
});

/**
 * GET /api/businesses/:slug/dashboard/stats
 * Stats pour le tableau de bord (token OU JWT propriétaire).
 * Query: period = 7d | 30d | this_month | 6m
 */
router.get("/:slug/dashboard/stats", (req, res, next) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
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
 * Données pour graphique (opérations / membres par semaine).
 * Query: weeks (4–26) ou period = 7d|30d|this_month|6m pour déduire le nombre de semaines.
 */
router.get("/:slug/dashboard/evolution", (req, res, next) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
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
 * GET /api/businesses/:slug/public/logo
 * Logo du commerce (public, pour la page fidélité client).
 */
router.get("/:slug/public/logo", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).send();
  if (business.logo_base64) {
    const base64Data = String(business.logo_base64).replace(/^data:image\/\w+;base64,/, "");
    const buf = Buffer.from(base64Data, "base64");
    if (buf.length > 0) {
      const isPng = business.logo_base64.includes("image/png");
      res.setHeader("Content-Type", isPng ? "image/png" : "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=3600");
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
  const apiBase = (process.env.API_URL || "").replace(/\/$/, "") || (req.protocol + "://" + (req.get("host") || ""));
  let points_reward_tiers = business.points_reward_tiers;
  if (typeof points_reward_tiers === "string" && points_reward_tiers?.trim()) {
    try {
      points_reward_tiers = JSON.parse(points_reward_tiers);
    } catch (_) {
      points_reward_tiers = undefined;
    }
  }
  res.json({
    id: business.id,
    name: business.name,
    slug: business.slug,
    organizationName: business.organization_name,
    logoUrl: business.logo_base64 ? `${apiBase}/api/businesses/${encodeURIComponent(req.params.slug)}/public/logo` : undefined,
    backgroundColor: business.background_color ?? undefined,
    foregroundColor: business.foreground_color ?? undefined,
    labelColor: business.label_color ?? undefined,
    program_type: business.program_type ?? undefined,
    loyalty_mode: business.loyalty_mode ?? "points_cash",
    points_per_ticket: business.points_per_ticket != null ? Number(business.points_per_ticket) : 10,
    required_stamps: business.required_stamps != null ? Number(business.required_stamps) : undefined,
    stamp_reward_label: business.stamp_reward_label ?? undefined,
    points_reward_tiers: points_reward_tiers ?? undefined,
  });
});

router.get("/:slug/games", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  const games = getBusinessGames(business.id).map((g) => ({
    game_code: g.game_code,
    game_name: g.game_name,
    game_type: g.game_type,
    enabled: g.enabled,
    ticket_cost: g.ticket_cost,
    daily_spin_limit: g.daily_spin_limit,
    cooldown_seconds: g.cooldown_seconds,
  }));
  return res.json({
    loyalty_mode: business.loyalty_mode ?? "points_cash",
    points_per_ticket: business.points_per_ticket != null ? Number(business.points_per_ticket) : 10,
    games,
  });
});

router.get("/:slug/members/:memberId/tickets", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  const member = getMemberForBusiness(req.params.memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });
  const wallet = getMemberTicketWallet(business.id, member.id);
  const history = getMemberTicketHistory(business.id, member.id, 20);
  return res.json({
    member_id: member.id,
    points: Number(member.points) || 0,
    loyalty_mode: business.loyalty_mode ?? "points_cash",
    points_per_ticket: business.points_per_ticket != null ? Number(business.points_per_ticket) : 10,
    ticket_balance: Number(wallet?.ticket_balance) || 0,
    history,
  });
});

router.post("/:slug/members/:memberId/tickets/convert", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  const member = getMemberForBusiness(req.params.memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });
  const pointsToConvert = Number(req.body?.points_to_convert ?? req.body?.pointsToConvert);
  const idempotencyKey = getIdempotencyKey(req);
  const result = convertPointsToTickets({
    businessId: business.id,
    memberId: member.id,
    pointsToConvert,
    idempotencyKey,
    metadata: { source: "client_page" },
  });
  if (result?.error === "mode_disabled") return res.status(400).json({ error: "Mode jeu désactivé", code: "MODE_DISABLED" });
  if (result?.error === "invalid_points") return res.status(400).json({ error: "Nombre de points invalide", code: "INVALID_POINTS" });
  if (result?.error === "not_enough_points") return res.status(400).json({ error: "Pas assez de points", code: "NOT_ENOUGH_POINTS" });
  if (result?.error) return res.status(400).json({ error: "Conversion impossible", code: String(result.error).toUpperCase() });
  return res.json(result);
});

router.post("/:slug/games/:gameCode/spins", (req, res) => {
  try {
    const business = getBusinessBySlug(req.params.slug);
    if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
    const memberId = String(req.body?.memberId || "").trim();
    if (!memberId) return res.status(400).json({ error: "memberId requis" });
    const member = getMemberForBusiness(memberId, business.id);
    if (!member) return res.status(404).json({ error: "Membre introuvable" });
    const idempotencyKey = getIdempotencyKey(req);
    const clientIpHash = buildIpHash(req);
    const deviceHash = buildDeviceHash(req.body?.client_fingerprint ?? req.body?.clientFingerprint ?? "");
    const result = spinGameForMember({
      businessId: business.id,
      memberId: member.id,
      gameCode: req.params.gameCode,
      idempotencyKey,
      clientIpHash,
      deviceHash,
      riskScore: deviceHash ? 0.15 : 0.35,
    });
    if (result?.error === "mode_disabled") return res.status(400).json({ error: "Mode jeu désactivé", code: "MODE_DISABLED" });
    if (result?.error === "game_disabled") return res.status(400).json({ error: "Jeu indisponible", code: "GAME_DISABLED" });
    if (result?.error === "not_enough_tickets") {
      return res.status(400).json({
        error: "Tickets insuffisants",
        code: "NOT_ENOUGH_TICKETS",
        ticket_cost: result.ticket_cost,
        ticket_balance: result.ticket_balance,
      });
    }
    if (result?.error === "daily_limit_reached") return res.status(429).json({ error: "Limite quotidienne atteinte", code: "DAILY_LIMIT_REACHED" });
    if (result?.error === "cooldown_active") {
      return res.status(429).json({ error: "Attendez avant de rejouer", code: "COOLDOWN_ACTIVE", cooldown_seconds: result.cooldown_seconds });
    }
    if (result?.error === "member_not_found") {
      return res.status(404).json({ error: "Membre introuvable. Recharge la page ou recrée ta carte.", code: "MEMBER_NOT_FOUND" });
    }
    if (result?.error === "business_not_found") {
      return res.status(404).json({ error: "Commerce introuvable.", code: "BUSINESS_NOT_FOUND" });
    }
    if (result?.error) {
      return res.status(400).json({ error: "Spin impossible", code: String(result.error).toUpperCase() });
    }
    const reward = result.reward
      ? {
        id: result.reward.id,
        code: result.reward.code,
        label: result.reward.label,
        kind: result.reward.kind,
        value: result.reward.value || null,
      }
      : null;
    return res.json({
      ok: true,
      idempotent: !!result.idempotent,
      spin: result.spin,
      reward,
      ticket_balance: result.ticket_balance,
      member_points: result.member_points,
    });
  } catch (err) {
    console.error("[spins] Erreur:", err);
    const detail = err?.message || String(err);
    return res.status(500).json({
      error: "Erreur serveur. Réessaie dans un instant.",
      code: "SERVER_ERROR",
      detail: detail.slice(0, 200),
    });
  }
});

router.get("/:slug/members/:memberId/rewards", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  const member = getMemberForBusiness(req.params.memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });
  const rewards = getMemberRewards(business.id, member.id, 30);
  return res.json({ rewards });
});

router.post("/:slug/members/:memberId/rewards/:grantId/claim", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Accès non autorisé" });
  }
  const member = getMemberForBusiness(req.params.memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });
  const claimed = markRewardGrantClaimed(business.id, member.id, req.params.grantId);
  if (!claimed) return res.status(404).json({ error: "Récompense introuvable ou déjà utilisée" });
  return res.json({ ok: true, reward_grant: claimed });
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
    locationLat,
    locationLng,
    locationRelevantText,
    locationRadiusMeters,
    locationAddress,
    slug: requestedSlug,
  } = body;
  const updates = {};
  if (requestedSlug !== undefined) {
    const normalizedSlug = String(requestedSlug).trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (!normalizedSlug) {
      return res.status(400).json({ error: "slug invalide" });
    }
    if (normalizedSlug !== business.slug) {
      const existing = getBusinessBySlug(normalizedSlug);
      if (existing && existing.id !== business.id) {
        return res.status(409).json({ error: "Ce lien est déjà utilisé" });
      }
      updates.slug = normalizedSlug;
    }
  }
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
  const logoBase64 = body.logoBase64 ?? body.logo_base64;
  if (logoBase64 !== undefined) {
    if (logoBase64 === null || logoBase64 === "") {
      updates.logo_base64 = null;
    } else if (typeof logoBase64 === "string") {
      const base64Data = logoBase64.replace(/^data:image\/\w+;base64,/, "");
      const buf = Buffer.from(base64Data, "base64");
      if (buf.length === 0 || buf.length > 4 * 1024 * 1024) {
        return res.status(400).json({ error: "Logo invalide ou trop volumineux (max 4 Mo)." });
      }
      updates.logo_base64 = logoBase64;
    }
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
  const loyaltyMode = body.loyaltyMode ?? body.loyalty_mode;
  const pointsPerTicket = body.pointsPerTicket ?? body.points_per_ticket;
  if (pointsRewardTiers !== undefined) {
    if (pointsRewardTiers === null || pointsRewardTiers === "") updates.points_reward_tiers = null;
    else if (Array.isArray(pointsRewardTiers)) updates.points_reward_tiers = JSON.stringify(pointsRewardTiers);
    else if (typeof pointsRewardTiers === "string") {
      try { JSON.parse(pointsRewardTiers); updates.points_reward_tiers = pointsRewardTiers; } catch (_) { updates.points_reward_tiers = null; }
    }
  }
  if (loyaltyMode !== undefined) {
    const mode = String(loyaltyMode || "").trim().toLowerCase();
    updates.loyalty_mode = mode === "points_game_tickets" ? "points_game_tickets" : "points_cash";
  }
  if (pointsPerTicket !== undefined) {
    const n = Number(pointsPerTicket);
    updates.points_per_ticket = Number.isInteger(n) && n > 0 ? n : 10;
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
  const labelRestants = body.labelRestants ?? body.label_restants;
  if (labelRestants !== undefined) {
    const v = labelRestants == null || labelRestants === "" ? null : String(labelRestants).trim().slice(0, 32);
    updates.label_restants = v || null;
  }
  const labelMember = body.labelMember ?? body.label_member;
  if (labelMember !== undefined) {
    const v = labelMember == null || labelMember === "" ? null : String(labelMember).trim().slice(0, 32);
    updates.label_member = v || null;
  }
  const headerRightText = body.headerRightText ?? body.header_right_text;
  if (headerRightText !== undefined) {
    const v = headerRightText == null || headerRightText === "" ? null : String(headerRightText).trim().slice(0, 32);
    updates.header_right_text = v || null;
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
