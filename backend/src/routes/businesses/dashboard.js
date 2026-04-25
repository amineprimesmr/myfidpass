/**
 * Routes dashboard (/:slug/dashboard/*). Utilise req.business et canAccessDashboard (shared).
 * Dérogation limite 400 lignes (REFONTE-REGLES) : découpage prévu en sous-fichiers — 2025-03.
 */
import { Router } from "express";
import {
  updateBusiness,
  getBusinessById,
  bumpBusinessPassRefreshTimestamp,
  getBusinessGames,
  updateBusinessGameConfig,
  getGameRewardsForBusiness,
  replaceGameRewardsForBusiness,
  getEngagementRewards,
  getPassKitPushTokensForBusiness,
  getDashboardStats,
  getDashboardTrafficPatterns,
  getDashboardEvolution,
  getDashboardEvolutionForMonth,
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
import { deleteMemberForBusiness, deleteAllMembersForBusiness } from "../../db/member-delete.js";
import { getRoulettePublicSegments } from "../../db/games.js";
import { resolveBusinessProgramType } from "../../db/businesses.js";
import { sendPassKitUpdate } from "../../apns.js";
import {
  ensureDashboardAccess,
  blockStaffDashboardWrites,
  ensureOperationalSubscription,
  getApiBase,
  normalizeHexForPatch,
  MAX_LOGO_BASE64_BYTES,
} from "./shared.js";
import { postMemberPointsRemove } from "./member-points-remove-handler.js";
import { patchMemberProfile } from "./member-patch-handler.js";
import { normalizeLocationRadiusForStorage } from "../../locationRadiusLimits.js";
import { normalizeFlyerPrefsPut } from "../../lib/flyer-prefs.js";
import { mergeCampaignAutomationJson } from "../../lib/campaign-automation-cron.js";
import rateLimit from "express-rate-limit";
import { parseFlyerAIBody } from "../../services/flyer-ai-image.js";
import {
  countActiveFlyerJobsForBusiness,
  enqueueFlyerGenerationJob,
  getFlyerJobStatusForResponse,
} from "../../lib/flyer-generation-jobs.js";
import { parseCampaignAutomationInstructionWithAI, normalizeEventTypeToken } from "../../services/campaign-automation-ai.js";
import {
  FLYER_AI_FREE_PER_MONTH,
  currentMonthKeyUTC,
  isFlyerAiUnlimited,
  DEFAULT_FLYER_AI_DEV_UNLOCK_SECRET,
} from "../../services/flyer-ai-quota.js";
import { signReceiptChallengeToken } from "../../lib/receipt-validation-jwt.js";
import logger from "../../lib/logger.js";
import { flyerAiQuotaDevBypass } from "../../lib/flyer-ai-quota-bypass.js";
import { parseFlyerPrefsCustomBgDataUrl } from "../../lib/resolve-flyer-prefs-custom-logo.js";
import {
  buildCsvFromRows,
  buildExportRows,
  summarizeExportRows,
} from "../../lib/merchant-transaction-export.js";
import { buildMerchantAccountingPack } from "../../lib/merchant-accounting-pack.js";
import socialMetricsRouter from "./dashboard-social-metrics.js";
import dashboardSocialOauthRouter from "./dashboard-social-oauth.js";
import dashboardDeliveryReceiptClaimsRouter from "./dashboard-delivery-receipt-claims.js";
import dashboardGoogleBusinessRouter from "./dashboard-google-business.js";
import dashboardTeamRouter from "./dashboard-team.js";
import { isDeliveryReceiptDevResetEnabled } from "../../lib/delivery-receipt-dev-reset-flag.js";
import { refreshGoogleSnapshotForBusiness } from "../../services/social-metrics-service.js";

const router = Router({ mergeParams: true });

/** Remet le compteur flyer IA au mois UTC courant si besoin. */
function syncFlyerAiBillingMonth(business) {
  const month = currentMonthKeyUTC();
  if (String(business.flyer_ai_billing_month || "").trim() !== month) {
    updateBusiness(business.id, {
      flyer_ai_billing_month: month,
      flyer_ai_generations_used: 0,
    });
    return getBusinessById(business.id);
  }
  return business;
}

/** Max 8 générations flyer IA / heure / commerce (coût OpenAI). */
const flyerAiGenerateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `flyer-ai:${req.business?.id ?? req.ip}`,
  message: { error: "Limite horaire atteinte. Réessayez dans un moment." },
});

function requireDashboard(req, res, next) {
  if (!req.business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!ensureDashboardAccess(req, res, req.business)) return;
  next();
}

