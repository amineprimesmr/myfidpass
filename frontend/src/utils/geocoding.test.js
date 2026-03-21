import { describe, it, expect } from "vitest";
import { formatPhotonAddress } from "./geocoding.js";

describe("formatPhotonAddress", () => {
  it("assemble ville et pays", () => {
    expect(
      formatPhotonAddress({
        street: "Rue de Paris",
        housenumber: "10",
        postcode: "35000",
        city: "Rennes",
        country: "France",
      })
    ).toContain("Rennes");
    expect(
      formatPhotonAddress({
        street: "Rue de Paris",
        housenumber: "10",
        postcode: "35000",
        city: "Rennes",
        country: "France",
      })
    ).toContain("France");
  });

  it("retourne chaîne vide si props absent", () => {
    expect(formatPhotonAddress(null)).toBe("");
  });
});
