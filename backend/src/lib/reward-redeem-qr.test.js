import { describe, it, expect } from "vitest";
import { buildRewardRedeemQrPayload, parseRewardRedeemQrPayload } from "./reward-redeem-qr.js";

const MEMBER = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

describe("reward-redeem-qr", () => {
  it("encode / decode palier points", () => {
    const raw = buildRewardRedeemQrPayload({
      memberId: MEMBER,
      programType: "points",
      tierIndex: 2,
      points: 80,
    });
    expect(raw).toContain(MEMBER);
    const parsed = parseRewardRedeemQrPayload(raw);
    expect(parsed).toEqual({
      memberId: MEMBER,
      mode: "points",
      tierIndex: 2,
      points: 80,
    });
  });

  it("encode tampons", () => {
    const raw = buildRewardRedeemQrPayload({ memberId: MEMBER, programType: "stamps" });
    expect(parseRewardRedeemQrPayload(raw)).toEqual({ memberId: MEMBER, mode: "stamps" });
  });
});
