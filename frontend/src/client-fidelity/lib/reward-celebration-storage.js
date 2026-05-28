const STORAGE_PREFIX = "fid_reward_celebration_";

/**
 * @param {string} slug
 * @param {string} memberId
 */
export function rewardCelebrationStorageKey(slug, memberId) {
  return `${STORAGE_PREFIX}${String(slug || "").trim()}_${String(memberId || "").trim()}`;
}

/**
 * @param {string} slug
 * @param {string} memberId
 * @returns {{ welcomeShown: boolean; tiers: number[] }}
 */
export function loadRewardCelebrationStorage(slug, memberId) {
  if (typeof localStorage === "undefined" || !slug || !memberId) {
    return { welcomeShown: false, tiers: [] };
  }
  try {
    const raw = localStorage.getItem(rewardCelebrationStorageKey(slug, memberId));
    if (!raw) return { welcomeShown: false, tiers: [] };
    const parsed = JSON.parse(raw);
    const tiers = Array.isArray(parsed?.tiers)
      ? parsed.tiers.map((n) => parseInt(String(n), 10)).filter((n) => Number.isInteger(n) && n >= 0)
      : [];
    return { welcomeShown: !!parsed?.welcomeShown, tiers };
  } catch {
    return { welcomeShown: false, tiers: [] };
  }
}

/**
 * @param {string} slug
 * @param {string} memberId
 * @param {{ welcomeShown: boolean; tiers: number[] }} data
 */
export function saveRewardCelebrationStorage(slug, memberId, data) {
  if (typeof localStorage === "undefined" || !slug || !memberId) return;
  try {
    localStorage.setItem(
      rewardCelebrationStorageKey(slug, memberId),
      JSON.stringify({
        welcomeShown: !!data.welcomeShown,
        tiers: Array.isArray(data.tiers) ? data.tiers : [],
      }),
    );
  } catch (_) {}
}