router.use(requireDashboard);
router.use((req, res, next) => {
  if (!blockStaffDashboardWrites(req, res, req.business)) return;
  next();
});
router.use("/team", dashboardTeamRouter);
router.use(socialMetricsRouter);
router.use(dashboardSocialOauthRouter);
router.use(dashboardDeliveryReceiptClaimsRouter);
router.use(dashboardGoogleBusinessRouter);

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
    /** 1 = embarquer lat/lng/rayon dans le .pkpass (géofence Wallet). 0 = pas d’emplacements dans le pass (campagnes / alertes plus visibles hors zone). */
    wallet_pass_include_locations:
      business.wallet_pass_include_locations != null ? Number(business.wallet_pass_include_locations) : 0,
    required_stamps: business.required_stamps != null ? Number(business.required_stamps) : undefined,
    stamp_emoji: business.stamp_emoji ?? undefined,
    stamp_reward_label: business.stamp_reward_label ?? undefined,
    stamp_mid_reward_label: business.stamp_mid_reward_label ?? undefined,
    points_per_euro: business.points_per_euro != null ? Number(business.points_per_euro) : undefined,
    points_per_visit: business.points_per_visit != null ? Number(business.points_per_visit) : undefined,
    program_type: business.program_type ?? undefined,
    loyalty_mode: business.loyalty_mode ?? "points_cash",
    points_per_ticket: business.points_per_ticket != null ? Number(business.points_per_ticket) : 10,
    points_min_amount_eur: business.points_min_amount_eur != null ? Number(business.points_min_amount_eur) : undefined,
    points_reward_tiers: points_reward_tiers ?? undefined,
    sector: business.sector ?? undefined,
    logo_url:
      Number(business.asset_logo_present) === 1
        ? `${apiBase}/api/businesses/${encodeURIComponent(slug)}/logo`
        : undefined,
    logo_updated_at: business.logo_updated_at ?? undefined,
    logo_icon_url:
      Number(business.asset_logo_icon_present) === 1
        ? `${apiBase}/api/businesses/${encodeURIComponent(slug)}/logo-icon`
        : undefined,
    logo_icon_updated_at: business.logo_icon_updated_at ?? undefined,
    /** Icône campagnes / push — média séparé (ne modifie pas le logo carte ni le logo carré fiche). */
    notification_icon_url:
      Number(business.asset_notification_icon_present) === 1
        ? `${apiBase}/api/businesses/${encodeURIComponent(slug)}/notification-icon`
        : undefined,
    notification_icon_updated_at: business.notification_icon_updated_at ?? undefined,
    has_card_background: Number(business.asset_card_background_present) === 1,
    card_background_updated_at: business.card_background_updated_at ?? undefined,
    fidelity_page_background_url:
      Number(business.asset_fidelity_page_background_present) === 1
        ? `${apiBase}/api/businesses/${encodeURIComponent(slug)}/fidelity-page-background`
        : undefined,
    fidelity_page_background_updated_at: business.fidelity_page_background_updated_at ?? undefined,
    /** Fond page jeu QR depuis prefs flyer (si pas d’asset fidélité dédié). */
    flyer_custom_bg_url: parseFlyerPrefsCustomBgDataUrl(business.flyer_prefs_json)
      ? `${apiBase}/api/businesses/${encodeURIComponent(slug)}/public/flyer-custom-bg`
      : undefined,
    flyer_prefs_updated_at: business.flyer_prefs_updated_at ?? undefined,
    fidelity_qr_hero_title: business.fidelity_qr_hero_title?.trim() || undefined,
    strip_color: business.strip_color ?? undefined,
    strip_display_mode: business.strip_display_mode ?? "logo",
    strip_text: business.strip_text ?? undefined,
    label_restants: business.label_restants ?? undefined,
    label_member: business.label_member ?? undefined,
    header_right_text: business.header_right_text ?? undefined,
    notification_title_override: business.notification_title_override ?? undefined,
    notification_change_message: business.notification_change_message ?? undefined,
    campaign_automation: mergeCampaignAutomationJson(business.campaign_automation_json ?? ""),
    has_stamp_icon: Number(business.asset_stamp_icon_present) === 1,
    stamp_icon_url:
      Number(business.asset_stamp_icon_present) === 1
        ? `${apiBase}/api/businesses/${encodeURIComponent(slug)}/stamp-icon`
        : undefined,
    engagement_rewards: getEngagementRewards(business.id),
    /** 0 ou null = illimité — crédits `points_add` max par client et par jour (UTC). */
    scan_max_passes_per_member_per_day:
      business.scan_max_passes_per_member_per_day != null
        ? Number(business.scan_max_passes_per_member_per_day)
        : null,
    /** 0 ou null = illimité — plafond de points par opération (scan / fiche membre). */
    scan_max_points_per_transaction:
      business.scan_max_points_per_transaction != null
        ? Number(business.scan_max_points_per_transaction)
        : null,
    /** 1 = exiger un QR ticket (JWT) pour tout crédit basé sur un montant € (scan + fiche membre). */
    require_receipt_qr_validation:
      business.require_receipt_qr_validation != null ? Number(business.require_receipt_qr_validation) : 0,
    /** Tolérance en centimes entre montant saisi et montant dans le JWT (défaut 5). */
    receipt_qr_tolerance_cents:
      business.receipt_qr_tolerance_cents != null ? Number(business.receipt_qr_tolerance_cents) : 5,
    delivery_receipt_claims_enabled:
      business.delivery_receipt_claims_enabled != null ? Number(business.delivery_receipt_claims_enabled) : 1,
    delivery_receipt_max_age_days:
      business.delivery_receipt_max_age_days != null ? Number(business.delivery_receipt_max_age_days) : 14,
    delivery_receipt_auto_max_amount_eur:
      business.delivery_receipt_auto_max_amount_eur != null ? Number(business.delivery_receipt_auto_max_amount_eur) : 80,
    delivery_receipt_auto_min_confidence:
      business.delivery_receipt_auto_min_confidence != null ? Number(business.delivery_receipt_auto_min_confidence) : 0.72,
    delivery_receipt_max_per_member_per_day:
      business.delivery_receipt_max_per_member_per_day != null ? Number(business.delivery_receipt_max_per_member_per_day) : 4,
    delivery_receipt_max_per_member_per_month:
      business.delivery_receipt_max_per_member_per_month != null
        ? Number(business.delivery_receipt_max_per_member_per_month)
        : 25,
    /** 1 = le dashboard peut appeler POST .../delivery-receipt-claims/dev-reset (variable DELIVERY_RECEIPT_DEV_RESET sur l’API). */
    delivery_receipt_dev_reset_available: isDeliveryReceiptDevResetEnabled() ? 1 : 0,
    /** Préférences export bilan (valorisation, montants nominatifs) — objet JSON ou {}. */
    accounting_prefs: (() => {
      const raw = business.accounting_prefs_json;
      if (!raw || !String(raw).trim()) return {};
      try {
        const o = JSON.parse(raw);
        return typeof o === "object" && o != null && !Array.isArray(o) ? o : {};
      } catch {
        return {};
      }
    })(),
  });
});

/** Génère un JWT à encoder en QR sur le ticket de caisse (même montant que le panier, 15 min). */
router.post("/receipt-challenge", (req, res) => {
  const business = req.business;
  if (!ensureOperationalSubscription(req, res, business)) return;
  const amountEur = Number(req.body?.amount_eur ?? req.body?.amountEur);
  if (!Number.isFinite(amountEur) || amountEur <= 0) {
    return res.status(400).json({ error: "Indiquez amount_eur (nombre > 0)." });
  }
  const secret = process.env.JWT_SECRET;
  if (!secret || String(secret).length < 8) {
    return res.status(500).json({ error: "Configuration JWT manquante." });
  }
  const token = signReceiptChallengeToken({
    businessId: business.id,
    amountEur,
    secret,
  });
  const expMs = Date.now() + 15 * 60 * 1000;
  res.json({
    qr_payload: token,
    expires_at: new Date(expMs).toISOString(),
    amount_eur: Math.round(amountEur * 100) / 100,
  });
});

