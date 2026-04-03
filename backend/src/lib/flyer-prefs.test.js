import { describe, expect, it } from "vitest";
import { normalizeFlyerPrefsPut } from "./flyer-prefs.js";

describe("normalizeFlyerPrefsPut", () => {
  it("retire les clés réseaux sociaux du state", () => {
    const r = normalizeFlyerPrefsPut(
      {
        state: {
          headline: "X",
          social1: "instagram",
          socialUrl1: "https://instagram.com/x",
        },
      },
      null,
    );
    expect(r.ok).toBe(true);
    expect(r.value.state.social1).toBeUndefined();
    expect(r.value.state.socialUrl1).toBeUndefined();
    expect(r.value.state.headline).toBe("X");
  });
});
