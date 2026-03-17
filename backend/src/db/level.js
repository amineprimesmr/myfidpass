/**
 * Helper niveau membre (points → libellé). Référence : REFONTE-REGLES.md.
 */
export function getLevel(points) {
  if (points >= 500) return "Or";
  if (points >= 200) return "Argent";
  if (points >= 50) return "Bronze";
  return "Débutant";
}