router.patch("/settings", async (req, res) => {
  try {
  const business = req.business;
  const body = req.body || {};
  const organization_name = body.organization_name ?? body.organizationName;
  const background_color = body.background_color ?? body.backgroundColor;
  const foreground_color = body.foreground_color ?? body.foregroundColor;
  const label_color = body.label_color ?? body.labelColor;
  const back_terms = body.back_terms ?? body.backTerms;
  const back_contact = body.back_contact ?? body.backContact;
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
  const logo_icon_base64 = body.logo_icon_base64 ?? body.logoIconBase64;
  const notification_icon_base64 = body.notification_icon_base64 ?? body.notificationIconBase64;
  const card_background_base64 = body.card_background_base64 ?? body.cardBackgroundBase64;
  const fidelity_page_background_base64 =
    body.fidelity_page_background_base64 ?? body.fidelityPageBackgroundBase64;
  const fidelity_qr_hero_title = body.fidelity_qr_hero_title ?? body.fidelityQrHeroTitle;
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
  const wallet_pass_include_locations_in =
    body.wallet_pass_include_locations ?? body.walletPassIncludeLocations;
  const updates = {};
  if (organization_name !== undefined) updates.organization_name = organization_name ? String(organization_name).trim() : null;
  if (location_address !== undefined) updates.location_address = location_address ? String(location_address).trim() : null;
  if (location_lat !== undefined) updates.location_lat = location_lat === null || location_lat === "" ? null : Number(location_lat);
  if (location_lng !== undefined) updates.location_lng = location_lng === null || location_lng === "" ? null : Number(location_lng);
  if (location_radius_meters !== undefined) {
    updates.location_radius_meters =
      location_radius_meters === null || location_radius_meters === ""
        ? null
        : normalizeLocationRadiusForStorage(location_radius_meters);
  }
  if (location_relevant_text !== undefined) updates.location_relevant_text = location_relevant_text ? String(location_relevant_text).trim() : null;
  if (wallet_pass_include_locations_in !== undefined) {
    const v = wallet_pass_include_locations_in;
    const on =
      v === true ||
      v === 1 ||
      String(v).toLowerCase() === "true" ||
      String(v) === "1";
    updates.wallet_pass_include_locations = on ? 1 : 0;
  }
  if (background_color !== undefined) {
    updates.background_color = normalizeHexForPatch(background_color);
    updates.strip_color = updates.background_color;
  }
  if (foreground_color !== undefined) updates.foreground_color = normalizeHexForPatch(foreground_color);
  if (label_color !== undefined) {
    updates.label_color =
      label_color === null || label_color === "" ? null : normalizeHexForPatch(label_color);
  }
  if (back_terms !== undefined) {
    updates.back_terms = back_terms == null ? null : String(back_terms).trim() || null;
  }
  if (back_contact !== undefined) {
    updates.back_contact = back_contact == null ? null : String(back_contact).trim() || null;
  }
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
    const v = stamp_emoji == null || stamp_emoji === "" ? null : String(stamp_emoji).trim().slice(0, 32);
    updates.stamp_emoji = v || null;
  }
  if (stamp_reward_label !== undefined) {
    const v = stamp_reward_label == null || stamp_reward_label === "" ? null : String(stamp_reward_label).trim().slice(0, 120);
    updates.stamp_reward_label = v || null;
  }
  {
    const stampMidIncoming =
      body.stamp_mid_reward_label !== undefined ? body.stamp_mid_reward_label : body.stampMidRewardLabel;
    if (stampMidIncoming !== undefined) {
      const v =
        stampMidIncoming == null || stampMidIncoming === ""
          ? null
          : String(stampMidIncoming).trim().slice(0, 120);
      updates.stamp_mid_reward_label = v || null;
    }
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
  const MAX_LOGO_ICON_BYTES = 512 * 1024;
  if (logo_icon_base64 !== undefined) {
    if (logo_icon_base64 === null || (typeof logo_icon_base64 === "string" && logo_icon_base64.trim() === "")) {
      updates.logo_icon_base64 = null;
    } else if (typeof logo_icon_base64 === "string") {
      const base64Data = String(logo_icon_base64).replace(/^data:image\/\w+;base64,/, "");
      const buf = Buffer.from(base64Data, "base64");
      if (buf.length > MAX_LOGO_ICON_BYTES) {
        return res.status(400).json({ error: "Logo carré trop volumineux (max 512 Ko)." });
      }
      if (buf.length > 0) {
        updates.logo_icon_base64 = logo_icon_base64.startsWith("data:") ? logo_icon_base64 : `data:image/png;base64,${base64Data}`;
      } else {
        updates.logo_icon_base64 = null;
      }
    }
  }
  if (notification_icon_base64 !== undefined) {
    if (notification_icon_base64 === null || (typeof notification_icon_base64 === "string" && notification_icon_base64.trim() === "")) {
      updates.notification_icon_base64 = null;
    } else if (typeof notification_icon_base64 === "string") {
      const base64Data = String(notification_icon_base64).replace(/^data:image\/\w+;base64,/, "");
      const buf = Buffer.from(base64Data, "base64");
      if (buf.length > MAX_LOGO_ICON_BYTES) {
        return res.status(400).json({ error: "Icône notification trop volumineuse (max 512 Ko)." });
      }
      if (buf.length > 0) {
        updates.notification_icon_base64 = notification_icon_base64.startsWith("data:")
          ? notification_icon_base64
          : `data:image/png;base64,${base64Data}`;
      } else {
        updates.notification_icon_base64 = null;
      }
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
  if (fidelity_page_background_base64 !== undefined) {
    if (
      fidelity_page_background_base64 === null ||
      (typeof fidelity_page_background_base64 === "string" && fidelity_page_background_base64.trim() === "")
    ) {
      updates.fidelity_page_background_base64 = null;
    } else if (typeof fidelity_page_background_base64 === "string") {
      const base64Data = String(fidelity_page_background_base64).replace(/^data:image\/\w+;base64,/, "");
      const buf = Buffer.from(base64Data, "base64");
      if (buf.length > MAX_LOGO_BASE64_BYTES) {
        return res.status(400).json({ error: "Image de fond page fidélité trop volumineuse (max 4 Mo)." });
      }
      updates.fidelity_page_background_base64 = fidelity_page_background_base64.startsWith("data:")
        ? fidelity_page_background_base64
        : `data:image/jpeg;base64,${base64Data}`;
    }
  }
  if (fidelity_qr_hero_title !== undefined) {
    if (fidelity_qr_hero_title === null || String(fidelity_qr_hero_title).trim() === "") {
      updates.fidelity_qr_hero_title = null;
    } else {
      updates.fidelity_qr_hero_title = String(fidelity_qr_hero_title).trim().slice(0, 400);
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
  const campaign_automation_in = body.campaign_automation ?? body.campaignAutomation;
  if (campaign_automation_in !== undefined) {
    if (campaign_automation_in === null) {
      updates.campaign_automation_json = null;
    } else if (typeof campaign_automation_in === "object") {
      updates.campaign_automation_json = JSON.stringify(mergeCampaignAutomationJson(JSON.stringify(campaign_automation_in)));
    } else if (typeof campaign_automation_in === "string") {
      const t = campaign_automation_in.trim();
      updates.campaign_automation_json = t ? JSON.stringify(mergeCampaignAutomationJson(t)) : null;
    }
  }
  const scanMaxPassesIn = body.scan_max_passes_per_member_per_day ?? body.scanMaxPassesPerMemberPerDay;
  const scanMaxPointsIn = body.scan_max_points_per_transaction ?? body.scanMaxPointsPerTransaction;
  if (scanMaxPassesIn !== undefined) {
    if (scanMaxPassesIn === null || scanMaxPassesIn === "") {
      updates.scan_max_passes_per_member_per_day = null;
    } else {
      const n = Math.floor(Number(scanMaxPassesIn));
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: "scan_max_passes_per_member_per_day invalide (entier ≥ 0)." });
      }
      updates.scan_max_passes_per_member_per_day = n === 0 ? null : Math.min(n, 999);
    }
  }
  if (scanMaxPointsIn !== undefined) {
    if (scanMaxPointsIn === null || scanMaxPointsIn === "") {
      updates.scan_max_points_per_transaction = null;
    } else {
      const n = Math.floor(Number(scanMaxPointsIn));
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: "scan_max_points_per_transaction invalide (entier ≥ 0)." });
      }
      updates.scan_max_points_per_transaction = n === 0 ? null : Math.min(n, 999999);
    }
  }

  const requireReceiptIn = body.require_receipt_qr_validation ?? body.requireReceiptQrValidation;
  if (requireReceiptIn !== undefined) {
    const on =
      requireReceiptIn === true ||
      requireReceiptIn === 1 ||
      String(requireReceiptIn).toLowerCase() === "true" ||
      String(requireReceiptIn) === "1";
    updates.require_receipt_qr_validation = on ? 1 : 0;
  }
  const receiptTolIn = body.receipt_qr_tolerance_cents ?? body.receiptQrToleranceCents;
  if (receiptTolIn !== undefined) {
    const n = Math.floor(Number(receiptTolIn));
    if (!Number.isFinite(n) || n < 0 || n > 500) {
      return res.status(400).json({ error: "receipt_qr_tolerance_cents invalide (0–500)." });
    }
    updates.receipt_qr_tolerance_cents = n;
  }

  const delivEn = body.delivery_receipt_claims_enabled ?? body.deliveryReceiptClaimsEnabled;
  if (delivEn !== undefined) {
    const on =
      delivEn === true ||
      delivEn === 1 ||
      String(delivEn).toLowerCase() === "true" ||
      String(delivEn) === "1";
    updates.delivery_receipt_claims_enabled = on ? 1 : 0;
  }
  const delivAge = body.delivery_receipt_max_age_days ?? body.deliveryReceiptMaxAgeDays;
  if (delivAge !== undefined) {
    const n = Math.floor(Number(delivAge));
    if (!Number.isFinite(n) || n < 1 || n > 90) {
      return res.status(400).json({ error: "delivery_receipt_max_age_days invalide (1–90)." });
    }
    updates.delivery_receipt_max_age_days = n;
  }
  const delivAutoMax = body.delivery_receipt_auto_max_amount_eur ?? body.deliveryReceiptAutoMaxAmountEur;
  if (delivAutoMax !== undefined) {
    const n = Number(delivAutoMax);
    if (!Number.isFinite(n) || n < 5 || n > 5000) {
      return res.status(400).json({ error: "delivery_receipt_auto_max_amount_eur invalide (5–5000)." });
    }
    updates.delivery_receipt_auto_max_amount_eur = n;
  }
  const delivConf = body.delivery_receipt_auto_min_confidence ?? body.deliveryReceiptAutoMinConfidence;
  if (delivConf !== undefined) {
    const n = Number(delivConf);
    if (!Number.isFinite(n) || n < 0.3 || n > 0.99) {
      return res.status(400).json({ error: "delivery_receipt_auto_min_confidence invalide (0.3–0.99)." });
    }
    updates.delivery_receipt_auto_min_confidence = n;
  }
  const delivDay = body.delivery_receipt_max_per_member_per_day ?? body.deliveryReceiptMaxPerMemberPerDay;
  if (delivDay !== undefined) {
    const n = Math.floor(Number(delivDay));
    if (!Number.isFinite(n) || n < 1 || n > 20) {
      return res.status(400).json({ error: "delivery_receipt_max_per_member_per_day invalide (1–20)." });
    }
    updates.delivery_receipt_max_per_member_per_day = n;
  }
  const delivMonth = body.delivery_receipt_max_per_member_per_month ?? body.deliveryReceiptMaxPerMemberPerMonth;
  if (delivMonth !== undefined) {
    const n = Math.floor(Number(delivMonth));
    if (!Number.isFinite(n) || n < 1 || n > 200) {
      return res.status(400).json({ error: "delivery_receipt_max_per_member_per_month invalide (1–200)." });
    }
    updates.delivery_receipt_max_per_member_per_month = n;
  }

  if (engagement_rewards !== undefined) {
    if (engagement_rewards === null || (typeof engagement_rewards === "object" && Object.keys(engagement_rewards).length === 0)) {
      updates.engagement_rewards = null;
    } else if (typeof engagement_rewards === "object") {
      const er = JSON.parse(JSON.stringify(engagement_rewards));
      if (er.google_review && typeof er.google_review === "object") {
        er.google_review.require_approval = false;
      }
      updates.engagement_rewards = JSON.stringify(er);
    } else if (typeof engagement_rewards === "string") {
      try {
        const er = JSON.parse(engagement_rewards);
        if (er && typeof er === "object" && er.google_review && typeof er.google_review === "object") {
          er.google_review.require_approval = false;
        }
        updates.engagement_rewards = JSON.stringify(er);
      } catch (_) {
        updates.engagement_rewards = null;
      }
    }
  }

  const accounting_prefs_in = body.accounting_prefs_json ?? body.accountingPrefsJson ?? body.accounting_prefs;
  if (accounting_prefs_in !== undefined) {
    if (accounting_prefs_in === null || accounting_prefs_in === "") {
      updates.accounting_prefs_json = null;
    } else {
      let obj;
      try {
        obj = typeof accounting_prefs_in === "string" ? JSON.parse(accounting_prefs_in) : accounting_prefs_in;
      } catch {
        return res.status(400).json({ error: "accounting_prefs JSON invalide." });
      }
      if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
        return res.status(400).json({ error: "accounting_prefs doit être un objet JSON." });
      }
      const str = JSON.stringify(obj);
      if (str.length > 32000) {
        return res.status(400).json({ error: "Préférences comptables trop volumineuses (max 32 Ko)." });
      }
      updates.accounting_prefs_json = str;
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
  const passWalletGeometryUpdated =
    locationUpdated || updates.wallet_pass_include_locations !== undefined;
  const passNotifTextsUpdated =
    updates.notification_title_override !== undefined || updates.notification_change_message !== undefined;
  /** Icône / logos dans le .pkpass (notification Wallet utilise `icon.png` du pass, pas l’URL Web Push). */
  const passVisualMediaUpdated =
    updates.notification_icon_base64 !== undefined ||
    updates.logo_icon_base64 !== undefined ||
    updates.logo_base64 !== undefined ||
    updates.card_background_base64 !== undefined ||
    updates.stamp_icon_base64 !== undefined;
  updateBusiness(business.id, updates);
  if (passNotifTextsUpdated || passVisualMediaUpdated) {
    bumpBusinessPassRefreshTimestamp(business.id);
  }
  // Ne pas envoyer de vague PassKit pour les seuls changements de texte (titre/message) :
  // ces champs sont des templates persistés en DB — la vague sera envoyée lors du POST /notifications/send
  // qui suit immédiatement (le pre-send flush de l’app iOS appellerait sinon 2 vagues → double notif Wallet).
  if (passWalletGeometryUpdated || passVisualMediaUpdated) {
    const passKitTokens = getPassKitPushTokensForBusiness(business.id);
    if (passKitTokens.length > 0) {
      // Relire la ligne commerce frais → on récupère `pass_last_modified_ms` fraîchement bumpé
      // pour construire un `apns-collapse-id` unique. Sans collapse-id distinct, un push PATCH
      // d'icône peut être fusionné par APNs avec le push du broadcast qui suit ≈1-5 s plus tard,
      // et seul LE DERNIER est délivré → la 1ʳᵉ fenêtre d'invalidation de la miniature bannière
      // côté passd est perdue, Wallet garde l'ancienne icône en cache.
      const bFresh = getBusinessById(business.id);
      const passMs = Number(bFresh?.pass_last_modified_ms) || Date.now();
      // Préfixe distinct des broadcasts (`bcast-…`) pour que cette vague ne soit jamais fusionnée
      // avec le push du POST /notifications/send qui suit presque toujours dans la foulée.
      const assetCollapseId = `asset-${passMs}`;

      // Attendre l’envoi des 1ers APNs PassKit **avant** le 200 : sinon l’app iOS continue (aperçu OK)
      // alors que le téléphone n’a pas encore reçu le push « pass mis à jour » → bannière Wallet avec **ancienne** icon.png.
      const PAR = 40;
      const MAX_SYNC = 300;
      const head = passKitTokens.slice(0, MAX_SYNC);
      for (let i = 0; i < head.length; i += PAR) {
        const chunk = head.slice(i, i + PAR);
        await Promise.all(
          chunk.map((row) =>
            sendPassKitUpdate(row.push_token, { collapseId: assetCollapseId }).catch(() => {}),
          ),
        );
      }
      const tail = passKitTokens.slice(MAX_SYNC);
      if (tail.length > 0) {
        process.nextTick(() => {
          tail.forEach((row) => {
            sendPassKitUpdate(row.push_token, { collapseId: assetCollapseId }).catch(() => {});
          });
        });
      }
      // Retry anti-throttling : Apple peut déprioritiser / dropper un silent push background
      // priority 5, surtout lorsque l'appareil vient de sortir de veille. Un second push 1800 ms
      // plus tard avec un collapse-id DIFFÉRENT (`asset-…~retry`) force une seconde tentative
      // indépendante qui ne sera pas fusionnée avec la première. Le coût est minime (quelques
      // dizaines de pushes par PATCH d'icône) et c'est la différence entre "l'icône se met à jour"
      // et "l'icône reste figée pour le prochain envoi".
      if (passVisualMediaUpdated) {
        const retryCollapseId = `${assetCollapseId}~retry`;
        setTimeout(() => {
          try {
            const tokensNow = getPassKitPushTokensForBusiness(business.id);
            for (const row of tokensNow) {
              sendPassKitUpdate(row.push_token, { collapseId: retryCollapseId }).catch(() => {});
            }
          } catch {
            /* retry best-effort */
          }
        }, 1800);
      }
    }
  }
  if (updates.engagement_rewards !== undefined) {
    const bid = business.id;
    process.nextTick(() => {
      (async () => {
        try {
          const er = getEngagementRewards(bid);
          const pid = String(er.google_review?.place_id ?? "").trim();
          if (er.google_review?.enabled && pid) {
            await refreshGoogleSnapshotForBusiness(bid, pid);
          }
        } catch (_) {
          /* métriques best-effort */
        }
      })();
    });
  }
  return res.status(200).send();
  } catch (err) {
    logger.error({ err, businessId: req.business?.id }, "[dashboard] PATCH /settings error");
    if (!res.headersSent) res.status(500).json({ error: "Erreur interne lors de la mise à jour des paramètres." });
  }
});

