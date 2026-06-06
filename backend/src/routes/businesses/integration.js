/**
 * Intégration bornes / caisses : lookup et scan.
 * Référence : REFONTE-REGLES.md — max 15 routes par fichier.
 */
import { Router } from "express";
import {
  getMemberForBusiness,
  addPoints,
  addStampsWithCycleRollover,
  createTransaction,
  countMemberPointsAddsTodayUtc,
  normalizeStampBalance,
  mergeBusinessAssetsForPass,
} from "../../db.js";
import { pushPassKitUpdateForMember } from "../../lib/passkit-member-push.js";
import { pushPassKitAfterMemberBalanceChange } from "../../lib/wallet-reward-tier-notify.js";
import { scheduleMemberCampaignEvents } from "../../lib/campaign-event-jobs.js";
import { syncGoogleWalletObjectForMember } from "../../google-wallet.js";
import { ensureOperationalSubscription, getApiBase } from "./shared.js";
import {
  parseMerchantScanCode,
  resolvePointsRewardFromQr,
  resolveStampRewardFromQr,
  stampCycleSize,
} from "../../lib/reward-redeem-qr.js";
import { executeMemberRewardRedeem } from "../../lib/member-reward-redeem.js";
import {
  computeRawPointsForCredit,
  enforceScanSecurityLimits,
} from "../../lib/scan-credit-helpers.js";
import {
  isReceiptValidationRequiredForRequest,
  verifyReceiptTokenForScan,
} from "../../lib/receipt-validation-jwt.js";

const router = Router();

function resolveRewardRedeemPreview(business, member, rewardRedeem) {
  if (!rewardRedeem) return null;
  const programType = (business.program_type || "").toLowerCase();
  if (rewardRedeem.mode === "stamps" || programType === "stamps") {
    const cycleN = stampCycleSize(business);
    const balance = normalizeStampBalance(member.points, cycleN);
    const resolved = resolveStampRewardFromQr(business, rewardRedeem);
    return {
      mode: "stamps",
      label: resolved.label,
      tier_index: resolved.tierIndex ?? 0,
      points_required: resolved.pointsRequired,
      points_balance: balance,
      eligible: balance >= resolved.pointsRequired,
    };
  }
  const resolved = resolvePointsRewardFromQr(business, rewardRedeem);
  const balance = Number(member.points) || 0;
  const pointsRequired = resolved.pointsRequired;
  return {
    mode: "points",
    tier_index: resolved.tierIndex ?? rewardRedeem.tierIndex ?? 0,
    label: resolved.label,
    tier_image_url: resolved.imageUrl ?? null,
    points_required: pointsRequired,
    points_balance: balance,
    eligible: balance >= pointsRequired && pointsRequired > 0,
  };
}

async function syncGoogleWalletAfterMemberMutation(member, business, req, context) {
  const walletBusiness = mergeBusinessAssetsForPass(business);
  try {
    const result = await syncGoogleWalletObjectForMember(member, walletBusiness, getApiBase(req));
    if (!result.ok) {
      console.warn("[Google Wallet] sync intégration échouée:", {
        context,
        slug: walletBusiness?.slug,
        memberId: member?.id,
        googleStatus: result.googleStatus,
        googleError: result.googleError?.message || result.error,
      });
    }
  } catch (e) {
    console.warn("[Google Wallet] sync intégration exception:", {
      context,
      slug: walletBusiness?.slug,
      memberId: member?.id,
      error: e?.message || String(e),
    });
  }
}

/** PassKit / Google Wallet en arrière-plan : la réponse HTTP part tout de suite (évite timeout app commerçant). */
function scheduleWalletSyncAfterIntegrationScan({
  business,
  memberId,
  previousBalance,
  updated,
  req,
}) {
  void (async () => {
    try {
      scheduleMemberCampaignEvents({
        business,
        memberId,
        triggers: ["first_scan", "reward_unlocked"],
        previousBalance,
        newBalance: updated?.points,
      });
      await pushPassKitAfterMemberBalanceChange({
        business,
        memberId,
        previousBalance,
        reason: "integration_scan",
      });
      await syncGoogleWalletAfterMemberMutation(updated, business, req, "integration_scan");
    } catch (e) {
      console.warn("[integration/scan] sync Wallet arrière-plan:", e?.message || String(e));
    }
  })();
}

