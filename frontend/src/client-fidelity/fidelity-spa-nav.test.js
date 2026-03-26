import { describe, it, expect } from "vitest";
import { isFidelityClientSpaPath } from "./fidelity-spa-nav.js";

describe("isFidelityClientSpaPath", () => {
  it("accepte la page carte et la page jeu", () => {
    expect(isFidelityClientSpaPath("/fidelity/demo")).toBe(true);
    expect(isFidelityClientSpaPath("/fidelity/demo/jeu")).toBe(true);
    expect(isFidelityClientSpaPath("/fidelity/demo/")).toBe(true);
  });

  it("refuse les autres chemins", () => {
    expect(isFidelityClientSpaPath("/fidelity")).toBe(false);
    expect(isFidelityClientSpaPath("/fidelity/a/b/c")).toBe(false);
    expect(isFidelityClientSpaPath("/app")).toBe(false);
  });
});
