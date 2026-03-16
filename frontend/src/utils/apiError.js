/**
 * Helpers centralisés pour les erreurs API et l’échappement de contenu serveur (XSS).
 */

export function escapeHtmlForServer(s) {
  if (s == null || s === undefined) return "";
  const div = document.createElement("div");
  div.textContent = String(s);
  return div.innerHTML;
}

export function getApiErrorMessage(res, data) {
  if (data?.error && typeof data.error === "string") return data.error;
  if (!res) return "Erreur réseau. Vérifiez votre connexion.";
  const status = res.status;
  if (status === 401) return "Session expirée. Reconnectez-vous.";
  if (status === 403) return "Accès refusé.";
  if (status === 404) return "Ressource introuvable.";
  if (status === 429) return "Trop de tentatives. Réessayez plus tard.";
  if (status >= 500) return "Erreur serveur. Réessayez plus tard.";
  return "Une erreur est survenue.";
}

export function showApiError(res, data, errEl) {
  if (!errEl) return;
  errEl.textContent = getApiErrorMessage(res, data);
  errEl.classList.remove("hidden");
}
