/**
 * UUID stable lié au user MyFidpass — passé à StoreKit (`appAccountToken`) et vérifié côté serveur.
 */
import { createHash } from "crypto";
import { getDb } from "../db/connection.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidString(value) {
  return UUID_RE.test(String(value || "").trim());
}

/** Même algorithme que iOS `MerchantAppAccountToken`. */
export function appAccountTokenUuidForUserId(userId) {
  const s = String(userId || "").trim();
  if (!s) return null;
  if (isUuidString(s)) return s.toLowerCase();
  const hash = createHash("sha256").update(`myfidpass.appAccountToken.v1:${s}`).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function appAccountTokenFromApplePayload(payload) {
  const raw = payload?.appAccountToken ?? payload?.app_account_token;
  if (raw == null || raw === "") return null;
  const s = String(raw).trim().toLowerCase();
  return isUuidString(s) ? s : null;
}

/** Retrouve le user MyFidpass à partir du token StoreKit (scan IDs — webhook Apple). */
export function resolveUserIdForAppAccountToken(token) {
  const target = String(token || "").trim().toLowerCase();
  if (!isUuidString(target)) return null;
  const db = getDb();
  const rows = db.prepare("SELECT id FROM users").all();
  for (const row of rows) {
    const id = String(row?.id || "").trim();
    if (!id) continue;
    if (appAccountTokenUuidForUserId(id) === target) return id;
  }
  return null;
}
