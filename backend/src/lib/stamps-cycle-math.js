/**
 * Logique tampons : cycle 0 … N-1, retour à 0 après chaque Nᵉ tampon (récompense max).
 */

/**
 * Solde tampon dans le cycle courant (0 … N-1).
 */
export function normalizeStampBalance(rawPoints, cycleSize) {
  const N = Math.max(1, Math.floor(Number(cycleSize) || 1));
  const p = Math.max(0, Math.floor(Number(rawPoints) || 0));
  return p % N;
}

/**
 * @returns {{ newBalance: number, cycleCompletions: number, rawAdded: number }}
 */
export function computeStampRolloverState(currentRawPoints, delta, cycleSize) {
  const N = Math.max(1, Math.floor(Number(cycleSize) || 1));
  const d = Math.max(0, Math.floor(Number(delta) || 0));
  if (d <= 0) {
    return { newBalance: normalizeStampBalance(currentRawPoints, N), cycleCompletions: 0, rawAdded: 0 };
  }
  let cur = normalizeStampBalance(currentRawPoints, N);
  let remaining = d;
  let cycleCompletions = 0;
  while (remaining > 0) {
    const space = N - cur;
    if (remaining < space) {
      cur += remaining;
      remaining = 0;
    } else {
      remaining -= space;
      cur = 0;
      cycleCompletions += 1;
    }
  }
  return { newBalance: cur, cycleCompletions, rawAdded: d };
}
