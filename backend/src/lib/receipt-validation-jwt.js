/**
 * JWT « ticket de caisse » : même montant que le panier, court délai, signé avec JWT_SECRET.
 */
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";

const RECEIPT_TYP = "mfp_rcp";

/**
 * @param {{ businessId: string, amountEur: number, secret: string }} p
 */
export function signReceiptChallengeToken({ businessId, amountEur, secret }) {
  const amt = Math.round(amountEur * 100) / 100;
  return jwt.sign(
    {
      typ: RECEIPT_TYP,
      bid: businessId,
      amt,
      jti: randomUUID(),
    },
    secret,
    { algorithm: "HS256", expiresIn: "15m" },
  );
}

/**
 * @param {{ token: string, business: object, amountEur: number, toleranceCents?: number }} p
 */
export function verifyReceiptTokenForScan({ token, business, amountEur, toleranceCents }) {
  const secret = process.env.JWT_SECRET;
  if (!secret || String(secret).length < 8) {
    return { ok: false, code: "SERVER_CONFIG", error: "Configuration serveur incomplète." };
  }
  let payload;
  try {
    payload = jwt.verify(String(token).trim(), secret, { algorithms: ["HS256"] });
  } catch (_) {
    return { ok: false, code: "RECEIPT_TOKEN_INVALID", error: "QR ticket invalide ou expiré. Régénérez le QR depuis le ticket." };
  }
  if (payload.typ !== RECEIPT_TYP || payload.bid !== business.id) {
    return { ok: false, code: "RECEIPT_TOKEN_MISMATCH", error: "Ce QR ne correspond pas à ce commerce." };
  }
  const tol = toleranceCents != null && Number.isFinite(Number(toleranceCents)) ? Math.max(0, Math.floor(Number(toleranceCents))) : 5;
  const wantCents = Math.round(Number(amountEur) * 100);
  const gotCents = Math.round(Number(payload.amt) * 100);
  if (Math.abs(wantCents - gotCents) > tol) {
    return {
      ok: false,
      code: "RECEIPT_AMOUNT_MISMATCH",
      error: `Le montant du ticket (${payload.amt} €) ne correspond pas au panier (${amountEur} €).`,
    };
  }
  return { ok: true };
}

/**
 * @param {object} business
 * @param {number|undefined|null} amountEur
 */
export function isReceiptValidationRequiredForRequest(business, amountEur) {
  if (Number(business.require_receipt_qr_validation) !== 1) return false;
  const amt = Number(amountEur);
  return Number.isFinite(amt) && amt > 0;
}
