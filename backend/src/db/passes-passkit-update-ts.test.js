import { describe, it, expect } from "vitest";
import { effectivePassKitRowUpdateTs, parsePassKitUpdateTag } from "./passes.js";

describe("effectivePassKitRowUpdateTs (PassKit passesUpdatedSince)", () => {
  it("utilise last_broadcast_at quand last_visit_at est absent", () => {
    const ts = effectivePassKitRowUpdateTs({
      last_visit_at: null,
      last_broadcast_at: "2026-03-20 12:00:00",
      created_at: "2025-01-01 10:00:00",
    });
    expect(ts).toBe(Date.parse("2026-03-20T12:00:00Z"));
  });

  it("prend le max entre visite, diffusion et création membre", () => {
    const ts = effectivePassKitRowUpdateTs({
      last_visit_at: "2026-01-01 00:00:00",
      last_broadcast_at: "2026-06-01 00:00:00",
      created_at: "2020-01-01 00:00:00",
    });
    expect(ts).toBe(Date.parse("2026-06-01T00:00:00Z"));
  });

  it("retombe sur created_at si pas de visite ni diffusion", () => {
    const ts = effectivePassKitRowUpdateTs({
      last_visit_at: null,
      last_broadcast_at: null,
      created_at: "2024-05-10 08:30:00",
    });
    expect(ts).toBe(Date.parse("2024-05-10T08:30:00Z"));
  });

  it("prend en compte notification_pass_layout_at (textes pass sans nouvelle diffusion)", () => {
    const ts = effectivePassKitRowUpdateTs({
      last_visit_at: null,
      last_broadcast_at: "2026-01-01 00:00:00",
      notification_pass_layout_at: "2026-06-15 12:00:00",
      created_at: "2020-01-01 00:00:00",
    });
    expect(ts).toBe(Date.parse("2026-06-15T12:00:00Z"));
  });

  it("prend en compte pass_last_modified_ms (icône notif / invalidation ms)", () => {
    const iconMs = Date.parse("2026-08-20T10:00:00.500Z");
    const ts = effectivePassKitRowUpdateTs({
      last_visit_at: null,
      last_broadcast_at: "2026-01-01 00:00:00",
      notification_pass_layout_at: "2026-06-15 12:00:00",
      created_at: "2020-01-01 00:00:00",
      pass_last_modified_ms: iconMs,
    });
    expect(ts).toBe(iconMs);
  });

  it("parse les nouveaux update tags opaques ms:... et les anciens tags date", () => {
    const ms = Date.parse("2026-08-20T10:00:00.500Z");
    expect(parsePassKitUpdateTag(`ms:${ms}`)).toBe(ms);
    expect(parsePassKitUpdateTag(String(ms))).toBe(ms);
    expect(parsePassKitUpdateTag("2026-08-20 10:00:00.500")).toBe(ms);
  });
});
