import { buildStripeSaasPaymentUrl } from "../config.js";

/** Page téléchargement app — destination des CTA landing (hors checkout Stripe). */
export const LANDING_APP_DOWNLOAD_HREF = "/get";

/** URL Stripe Checkout — offre mensuelle (1er mois à 1 €, puis 49 €/mois). */
export function getLandingPricingCheckoutUrl() {
  return buildStripeSaasPaymentUrl();
}
