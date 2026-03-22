import { describe, expect, it } from "vitest";
import { resolvePublicWalletLogoPng } from "./resolve-public-business-logo.js";

describe("resolvePublicWalletLogoPng", () => {
  it("sans commerce → null", async () => {
    expect(await resolvePublicWalletLogoPng(null)).toBeNull();
    expect(await resolvePublicWalletLogoPng(undefined)).toBeNull();
  });
});
