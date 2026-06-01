import {
  buildStripeAnnualPaymentUrl,
  buildStripeSaasPaymentUrl,
} from "../config.js";

/** Page téléchargement app — destination des CTA landing (hors tarifs Stripe). */
export const LANDING_APP_DOWNLOAD_HREF = "/get";

/**
 * URL Stripe Checkout (Payment Link) pour un plan tarifaire landing.
 * @param {"monthly"|"annual"} planId
 * @returns {string}
 */
export function getLandingPricingCheckoutUrl(planId) {
  if (planId === "monthly") return buildStripeSaasPaymentUrl();
  if (planId === "annual") return buildStripeAnnualPaymentUrl();
  return LANDING_APP_DOWNLOAD_HREF;
}
