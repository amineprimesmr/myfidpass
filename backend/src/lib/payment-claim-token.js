/**
 * Jeton signé pour activation post-paiement (lien e-mail, sans OTP).
 */
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const TTL_MS = 48 * 60 * 60 * 1000;

function tokenSecret() {
  return process.env.PAYMENT_CLAIM_TOKEN_SECRET || process.env.JWT_SECRET || "local-dev-only";
}

/** @param {{ email: string, sessionId?: string | null, subscriptionId?: string | null, establishment_name?: string | null, google_place_id?: string | null }} input */
export function createPaymentClaimToken(input) {
  const body = {
    email: String(input.email || "").trim().toLowerCase(),
    sessionId: input.sessionId || null,
    subscriptionId: input.subscriptionId || null,
    establishment_name: input.establishment_name || null,
    google_place_id: input.google_place_id || null,
    exp: Date.now() + TTL_MS,
    n: randomBytes(12).toString("hex"),
  };
  const data = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = createHmac("sha256", tokenSecret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

/** @returns {{ ok: true, payload: object } | { ok: false, code: string, message?: string }} */
export function parsePaymentClaimToken(token) {
  const raw = String(token || "").trim();
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) {
    return { ok: false, code: "invalid_token", message: "Lien invalide." };
  }
  const data = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = createHmac("sha256", tokenSecret()).update(data).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, code: "invalid_token", message: "Lien invalide." };
    }
  } catch {
    return { ok: false, code: "invalid_token", message: "Lien invalide." };
  }
  let body;
  try {
    body = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    return { ok: false, code: "invalid_token", message: "Lien invalide." };
  }
  if (!body?.email || !String(body.email).includes("@")) {
    return { ok: false, code: "invalid_token", message: "Lien invalide." };
  }
  if (Date.now() > Number(body.exp || 0)) {
    return { ok: false, code: "token_expired", message: "Ce lien a expiré. Retournez sur la page Merci pour en recevoir un nouveau." };
  }
  return { ok: true, payload: body };
}

export function buildPaymentClaimConfirmUrl(token) {
  const base = (process.env.FRONTEND_URL || "https://myfidpass.fr").replace(/\/$/, "");
  const params = new URLSearchParams({ claim_token: token, stay: "1" });
  return `${base}/get?${params.toString()}`;
}
