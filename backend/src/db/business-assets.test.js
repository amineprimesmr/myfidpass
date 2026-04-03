import { describe, it, expect } from "vitest";
import { ASSET_KIND_TO_FLAG } from "./business-assets.js";

describe("business-assets", () => {
  it("mappe le fond page fidélité client vers la colonne businesses", () => {
    expect(ASSET_KIND_TO_FLAG.fidelity_page_background).toBe("asset_fidelity_page_background_present");
  });
});
