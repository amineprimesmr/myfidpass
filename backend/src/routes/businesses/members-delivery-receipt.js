/**
 * POST/GET /:slug/members/:memberId/delivery-receipt-claims — espace client web (sans JWT membre).
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { createHash } from "crypto";
import sharp from "sharp";
import {
  getMemberForBusiness,
  addPoints,
  createTransaction,
  getPushTokensForMember,
  hasOperationalMerchantAccess,
  mergeBusinessAssetsForPass,
} from "../../db.js";
import {
  insertReceiptDeliveryClaim,
  listReceiptDeliveryClaimsForMember,
  findBlockingClaimByFingerprint,
  findRecentClaimByFileHash,
  countMemberDeliveryClaimsTodayUtc,
  countMemberDeliveryClaimsThisMonthUtc,
  getReceiptDeliveryClaimByIdempotencyKey,
  updateReceiptDeliveryClaim,
} from "../../db/receipt-delivery-claims.js";
import { getApiBase, getIdempotencyKey } from "./shared.js";
import { extractDeliveryReceiptWithOpenAI, MAX_SIDE_PX } from "../../services/receipt-delivery-claim-ai.js";
import {
  merchantNameLikelyMatchesBusiness,
  receiptAddressLikelyMatchesBusiness,
} from "../../lib/merchant-receipt-match.js";
import {
  computeRawPointsForCredit,
  enforceScanSecurityLimits,
} from "../../lib/scan-credit-helpers.js";
import { countMemberPointsAddsTodayUtc } from "../../db/transactions.js";
import { sendPassKitUpdate } from "../../apns.js";
import { devPaymentBypass } from "../../lib/dev-payment-bypass.js";
import { syncGoogleWalletObjectForMember } from "../../google-wallet.js";

const router = Router({ mergeParams: true });

async function syncGoogleWalletAfterMemberMutation(member, business, req) {
  const walletBusiness = mergeBusinessAssetsForPass(business);
  try {
    const result = await syncGoogleWalletObjectForMember(member, walletBusiness, getApiBase(req));
    if (!result.ok) {
      console.warn("[Google Wallet] sync ticket client échouée:", {
        slug: walletBusiness?.slug,
        memberId: member?.id,
        googleStatus: result.googleStatus,
        googleError: result.googleError?.message || result.error,
      });
    }
  } catch (e) {
    console.warn("[Google Wallet] sync ticket client exception:", {
      slug: walletBusiness?.slug,
      memberId: member?.id,
      error: e?.message || String(e),
    });
  }
}

const claimPostLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Trop de demandes. Réessayez dans 15 minutes.", code: "RATE_LIMIT" },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { forwardedHeader: false },
});

function numOr(b, col, fallback) {
  const v = b[col];
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseReceiptDateMs(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const t = Date.parse(`${isoDate}T12:00:00.000Z`);
  return Number.isFinite(t) ? t : null;
}

function receiptTooOldMs(receiptDateIso, maxAgeDays) {
  const t = parseReceiptDateMs(receiptDateIso);
  if (t == null) return { unknown: true };
  const maxD = Math.max(1, Math.min(90, Math.floor(Number(maxAgeDays) || 14)));
  const cutoff = Date.now() - maxD * 86400000;
  return { unknown: false, tooOld: t < cutoff };
}

/** Date ticket dans le futur (tolérance fuseau ~1 jour). */
function receiptTooFuture(receiptDateIso) {
  const t = parseReceiptDateMs(receiptDateIso);
  if (t == null) return { unknown: true };
  const limit = Date.now() + 86400000;
  return { unknown: false, future: t > limit };
}

function buildFingerprint({ orderReference, receiptDateIso, amountEurCents }) {
  const ref = String(orderReference || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 64);
  if (ref.length >= 5) return `ref:${ref}`;
  const d = String(receiptDateIso || "").slice(0, 10) || "nodate";
  return `amt:${amountEurCents}:${d}`;
}

async function normalizeImageToJpegBuffer(inputBuf) {
  let img = sharp(inputBuf).rotate();
  const meta = await img.metadata();
  if (meta.width && meta.width > MAX_SIDE_PX) {
    img = img.resize(MAX_SIDE_PX, null, { withoutEnlargement: true });
  }
  const out = await img.jpeg({ quality: 86 }).toBuffer();
  const hash = createHash("sha256").update(out).digest("hex");
  return { buffer: out, fileHash: hash, base64: out.toString("base64") };
}

