/**
 * Fragments SQL réutilisables pour les segments membres (sans import DB).
 */

/**
 * Clients réellement inactifs depuis N jours : au moins une visite enregistrée,
 * puis plus de passage depuis N jours. Exclut les nouveaux inscrits sans visite magasin.
 */
export function sqlInactiveMembersSinceDays(days) {
  const d = Math.max(1, Math.floor(Number(days) || 14));
  return `last_visit_at IS NOT NULL AND last_visit_at < datetime('now', '-${d} days')`;
}
