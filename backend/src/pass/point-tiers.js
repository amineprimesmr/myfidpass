/**
 * Paliers points côté pass — même logique que le formulaire SaaS (readPointTierInputs).
 * Référence : frontend/src/features/app-card-rules-point-tiers.js
 */

/**
 * @param {unknown} business
 * @returns {{ points: number; label: string }[]}
 */
export function parsePointRewardTiersFromBusiness(business) {
  let tiers = business?.points_reward_tiers;
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
    const pts = parseInt(String(t.points), 10);
    const label = t.label != null ? String(t.label).trim() : "";
    if (Number.isNaN(pts) || pts < 0) continue;
    out.push({ points: pts, label });
  }
  out.sort((a, b) => a.points - b.points);
  return out;
}

/**
 * Texte face avant « Récompense » : premier palier avec libellé (comme l’aperçu Wallet du SaaS).
 * @param {{ points: number; label: string }[]} sortedTiers
 * @returns {string}
 */
export function frontRewardLabelFromSortedTiers(sortedTiers) {
  const first = sortedTiers.find((t) => t.label);
  return first ? first.label : "Paliers en magasin";
}

/**
 * Lignes pour le verso « Récompenses ».
 * @param {{ points: number; label: string }[]} sortedTiers
 * @returns {string[]}
 */
export function backRewardLinesFromSortedTiers(sortedTiers) {
  return sortedTiers.map((t) => `${t.points} pts = ${t.label || "Récompense"}`);
}