function isUniqueConstraintErr(e) {
  const c = e?.code || "";
  return c === "SQLITE_CONSTRAINT_UNIQUE" || String(e?.message || "").includes("UNIQUE constraint failed");
}

function subscriptionBlocksPublicClaim(req, business) {
  const uid = req.user?.id != null ? String(req.user.id).trim() : "";
  const bid = business.user_id != null ? String(business.user_id).trim() : "";
  if (uid && uid === bid && !devPaymentBypass(req) && !hasOperationalMerchantAccess(uid)) {
    return true;
  }
  return false;
}

router.get("/:memberId/delivery-receipt-claims", (req, res) => {
  const business = req.business;
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (Number(business.delivery_receipt_claims_enabled) !== 1) {
    return res.status(403).json({ error: "Fonctionnalité désactivée.", code: "FEATURE_DISABLED" });
  }
  const member = getMemberForBusiness(req.params.memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });
  const rows = listReceiptDeliveryClaimsForMember(business.id, member.id, 40);
  return res.json({
    claims: rows.map((r) => ({
      id: r.id,
      status: r.status,
      amount_eur: r.amount_eur != null ? Number(r.amount_eur) : null,
      points_credited: r.points_credited != null ? Number(r.points_credited) : null,
      ai_confidence: r.ai_confidence != null ? Number(r.ai_confidence) : null,
      merchant_match_ok: r.merchant_match_ok != null ? Number(r.merchant_match_ok) === 1 : null,
      rejection_reason: r.rejection_reason || null,
      created_at: r.created_at,
      resolved_at: r.resolved_at || null,
      resolution_note: r.resolution_note || null,
    })),
  });
});

