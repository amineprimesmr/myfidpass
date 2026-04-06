/**
 * Contournement du quota mensuel flyer IA — réservé au développement / staging.
 *
 * - `DEV_BYPASS_PAYMENT=true` + en-tête `X-Dev-Bypass-Payment: 1` (même couple que l’abonnement dev).
 * - ou `DEV_BYPASS_FLYER_AI_QUOTA=true` + en-tête `X-Dev-Bypass-Flyer-AI-Quota: 1` (toggle « Flyer IA » dans l’app).
 *
 * En production publique, ne pas définir ces variables (Railway).
 */
import { devPaymentBypass } from "./dev-payment-bypass.js";

/**
 * @param {import("express").Request} req
 * @returns {boolean}
 */
export function flyerAiQuotaDevBypass(req) {
  if (devPaymentBypass(req)) return true;
  if (process.env.DEV_BYPASS_FLYER_AI_QUOTA === "true" && req.get("X-Dev-Bypass-Flyer-AI-Quota") === "1") {
    return true;
  }
  return false;
}
