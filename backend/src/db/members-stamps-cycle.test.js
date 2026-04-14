import { describe, it, expect } from "vitest";
import { normalizeStampBalance, computeStampRolloverState } from "../lib/stamps-cycle-math.js";

describe("normalizeStampBalance", () => {
  it("ramène les valeurs >= N dans le cycle courant", () => {
    expect(normalizeStampBalance(10, 10)).toBe(0);
    expect(normalizeStampBalance(11, 10)).toBe(1);
    expect(normalizeStampBalance(9, 10)).toBe(9);
  });
});

describe("computeStampRolloverState", () => {
  it("9 + 1 sur N=10 : carte complète, solde 0", () => {
    const r = computeStampRolloverState(9, 1, 10);
    expect(r.newBalance).toBe(0);
    expect(r.cycleCompletions).toBe(1);
    expect(r.rawAdded).toBe(1);
  });

  it("0 + 10 sur N=10 : une carte complète", () => {
    const r = computeStampRolloverState(0, 10, 10);
    expect(r.newBalance).toBe(0);
    expect(r.cycleCompletions).toBe(1);
  });

  it("8 + 5 sur N=10 : un tour puis 3 tampons", () => {
    const r = computeStampRolloverState(8, 5, 10);
    expect(r.newBalance).toBe(3);
    expect(r.cycleCompletions).toBe(1);
  });

  it("legacy 15 + 1 sur N=10 : 15%10=5, +1=6", () => {
    const r = computeStampRolloverState(15, 1, 10);
    expect(r.newBalance).toBe(6);
    expect(r.cycleCompletions).toBe(0);
  });
});
