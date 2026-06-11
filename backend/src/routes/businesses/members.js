/**
 * Routes membres (/:slug/members/*). Utilise req.business. Auth dashboard pour certaines routes.
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { randomUUID } from "crypto";
import { executeMemberRewardRedeem, getMemberProgramRewardsUsage } from "../../lib/member-reward-redeem.js";
import { getMemberForBusinessOrGroup } from "../../lib/loyalty-group-resolve.js";
import {
  createMember,
  createMemberForBusiness,
  getMemberForBusiness,
  getMemberByEmailForBusiness,
  updateMember,
  addPoints,
  addStampsWithCycleRollover,
  deductPoints,
  resetMemberPoints,
  createTransaction,
  getTransactionByIdempotencyKey,
  countMemberPointsAddsTodayUtc,
  getMemberTicketWallet,
  getMemberTicketHistory,
  convertPointsToTickets,
  getMemberRewards,
  markRewardGrantClaimed,
  memberHasAppleWalletRegistration,
  businessUsesTicketBonuses,
  mergeBusinessAssetsForPass,
  hasMemberCompletedEngagementAction,
  isGuestPlaceholderEmail,
} from "../../db.js";
import { grantWelcomeBonusIfEligible } from "../../db/welcome-bonus.js";
import { devPaymentBypass } from "../../lib/dev-payment-bypass.js";
import { pushPassKitUpdateForMember } from "../../lib/passkit-member-push.js";
import { pushPassKitAfterMemberBalanceChange } from "../../lib/wallet-reward-tier-notify.js";
import { scheduleMemberCampaignEvents } from "../../lib/campaign-event-jobs.js";
import { generatePass } from "../../pass.js";
import {
  ensureGoogleWalletClassForBusiness,
  ensureGoogleWalletObjectForMember,
  getGoogleWalletDefaultClassId,
  getGoogleWalletSaveUrl,
  syncGoogleWalletObjectForMember,
} from "../../google-wallet.js";
import { getApiBase, getIdempotencyKey, canAccessDashboard, ensureOperationalSubscription } from "./shared.js";
import { validate, schemas } from "../../lib/validate.js";
import { scheduleMerchantDashboardSyncForBusiness } from "../../lib/merchant-dashboard-sync-push.js";
import { scheduleCampaignEventJobsForMember } from "../../lib/campaign-event-jobs.js";
import {
  computeRawPointsForCredit,
  enforceScanSecurityLimits,
} from "../../lib/scan-credit-helpers.js";
import {
  isReceiptValidationRequiredForRequest,
  verifyReceiptTokenForScan,
} from "../../lib/receipt-validation-jwt.js";

const router = Router();

async function syncGoogleWalletAfterMemberMutation(member, business, req, context) {
  const walletBusiness = mergeBusinessAssetsForPass(business);
  try {
    const result = await syncGoogleWalletObjectForMember(member, walletBusiness, getApiBase(req));
    if (!result.ok) {
      console.warn("[Google Wallet] sync membre échouée:", {
        context,
        slug: walletBusiness?.slug,
        memberId: member?.id,
        googleStatus: result.googleStatus,
        googleError: result.googleError?.message || result.error,
      });
    }
  } catch (e) {
    console.warn("[Google Wallet] sync membre exception:", {
      context,
      slug: walletBusiness?.slug,
      memberId: member?.id,
      error: e?.message || String(e),
    });
  }
}

const membersCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Trop de créations. Réessayez dans 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { forwardedHeader: false },
});

// ——— POST / (création membre) ———
router.post("/", membersCreateLimiter, validate(schemas.createMember), (req, res) => {
  const business = req.business;
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });

  const { email, name } = req.body || {};
  if (!email || !name) {
    return res.status(400).json({ error: "email et name requis" });
  }

  const normEmail = String(email).trim().toLowerCase();
  const normName = String(name).trim();
  if (req.user) {
    const previewWalletEmail = normEmail.startsWith("wallet-apercu.") && normEmail.endsWith("@example.com");
    if (!previewWalletEmail && !devPaymentBypass(req)) {
      if (!ensureOperationalSubscription(req, res, business)) return;
    }
  }
  const existing = getMemberByEmailForBusiness(business.id, normEmail);
  if (existing) {
    let welcome_bonus_granted = null;
    if (!isGuestPlaceholderEmail(existing.email)) {
      welcome_bonus_granted = grantWelcomeBonusIfEligible(business, existing.id, { source: "web_signup" });
    }
    const fresh = getMemberForBusinessOrGroup(existing.id, business) || existing;
    return res.status(200).json({
      memberId: fresh.id,
      member: {
        id: fresh.id,
        email: fresh.email,
        name: fresh.name,
        points: fresh.points,
      },
      reused: true,
      welcome_bonus_granted: welcome_bonus_granted ?? undefined,
    });
  }

  try {
    const member = createMemberForBusiness({
      id: randomUUID(),
      businessId: business.id,
      email: normEmail,
      name: normName,
    });

    let welcome_bonus_granted = null;
    if (!isGuestPlaceholderEmail(normEmail)) {
      welcome_bonus_granted = grantWelcomeBonusIfEligible(business, member.id, { source: "web_signup" });
    }
    const fresh = getMemberForBusinessOrGroup(member.id, business) || member;

    try {
      scheduleCampaignEventJobsForMember({ business, memberId: member.id });
    } catch (e) {
      console.error("[campaign-event-jobs] schedule member_created failed:", e?.message || String(e));
    }
    scheduleMerchantDashboardSyncForBusiness(business.id, "member_created");

    res.status(201).json({
      memberId: fresh.id,
      member: {
        id: fresh.id,
        email: fresh.email,
        name: fresh.name,
        points: fresh.points,
      },
      welcome_bonus_granted: welcome_bonus_granted ?? undefined,
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
  if (!ensureOperationalSubscription(req, res, business)) return;
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
      try {
        scheduleCampaignEventJobsForMember({ business, memberId: member.id });
      } catch (e) {
        console.error("[campaign-event-jobs] schedule import member_created failed:", e?.message || String(e));
      }
      created.push({ email, name, id: member.id });
    } catch (e) {
      errors.push({ row: i + 1, email, reason: e.message || "Erreur création" });
    }
  }
  if (created.length > 0) {
    scheduleMerchantDashboardSyncForBusiness(business.id, "import");
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
  const member = getMemberForBusinessOrGroup(req.params.memberId, business);
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
  const member = getMemberForBusinessOrGroup(req.params.memberId, business);
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
  const member = getMemberForBusinessOrGroup(req.params.memberId, business);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });
  const rewards = getMemberRewards(business.id, member.id, 30);
  return res.json({ rewards });
});

// ——— POST /:memberId/rewards/:grantId/claim ———
router.post("/:memberId/rewards/:grantId/claim", (req, res) => {
  const business = req.business;
  if (!ensureOperationalSubscription(req, res, business)) return;
  const member = getMemberForBusinessOrGroup(req.params.memberId, business);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });
  const claimed = markRewardGrantClaimed(business.id, member.id, req.params.grantId);
  if (!claimed) return res.status(404).json({ error: "Récompense introuvable ou déjà utilisée" });
  return res.json({ ok: true, reward_grant: claimed });
});

// ——— GET /:memberId ———
router.get("/:memberId", (req, res) => {
  const business = req.business;
  const member = getMemberForBusinessOrGroup(req.params.memberId, business);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });

  res.json({
    id: member.id,
    email: member.email,
    name: member.name,
    points: member.points,
    last_visit_at: member.last_visit_at || null,
    phone: member.phone || null,
    city: member.city || null,
    birth_date: member.birth_date || null,
    profile_ticket_eligible: businessUsesTicketBonuses(business.id),
    profile_bonus_claimed: Number(member.profile_ticket_bonus_granted) === 1,
    rewards_usage: getMemberProgramRewardsUsage(business, member),
    /** PassKit : au moins un appareil enregistré (ajout Apple Wallet effectif côté iOS). */
    apple_wallet_registered: memberHasAppleWalletRegistration(member.id),
    /**
     * Page jeu QR invité : l’avis Google a déjà été enregistré côté serveur (engagement_completions).
     * Le client ne doit pas se fier seul à sessionStorage (`fid_qr_spin_gate`), perdu ou désynchronisé après Safari / WKWebView.
     */
    google_review_engagement_done: hasMemberCompletedEngagementAction(
      business.id,
      member.id,
      "google_review",
      12,
    ),
  });
});

