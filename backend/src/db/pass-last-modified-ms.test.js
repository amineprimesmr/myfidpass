/**
 * Tests unitaires du bump monotone à la seconde pour `pass_last_modified_ms`.
 *
 * Pourquoi ce test existe :
 *   Bug client reproductible : après changement de l'icône de notification dans le dashboard
 *   puis envoi immédiat d'une notification manuelle, la bannière Wallet côté iPhone continuait
 *   d'afficher l'ancienne icône. Cause racine : les deux mutations (PATCH icône + POST /send)
 *   tombent dans la même seconde UTC, donc l'en-tête HTTP `Last-Modified` (RFC 1123, précision
 *   seconde) était identique d'une requête PassKit à l'autre → Apple Wallet (`passd`) recyclait
 *   la miniature de bannière cachée en mémoire au lieu de régénérer à partir du nouveau
 *   `icon.png` pourtant bien présent dans le `.pkpass` servi.
 *
 *   Ces tests garantissent que `computeNextPassLastModifiedMs` :
 *     - avance TOUJOURS d'au moins une seconde côté `Math.floor(ms / 1000)` ;
 *     - ne revient jamais en arrière (monotone) ;
 *     - fait progresser le temps "réel" lorsqu'on a déjà changé de seconde.
 *
 *   Ainsi, même 100 bumps consécutifs dans la même milliseconde produisent 100 valeurs dont
 *   la partie "seconde" est strictement croissante → 100 en-têtes `Last-Modified` distincts.
 */
import { describe, it, expect } from "vitest";
import { computeNextPassLastModifiedMs } from "./pass-last-modified-ms.js";

describe("computeNextPassLastModifiedMs", () => {
  it("accepte null / undefined / NaN comme prev → retourne now", () => {
    const now = 1_700_000_000_500;
    expect(computeNextPassLastModifiedMs(null, now)).toBe(now);
    expect(computeNextPassLastModifiedMs(undefined, now)).toBe(now);
    expect(computeNextPassLastModifiedMs("not-a-number", now)).toBe(now);
    expect(computeNextPassLastModifiedMs(0, now)).toBe(now);
    expect(computeNextPassLastModifiedMs(-5, now)).toBe(now);
  });

  it("dans une seconde neuve : retourne nowMs exact (précision ms conservée pour les logs)", () => {
    const prev = 1_700_000_000_500; // seconde 1700000000
    const now = 1_700_000_005_123; // seconde 1700000005 → progression naturelle
    expect(computeNextPassLastModifiedMs(prev, now)).toBe(now);
  });

  it("deux bumps DANS la même seconde UTC → le 2e saute au début de la seconde suivante", () => {
    const prev = 1_700_000_000_500; // seconde 1700000000
    const now = 1_700_000_000_700; // même seconde 1700000000
    const next = computeNextPassLastModifiedMs(prev, now);
    expect(Math.floor(next / 1000)).toBe(1_700_000_001);
    expect(next).toBe(1_700_000_001_000);
  });

  it("garantit monotonie stricte à la seconde même si l'horloge système recule", () => {
    const prev = 1_700_000_100_900;
    const now = 1_700_000_050_000; // clock skew — l'horloge a reculé de 50s
    const next = computeNextPassLastModifiedMs(prev, now);
    expect(Math.floor(next / 1000)).toBeGreaterThan(Math.floor(prev / 1000));
    expect(next).toBeGreaterThan(prev);
  });

  it("100 bumps consécutifs dans la même ms produisent 100 secondes strictement croissantes", () => {
    let prev = 1_700_000_000_000;
    const fixedNow = 1_700_000_000_123;
    const seen = new Set();
    for (let i = 0; i < 100; i++) {
      const next = computeNextPassLastModifiedMs(prev, fixedNow);
      const sec = Math.floor(next / 1000);
      expect(seen.has(sec)).toBe(false);
      seen.add(sec);
      expect(next).toBeGreaterThan(prev);
      prev = next;
    }
    expect(seen.size).toBe(100);
  });

  it("scénario utilisateur : 3 bumps en rapide succession → 3 Last-Modified HTTP distincts", () => {
    // T0: upload icône A (setBusinessAssetData + bump)
    // T0+50ms: envoi broadcast 1 (setLastBroadcastMessage + bump)
    // T0+300ms: upload icône B
    // T0+350ms: envoi broadcast 2
    const t0 = 1_700_000_000_000;
    let current = 0;
    const timestamps = [];
    for (const offset of [0, 50, 300, 350]) {
      current = computeNextPassLastModifiedMs(current, t0 + offset);
      timestamps.push(current);
    }
    const seconds = timestamps.map((t) => Math.floor(t / 1000));
    // Chaque bump doit correspondre à une seconde distincte → Last-Modified HTTP change à chaque fois.
    expect(new Set(seconds).size).toBe(4);
    // Les secondes sont strictement croissantes.
    for (let i = 1; i < seconds.length; i++) {
      expect(seconds[i]).toBeGreaterThan(seconds[i - 1]);
    }
  });
});
