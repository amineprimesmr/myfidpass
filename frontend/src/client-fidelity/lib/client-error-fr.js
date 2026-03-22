/**
 * Messages utilisateur en français pour les erreurs réseau / navigateur
 * (évite d’afficher « Failed to fetch », etc.).
 */

/**
 * @param {unknown} err
 * @param {string} [fallback]
 * @returns {string}
 */
export function messageUtilisateurPourErreur(err, fallback = "Une erreur est survenue. Réessaie.") {
  if (err == null) return fallback;
  const name = String(/** @type {{ name?: string }} */ (err).name || "");
  const raw = String(
    /** @type {{ message?: string }} */ (err).message != null
      ? /** @type {{ message?: string }} */ (err).message
      : err,
  ).trim();
  const low = raw.toLowerCase();

  if (
    name === "TypeError" &&
    (low.includes("fetch") || low.includes("network") || low.includes("load failed"))
  ) {
    return "Connexion impossible. Vérifie ta connexion ou que le serveur est bien démarré (en local : backend + front).";
  }
  if (low === "failed to fetch" || low.includes("failed to fetch")) {
    return "Connexion impossible. Vérifie ta connexion ou que le serveur est bien démarré.";
  }
  if (low.includes("networkerror") || low.includes("erreur réseau")) {
    return "Problème réseau. Réessaie dans un instant.";
  }
  if (low === "aborted" || low.includes("abort")) {
    return "Requête interrompue. Réessaie.";
  }

  /* Chaînes API parfois en anglais */
  if (low === "not found") return "Ressource introuvable.";
  if (low === "unauthorized") return "Accès refusé. Reconnecte-toi si besoin.";
  if (low === "forbidden") return "Action non autorisée.";

  return raw || fallback;
}