// ——— POST /:memberId/points/remove ——— (correction caisse : retire des points sans passer par une récompense)
router.post("/:memberId/points/remove", async (req, res) => {
  const business = req.business;
  if (!ensureOperationalSubscription(req, res, business)) return;

  const member = getMemberForBusinessOrGroup(req.params.memberId, business);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });

  const n = Math.floor(Number(req.body?.points));
  if (!Number.isInteger(n) || n <= 0) {
    return res.status(400).json({
      error: "Indiquez un nombre entier de points à retirer (supérieur à 0).",
      code: "INVALID_POINTS_REMOVE",
    });
  }

  const current = Number(member.points) || 0;
  if (current < n) {
    return res.status(400).json({
      error: `Solde insuffisant (${current} pts). Impossible de retirer ${n} pts.`,
      code: "NOT_ENOUGH_POINTS",
    });
  }

  const updated = deductPoints(member.id, n);
  createTransaction({
    businessId: business.id,
    memberId: member.id,
    type: "points_correction",
    points: -n,
    metadata: { reason: "cashier_correction" },
    actorUserId: req.user?.id,
  });
  await pushPassKitUpdateForMember(business.id, member.id, "points_remove");
  await syncGoogleWalletAfterMemberMutation(updated, business, req, "points_remove");
  res.json({
    id: updated.id,
    points: updated.points,
    points_removed: n,
  });
});

