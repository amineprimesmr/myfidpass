/**
 * Routes membres (/:slug/members/*). Utilise req.business. Auth dashboard pour certaines routes.
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { randomUUID } from "crypto";
import {
  createMember,
  getMemberForBusiness,
  getMemberByEmailForBusiness,
  updateMember,
  addPoints,
  deductPoints,
  resetMemberPoints,
  createTransaction,
  getMemberTicketWallet,
  getMemberTicketHistory,
  convertPointsToTickets,
  getMemberRewards,
  markRewardGrantClaimed,
  getPushTokensForMember,
} from "../../db.js";
import { sendPassKitUpdate } from "../../apns.js";
import { generatePass } from "../../pass.js";
import { getGoogleWalletSaveUrl } from "../../google-wallet.js";
import { getIdempotencyKey, canAccessDashboard } from "./shared.js";

const router = Router();

const membersCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Trop de créations. Réessayez dans 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ——— POST / (création membre) ———
router.post("/", membersCreateLimiter, (req, res) => {
  const business = req.business;
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

// ——— POST /import ———
router.post("/import", (req, res) => {
  const business = req.business;
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

// ——— GET /:memberId/tickets ———
router.get("/:memberId/tickets", (req, res) => {
  const business = req.business;
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

// ——— POST /:memberId/tickets/convert ———
router.post("/:memberId/tickets/convert", (req, res) => {
  const business = req.business;
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

// ——— GET /:memberId/rewards ———
router.get("/:memberId/rewards", (req, res) => {
  const business = req.business;
  const member = getMemberForBusiness(req.params.memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });
  const rewards = getMemberRewards(business.id, member.id, 30);
  return res.json({ rewards });
});

// ——— POST /:memberId/rewards/:grantId/claim ———
router.post("/:memberId/rewards/:grantId/claim", (req, res) => {
  const business = req.business;
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Accès non autorisé" });
  }
  const member = getMemberForBusiness(req.params.memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });
  const claimed = markRewardGrantClaimed(business.id, member.id, req.params.grantId);
  if (!claimed) return res.status(404).json({ error: "Récompense introuvable ou déjà utilisée" });
  return res.json({ ok: true, reward_grant: claimed });
});

// ——— GET /:memberId ———
router.get("/:memberId", (req, res) => {
  const business = req.business;
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

// ——— POST /:memberId/points ———
router.post("/:memberId/points", async (req, res) => {
  const business = req.business;
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
    for (const token of tokens) {
      await sendPassKitUpdate(token);
    }
  }
  res.json({
    id: updated.id,
    points: updated.points,
    points_added: points,
  });
});

// ——— POST /:memberId/redeem ———
router.post("/:memberId/redeem", async (req, res) => {
  const business = req.business;
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
      try { await sendPassKitUpdate(token); } catch (_) { /* ignore */ }
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
      try { await sendPassKitUpdate(token); } catch (_) { /* ignore */ }
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

// ——— GET /:memberId/pass ———
router.get("/:memberId/pass", async (req, res) => {
  const business = req.business;
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

// ——— GET /:memberId/google-wallet-url ———
router.get("/:memberId/google-wallet-url", (req, res) => {
  const business = req.business;
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

export default router;
