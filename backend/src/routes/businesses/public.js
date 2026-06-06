/**
 * Routes publiques (sans auth) : infos entreprise, config jeux, spins.
 * Référence : REFONTE-REGLES.md — max 15 routes par fichier.
 */
import { Router } from "express";
import {
  getBusinessGames,
  getEngagementRewards,
  getMemberForBusiness,
  getRoulettePublicSegments,
  resolveBusinessProgramType,
  shouldSkipTicketConsumptionForLocalBrowser,
  shouldSkipTicketConsumptionForLocalDev,
  spinGameForMember,
} from "../../db.js";
import { buildIpHash, buildDeviceHash } from "../../services/engagement-proof.js";
import { parseFlyerPrefsCustomLogoDataUrl } from "../../lib/resolve-flyer-prefs-custom-logo.js";
import { getApiBase, getIdempotencyKey } from "./shared.js";
import { buildPublicFidelityClientUrl } from "../../lib/public-client-url.js";
import { normalizePointsRewardTiersForClient } from "../../lib/points-reward-tiers.js";
import { resolveSignupRewardLabelForBusiness } from "../../lib/signup-reward-label.js";

/** @param {string} v */
function isHex6(v) {
  return typeof v === "string" && /^#[0-9A-Fa-f]{6}$/.test(v.trim());
}