// ——— POST /:memberId/points ———
router.post("/:memberId/points", async (req, res) => {
  const business = req.business;
  if (!ensureOperationalSubscription(req, res, business)) return;

  const member = getMemberForBusinessOrGroup(req.params.memberId, business);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });

  // ── Idempotence : si la même Idempotency-Key a déjà été traitée, on retourne
  // le membre tel qu'il est sans ajouter de points une deuxième fois.
  const idempotencyKey = getIdempotencyKey(req);
  if (idempotencyKey) {
    const existing = getTransactionByIdempotencyKey(business.id, idempotencyKey);
    if (existing) {
      // Double envoi détecté : réponse 200 idempotente (pas de double crédit)
      const currentMember = getMemberForBusinessOrGroup(req.params.memberId, business);
      return res.json({
        id: currentMember.id,
        points: currentMember.points,
        points_added: existing.points,
        idempotent: true,
      });
    }
  }

  const pointsDirect = Number(req.body?.points);
  const amountEur = Number(req.body?.amount_eur);
  const visit = req.body?.visit === true;
  const receiptTok = String(req.body?.receipt_validation_token ?? req.body?.receiptValidationToken ?? "").trim();
  if (isReceiptValidationRequiredForRequest(business, amountEur)) {
    if (!receiptTok) {
      return res.status(400).json({
        error: "Scan du QR ticket de caisse requis (réglages sécurité).",
        code: "RECEIPT_VALIDATION_REQUIRED",
      });
    }
    const tol = business.receipt_qr_tolerance_cents != null ? Number(business.receipt_qr_tolerance_cents) : 5;
    const v = verifyReceiptTokenForScan({
      token: receiptTok,
      business,
      amountEur,
      toleranceCents: tol,
    });
    if (!v.ok) {
      return res.status(400).json({ error: v.error, code: v.code });
    }
  }
  const perEuro = Number(business.points_per_euro) || 1;
  const perVisit = Number(business.points_per_visit) || 0;
  const minAmount = business.points_min_amount_eur != null ? Number(business.points_min_amount_eur) : null;
  const programType = (business.program_type || "").toLowerCase();

  let points = computeRawPointsForCredit(business, { pointsDirect, amountEur, visit });

  if (points <= 0) {
    const minHint = minAmount != null ? ` Achat minimum ${minAmount} € pour gagner des points.` : "";
    const msg = perVisit === 0 && programType !== "stamps"
      ? `Vos règles : 0 point par passage. Saisissez un montant en € ou un nombre de points pour créditer.${minHint}`
      : `Saisissez le montant du panier en € ou cliquez sur « 1 passage ». Règles : ${perEuro} pt/€, ${perVisit} pt/passage.${minHint}`;
    return res.status(400).json({ error: msg });
  }

  const addsToday = countMemberPointsAddsTodayUtc(business.id, member.id);
  const secured = enforceScanSecurityLimits(business, points, addsToday);
  if (!secured.ok) {
    return res.status(secured.status).json({ error: secured.error, code: secured.code });
  }
  points = secured.points;
  const meta =
    amountEur > 0 || visit ? { amount_eur: amountEur || undefined, visit } : undefined;

  const stampCycleN =
    business.required_stamps != null && Number(business.required_stamps) > 0
      ? Math.floor(Number(business.required_stamps))
      : 10;
  let updated;
  /** Solde avant crédit (mode points) — détection palier Wallet. */
  let previousPoints = null;
  let metaMerged = secured.capped ? { ...(meta || {}), points_capped: true, requested_points: secured.originalPoints } : meta;
  if (programType === "stamps") {
    previousPoints = Math.max(0, Math.floor(Number(member.points) || 0));
    const r = addStampsWithCycleRollover(member.id, points, stampCycleN);
    if (!r.member) {
      return res.status(500).json({ error: "Mise à jour membre impossible." });
    }
    updated = r.member;
    if (r.cycleCompletions > 0) {
      metaMerged = {
        ...(metaMerged || {}),
        stamp_cycle_completed: true,
        stamp_cycles_completed: r.cycleCompletions,
        required_stamps: stampCycleN,
      };
    }
  } else {
    previousPoints = Math.max(0, Math.floor(Number(member.points) || 0));
    updated = addPoints(member.id, points);
  }
  createTransaction({
    businessId: business.id,
    memberId: member.id,
    type: "points_add",
    points,
    metadata: metaMerged,
    idempotencyKey: idempotencyKey || null,
    actorUserId: req.user?.id,
  });
  scheduleMemberCampaignEvents({
    business,
    memberId: member.id,
    triggers: ["first_scan", "reward_unlocked"],
    previousBalance: previousPoints,
    newBalance: updated.points,
  });
  if (programType === "stamps") {
    await pushPassKitAfterMemberBalanceChange({
      business,
      memberId: member.id,
      previousBalance: previousPoints,
      reason: "points_add",
    });
  } else {
    await pushPassKitAfterMemberBalanceChange({
      business,
      memberId: member.id,
      previousBalance: previousPoints,
      reason: "points_add",
    });
  }
  await syncGoogleWalletAfterMemberMutation(updated, business, req, "points_add");
  res.json({
    id: updated.id,
    points: updated.points,
    points_added: points,
    points_capped: secured.capped === true,
    points_requested: secured.capped ? secured.originalPoints : undefined,
  });
});

