/**
 * Envoi PassKit (APNs) en salves : parallèle par salve, intervalle court entre salves.
 *
 * Apple ne garantit pas la livraison instantanée ; côté serveur on minimise la latence
 * (plus de boucle séquentielle ni pause 2,5 s fixe). Deux salves restent optionnelles
 * pour limiter le batching APNs (apns-id unique par appel dans sendPassKitUpdate).
 *
 * PASSKIT_WAVE_GAP_MS — ms entre salve 1 et 2 (défaut 2000). Mettre 0 pour une seule salve.
 */
import { sendPassKitUpdate } from "./apns.js";

/**
 * 2ᵉ salve après délai : iOS traite parfois la 1ʳᵉ push background avant de refetch le pass.
 * Défaut 2 s (campagnes manuelles) ; PASSKIT_WAVE_GAP_MS=0 pour une seule salve.
 */
const PASSKIT_WAVE_GAP_MS = Math.min(30_000, Math.max(0, Number(process.env.PASSKIT_WAVE_GAP_MS ?? 2000)));

/**
 * Parallélisme borné : évite des centaines d’APNs simultanés (saturation connexions / timeouts HTTP côté hébergeur).
 * PASSKIT_PARALLEL_LIMIT (défaut 24) — ajuster si besoin.
 */
/** Défaut 48 : envoi souvent en arrière-plan (plus de timeout HTTP) — monter avec PASSKIT_PARALLEL_LIMIT si le serveur suit. */
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
 *   - collapseId : transmis tel quel à APNs via `apns-collapse-id`. Permet de distinguer les
 *     différentes raisons d'invalidation (changement d'icône vs broadcast vs scan de point).
 *     Deux pushes avec des collapseId différents ne sont jamais fusionnés par APNs.
 * @returns {Promise<Array<{ row: object, result: { sent: boolean, error?: string } }>>}
 *         Résultats de la **dernière** salve (pour comptage / logs), comme l’ancien code (2ᵉ boucle).
 */
export async function sendPassKitPushWaves(passKitRows, opts = {}) {
  const rows = (passKitRows || []).filter((r) => r.push_token);
  if (rows.length === 0) return [];

  const runWave = (waveOpts) => sendPassKitChunked(rows, waveOpts);

  const wave1 = await runWave(opts);
  if (PASSKIT_WAVE_GAP_MS <= 0) {
    return wave1;
  }
  await new Promise((r) => setTimeout(r, PASSKIT_WAVE_GAP_MS));
  // Pour la 2ᵉ salve, on dérive un collapseId distinct si présent (suffixe "~w2") afin que les
  // deux salves ne soient pas coalescées entre elles côté APNs — on garantit ainsi que chaque
  // device reçoit deux invalidations même si la 1ʳᵉ a été droppée par le throttling background.
  // 2ᵉ salve : pas de collapse-id (apns-id unique) pour maximiser une 2ᵉ chance de réveil Wallet.
  const wave2Opts = opts?.collapseId
    ? { collapseId: null }
    : opts;
  const wave2 = await runWave(wave2Opts);
  // Garde le meilleur résultat : si wave 1 a réussi mais wave 2 a échoué, on compte quand même l'envoi.
  return wave2.map((w2, i) => {
    if (!w2.result.sent && wave1[i]?.result?.sent) return wave1[i];
    return w2;
  });
}

export function passKitWaveGapMsForDiagnostics() {
  return PASSKIT_WAVE_GAP_MS;
}
