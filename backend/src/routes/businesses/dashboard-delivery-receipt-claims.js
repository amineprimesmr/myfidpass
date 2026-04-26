/**
 * File d’approbation : GET/POST .../dashboard/delivery-receipt-claims */
import { Router } from "express";
import {
  getMemberForBusiness,
  addPoints,
  createTransaction,
  getPushTokensForMember,
} from "../../db.js";
import {
  devResetAllReceiptDeliveryClaimsForBusiness,
  getReceiptDeliveryClaimForBusiness,
  listReceiptDeliveryClaimsForDashboard,
  updateReceiptDeliveryClaim,
} from "../../db/receipt-delivery-claims.js";
import {
  computeRawPointsForCredit,
  enforceScanSecurityLimits,
} from "../../lib/scan-credit-helpers.js";
import { countMemberPointsAddsTodayUtc } from "../../db/transactions.js";
import { sendPassKitUpdate } from "../../apns.js";
import { ensureOperationalSubscription } from "./shared.js";
import { isDeliveryReceiptDevResetEnabled } from "../../lib/delivery-receipt-dev-reset-flag.js";

const router = Router({ mergeParams: true });

router.get("/delivery-receipt-claims", (req, res) => {
  const business = req.business;
  const status = String(req.query?.status || "").trim().toLowerCase();
  const st = status === "pending" || status === "approved" || status === "rejected" ? status : null;
  const rows = listReceiptDeliveryClaimsForDashboard(business.id, st, 200);
  return res.json({
    dev_reset_available: isDeliveryReceiptDevResetEnabled(),
    claims: rows.map((c) => ({
      id: c.id,
      member_id: c.member_id,
      member_name: c.member_name || null,
      member_email: c.member_email || null,
      status: c.status,
      amount_eur: c.amount_eur != null ? Number(c.amount_eur) : null,
      points_credited: c.points_credited != null ? Number(c.points_credited) : null,
      ai_confidence: c.ai_confidence != null ? Number(c.ai_confidence) : null,
      merchant_match_ok: c.merchant_match_ok != null ? Number(c.merchant_match_ok) === 1 : null,
      ai_extracted_json: c.ai_extracted_json || null,
      rejection_reason: c.rejection_reason || null,
      created_at: c.created_at,
      resolved_at: c.resolved_at || null,
      resolution_note: c.resolution_note || null,
    })),
  });
});

router.post("/delivery-receipt-claims/dev-reset", async (req, res) => {
  if (!isDeliveryReceiptDevResetEnabled()) {
    return res.status(404).json({ error: "Fonction non disponible.", code: "NOT_FOUND" });
  }
  const business = req.business;
  const body = typeof req.body === "object" && req.body ? req.body : {};
  const confirm = String(body.confirm ?? "").trim();
  if (confirm !== "reset_all_delivery_receipts") {
    return res.status(400).json({
      error: 'Confirmation requise : corps JSON { "confirm": "reset_all_delivery_receipts" }.',
      code: "CONFIRM_REQUIRED",
    });
  }

  const result = devResetAllReceiptDeliveryClaimsForBusiness(business.id);
  const memberIds = [...new Set(result.members_adjusted.map((m) => m.member_id))];
  for (const mid of memberIds) {
    const tokens = getPushTokensForMember(mid);
    for (const token of tokens) {
      try {
        await sendPassKitUpdate(token);
      } catch (_) {
        /* ignore */
      }
    }
  }
  return res.json({
    ok: true,
    claims_deleted: result.claims_deleted,
    transactions_deleted: result.transactions_deleted,
    members_adjusted: result.members_adjusted,
  });
});

router.post("/delivery-receipt-claims/:claimId/approve", async (req, res) => {
  const business = req.business;
  if (!ensureOperationalSubscription(req, res, business)) return;

  const claim = getReceiptDeliveryClaimForBusiness(business.id, req.params.claimId);
  if (!claim) return res.status(404).json({ error: "Demande introuvable." });
  if (claim.status !== "pending") {
    return res.status(400).json({ error: "Cette demande n’est plus en attente.", code: "NOT_PENDING" });
  }

  const member = getMemberForBusiness(claim.member_id, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable." });

  const amountEur = Number(claim.amount_eur);
  if (!Number.isFinite(amountEur) || amountEur <= 0) {
    return res.status(400).json({ error: "Montant invalide sur la demande." });
  }

  const points = computeRawPointsForCredit(business, {
    pointsDirect: NaN,
    amountEur,
    visit: false,
  });
  if (points <= 0) {
    return res.status(400).json({
      error: "Ce montant ne donne aucun point selon les règles actuelles du programme.",
      code: "POINTS_RULE_ZERO",
    });
  }

  const addsToday = countMemberPointsAddsTodayUtc(business.id, member.id);
  const secured = enforceScanSecurityLimits(business, points, addsToday);
  if (!secured.ok) {
    return res.status(secured.status).json({ error: secured.error, code: secured.code });
  }

  const pts = secured.points;
  const updated = addPoints(member.id, pts);
  createTransaction({
    businessId: business.id,
    memberId: member.id,
    type: "points_add",
    points: pts,
    metadata: {
      source: "delivery_receipt_claim",
      amount_eur: amountEur,
      claim_id: claim.id,
      manual_approved: true,
    },
    idempotencyKey: null,
    actorUserId: req.user?.id,
  });
  const tokens = getPushTokensForMember(member.id);
  for (const token of tokens) {
    try {
      await sendPassKitUpdate(token);
    } catch (_) {
      /* ignore */
    }
  }
  updateReceiptDeliveryClaim(claim.id, {
    status: "approved",
    points_credited: pts,
    resolved_at: new Date().toISOString(),
    resolution_note: "manual",
  });

  return res.json({
    ok: true,
    claim: {
      id: claim.id,
      status: "approved",
      points_credited: pts,
      member_points: updated.points,
    },
  });
});

router.post("/delivery-receipt-claims/:claimId/reject", (req, res) => {
  const business = req.business;
  if (!ensureOperationalSubscription(req, res, business)) return;

  const claim = getReceiptDeliveryClaimForBusiness(business.id, req.params.claimId);
  if (!claim) return res.status(404).json({ error: "Demande introuvable." });
  if (claim.status !== "pending") {
    return res.status(400).json({ error: "Cette demande n’est plus en attente.", code: "NOT_PENDING" });
  }

  const note = String(req.body?.note ?? req.body?.reason ?? "").trim().slice(0, 500);
  updateReceiptDeliveryClaim(claim.id, {
    status: "rejected",
    rejection_reason: note || "Refusée par le commerce.",
    resolved_at: new Date().toISOString(),
    resolution_note: "manual_reject",
  });

  return res.json({ ok: true, claim: { id: claim.id, status: "rejected" } });
});

export default router;