// ——— POST /:memberId/redeem ———
router.post("/:memberId/redeem", async (req, res) => {
  const business = req.business;
  if (!ensureOperationalSubscription(req, res, business)) return;
  const member = getMemberForBusinessOrGroup(req.params.memberId, business);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });

  const body = req.body || {};
  const type = (body.type || "").toLowerCase();
  if (type === "stamps") {
    const result = executeMemberRewardRedeem(business, member, {
      mode: "stamps",
      stampThreshold: body.stamp_threshold ?? body.stampThreshold ?? null,
      actorUserId: req.user?.id,
      source: "member_redeem_stamps",
    });
    if (!result.ok) {
      return res.status(result.status).json({
        error: result.error,
        code: result.code,
        points_required: result.points_required,
        points_balance: result.points_balance,
      });
    }
    await pushPassKitUpdateForMember(business.id, member.id, "redeem_stamps");
    await syncGoogleWalletAfterMemberMutation(
      { ...member, points: result.new_points },
      business,
      req,
      "redeem_stamps",
    );
    return res.json({
      ok: true,
      type: "stamps",
      previous_points: result.previous_points,
      new_points: result.new_points,
      message: result.message,
    });
  }

  if (type === "points") {
    const amountRaw = body.amount_eur ?? body.amountEur;
    const amountEur = amountRaw != null && amountRaw !== "" ? Number(amountRaw) : undefined;
    const result = executeMemberRewardRedeem(business, member, {
      mode: "points",
      tierIndex: body.tier_index != null ? Number(body.tier_index) : body.tierIndex,
      points: body.points != null ? Number(body.points) : undefined,
      amountEur: Number.isFinite(amountEur) ? amountEur : undefined,
      actorUserId: req.user?.id,
      source: "member_redeem_points",
    });
    if (!result.ok) {
      return res.status(result.status).json({
        error: result.error,
        code: result.code,
        points_required: result.points_required,
        points_balance: result.points_balance,
        min_purchase_eur: result.min_purchase_eur,
      });
    }
    await pushPassKitUpdateForMember(business.id, member.id, "redeem_points");
    await syncGoogleWalletAfterMemberMutation(
      { ...member, points: result.new_points },
      business,
      req,
      "redeem_points",
    );
    return res.json({
      ok: true,
      type: "points",
      points_deducted: result.points_deducted,
      previous_points: result.previous_points,
      new_points: result.new_points,
      reward_label: result.reward_label,
      signup_cycle: result.signup_cycle === true,
      message: result.message,
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
  const member = getMemberForBusinessOrGroup(req.params.memberId, business);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });

  const biz = mergeBusinessAssetsForPass(business);
  const template = req.query.template || "classic";
  const opts = { template };
  if (req.query.organization_name != null) opts.organizationName = req.query.organization_name;
  opts.background_color = req.query.background_color ?? biz?.background_color ?? undefined;
  opts.backgroundColor = opts.background_color;
  const stripFromQuery = (req.query.strip_color ?? "").toString().trim();
  opts.strip_color = stripFromQuery || opts.background_color || biz?.strip_color || undefined;
  opts.stripColor = opts.strip_color;
  opts.foreground_color = req.query.foreground_color ?? biz?.foreground_color ?? undefined;
  opts.foregroundColor = opts.foreground_color;
  const programTypeQuery = (req.query.program_type || "").toLowerCase();
  opts.program_type = programTypeQuery === "points" || programTypeQuery === "stamps" ? programTypeQuery : (biz?.program_type ?? undefined);
  opts.stamp_emoji = req.query.stamp_emoji ?? biz.stamp_emoji ?? undefined;
  /** App Ma carte : aperçu = catalogue `stamp_emoji` ; sans ce flag le strip réutilisait `stamp_icon` serveur (image perso) même après choix d’icône catalogue. */
  const catalogStampOnly = ["1", "true", "yes"].includes(String(req.query.catalog_stamp_only ?? "").trim().toLowerCase());
  if (catalogStampOnly) {
    opts.stamp_icon_base64 = "";
  }
  if (req.query.required_stamps != null) {
    const n = parseInt(req.query.required_stamps, 10);
    if (Number.isInteger(n) && n > 0) opts.required_stamps = n;
  }
  if (biz?.card_background_base64) opts.card_background_base64 = biz.card_background_base64;
  opts.strip_display_mode = "logo";
  opts.strip_text = undefined;
  const lc = (req.query.label_color ?? "").toString().trim();
  if (lc) opts.label_color = lc.startsWith("#") ? lc : `#${lc}`;

  /** Même solde que l’aperçu « Ma carte » (dashboard uniquement) — sinon le Wallet affiche 0 pts alors que l’app montre 50 fictifs. */
  let memberForPass = member;
  if (canAccessDashboard(business, req) && req.query.preview_points != null) {
    const n = parseInt(String(req.query.preview_points), 10);
    if (Number.isInteger(n) && n >= 0 && n <= 9999999) {
      memberForPass = { ...member, points: n };
    }
  }

  try {
    const buffer = await generatePass(memberForPass, biz, opts);
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
router.get("/:memberId/google-wallet-url", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    const business = mergeBusinessAssetsForPass(req.business);
    const member = getMemberForBusinessOrGroup(req.params.memberId, business);
    if (!member) return res.status(404).json({ error: "Membre introuvable" });

    const frontendOrigin = req.get("Origin") || req.get("Referer")?.replace(/\/[^/]*$/, "") || process.env.FRONTEND_URL;
    const apiBase = getApiBase(req);
    const ensured = await ensureGoogleWalletClassForBusiness(business, apiBase);
    const classId = ensured.ok ? ensured.classId : getGoogleWalletDefaultClassId();
    if (!ensured.ok) {
      console.warn("[Google Wallet] classe commerce indisponible, repli classe globale:", {
        slug: business.slug,
        classId: ensured.classId,
        googleStatus: ensured.googleStatus,
        googleError: ensured.googleError?.message || ensured.error,
      });
    }
    if (!classId) {
      return res.status(503).json({
        error: "Google Wallet non configuré",
        code: "google_wallet_unavailable",
      });
    }
    const objectReady = await ensureGoogleWalletObjectForMember(member, business, apiBase, classId);
    if (!objectReady.ok) {
      console.warn("[Google Wallet] objet indisponible:", {
        slug: business.slug,
        memberId: member.id,
        classId,
        googleStatus: objectReady.googleStatus,
        googleError: objectReady.googleError?.message || objectReady.error,
      });
      return res.status(503).json({
        error: "Google Wallet indisponible pour cette carte",
        code: "google_wallet_object_unavailable",
        detail: objectReady.googleError?.message || objectReady.error || undefined,
      });
    }
    const result = getGoogleWalletSaveUrl(member, business, frontendOrigin, {
      apiBase,
      classId,
      objectId: objectReady.objectId,
    });
    if (!result) {
      return res.status(503).json({
        error: "Google Wallet non configuré",
        code: "google_wallet_unavailable",
      });
    }
    res.json(result);
  } catch (e) {
    console.error("[Google Wallet] génération URL:", e);
    return res.status(503).json({
      error: "Google Wallet indisponible",
      code: "google_wallet_unavailable",
    });
  }
});

export default router;
