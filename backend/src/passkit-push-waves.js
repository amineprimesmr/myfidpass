/**
 * Envoi PassKit (APNs) : parallèle borné, une salve immédiate (sans délai ni retry).
 *
 * PASSKIT_WAVE_GAP_MS — ms entre salve 1 et 2 (défaut 0 = une seule salve).
 */
import { sendPassKitUpdate } from "./apns.js";

const PASSKIT_WAVE_GAP_MS = Math.min(30_000, Math.max(0, Number(process.env.PASSKIT_WAVE_GAP_MS ?? 0)));

/** Défaut 48 — ajuster avec PASSKIT_PARALLEL_LIMIT si le serveur suit. */
const PASSKIT_PARALLEL_LIMIT = Math.min(120, Math.max(4, Number(process.env.PASSKIT_PARALLEL_LIMIT ?? 48)));

async function sendPassKitChunked(rows, opts = {}) {
  const out = [];
  for (let i = 0; i < rows.length; i += PASSKIT_PARALLEL_LIMIT) {
    const chunk = rows.slice(i, i + PASSKIT_PARALLEL_LIMIT);
    const part = await Promise.all(
      chunk.map(async (row) => {
        const result = await sendPassKitUpdate(row.push_token, opts);
        return { row, result };
      })
    );
    out.push(...part);
  }
  return out;
}

/**
 * @param {Array<{ push_token: string, serial_number?: string }>} passKitRows
 * @param {{ collapseId?: string | null }} [opts]
 * @returns {Promise<Array<{ row: object, result: { sent: boolean, error?: string } }>>}
 */
export async function sendPassKitPushWaves(passKitRows, opts = {}) {
  const rows = (passKitRows || []).filter((r) => r.push_token);
  if (rows.length === 0) return [];

  const wave1 = await sendPassKitChunked(rows, opts);
  if (PASSKIT_WAVE_GAP_MS <= 0) {
    return wave1;
  }
  await new Promise((r) => setTimeout(r, PASSKIT_WAVE_GAP_MS));
  const wave2Opts = opts?.collapseId
    ? { ...opts, collapseId: `${opts.collapseId}~w2`.slice(0, 64) }
    : opts;
  const wave2 = await sendPassKitChunked(rows, wave2Opts);
  return wave2.map((w2, i) => {
    if (!w2.result.sent && wave1[i]?.result?.sent) return wave1[i];
    return w2;
  });
}

export function passKitWaveGapMsForDiagnostics() {
  return PASSKIT_WAVE_GAP_MS;
}
