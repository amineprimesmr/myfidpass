/**
 * Paliers récompenses tampons — détection franchissement (notif Wallet).
 */
import { normalizeStampBalance } from "./stamps-cycle-math.js";

export const STAMP_MID_DEFAULT = 5;

/**
 * Paliers tampons franchis entre deux soldes bruts (exclusif ancien, inclusif nouveau).
 * @param {object} business
 * @param {number} previousRaw
 * @param {number} newRaw
 * @returns {{ threshold: number; label: string }[]}
 */
export function findNewlyUnlockedStampRewardTiers(business, previousRaw, newRaw) {
  const required = Math.max(1, Math.floor(Number(business?.required_stamps) || 10));
  const prev = Math.max(0, Math.floor(Number(previousRaw) || 0));
  const next = Math.max(0, Math.floor(Number(newRaw) || 0));
  if (next <= prev) return [];

  const midLabel = String(business?.stamp_mid_reward_label || "").trim();
  const finalLabel = String(business?.stamp_reward_label || "").trim() || "Récompense";
  /** @type {{ threshold: number; label: string }[]} */
  const unlocked = [];
  const seen = new Set();

  for (let raw = prev + 1; raw <= next; raw += 1) {
    const mod = normalizeStampBalance(raw, required);
    if (midLabel && required > STAMP_MID_DEFAULT && mod === STAMP_MID_DEFAULT) {
      const key = `mid-${STAMP_MID_DEFAULT}`;
      if (!seen.has(key)) {
        seen.add(key);
        unlocked.push({ threshold: STAMP_MID_DEFAULT, label: midLabel });
      }
    }
    if (mod === 0 && raw > 0) {
      const cycles = Math.floor(raw / required);
      const key = `final-${cycles}`;
      if (!seen.has(key)) {
        seen.add(key);
        unlocked.push({ threshold: required, label: finalLabel });
      }
    }
  }

  unlocked.sort((a, b) => a.threshold - b.threshold);
  return unlocked;
}

/**
 * Libellé à afficher dans la notif Wallet (palier le plus élevé franchi).
 * @param {{ threshold: number; label: string }[]} unlocked
 * @returns {string|null}
 */
export function pickStampUnlockNotificationLabel(unlocked) {
  if (!unlocked?.length) return null;
  const best = unlocked[unlocked.length - 1];
  const lab = best?.label != null ? String(best.label).trim() : "";
  return lab || null;
}
