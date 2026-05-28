/**
 * Régression : 1ʳᵉ campagne OK, 2ᵉ ignorée (204 Wallet) après refetch de la 1ʳᵉ.
 */
import { describe, it, expect } from "vitest";
import { formatUtcSqlWithMs } from "./datetime-sql.js";
import { computeNextPassLastModifiedMs } from "./pass-last-modified-ms.js";
import {
  filterPassKitRegistrationRows,
  effectivePassKitRowUpdateTs,
} from "./passes-passkit-since-filter.js";
import { buildLastBroadcastFieldValue } from "../pass/broadcast-field.js";

function makeRow({ lastBroadcastAt, passMs, layoutAt = null }) {
  return {
    serial_number: "member-1",
    last_visit_at: null,
    created_at: "2025-01-01 10:00:00",
    last_broadcast_at: lastBroadcastAt,
    notification_pass_layout_at: layoutAt,
    pass_last_modified_ms: passMs,
  };
}

describe("2 campagnes PassKit consécutives (filtre registrations)", () => {
  it("après refetch campagne 1, campagne 2 n’est pas filtrée (pas de 204)", () => {
    const t0 = Date.parse("2026-05-28T16:00:00.000Z");
    let passMs = 0;

    // Campagne 1 : setLastBroadcast + bump (comme dispatch)
    const broadcast1At = formatUtcSqlWithMs(t0 + 50);
    passMs = computeNextPassLastModifiedMs(passMs, t0 + 50);
    passMs = computeNextPassLastModifiedMs(passMs, t0 + 55);

    const rowAfter1 = makeRow({ lastBroadcastAt: broadcast1At, passMs });
    const lastUpdated1 = formatUtcSqlWithMs(
      Math.max(passMs, effectivePassKitRowUpdateTs(rowAfter1))
    );

    // iPhone refetch campagne 1 → puis push campagne 2
    const broadcast2At = formatUtcSqlWithMs(t0 + 400);
    passMs = computeNextPassLastModifiedMs(passMs, t0 + 400);
    passMs = computeNextPassLastModifiedMs(passMs, t0 + 405);
    const rowAfter2 = makeRow({ lastBroadcastAt: broadcast2At, passMs });

    const filtered = filterPassKitRegistrationRows([rowAfter2], lastUpdated1);
    expect(filtered.length).toBe(1);
    expect(filtered[0].last_broadcast_at).toBe(broadcast2At);
  });

  it("PATCH titre seul entre deux envois ne doit pas faire perdre la campagne 2", () => {
    const t0 = Date.parse("2026-05-28T16:00:00.000Z");
    let passMs = computeNextPassLastModifiedMs(0, t0);

    const broadcast1At = formatUtcSqlWithMs(t0 + 100);
    passMs = computeNextPassLastModifiedMs(passMs, t0 + 100);
    const row1 = makeRow({ lastBroadcastAt: broadcast1At, passMs });
    const sinceTag = formatUtcSqlWithMs(Math.max(passMs, effectivePassKitRowUpdateTs(row1)));

    // PATCH titre (bump layout, pas de nouveau broadcast)
    const layoutAt = formatUtcSqlWithMs(t0 + 200);
    passMs = computeNextPassLastModifiedMs(passMs, t0 + 200);

    const broadcast2At = formatUtcSqlWithMs(t0 + 250);
    passMs = computeNextPassLastModifiedMs(passMs, t0 + 250);
    const row2 = makeRow({
      lastBroadcastAt: broadcast2At,
      passMs,
      layoutAt,
    });

    expect(filterPassKitRegistrationRows([row2], sinceTag).length).toBe(1);
  });

  it("scénario strict pré-correctif : tag en avance sur broadcast mais filet récent", () => {
    const broadcastAt = "2026-05-28 16:00:01.500";
    const row = makeRow({
      lastBroadcastAt: broadcastAt,
      passMs: Date.parse("2026-05-28T16:00:01.000Z"),
    });
    // Tag Wallet légèrement après broadcast (horloge / layout bump)
    const sinceTag = "2026-05-28 16:00:02.000";
    expect(filterPassKitRegistrationRows([row], sinceTag).length).toBe(1);
  });
});

describe("valeur lastMessage (alerte %@)", () => {
  it("1er et 2e envoi ont des valeurs distinctes (suffixe invisible)", () => {
    const at = "2026-05-28 16:00:01.123";
    const v1 = buildLastBroadcastFieldValue("Hello", at, 1);
    const v2 = buildLastBroadcastFieldValue("World", at, 2);
    expect(v1).not.toBe(v2);
    expect(v1.startsWith("Hello")).toBe(true);
    expect(v2.startsWith("World")).toBe(true);
  });
});
