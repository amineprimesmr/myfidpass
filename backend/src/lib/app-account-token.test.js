import { describe, it, expect } from "vitest";
import {
  appAccountTokenUuidForUserId,
  appAccountTokenFromApplePayload,
  isUuidString,
} from "./app-account-token.js";

describe("appAccountTokenUuidForUserId", () => {
  it("returns lowercase UUID when user id is already UUID", () => {
    const id = "A1B2C3D4-E5F6-4789-A012-3456789ABCDE";
    expect(appAccountTokenUuidForUserId(id)).toBe("a1b2c3d4-e5f6-4789-a012-3456789abcde");
    expect(isUuidString(id)).toBe(true);
  });

  it("returns stable derived UUID for non-UUID user ids", () => {
    const a = appAccountTokenUuidForUserId("user-legacy-42");
    const b = appAccountTokenUuidForUserId("user-legacy-42");
    expect(a).toBe(b);
    expect(isUuidString(a)).toBe(true);
  });
});

describe("appAccountTokenFromApplePayload", () => {
  it("reads appAccountToken from payload", () => {
    expect(
      appAccountTokenFromApplePayload({
        appAccountToken: "A1B2C3D4-E5F6-4789-A012-3456789ABCDE",
      }),
    ).toBe("a1b2c3d4-e5f6-4789-a012-3456789abcde");
  });
});
