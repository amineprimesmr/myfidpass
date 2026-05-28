/**
 * Libellé du palier 10 pts (récompense inscription / jeu roulette).
 */
import { getDb } from "../db/connection.js";

/**
 * @param {string} businessId
 * @returns {string}
 */
export function resolveSignupRewardLabelForBusiness(businessId) {
  if (!businessId) return "";
  try {
    const db = getDb();
    const gift = db
      .prepare(
        `SELECT gr.label FROM game_rewards gr
         INNER JOIN business_games bg ON bg.game_id = gr.game_id AND bg.business_id = gr.business_id
         INNER JOIN games g ON g.id = gr.game_id AND g.code = 'roulette'
         WHERE gr.business_id = ? AND gr.code = 'cadeau' AND gr.active = 1
         LIMIT 1`,
      )
      .get(businessId);
    if (gift?.label) return String(gift.label).trim();
  } catch (_) {
    /* tables jeu absentes */
  }
  return "";
}
