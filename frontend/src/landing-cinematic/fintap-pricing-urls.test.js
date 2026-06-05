import { describe, it, expect } from "vitest";
import { getLandingPricingCheckoutUrl } from "./fintap-pricing-urls.js";

describe("fintap-pricing-urls", () => {
  it("retourne le Payment Link Stripe mensuel avec promo 1er mois à 1 €", () => {
    const url = getLandingPricingCheckoutUrl();
    expect(url).toContain("prefilled_promo_code=MYFID1EURO");
    expect(url.startsWith("https://buy.stripe.com/")).toBe(true);
  });
});