// ——— Flyer QR (sync SaaS + app, même état que le canvas) ———
router.get("/flyer", (req, res) => {
  let business = syncFlyerAiBillingMonth(req.business);
  const slug = req.params.slug ?? business.slug;
  const fe = (process.env.FRONTEND_URL || "https://www.myfidpass.fr").replace(/\/$/, "");
  const shareUrl = `${fe}/fidelity/${encodeURIComponent(slug)}`;
  let flyer_prefs = null;
  if (business.flyer_prefs_json && String(business.flyer_prefs_json).trim()) {
    try {
      flyer_prefs = JSON.parse(business.flyer_prefs_json);
    } catch (_) {
      flyer_prefs = null;
    }
  }
  const unlimited = isFlyerAiUnlimited(business);
  const used = Math.max(0, Math.floor(Number(business.flyer_ai_generations_used) || 0));
  const bonus = Math.max(0, Math.floor(Number(business.flyer_ai_generations_bonus) || 0));
  const allowance = FLYER_AI_FREE_PER_MONTH + bonus;
  const remaining = unlimited ? null : Math.max(0, allowance - used);
  res.json({
    flyer_prefs,
    updated_at: business.flyer_prefs_updated_at ?? null,
    share_url: shareUrl,
    flyer_ai_unlimited: unlimited,
    flyer_ai_generations_used: used,
    /** Générations achetées (pack) — cumul sur plusieurs mois. */
    flyer_ai_generations_bonus: bonus,
    flyer_ai_generations_remaining: remaining,
    flyer_ai_billing_month: business.flyer_ai_billing_month ?? currentMonthKeyUTC(),
  });
});

