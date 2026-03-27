/**
 * Envoi PassKit (APNs) en salves : parallèle par salve, intervalle court entre salves.
 *
 * Apple ne garantit pas la livraison instantanée ; côté serveur on minimise la latence
 * (plus de boucle séquentielle ni pause 2,5 s fixe). Deux salves restent optionnelles
 * pour limiter le batching APNs (apns-id unique par appel dans sendPassKitUpdate).
 *
 * PASSKIT_WAVE_GAP_MS — ms entre salve 1 et 2 (défaut 400). Mettre 0 pour une seule salve.
 */
import { sendPassKitUpdate } from "./apns.js";

const PASSKIT_WAVE_GAP_MS = Math.min(30_000, Math.max(0, Number(process.env.PASSKIT_WAVE_GAP_MS ?? 400)));

/**
 * @param {Array<{ push_token: string, serial_number?: string }>} passKitRows
 * @returns {Promise<Array<{ row: object, result: { sent: boolean, error?: string } }>>}
 *         Résultats de la **dernière** salve (pour comptage / logs), comme l’ancien code (2ᵉ boucle).
 */
export async function sendPassKitPushWaves(passKitRows) {
  const rows = (passKitRows || []).filter((r) => r.push_token);
  if (rows.length === 0) return [];

  const runWave = () =>
    Promise.all(
      rows.map(async (row) => {
        const result = await sendPassKitUpdate(row.push_token);
        return { row, result };
      })
    );

  const wave1 = await runWave();
  if (PASSKIT_WAVE_GAP_MS <= 0) {
    return wave1;
  }
  await new Promise((r) => setTimeout(r, PASSKIT_WAVE_GAP_MS));
  return runWave();
}

export function passKitWaveGapMsForDiagnostics() {
  return PASSKIT_WAVE_GAP_MS;
}