router.post("/:memberId/delivery-receipt-claims", claimPostLimiter, async (req, res) => {
  const business = req.business;
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });

  if (Number(business.delivery_receipt_claims_enabled) !== 1) {
    return res.status(403).json({ error: "Réclamation livraison désactivée pour ce commerce.", code: "FEATURE_DISABLED" });
  }
  if (subscriptionBlocksPublicClaim(req, business)) {
    return res.status(403).json({
      error: "Le programme fidélité de ce commerce est en pause (abonnement).",
      code: "subscription_required",
    });
  }

  const member = getMemberForBusiness(req.params.memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });

  const idem = getIdempotencyKey(req);
  if (idem) {
    const existing = getReceiptDeliveryClaimByIdempotencyKey(business.id, idem);
    if (existing) {
      return res.status(200).json({
        ok: true,
        idempotent: true,
        claim: {
          id: existing.id,
          status: existing.status,
          amount_eur: Number(existing.amount_eur),
          points_credited: existing.points_credited != null ? Number(existing.points_credited) : null,
          rejection_reason: existing.rejection_reason || null,
        },
      });
    }
  }

  const body = req.body || {};
  const imageBase64 = String(body.image_base64 ?? body.imageBase64 ?? "").trim();
  const mimeHint = String(body.mime_type ?? body.mimeType ?? "image/jpeg").trim().toLowerCase();
  const mime =
    mimeHint === "image/png" || mimeHint === "image/webp" || mimeHint === "image/jpeg" ? mimeHint : "image/jpeg";

  if (!imageBase64 || imageBase64.length < 100) {
    return res.status(400).json({ error: "Envoyez image_base64 (photo ou capture du ticket).", code: "INVALID_IMAGE" });
  }

  const maxDay = Math.max(1, Math.min(20, Math.floor(numOr(business, "delivery_receipt_max_per_member_per_day", 4))));
  const maxMonth = Math.max(1, Math.min(200, Math.floor(numOr(business, "delivery_receipt_max_per_member_per_month", 25))));
  if (countMemberDeliveryClaimsTodayUtc(business.id, member.id) >= maxDay) {
    return res.status(400).json({
      error: `Limite du jour atteinte (${maxDay} réclamation(s) maximum). Réessayez demain.`,
      code: "DAILY_CLAIM_LIMIT",
    });
  }
  if (countMemberDeliveryClaimsThisMonthUtc(business.id, member.id) >= maxMonth) {
    return res.status(400).json({
      error: `Limite du mois atteinte (${maxMonth} réclamation(s) maximum).`,
      code: "MONTHLY_CLAIM_LIMIT",
    });
  }

  let norm;
  try {
    const rawBuf = Buffer.from(imageBase64.replace(/^data:[^;]+;base64,/, ""), "base64");
    if (rawBuf.length < 80 || rawBuf.length > 6 * 1024 * 1024) {
      return res.status(400).json({ error: "Image invalide ou trop volumineuse (max 6 Mo).", code: "INVALID_IMAGE" });
    }
    norm = await normalizeImageToJpegBuffer(rawBuf);
  } catch {
    return res.status(400).json({ error: "Impossible de lire cette image.", code: "INVALID_IMAGE" });
  }

  const dupImg = findRecentClaimByFileHash(business.id, norm.fileHash, 21);
  if (dupImg) {
    return res.status(400).json({
      error: "Ce ticket a déjà été utilisé récemment.",
      code: "DUPLICATE_IMAGE",
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const ai = await extractDeliveryReceiptWithOpenAI({
    apiKey,
    imageBase64: norm.base64,
    mime: "image/jpeg",
    businessContext: {
      organizationName: business.organization_name || business.name || "",
      businessName: business.name || "",
      locationAddress: business.location_address || "",
    },
  });
  if (!ai.ok) {
    const code = ai.code || "AI_ERROR";
    const status = code === "AI_UNAVAILABLE" ? 503 : 400;
    return res.status(status).json({ error: ai.error, code });
  }

  const ex = ai.value;
  const age = receiptTooOldMs(
    ex.receiptDateIso,
    numOr(business, "delivery_receipt_max_age_days", 14),
  );
  if (!age.unknown && age.tooOld) {
    return res.status(400).json({
      error: "Ticket trop ancien pour être accepté.",
      code: "RECEIPT_TOO_OLD",
    });
  }
  const fut = receiptTooFuture(ex.receiptDateIso);
  if (!fut.unknown && fut.future) {
    return res.status(400).json({
      error: "La date du ticket semble incorrecte (dans le futur). Vérifie la photo.",
      code: "RECEIPT_DATE_FUTURE",
    });
  }

  if (ex.totalTtcEur == null || !Number.isFinite(ex.totalTtcEur) || ex.totalTtcEur <= 0) {
    return res.status(400).json({
      error: "Montant total illisible sur le ticket. Reprends une photo plus nette (total TTC visible).",
      code: "AMOUNT_UNREADABLE",
      extracted_amount_eur: ex.totalTtcEur,
    });
  }

  const amountEur = Math.round(ex.totalTtcEur * 100) / 100;
  const amountCents = Math.round(amountEur * 100);
  const fingerprint = buildFingerprint({
    orderReference: ex.orderReference,
    receiptDateIso: ex.receiptDateIso || "",
    amountEurCents: amountCents,
  });

  const blocking = findBlockingClaimByFingerprint(business.id, fingerprint);
  if (blocking) {
    return res.status(400).json({
      error: "Ce ticket a déjà été enregistré ou est en cours de traitement.",
      code: "DUPLICATE_TICKET",
    });
  }

  const blobText = `${ex.merchantNameOnReceipt} ${ex.merchantAddressOnReceipt || ""} ${ex.rawSummary} ${ex.deliveryPlatform || ""}`;
  const serverMerchantOk = merchantNameLikelyMatchesBusiness(business, ex.merchantNameOnReceipt, blobText);
  const aiMerchantOk = ex.matchesExpectedMerchant === true;
  const identityOk = aiMerchantOk || serverMerchantOk;

  const deliveryOk = ex.isLikelyFoodDeliveryReceipt === true || ex.deliveryPlatform != null;
  if (!deliveryOk) {
    return res.status(400).json({
      error: "Ce document ne ressemble pas à un ticket de livraison valide.",
      code: "NOT_DELIVERY_RECEIPT",
    });
  }
  if (ex.receiptAppearsLegitimate !== true) {
    return res.status(400).json({
      error: "Le document ne peut pas être validé automatiquement. Utilise une photo nette du ticket d’achat.",
      code: "RECEIPT_NOT_LEGITIMATE",
    });
  }

  /** Plafond0,58 : évite les seuils SaaS trop hauts qui renvoyaient tout en « attente » avant refonte. */
  const minConf = Math.min(
    0.58,
    Math.max(0.48, numOr(business, "delivery_receipt_auto_min_confidence", 0.52)),
  );
  if (ex.confidence < minConf) {
    return res.status(400).json({
      error: "Analyse du ticket trop incertaine. Reprends une photo plus nette (total et nom du commerce visibles).",
      code: "LOW_CONFIDENCE",
    });
  }

  if (!identityOk) {
    return res.status(400).json({
      error: "Ce ticket ne correspond pas à ce commerce fidélité (nom d’enseigne différent).",
      code: "MERCHANT_MISMATCH",
    });
  }

  const bizHasAddr = String(business.location_address || "").trim().length >= 10;
  const extAddr = String(ex.merchantAddressOnReceipt || "").trim();
  if (bizHasAddr) {
    let addressOk = false;
    if (!extAddr || extAddr.length < 6) {
      /** Ticket sans adresse lisible : on exige que l’IA ait validé l’enseigne attendue. */
      addressOk = aiMerchantOk === true;
    } else if (ex.matchesExpectedAddress === true) {
      addressOk = true;
    } else if (ex.matchesExpectedAddress === false) {
      addressOk = receiptAddressLikelyMatchesBusiness(business, extAddr);
    } else {
      addressOk = receiptAddressLikelyMatchesBusiness(business, extAddr);
    }
    if (!addressOk) {
      return res.status(400).json({
        error:
          "L’adresse ou le lieu sur le ticket ne correspond pas à ce commerce. Vérifie la photo ou que c’est bien le même établissement.",
        code: "ADDRESS_MISMATCH",
      });
    }
  }

  const points = computeRawPointsForCredit(business, {
    pointsDirect: NaN,
    amountEur,
    visit: false,
  });
  if (points <= 0) {
    return res.status(400).json({
      error: "Selon les règles du programme, ce montant ne donne pas de points.",
      code: "POINTS_RULE_ZERO",
    });
  }

  const addsToday = countMemberPointsAddsTodayUtc(business.id, member.id);
  const secured = enforceScanSecurityLimits(business, points, addsToday);

  if (!secured.ok) {
    let row;
    try {
      row = insertReceiptDeliveryClaim({
        business_id: business.id,
        member_id: member.id,
        status: "rejected",
        file_hash_sha256: norm.fileHash,
        claim_fingerprint: fingerprint,
        amount_eur: amountEur,
        points_credited: null,
        ai_extracted_json: JSON.stringify(ex),
        ai_confidence: ex.confidence,
        merchant_match_ok: identityOk ? 1 : 0,
        rejection_reason: secured.error,
        idempotency_key: idem || null,
        resolved_at: new Date().toISOString(),
        resolution_note: secured.code || "scan_limit",
      });
    } catch (e) {
      if (isUniqueConstraintErr(e)) {
        return res.status(400).json({ error: "Ce ticket est déjà enregistré.", code: "DUPLICATE_TICKET" });
      }
      throw e;
    }
    return res.status(secured.status).json({
      error: secured.error,
      code: secured.code,
      claim_id: row.id,
    });
  }

  let row;
  try {
    row = insertReceiptDeliveryClaim({
      business_id: business.id,
      member_id: member.id,
      status: "pending",
      file_hash_sha256: norm.fileHash,
      claim_fingerprint: fingerprint,
      amount_eur: amountEur,
      points_credited: null,
      ai_extracted_json: JSON.stringify(ex),
      ai_confidence: ex.confidence,
      merchant_match_ok: identityOk ? 1 : 0,
      rejection_reason: null,
      idempotency_key: idem || null,
      resolved_at: null,
      resolution_note: null,
    });
  } catch (e) {
    if (isUniqueConstraintErr(e)) {
      return res.status(400).json({ error: "Ce ticket est déjà enregistré.", code: "DUPLICATE_TICKET" });
    }
    throw e;
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
      claim_id: row.id,
      auto_approved: true,
    },
    idempotencyKey: idem ? `rdc:${idem}` : null,
  });
  const tokens = getPushTokensForMember(member.id);
  for (const token of tokens) {
    try {
      await sendPassKitUpdate(token);
    } catch (_) {
      /* ignore */
    }
  }
  await syncGoogleWalletAfterMemberMutation(updated, business, req);
  updateReceiptDeliveryClaim(row.id, {
    status: "approved",
    points_credited: pts,
    resolved_at: new Date().toISOString(),
    resolution_note: "auto_ai",
  });
  return res.status(201).json({
    ok: true,
    claim: {
      id: row.id,
      status: "approved",
      amount_eur: amountEur,
      points_credited: pts,
      member_points: updated.points,
      auto_approved: true,
    },
  });
});

export default router;
