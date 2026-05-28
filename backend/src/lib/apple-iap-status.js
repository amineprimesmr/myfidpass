/**
 * Logique pure statut abonnement Apple (sans DB / JWT) — testable en Vitest.
 */

function msFromAppleTimestamp(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e12 ? n * 1000 : n;
}

/** `expiresDate` StoreKit (ms) ou chaîne ISO / alias App Store Server API. */
export function expiresMsFromApplePayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const candidates = [
    payload.expiresDate,
    payload.expires_date,
    payload.expiresDateMs,
    payload.expirationDate,
    payload.expiration_date,
  ];
  for (const raw of candidates) {
    const ms = msFromAppleTimestamp(raw);
    if (ms != null) return ms;
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const parsed = Date.parse(trimmed);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return null;
}

/**
 * Statut abonnement dérivé du JWS StoreKit / App Store Server API.
 * Ne jamais retourner `active` par défaut : sans date d’expiration valide → pas d’accès payant.
 */
export function subscriptionStatusFromApplePayload(payload) {
  const now = Date.now();
  const expiresMs = expiresMsFromApplePayload(payload);
  const graceMs = msFromAppleTimestamp(payload?.gracePeriodExpiresDate ?? payload?.grace_period_expires_date);
  const revokeMs = msFromAppleTimestamp(payload?.revocationDate ?? payload?.revocation_date);
  if (revokeMs != null && revokeMs <= now) return "canceled";
  if (expiresMs == null) return "canceled";
  if (expiresMs > now) return "active";
  if (graceMs != null && graceMs > now) return "past_due";
  return "canceled";
}