router.put("/flyer", (req, res) => {
  const business = req.business;
  const normalized = normalizeFlyerPrefsPut(req.body || {}, business.flyer_prefs_json);
  if (!normalized.ok) {
    return res.status(400).json({ error: normalized.error });
  }
  const now = new Date().toISOString();
  updateBusiness(business.id, {
    flyer_prefs_json: JSON.stringify(normalized.value),
    flyer_prefs_updated_at: now,
  });
  res.json({ ok: true, updated_at: now });
});

/** Statut d’un job de génération flyer (polling SaaS / app iOS après 202 Accepted). */
router.get("/flyer/ai-generate/jobs/:jobId", (req, res) => {
  const payload = getFlyerJobStatusForResponse(req.params.jobId, req.business.id);
  if (!payload) {
    return res.status(404).json({ error: "Job introuvable." });
  }
  return res.json(payload);
});

/**
 * Génération d’image de fond flyer via OpenAI (DALL·E 3) — traitement asynchrone : réponse 202 + job_id.
 * Pas d’`ensureOperationalSubscription` : identité dashboard déjà vérifiée par `requireDashboard` ; quota mensuel / packs limite l’usage.
 */
router.post("/flyer/ai-generate", flyerAiGenerateLimiter, async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || String(apiKey).trim().length < 20) {
    return res.status(503).json({
      error: "Génération IA non configurée. Ajoutez OPENAI_API_KEY sur le serveur.",
    });
  }
  const parsed = parseFlyerAIBody(req.body || {});
  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error });
  }
  const business = syncFlyerAiBillingMonth(req.business);
  const unlimited = isFlyerAiUnlimited(business);
  const devFlyerQuotaBypass = flyerAiQuotaDevBypass(req);
  const used = Math.max(0, Math.floor(Number(business.flyer_ai_generations_used) || 0));
  const bonus = Math.max(0, Math.floor(Number(business.flyer_ai_generations_bonus) || 0));
  const allowance = FLYER_AI_FREE_PER_MONTH + bonus;
  if (!unlimited && !devFlyerQuotaBypass && used >= allowance) {
    return res.status(403).json({
      error:
        "Quota de générations flyer IA atteint pour ce commerce ce mois-ci (incluant vos créations gratuites et vos packs). Le compteur mensuel se renouvelle en UTC ; les packs achetés restent disponibles. Rendez-vous sur votre espace MyFidpass pour acheter des créations supplémentaires.",
      code: "FLYER_AI_LIMIT_REACHED",
    });
  }
  if (countActiveFlyerJobsForBusiness(req.business.id) > 0) {
    return res.status(409).json({
      error:
        "Une génération flyer IA est déjà en cours pour ce commerce. Patientez jusqu’à la fin du traitement ou consultez le statut du job.",
      code: "FLYER_AI_JOB_IN_PROGRESS",
    });
  }
  const jobId = enqueueFlyerGenerationJob({
    businessId: req.business.id,
    body: req.body || {},
    devFlyerQuotaBypass,
  });
  return res.status(202).json({ job_id: jobId, status: "queued" });
});

