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
 * Lignes brutes (tests / compat).
 * @param {{ points: number; label: string }[]} sortedTiers
 * @returns {string[]}
 */
export function backRewardLinesFromSortedTiers(sortedTiers) {
  return sortedTiers.map((t) => `${t.points} pts = ${t.label || "Récompense"}`);
}

/**
 * Texte verso du champ paliers : intro + une ligne par palier (atteint / prochain / à venir).
 * @param {{ points: number; label: string }[]} sortedTiers
 * @param {number} memberPoints
 * @returns {string}
 */
export function formatBackRewardsFieldValue(sortedTiers, memberPoints) {
  const pts = Math.max(0, Math.floor(Number(memberPoints) || 0));
  if (!sortedTiers.length) {
    return "Les paliers sont définis par le commerce. Renseignez-vous en magasin.";
  }
  const lines = [];
  let foundNext = false;
  for (const t of sortedTiers) {
    const p = Number(t.points);
    const lbl = (t.label && String(t.label).trim()) || "Récompense";
    if (pts >= p) {
      lines.push(`✓  ${p} pts — ${lbl}`);
    } else if (!foundNext) {
      lines.push(`→  ${p} pts — ${lbl}`);
      foundNext = true;
    } else {
      lines.push(`○  ${p} pts — ${lbl}`);
    }
  }
  return [
    "Cumulez des points et présentez cette carte pour profiter de chaque avantage.",
    "",
    ...lines,
  ].join("\n");
}
