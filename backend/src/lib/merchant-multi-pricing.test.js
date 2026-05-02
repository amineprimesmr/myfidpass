import { describe, it, expect } from "vitest";
import {
  multiBusinessMonthlyTotalCents,
  multiBusinessAnnualTotalCents,
  amountCentsForSplitIndex,
  resolveBusinessSplitAmountCents,
  MULTI_BUSINESS_MONTHLY_1_CENTS,
  MULTI_BUSINESS_ANNUAL_1_REFERENCE_CENTS,
} from "./merchant-multi-pricing.js";

describe("merchant-multi-pricing", () => {
  it("mensuel 1–5 commerces", () => {
    expect(multiBusinessMonthlyTotalCents(1)).toBe(4999);
    expect(multiBusinessMonthlyTotalCents(2)).toBe(8999);
    expect(multiBusinessMonthlyTotalCents(3)).toBe(12498);
    expect(multiBusinessMonthlyTotalCents(4)).toBe(15997);
    expect(multiBusinessMonthlyTotalCents(5)).toBe(19496);
    expect(multiBusinessMonthlyTotalCents(0)).toBe(4999);
    expect(multiBusinessMonthlyTotalCents(99)).toBe(19496);
  });

  it("annuel 1 commerce = référence 399 €", () => {
    expect(multiBusinessAnnualTotalCents(1)).toBe(MULTI_BUSINESS_ANNUAL_1_REFERENCE_CENTS);
  });

  it("somme des parts « par commerce » = total mensuel", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const total = multiBusinessMonthlyTotalCents(n);
      let sum = 0;
      for (let i = 0; i < n; i++) {
        sum += resolveBusinessSplitAmountCents(n, i, "month");
      }
      expect(sum).toBe(total);
    }
  });

  it("amountCentsForSplitIndex répartit le reste sur les premiers index", () => {
    expect(amountCentsForSplitIndex(100, 3, 0)).toBe(34);
    expect(amountCentsForSplitIndex(100, 3, 1)).toBe(33);
    expect(amountCentsForSplitIndex(100, 3, 2)).toBe(33);
  });
});
