/**
 * Appels serveur à l’API RevenueCat (nécessite REVENUECAT_SECRET_API_KEY sur Railway).
 * @see https://www.revenuecat.com/docs/projects/authentication
 */

import { getRevenueCatSecretApiKey } from "../lib/config.js";
import logger from "../lib/logger.js";

const BASE = "https://api.revenuecat.com/v1";

/**
 * Récupère l’objet subscriber RevenueCat pour un app_user_id (ex. id utilisateur MyFidpass).
 * @returns {Promise<object|null>} JSON ou null si clé absente / erreur.
 */
export async function fetchRevenueCatSubscriber(appUserId) {
  const key = getRevenueCatSecretApiKey();
  if (!key) {
    logger.debug("[revenuecat-api] REVENUECAT_SECRET_API_KEY absente — skip fetch");
    return null;
  }
  const id = String(appUserId || "").trim();
  if (!id) return null;

  const url = `${BASE}/subscribers/${encodeURIComponent(id)}`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn(
        { status: res.status, body: text.slice(0, 200) },
        "[revenuecat-api] subscriber fetch failed",
      );
      return null;
    }
    return await res.json();
  } catch (e) {
    logger.error({ err: e }, "[revenuecat-api] subscriber fetch error");
    return null;
  }
}
