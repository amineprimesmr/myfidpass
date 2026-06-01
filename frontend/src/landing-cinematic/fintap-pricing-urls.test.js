import { describe, it, expect } from "vitest";
import { getLandingPricingCheckoutUrl, LANDING_APP_DOWNLOAD_HREF } from "./fintap-pricing-urls.js";

describe("fintap-pricing-urls", () => {
  it("mensuel → Payment Link Stripe avec promo 1er mois à 1 €", () => {
    const url = getLandingPricingCheckoutUrl("monthly");
    expect(url).toContain("prefilled_promo_code=MYFID1EURO");
    expect(url.startsWith("https://buy.stripe.com/")).toBe(true);
  });

  it("annuel → Payment Link Stripe 399 €/an", () => {
    const url = getLandingPricingCheckoutUrl("annual");
    expect(url.startsWith("https://buy.stripe.com/fZufZh7bjbjEeCR4Cr8Zq03")).toBe(true);
  });

  it("plan inconnu → page téléchargement app", () => {
    expect(getLandingPricingCheckoutUrl("unknown")).toBe(LANDING_APP_DOWNLOAD_HREF);
  });
});
