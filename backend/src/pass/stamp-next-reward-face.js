/**
 * Texte face avant : label « Dans x passages » + valeur = libellé récompense marchand.
 * Aligné sur l’aperçu iOS `CafeDesArtsCardPreview` (règles paliers 5ᵉ / carte complète).
 *
 * @param {Object} p
 * @param {number} p.stampsCollected - tampons obtenus (≥ 0)
 * @param {number} p.totalStamps - objectif carte (≥ 1)
 * @param {string} [p.midReward] - récompense intermédiaire (ex. 5ᵉ passage)
 * @param {string} [p.finalReward] - récompense finale
 * @returns {{ label: string, value: string }}
 */
export function stampNextRewardFaceLabelAndValue({
  stampsCollected,
  totalStamps,
  midReward = "",
  finalReward = "",
}) {
  const total = Math.max(1, Math.min(50, Number(totalStamps) || 10));
  const filled = Math.min(Math.max(0, Math.floor(Number(stampsCollected) || 0)), total);
  const mid = String(midReward ?? "").trim();
  const fin = String(finalReward ?? "").trim();

  const dansLabel = (need) => {
    if (need <= 0) return "Objectif atteint";
    if (need === 1) return "Dans 1 passage";
    return `Dans ${need} passages`;
  };

  if (filled >= total) {
    return { label: "Objectif atteint", value: fin || "—" };
  }
  if (total <= 5) {
    const need = total - filled;
    return { label: dansLabel(need), value: fin || "Récompense" };
  }
  if (filled < 5) {
    const need = 5 - filled;
    return { label: dansLabel(need), value: mid || "Récompense au 5ᵉ passage" };
  }
  const need = total - filled;
  return { label: dansLabel(need), value: fin || "Récompense à la carte complète" };
}
