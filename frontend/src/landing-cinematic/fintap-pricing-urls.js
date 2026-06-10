import { buildStripeSaasPaymentUrl } from "../config.js";

/** Page téléchargement app — destination des CTA landing (hors checkout Stripe). */
export const LANDING_APP_DOWNLOAD_HREF = "/get";

/** URL Stripe Checkout intégrée — 1er mois à 1 € (coupon API), puis tarif mensuel selon palier. */
export function getLandingPricingCheckoutUrl() {
  return buildStripeSaasPaymentUrl();
}
