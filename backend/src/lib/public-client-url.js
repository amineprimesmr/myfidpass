import { getBusinessGames } from "../db/games.js";

/**
 * URL publique espace client : ajoute ?qr=1 si la roue est activée (parcours complet jeu + missions).
 * @param {string} frontendBase ex. https://www.myfidpass.fr
 * @param {string} slug
 * @param {string} businessId
 */
export function buildPublicFidelityClientUrl(frontendBase, slug, businessId) {
  const fe = String(frontendBase || "https://www.myfidpass.fr").replace(/\/$/, "");
  const path = `/fidelity/${encodeURIComponent(String(slug || "").trim())}`;
  const games = getBusinessGames(businessId);
  const roulette = games.find((g) => g.game_code === "roulette" && g.enabled);
  return roulette ? `${fe}${path}?qr=1` : `${fe}${path}`;
}
