import { describe, it, expect } from "vitest";
import { getLandingPricingCheckoutUrl } from "./fintap-pricing-urls.js";

describe("fintap-pricing-urls", () => {
  it("retourne la page checkout intégrée /paiement", () => {
    const url = getLandingPricingCheckoutUrl();
    expect(url).toContain("/paiement");
    expect(url).not.toContain("prefilled_promo_code");
  });
});
