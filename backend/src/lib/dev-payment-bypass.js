/**
 * Bypass paiement / abonnement réservé au développement local (jamais en production).
 * Aligné sur X-Dev-Bypass-Payment: 1 + DEV_BYPASS_PAYMENT=true.
 */
export function devPaymentBypass(req) {
  return process.env.DEV_BYPASS_PAYMENT === "true" && req.get("X-Dev-Bypass-Payment") === "1";
}