/**
 * Déverrouillage générations illimitées (équipe / test).
 * Secret : `FLYER_AI_DEV_UNLOCK_SECRET` (optionnel) sinon valeur par défaut dans le code (temporaire).
 * Body : `{ "unlock_secret": "…", "disable": false }` pour activer ; `"disable": true` pour repasser au quota mensuel.
 */
router.post("/flyer/ai-dev-unlock", async (req, res) => {
  const fromEnv = String(process.env.FLYER_AI_DEV_UNLOCK_SECRET || "").trim();
  const effectiveSecret =
    fromEnv.length >= 8 ? fromEnv : DEFAULT_FLYER_AI_DEV_UNLOCK_SECRET;
  const body = req.body || {};
  const provided = body.unlock_secret ?? body.unlockSecret;
  if (String(provided || "") !== String(effectiveSecret)) {
    return res.status(403).json({ error: "Secret incorrect." });
  }
  const disable = Boolean(body.disable ?? body.disable_unlimited);
  let business = syncFlyerAiBillingMonth(req.business);
  updateBusiness(business.id, { flyer_ai_unlimited: disable ? 0 : 1 });
  business = getBusinessById(business.id);
  const unlimited = isFlyerAiUnlimited(business);
  const used = Math.max(0, Math.floor(Number(business.flyer_ai_generations_used) || 0));
  const bonus = Math.max(0, Math.floor(Number(business.flyer_ai_generations_bonus) || 0));
  const allowance = FLYER_AI_FREE_PER_MONTH + bonus;
  return res.json({
    ok: true,
    flyer_ai_unlimited: unlimited,
    flyer_ai_generations_used: used,
    flyer_ai_generations_remaining: unlimited ? null : Math.max(0, allowance - used),
  });
});

/**
 * IA: transforme une instruction libre en règle d’automatisation exploitable.
 * Body: { instruction: string }
 */
router.post("/campaign-automation/parse", async (req, res) => {
  try {
  if (!ensureOperationalSubscription(req, res, req.business)) return;
  const instruction = String(req.body?.instruction ?? "").trim();
  if (!instruction) {
    return res.status(400).json({ error: "Instruction requise." });
  }
  const parsed = await parseCampaignAutomationInstructionWithAI({
    apiKey: process.env.OPENAI_API_KEY,
    instruction,
  });
  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error || "Instruction invalide." });
  }
  const v = parsed.value;
  const eventTypeNorm =
    normalizeEventTypeToken(v.eventType) ||
    (String(v.eventType || "").startsWith("custom:") ? String(v.eventType) : "member_created");
  return res.json({
    mode: "event",
    title: String(v.title || "Automatisation"),
    message: String(v.message || "").slice(0, 200),
    event_type: eventTypeNorm,
    delay_minutes: Math.max(1, Math.min(1440, Number(v.delayMinutes) || 2)),
    confidence: Math.max(0, Math.min(1, Number(v.confidence) || 0.7)),
    source: parsed.source || "heuristic",
  });
  } catch (err) {
    logger.error({ err }, "[dashboard] campaign-automation/parse error");
    if (!res.headersSent) res.status(500).json({ error: "Erreur lors de l'analyse IA." });
  }
});