function buildIntegrationScanResponseBody({
  member,
  updated,
  points,
  secured,
  programType,
  stampCycleCompleted,
  stampCyclesCompleted,
}) {
  return {
    member: {
      id: updated.id,
      name: member.name,
      email: member.email,
      points: updated.points,
    },
    points_added: points,
    new_balance: updated.points,
    points_capped: secured.capped === true,
    points_requested: secured.capped ? secured.originalPoints : undefined,
    stamp_cycle_completed: programType === "stamps" ? stampCycleCompleted : undefined,
    stamp_cycles_completed:
      programType === "stamps" && stampCyclesCompleted > 0 ? stampCyclesCompleted : undefined,
  };
}

router.get("/lookup", (req, res) => {
  const business = req.business;
  if (!ensureOperationalSubscription(req, res, business)) return;
  const raw = (req.query.barcode || "").trim();
  if (!raw) return res.status(400).json({ error: "Paramètre barcode requis" });
  const parsed = parseMerchantScanCode(raw);
  const member = getMemberForBusiness(parsed.memberId, business.id);
  if (!member) {
    return res.status(404).json({
      error: "Code non reconnu pour ce commerce. Scannez le QR affiché sur la carte dans le Wallet du client (pas le lien « Ajouter à Wallet »).",
      code: "MEMBER_NOT_FOUND",
    });
  }
  const pt = (business.program_type || "").toLowerCase();
  let pointsOut = member.points;
  if (pt === "stamps") {
    const N =
      business.required_stamps != null && Number(business.required_stamps) > 0
        ? Math.floor(Number(business.required_stamps))
        : 10;
    pointsOut = normalizeStampBalance(member.points, N);
  }
  const rewardRedeem = resolveRewardRedeemPreview(business, member, parsed.rewardRedeem);
  res.json({
    member: {
      id: member.id,
      name: member.name,
      email: member.email,
      points: pointsOut,
      last_visit_at: member.last_visit_at || null,
    },
    reward_redeem: rewardRedeem,
  });
});

/** Scan QR récompense client → débit du palier + libellé pour la caisse. */
router.post("/reward-redeem", async (req, res) => {
  const business = req.business;
  if (!ensureOperationalSubscription(req, res, business)) return;
  const raw = (req.body?.barcode || "").trim();
  if (!raw) {
    return res.status(400).json({ error: "Champ barcode requis", code: "BARCODE_MISSING" });
  }
  const parsed = parseMerchantScanCode(raw);
  const member = getMemberForBusiness(parsed.memberId, business.id);
  if (!member) {
    return res.status(404).json({
      error: "Code non reconnu. Utilisez le QR « Utiliser la récompense » affiché par le client.",
      code: "MEMBER_NOT_FOUND",
    });
  }
  if (!parsed.rewardRedeem) {
    return res.status(400).json({
      error:
        "Ce QR n'est pas un code récompense. Demandez au client d'ouvrir « Utiliser en magasin » sur sa carte fidélité.",
      code: "NOT_REWARD_REDEEM_QR",
    });
  }
  const redeemIntent = parsed.rewardRedeem;
  const result = executeMemberRewardRedeem(business, member, {
    mode: redeemIntent.mode === "stamps" ? "stamps" : "points",
    tierIndex: redeemIntent.tierIndex,
    points: redeemIntent.points,
    stampThreshold: redeemIntent.stampThreshold,
    actorUserId: req.user?.id,
    source: "integration_reward_redeem",
  });
  if (!result.ok) {
    return res.status(result.status).json({
      error: result.error,
      code: result.code,
      points_required: result.points_required,
      points_balance: result.points_balance,
    });
  }
  const previousPoints = result.previous_points;
  await pushPassKitUpdateForMember(business.id, member.id, "reward_redeem");
  if (result.type === "points") {
    await pushPassKitAfterMemberBalanceChange({
      business,
      memberId: member.id,
      previousBalance: previousPoints,
      reason: "reward_redeem_points",
    });
  }
  await syncGoogleWalletAfterMemberMutation(
    { ...member, points: result.new_points },
    business,
    req,
    "reward_redeem",
  );
  return res.json({
    ok: true,
    type: result.type,
    reward_label: result.reward_label,
    points_deducted: result.points_deducted,
    previous_points: result.previous_points,
    new_points: result.new_points,
    tier_index: result.tier_index,
    message: result.message,
    member: {
      id: member.id,
      name: member.name,
      email: member.email,
      points: result.new_points,
    },
  });
});

