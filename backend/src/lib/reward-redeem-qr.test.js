import { describe, it, expect } from "vitest";
import {
  buildRewardRedeemQrPayload,
  parseRewardRedeemQrPayload,
  resolvePointsRewardFromQr,
  resolveStampRewardFromQr,
} from "./reward-redeem-qr.js";

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

  it("encode tampons carte complète", () => {
    const raw = buildRewardRedeemQrPayload({ memberId: MEMBER, programType: "stamps" });
    expect(parseRewardRedeemQrPayload(raw)).toEqual({
      memberId: MEMBER,
      mode: "stamps",
      stampThreshold: null,
    });
  });

  it("encode tampons palier intermédiaire", () => {
    const raw = buildRewardRedeemQrPayload({
      memberId: MEMBER,
      programType: "stamps",
      stampThreshold: 5,
    });
    expect(parseRewardRedeemQrPayload(raw)).toEqual({
      memberId: MEMBER,
      mode: "stamps",
      stampThreshold: 5,
    });
  });

  it("resolve tampons — palier 5 avec solde cycle", () => {
    const business = {
      required_stamps: 10,
      stamp_mid_reward_label: "-50 % sur un article",
      stamp_reward_label: "Une récompense offerte",
    };
    const resolved = resolveStampRewardFromQr(business, { mode: "stamps", stampThreshold: 5 });
    expect(resolved.label).toBe("-50 % sur un article");
    expect(resolved.pointsRequired).toBe(5);
    expect(resolved.isFullCard).toBe(false);
  });

  it("resolve coût/libellé via points QR quand l’index DB a 0 pt", () => {
    const business = {
      points_reward_tiers: [
        { points: 0, label: "Début du jeu" },
        { points: 10, label: "Cadeau offert" },
        { points: 50, label: "Un café offert" },
      ],
    };
    const resolved = resolvePointsRewardFromQr(business, {
      mode: "points",
      tierIndex: 1,
      points: 10,
    });
    expect(resolved.pointsRequired).toBe(10);
    expect(resolved.label).toBe("Cadeau offert");
  });
});
