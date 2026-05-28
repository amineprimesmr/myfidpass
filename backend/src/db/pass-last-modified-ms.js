/**
 * Bump monotone `pass_last_modified_ms` (logique pure, testable sans SQLite).
 */

/**
 * @param {number | string | null | undefined} prevMsRaw
 * @param {number} nowMs
 * @returns {number}
 */
export function computeNextPassLastModifiedMs(prevMsRaw, nowMs) {
  const prevNum = Number(prevMsRaw);
  const prevMs = Number.isFinite(prevNum) && prevNum > 0 ? prevNum : 0;
  const minNextFloorSec = Math.floor(prevMs / 1000) + 1;
  const nowFloorSec = Math.floor(nowMs / 1000);
  return nowFloorSec >= minNextFloorSec ? nowMs : minNextFloorSec * 1000;
}
