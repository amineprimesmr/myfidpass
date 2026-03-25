/**
 * Reset complet des données (POST /api/dev/reset). Partagé landing + espace /app.
 */
import { API_BASE, getAuthHeaders, clearAuthToken } from "../config.js";

export async function runDevDataReset() {
  if (!confirm("Supprimer tous les comptes, cartes, membres et données ? Cette action est irréversible.")) return;
  let secret = "";
  try {
    let res = await fetch(`${API_BASE}/api/dev/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ secret: secret || undefined }),
    });
    let data = await res.json().catch(() => ({}));
    if (res.status === 403) {
      secret = prompt("Secret requis (variable RESET_SECRET sur Railway) :");
      if (secret === null) return;
      res = await fetch(`${API_BASE}/api/dev/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ secret }),
      });
      data = await res.json().catch(() => ({}));
    }
    if (res.status === 403) {
      alert("Secret incorrect.");
      return;
    }
    if (res.status === 404) {
      alert("Reset désactivé en production (définir RESET_SECRET sur Railway pour l’activer).");
      return;
    }
    if (!res.ok) {
      alert(data.error || "Erreur lors du reset.");
      return;
    }
    clearAuthToken();
    alert("Toutes les données ont été supprimées.");
    window.location.replace("/");
  } catch (_e) {
    alert("Impossible de contacter l’API.");
  }
}