// ——— Games ———
router.get("/games", (req, res) => {
  const games = getBusinessGames(req.business.id);
  const programType = resolveBusinessProgramType(req.business);
  const roulette_segments = getRoulettePublicSegments(req.business.id, programType);
  return res.json({ games, roulette_segments });
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
  if (req.params.gameCode === "roulette") {
    for (const r of rewardsInput) {
      const k = String(r?.kind || "none").trim();
      if (k !== "none" && k !== "points") {
        return res.status(400).json({
          error:
            "La roulette ne gère que des lots en points (kind: \"points\" avec value.points) ou sans gain (kind: \"none\"). Pas de réduction ni cadeau en magasin sur la roue.",
        });
      }
      if (k === "points") {
        const pts = Math.floor(Number(r?.value?.points));
        if (!Number.isFinite(pts) || pts < 0) {
          return res.status(400).json({ error: "Chaque lot « points » doit avoir value.points (entier ≥ 0)." });
        }
      }
    }
  }
  const rewards = replaceGameRewardsForBusiness(req.business.id, req.params.gameCode, rewardsInput);
  return res.json({ ok: true, rewards });
});

// ——— Stats ———
const PERIOD_OR_MONTH_RE = /^(7d|30d|this_month|6m|12m|1y|\d{4}-\d{2})$/;

router.get("/stats", (req, res) => {
  const business = req.business;
  const q = String(req.query.period || "").trim();
  const period = PERIOD_OR_MONTH_RE.test(q) ? q : "this_month";
  const stats = getDashboardStats(business.id, period);
  res.json({
    period: stats.period,
    period_key: stats.periodKey,
    members_count: stats.membersCount ?? 0,
    points_this_month: stats.pointsThisMonth ?? 0,
    transactions_this_month: stats.transactionsThisMonth ?? 0,
    new_members_last_7_days: stats.newMembersLast7Days ?? 0,
    new_members_last_30_days: stats.newMembersLast30Days ?? 0,
    new_members_in_period: stats.newMembersInPeriod ?? 0,
    inactive_members_30_days: stats.inactiveMembers30Days ?? 0,
    inactive_members_90_days: stats.inactiveMembers90Days ?? 0,
    members_with_points50: stats.membersWithPoints50 ?? 0,
    points_average_per_member: stats.pointsAveragePerMember ?? 0,
    active_members_in_period: stats.activeMembersInPeriod ?? 0,
    retention_pct: stats.retentionPct ?? 0,
    recurrent_members_in_period: stats.recurrentMembersInPeriod ?? 0,
    visits_in_period: stats.visitsInPeriod ?? 0,
    avg_visits_per_active_member: stats.avgVisitsPerActiveMember ?? undefined,
    avg_basket_eur: stats.avgBasketEur ?? undefined,
    rewards_redeemed_count: stats.rewardsRedeemedCount ?? 0,
    points_redeemed_in_period: stats.pointsRedeemedInPeriod ?? 0,
    google_reviews_new_in_period: stats.googleReviewsNewInPeriod ?? 0,
    notification_campaigns: stats.notificationCampaigns ?? [],
    business_name: business.organization_name ?? undefined,
  });
});

router.get("/stats/traffic", (req, res) => {
  const business = req.business;
  const q = String(req.query.period || "").trim();
  const period = PERIOD_OR_MONTH_RE.test(q) ? q : "this_month";
  const t = getDashboardTrafficPatterns(business.id, period);
  res.json({
    period: t.period,
    period_key: t.periodKey,
    timezone_note: t.timezoneNote,
    basis: t.basis,
    total_events: t.totalEvents,
    by_hour: t.byHour,
    by_weekday: t.byWeekday,
    peak_hour: t.peakHour,
    peak_weekday: t.peakWeekday,
  });
});

