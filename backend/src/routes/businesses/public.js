/**
 * Routes publiques (sans auth) : infos entreprise, config jeux, spins.
 * Référence : REFONTE-REGLES.md — max 15 routes par fichier.
 */
import { Router } from "express";
import { getBusinessGames, getMemberForBusiness, getRoulettePublicSegments, spinGameForMember } from "../../db.js";
import { buildIpHash, buildDeviceHash } from "../../services/engagement-proof.js";
import { getApiBase, getIdempotencyKey } from "./shared.js";

export function publicInfo(req, res) {
  const business = req.business;
  const apiBase = getApiBase(req);
  const slug = req.params.slug;
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
    logoUrl: business.logo_base64 ? `${apiBase}/api/businesses/${encodeURIComponent(slug)}/public/logo` : undefined,
    backgroundColor: business.background_color ?? undefined,
    foregroundColor: business.foreground_color ?? undefined,
    labelColor: business.label_color ?? undefined,
    program_type: business.program_type ?? undefined,
    loyalty_mode: business.loyalty_mode ?? "points_cash",
    points_per_ticket: business.points_per_ticket != null ? Number(business.points_per_ticket) : 10,
    required_stamps: business.required_stamps != null ? Number(business.required_stamps) : undefined,
    stamp_reward_label: business.stamp_reward_label ?? undefined,
    stamp_mid_reward_label: business.stamp_mid_reward_label ?? undefined,
    points_reward_tiers: points_reward_tiers ?? undefined,
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
  const roulette_segments =
    (business.loyalty_mode || "points_cash") === "points_game_tickets" ? getRoulettePublicSegments(business.id) : [];
  return res.json({
    loyalty_mode: business.loyalty_mode ?? "points_cash",
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
}

const gamesRouter = new Router();
gamesRouter.get("/", publicGames);
gamesRouter.post("/:gameCode/spins", spinsHandler);

export { gamesRouter };
