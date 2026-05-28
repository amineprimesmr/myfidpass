/** Paliers points publics : le palier à 10 pts (récompense inscription) est toujours présent côté client. */

export const SIGNUP_REWARD_POINTS = 10;

/**
 * @param {unknown} raw
 * @returns {{ points: number; label: string; image_url?: string; imageUrl?: string }[]}
 */
export function parsePointsRewardTiersRaw(raw) {
  let tiers = raw;
  if (typeof tiers === "string" && tiers.trim()) {
    try {
      tiers = JSON.parse(tiers);
    } catch {
      tiers = [];
    }
  }
  if (!Array.isArray(tiers)) return [];
  const out = [];
  for (const t of tiers) {
    if (t == null) continue;
    const points = parseInt(String(t.points ?? t.points_required), 10);
    const label = String(t.label ?? "").trim();
    if (Number.isNaN(points) || points < 0 || !label) continue;
    const img = t.image_url ?? t.imageUrl ?? t.image;
    const row = { points, label };
    if (typeof img === "string" && img.trim()) row.image_url = img.trim();
    out.push(row);
  }
  out.sort((a, b) => a.points - b.points);
  return out;
}

/**
 * Réinjecte le palier inscription (10 pts) si une ancienne migration l’a retiré du JSON.
 * @param {unknown} rawTiers
 * @param {string} [signupLabel]
 */
export function normalizePointsRewardTiersForClient(rawTiers, signupLabel = "") {
  const parsed = parsePointsRewardTiersRaw(rawTiers);
  if (!parsed.length) return [];
  const hasSignup = parsed.some((t) => t.points === SIGNUP_REWARD_POINTS);
  if (hasSignup) return parsed;
  const label = String(signupLabel || "").trim() || "Récompense de bienvenue";
  return [{ points: SIGNUP_REWARD_POINTS, label }, ...parsed].sort((a, b) => a.points - b.points);
}