// ——— Members (liste + export) ———
router.get("/members/export", (req, res) => {
  const business = req.business;
  if (!ensureOperationalSubscription(req, res, business)) return;
  const search = req.query.search ?? "";
  const filter = ["inactive30", "inactive90", "points50"].includes(req.query.filter) ? req.query.filter : null;
  const sort = ["last_visit", "points", "name", "created"].includes(req.query.sort) ? req.query.sort : "last_visit";
  const { members } = getMembersForBusiness(business.id, { search, limit: 2000, offset: 0, filter, sort });
  const header = "Nom;Email;Téléphone;Ville;Naissance;Points;Dernière visite;Inscrit le\n";
  const csv = header + members.map((m) => {
    const name = (m.name || "").replace(/;/g, ",").replace(/\n/g, " ");
    const email = (m.email || "").replace(/;/g, ",");
    const phone = (m.phone || "").replace(/;/g, ",").replace(/\n/g, " ");
    const city = (m.city || "").replace(/;/g, ",").replace(/\n/g, " ");
    const birth = (m.birth_date || "").replace(/;/g, ",");
    const lastVisit = m.last_visit_at ? new Date(m.last_visit_at).toLocaleString("fr-FR") : "";
    const created = m.created_at ? new Date(m.created_at).toLocaleString("fr-FR") : "";
    return `${name};${email};${phone};${city};${birth};${m.points};${lastVisit};${created}`;
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

/** Supprime tous les membres du commerce (cartes Wallet / Web Push, historiques). Body : { confirm: "SUPPRIMER tous les membres" } */
router.post("/members/delete-all", async (req, res) => {
  try {
  const business = req.business;
  if (!ensureOperationalSubscription(req, res, business)) return;
  const confirm = (req.body?.confirm ?? req.body?.confirmText ?? "").toString().trim();
  if (confirm !== "SUPPRIMER tous les membres") {
    return res.status(400).json({
      error: 'Confirmation requise : envoyez { "confirm": "SUPPRIMER tous les membres" }.',
      code: "CONFIRM_REQUIRED",
    });
  }
  const { deleted } = await deleteAllMembersForBusiness(business.id);
  res.json({ ok: true, deleted });
  } catch (err) {
    logger.error({ err }, "[dashboard] members/delete-all error");
    if (!res.headersSent) res.status(500).json({ error: "Erreur lors de la suppression." });
  }
});

/** Supprime un membre et sa carte (pass, transactions, abonnements push du client). */
router.delete("/members/:memberId", async (req, res) => {
  try {
  const business = req.business;
  if (!ensureOperationalSubscription(req, res, business)) return;
  const memberId = req.params.memberId;
  if (memberId === "delete-all") {
    return res.status(400).json({ error: "Utilisez POST /dashboard/members/delete-all pour tout supprimer.", code: "USE_DELETE_ALL" });
  }
  const r = await deleteMemberForBusiness(business.id, memberId);
  if (!r.ok) return res.status(404).json({ error: "Membre introuvable" });
  res.status(204).end();
  } catch (err) {
    logger.error({ err }, "[dashboard] DELETE member error");
    if (!res.headersSent) res.status(500).json({ error: "Erreur lors de la suppression du membre." });
  }
});

/** Même logique que POST /members/:id/points/remove — chemin dashboard pour éviter 404 si le sous-routeur members n’est pas à jour en prod. */
router.post("/members/:memberId/points/remove", postMemberPointsRemove);

/** Même logique que PATCH /members/:id — mise à jour profil depuis le panneau Membres. */
router.patch("/members/:memberId", patchMemberProfile);

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
  if (!ensureOperationalSubscription(req, res, business)) return;
  const format = String(req.query.format || "csv").toLowerCase();
  if (format !== "csv" && format !== "json") {
    return res.status(400).json({ error: "Indiquez format=csv ou format=json.", code: "INVALID_EXPORT_FORMAT" });
  }
  const exportLimit = Math.min(Math.max(Number(req.query.limit) || 25000, 1), 25000);
  const days = [7, 30, 90, 365].includes(Number(req.query.days)) ? Number(req.query.days) : null;
  const fromDate = String(req.query.from || req.query.date_from || "").trim() || null;
  const toDate = String(req.query.to || req.query.date_to || "").trim() || null;
  const typesCsv = String(req.query.types || "").trim() || null;
  const legacyType = [
    "visit",
    "points_add",
    "reward_redeem",
    "points_correction",
    "points_redeem_game_tickets",
  ].includes(req.query.type)
    ? req.query.type
    : null;
  const memberId = req.query.memberId || req.query.member_id || null;

  const { transactions, total } = getTransactionsForBusiness(business.id, {
    limit: exportLimit,
    offset: 0,
    memberId,
    days,
    fromDate,
    toDate,
    type: typesCsv ? null : legacyType,
    typesCsv,
  });
  const rows = buildExportRows(transactions);

  if (format === "json") {
    let periodLabel = "Toutes les opérations (dans la limite d’export)";
    if (fromDate || toDate) {
      periodLabel = `Du ${fromDate || "…"} au ${toDate || "…"}`;
    } else if (days) {
      periodLabel = `Roulant : ${days} derniers jours (réf. serveur UTC)`;
    }
    return res.json({
      business_name: business.organization_name || business.slug,
      slug: business.slug,
      generated_at: new Date().toISOString(),
      period_label: periodLabel,
      total_matching: total,
      returned_count: rows.length,
      truncated: total > rows.length,
      filters: {
        days,
        from: fromDate,
        to: toDate,
        types: typesCsv,
        type_legacy: legacyType,
        member_id: memberId,
      },
      summary: summarizeExportRows(rows),
      transactions: rows,
    });
  }

  const csv = buildCsvFromRows(rows);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="transactions-${business.slug}.csv"`);
  res.send("\uFEFF" + csv);
});

/** Pack multi-fichiers (CSV + lisezmoi) pour bilan / expert-comptable — JSON UTF-8. */
router.get("/accounting-pack", (req, res) => {
  const business = req.business;
  if (!ensureOperationalSubscription(req, res, business)) return;
  const exportLimit = Math.min(Math.max(Number(req.query.limit) || 25000, 1), 25000);
  const days = [7, 30, 90, 365].includes(Number(req.query.days)) ? Number(req.query.days) : null;
  const fromDate = String(req.query.from || req.query.date_from || "").trim() || null;
  const toDate = String(req.query.to || req.query.date_to || "").trim() || null;
  try {
    const pack = buildMerchantAccountingPack({
      business,
      days,
      fromDate,
      toDate,
      limit: exportLimit,
    });
    res.json(pack);
  } catch (err) {
    logger.error({ err, businessId: business?.id }, "[dashboard] GET /accounting-pack");
    res.status(500).json({ error: "Export comptable impossible.", code: "ACCOUNTING_PACK_FAILED" });
  }
});

router.get("/transactions", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 200);
  const offset = Number(req.query.offset) || 0;
  const memberId = req.query.memberId || null;
  const days = [7, 30, 90, 365].includes(Number(req.query.days)) ? Number(req.query.days) : null;
  const fromDate = String(req.query.from || "").trim() || null;
  const toDate = String(req.query.to || "").trim() || null;
  const typesCsv = String(req.query.types || "").trim() || null;
  const legacyType = [
    "visit",
    "points_add",
    "reward_redeem",
    "points_correction",
    "points_redeem_game_tickets",
  ].includes(req.query.type)
    ? req.query.type
    : null;
  const result = getTransactionsForBusiness(req.business.id, {
    limit,
    offset,
    memberId,
    days,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    type: typesCsv ? null : legacyType,
    typesCsv: typesCsv || undefined,
  });
  res.json(result);
});

// ——— Evolution ———
router.get("/evolution", (req, res) => {
  const p = String(req.query.period || "").trim();
  if (/^\d{4}-\d{2}$/.test(p)) {
    const evolution = getDashboardEvolutionForMonth(req.business.id, p);
    return res.json({ evolution });
  }
  let weeks = Number(req.query.weeks);
  if (!Number.isFinite(weeks) && req.query.period) {
    const pr = req.query.period;
    if (pr === "7d") weeks = 1;
    else if (pr === "30d") weeks = 4;
    else if (pr === "this_month") weeks = 4;
    else if (pr === "6m") weeks = 26;
    else if (pr === "12m" || pr === "1y") weeks = 26;
    else weeks = 6;
  }
  if (!Number.isFinite(weeks)) weeks = 6;
  weeks = Math.min(Math.max(weeks, 1), 26);
  const evolution = getDashboardEvolution(req.business.id, weeks);
  res.json({ evolution });
});

export default router;
