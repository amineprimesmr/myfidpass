import { describe, it, expect } from "vitest";
import { businessHasFileLogoForPublic, getBusinessLogoFileForPublic } from "./business-logo-assets.js";

describe("business-logo-assets", () => {
  it("retourne null pour un id inexistant / vide", () => {
    expect(getBusinessLogoFileForPublic("")).toBeNull();
    expect(getBusinessLogoFileForPublic("00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(businessHasFileLogoForPublic("")).toBe(false);
  });
});