router.post("/scan", async (req, res) => {
  const business = req.business;
  if (!ensureOperationalSubscription(req, res, business)) return;
  const raw = (req.body?.barcode || "").trim();
  if (!raw) {
    return res.status(400).json({ error: "Champ barcode requis", code: "BARCODE_MISSING" });
  }
  const parsed = parseMerchantScanCode(raw);
  const member = getMemberForBusiness(parsed.memberId, business.id);
  if (!member) {
    return res.status(404).json({
      error: "Code non reconnu pour ce commerce. Scannez le QR de la carte dans le Wallet du client.",
      code: "MEMBER_NOT_FOUND",
    });
  }
  const pointsDirect = Number(req.body?.points);
  const amountEur = Number(req.body?.amount_eur);
  const visit = req.body?.visit === true;
  const receiptTok = String(req.body?.receipt_validation_token ?? req.body?.receiptValidationToken ?? "").trim();
  if (isReceiptValidationRequiredForRequest(business, amountEur)) {
    if (!receiptTok) {
      return res.status(400).json({
        error: "Scan du QR ticket de caisse requis (réglages sécurité). Générez le QR depuis le même montant puis scannez-le sur le ticket.",
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
  const programType = (business.program_type || "").toLowerCase();
  let points = computeRawPointsForCredit(business, { pointsDirect, amountEur, visit });
  if (points <= 0) {
    const perEuro = Number(business.points_per_euro) || 1;
    const perVisit = Number(business.points_per_visit) || 0;
    const minAmount = business.points_min_amount_eur != null ? Number(business.points_min_amount_eur) : null;
    const minHint = minAmount != null ? ` Achat minimum ${minAmount} € pour gagner des points.` : "";
    const msg =
      perVisit === 0 && programType !== "stamps"
        ? `Vos règles : 0 point par passage. Saisissez un montant en € pour créditer des points.${minHint}`
        : `Saisissez le montant du panier en € ou cliquez sur « 1 passage ». Règles : ${perEuro} pt/€, ${perVisit} pt/passage.${minHint}`;
    return res.status(400).json({
      error: msg,
      code: "NO_POINTS_SPECIFIED",
    });
  }
  const addsToday = countMemberPointsAddsTodayUtc(business.id, member.id);
  const secured = enforceScanSecurityLimits(business, points, addsToday);
  if (!secured.ok) {
    return res.status(secured.status).json({ error: secured.error, code: secured.code });
  }
  points = secured.points;
  const metaBase =
    amountEur > 0 || visit
      ? { amount_eur: amountEur || undefined, visit, source: "integration" }
      : { source: "integration" };
  if (secured.capped) {
    metaBase.points_capped = true;
    metaBase.requested_points = secured.originalPoints;
  }
  const stampCycleN =
    business.required_stamps != null && Number(business.required_stamps) > 0
      ? Math.floor(Number(business.required_stamps))
      : 10;
  let updated;
  let stampCycleCompleted = false;
  let stampCyclesCompleted = 0;
  const previousBalance = Math.max(0, Math.floor(Number(member.points) || 0));
  if (programType === "stamps") {
    const r = addStampsWithCycleRollover(member.id, points, stampCycleN);
    if (!r.member) {
      return res.status(500).json({ error: "Mise à jour membre impossible.", code: "MEMBER_UPDATE_FAILED" });
    }
    updated = r.member;
    stampCyclesCompleted = r.cycleCompletions;
    stampCycleCompleted = r.cycleCompletions > 0;
    if (stampCycleCompleted) {
      metaBase.stamp_cycle_completed = true;
      metaBase.stamp_cycles_completed = r.cycleCompletions;
      metaBase.required_stamps = stampCycleN;
    }
  } else {
    const previousPoints = Math.max(0, Math.floor(Number(member.points) || 0));
    updated = addPoints(member.id, points);
    createTransaction({
      businessId: business.id,
      memberId: member.id,
      type: "points_add",
      points,
      metadata: metaBase,
      actorUserId: req.user?.id,
    });
    scheduleWalletSyncAfterIntegrationScan({
      business,
      memberId: member.id,
      previousBalance: previousPoints,
      updated,
      req,
    });
    res.json(
      buildIntegrationScanResponseBody({
        member,
        updated,
        points,
        secured,
        programType,
        stampCycleCompleted,
        stampCyclesCompleted,
      }),
    );
    return;
  }
  createTransaction({
    businessId: business.id,
    memberId: member.id,
    type: "points_add",
    points,
    metadata: metaBase,
    actorUserId: req.user?.id,
  });
  scheduleWalletSyncAfterIntegrationScan({
    business,
    memberId: member.id,
    previousBalance,
    updated,
    req,
  });
  res.json(
    buildIntegrationScanResponseBody({
      member,
      updated,
      points,
      secured,
      programType,
      stampCycleCompleted,
      stampCyclesCompleted,
    }),
  );
});

export default router;
