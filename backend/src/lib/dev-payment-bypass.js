/**
 * Bypass paiement / abonnement réservé au développement local (jamais en production).
 */
import { isProductionEnvironment } from "./production-env.js";

export function devPaymentBypass(req) {
  if (isProductionEnvironment()) return false;
  return process.env.DEV_BYPASS_PAYMENT === "true" && req.get("X-Dev-Bypass-Payment") === "1";
}
