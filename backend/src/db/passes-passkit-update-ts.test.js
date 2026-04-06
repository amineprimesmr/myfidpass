import { describe, it, expect } from "vitest";
import { effectivePassKitRowUpdateTs } from "./passes.js";

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
});
