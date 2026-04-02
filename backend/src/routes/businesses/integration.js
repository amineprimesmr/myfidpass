/**
 * Intégration bornes / caisses : lookup et scan.
 * Référence : REFONTE-REGLES.md — max 15 routes par fichier.
 */
import { Router } from "express";
import {
  getMemberForBusiness,
  addPoints,
  createTransaction,
  getPushTokensForMember,
  countMemberPointsAddsTodayUtc,
} from "../../db.js";
import { sendPassKitUpdate } from "../../apns.js";
import { canAccessDashboard, normalizeBarcodeToMemberId } from "./shared.js";
import {
  computeRawPointsForCredit,
  enforceScanSecurityLimits,
} from "../../lib/scan-credit-helpers.js";
import {
  isReceiptValidationRequiredForRequest,
  verifyReceiptTokenForScan,
} from "../../lib/receipt-validation-jwt.js";

const router = Router();

router.get("/lookup", (req, res) => {
  const business = req.business;
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

router.post("/scan", async (req, res) => {
  const business = req.business;
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
  const perEuro = Number(business.points_per_euro) || 1;
  const perVisit = Number(business.points_per_visit) || 0;
  const minAmount = business.points_min_amount_eur != null ? Number(business.points_min_amount_eur) : null;
  const programType = (business.program_type || "").toLowerCase();
  let points = computeRawPointsForCredit(business, { pointsDirect, amountEur, visit });
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
  const addsToday = countMemberPointsAddsTodayUtc(business.id, member.id);
  const secured = enforceScanSecurityLimits(business, points, addsToday);
  if (!secured.ok) {
    return res.status(secured.status).json({ error: secured.error, code: secured.code });
  }
  points = secured.points;
  const metaBase =
    amountEur > 0 || visit ? { amount_eur: amountEur || undefined, visit, source: "integration" } : { source: "integration" };
  if (secured.capped) {
    metaBase.points_capped = true;
    metaBase.requested_points = secured.originalPoints;
  }
  const updated = addPoints(member.id, points);
  createTransaction({
    businessId: business.id,
    memberId: member.id,
    type: "points_add",
    points,
    metadata: metaBase,
  });
  const tokens = getPushTokensForMember(member.id);
  if (tokens.length > 0) {
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
    points_capped: secured.capped === true,
    points_requested: secured.capped ? secured.originalPoints : undefined,
  });
});

export default router;
