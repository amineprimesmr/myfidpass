import { describe, it, expect } from "vitest";
import {
  shouldRunDailyAtNow,
  shouldRunOnceAtNow,
  getZonedCalendarParts,
} from "./merchant-notification-timezone.js";

describe("merchant-notification-timezone", () => {
  it("getZonedCalendarParts — Europe/Paris", () => {
    const parts = getZonedCalendarParts(new Date("2026-06-06T07:30:00Z"), "Europe/Paris");
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(6);
    expect(parts.day).toBe(6);
    expect(parts.hour).toBe(9);
    expect(parts.minute).toBe(30);
  });

  it("shouldRunDailyAtNow — fenêtre de grâce après l’heure cible", () => {
    const at930 = new Date("2026-06-06T07:30:00Z");
    expect(shouldRunDailyAtNow("daily_at:09:30", at930, "Europe/Paris")).toBe(true);
    const at932 = new Date("2026-06-06T07:32:00Z");
    expect(shouldRunDailyAtNow("daily_at:09:30", at932, "Europe/Paris")).toBe(true);
    const tooLate = new Date("2026-06-06T07:40:00Z");
    expect(shouldRunDailyAtNow("daily_at:09:30", tooLate, "Europe/Paris")).toBe(false);
  });

  it("shouldRunOnceAtNow — date + heure Paris", () => {
    const ok = new Date("2026-06-06T07:30:00Z");
    expect(shouldRunOnceAtNow("once_at:2026-06-06T09:30", ok, "Europe/Paris")).toBe(true);
    const wrongDay = new Date("2026-06-07T07:30:00Z");
    expect(shouldRunOnceAtNow("once_at:2026-06-06T09:30", wrongDay, "Europe/Paris")).toBe(false);
  });
});