export function publicInfo(req, res) {
  const business = req.business;
  const apiBase = getApiBase(req);
  const slug = req.params.slug;
  const signup_reward_label = resolveSignupRewardLabelForBusiness(business.id);

  const points_reward_tiers = normalizePointsRewardTiersForClient(
    business.points_reward_tiers,
    signup_reward_label,
  );
  /** Logo parcours client : flyer IA si importé, sinon logo carte fidélité (`/public/logo`). */
  const hasFlyerCustomLogo = !!parseFlyerPrefsCustomLogoDataUrl(business.flyer_prefs_json);
  const logoAssetPath = hasFlyerCustomLogo ? "flyer-qr-logo" : "logo";
  const logoUrl = `${apiBase}/api/businesses/${encodeURIComponent(slug)}/public/${logoAssetPath}`;
  /** Icône push / aperçu campagne — uniquement si import dédié (sinon le client utilise son placeholder). */
  const notificationIconUrl =
    Number(business.asset_notification_icon_present) === 1
      ? `${apiBase}/api/businesses/${encodeURIComponent(slug)}/notification-icon`
      : undefined;

  /**
   * Couleurs flyer extraites de flyer_prefs_json.state — servent à teinter la roue et les boutons
   * sur la page publique fidélité (fond toujours blanc, on colore uniquement les éléments UI).
   * wheelOdd = segments cadeau (pairs), wheelEven = segments PERDU (impairs).
   */
  let flyerColors = null;
  if (business.flyer_prefs_json) {
    try {
      const fp = JSON.parse(business.flyer_prefs_json);
      const s = fp?.state;
      if (s && typeof s === "object" && !Array.isArray(s)) {
        const wheelOdd = isHex6(s.wheelColorOdd) ? s.wheelColorOdd.trim() : null;
        const wheelEven = isHex6(s.wheelColorEven) ? s.wheelColorEven.trim() : null;
        const ctaBg = isHex6(s.ctaBannerBgColor) ? s.ctaBannerBgColor.trim() : null;
        const ctaText = isHex6(s.ctaTextColor) ? s.ctaTextColor.trim() : null;
        if (wheelOdd || wheelEven || ctaBg) {
          flyerColors = { wheelOdd, wheelEven, ctaBg, ctaText };
        }
      }
    } catch (_) {}
  }

  const engagementRewards = getEngagementRewards(business.id);
  const gr = engagementRewards?.google_review;
  const placeId = gr?.enabled && gr?.place_id ? String(gr.place_id).trim() : "";
  const google_review_write_url = placeId
    ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`
    : undefined;

  const frontendBase = (process.env.FRONTEND_URL || "https://www.myfidpass.fr").replace(/\/$/, "");
  const clientProgramUrl = buildPublicFidelityClientUrl(frontendBase, slug, business.id);

  res.json({
    id: business.id,
    name: business.name,
    slug: business.slug,
    /** Lien client à partager (roue + missions si jeu activé → ?qr=1). */
    client_program_url: clientProgramUrl,
    clientProgramUrl,
    organizationName: business.organization_name,
    /** Secteur d’activité (ex. fastfood, boulangerie) — pour préremplissage SaaS / flyer IA. */
    sector: business.sector?.trim() || undefined,
    logoUrl,
    has_flyer_custom_logo: hasFlyerCustomLogo,
    notificationIconUrl,
    logo_updated_at: business.logo_updated_at ?? undefined,
    logo_icon_updated_at: business.logo_icon_updated_at ?? undefined,
    notification_icon_updated_at: business.notification_icon_updated_at ?? undefined,
    /** Invalider le cache navigateur du logo page QR quand les prefs flyer (dont logo custom) changent. */
    flyer_prefs_updated_at: business.flyer_prefs_updated_at ?? undefined,
    backgroundColor: business.background_color ?? undefined,
    foregroundColor: business.foreground_color ?? undefined,
    labelColor: business.label_color ?? undefined,
    program_type: resolveBusinessProgramType(business),
    loyalty_mode: business.loyalty_mode ?? "points_cash",
    points_per_ticket: business.points_per_ticket != null ? Number(business.points_per_ticket) : 10,
    required_stamps: business.required_stamps != null ? Number(business.required_stamps) : undefined,
    stamp_reward_label: business.stamp_reward_label ?? undefined,
    stamp_mid_reward_label: business.stamp_mid_reward_label ?? undefined,
    start_game_reward_label: business.start_game_reward_label ?? undefined,
    label_restants: business.label_restants?.trim() || undefined,
    stamp_emoji: business.stamp_emoji?.trim() || undefined,
    points_reward_tiers: points_reward_tiers.length ? points_reward_tiers : undefined,
    signup_reward_label: signup_reward_label || undefined,
    /** Couleurs flyer pour theming page publique fidélité (roue + boutons). Fond toujours blanc. */
    flyerColors: flyerColors ?? undefined,
    /** Texte du titre principal sur la page jeu QR ; absent ou vide = défaut applicatif. */
    fidelityQrHeroTitle: business.fidelity_qr_hero_title?.trim() || undefined,
    /** Réclamations points livraison (Uber Eats, Deliveroo, etc.) — espace client web. */
    delivery_receipt_claims_enabled:
      business.delivery_receipt_claims_enabled != null ? Number(business.delivery_receipt_claims_enabled) : 1,
    delivery_receipt_max_age_days:
      business.delivery_receipt_max_age_days != null ? Number(business.delivery_receipt_max_age_days) : 14,
    /** Lien avis Google (page jeu QR / 1er spin) — absent si non configuré côté commerce. */
    google_review_write_url: google_review_write_url ?? undefined,
    welcome_bonus_enabled: Number(business.welcome_bonus_enabled) === 1 ? 1 : 0,
    welcome_bonus_amount:
      business.welcome_bonus_amount != null ? Number(business.welcome_bonus_amount) : 10,
  });
}

export function publicGames(req, res) {
  const business = req.business;
  const games = getBusinessGames(business.id).map((g) => ({
    game_code: g.game_code,
    game_name: g.game_name,
    game_type: g.game_type,
    enabled: g.enabled,
    ticket_cost: g.ticket_cost,
    daily_spin_limit: g.daily_spin_limit,
    cooldown_seconds: g.cooldown_seconds,
  }));
  const programType = resolveBusinessProgramType(business);
  const roulette_segments = getRoulettePublicSegments(business.id, programType);
  return res.json({
    loyalty_mode: business.loyalty_mode ?? "points_cash",
    program_type: programType,
    points_per_ticket: business.points_per_ticket != null ? Number(business.points_per_ticket) : 10,
    games,
    roulette_segments,
  });
}

function spinsHandler(req, res) {
  try {
    const business = req.business;
    const memberId = String(req.body?.memberId || "").trim();
    if (!memberId) return res.status(400).json({ error: "memberId requis" });
    const member = getMemberForBusiness(memberId, business.id);
    if (!member) return res.status(404).json({ error: "Membre introuvable" });
    const idempotencyKey = getIdempotencyKey(req);
    const clientIpHash = buildIpHash(req);
    const deviceHash = buildDeviceHash(req.body?.client_fingerprint ?? req.body?.clientFingerprint ?? "");
    const host = String(req.get("x-forwarded-host") || req.get("host") || "");
    const skipTicketConsumption =
      shouldSkipTicketConsumptionForLocalDev(host) || shouldSkipTicketConsumptionForLocalBrowser(req);
    /* Invités QR (email @guest.invalid) : pas de cooldown — le solde de tickets est le seul garde-fou.
     * Sans ça, un bug ou un refresh peut bloquer l'utilisateur même si il lui reste des tickets. */
    const isQrGuest = typeof member.email === "string" && member.email.toLowerCase().endsWith("@guest.invalid");
    const result = spinGameForMember({
      businessId: business.id,
      memberId: member.id,
      gameCode: req.params.gameCode,
      idempotencyKey,
      clientIpHash,
      deviceHash,
      riskScore: deviceHash ? 0.15 : 0.35,
      skipTicketConsumption,
      skipCooldown: isQrGuest,
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
}

const gamesRouter = new Router();
gamesRouter.get("/", publicGames);
gamesRouter.post("/:gameCode/spins", spinsHandler);

export { gamesRouter };
