/**
 * Gestion des refresh tokens en base (rotation à chaque usage).
 * Un refresh token ne peut être utilisé qu'une seule fois — il est remplacé
 * à chaque appel à POST /auth/refresh (refresh token rotation).
 */
import db from "./connection.js";

/**
 * Crée un refresh token pour un utilisateur.
 * @param {number} userId
 * @param {string} token  — UUID aléatoire généré par la route auth
 * @param {string} expiresAt — ISO date string
 */
export function createRefreshToken(userId, token, expiresAt) {
  db.prepare(
    "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)"
  ).run(userId, token, expiresAt);
}

/**
 * Récupère un refresh token par sa valeur.
 * Retourne null si introuvable ou expiré.
 * @param {string} token
 * @returns {{ id: number, user_id: number, token: string, expires_at: string } | null}
 */
export function getRefreshToken(token) {
  const row = db
    .prepare("SELECT * FROM refresh_tokens WHERE token = ?")
    .get(token);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    // Nettoyage à la volée
    db.prepare("DELETE FROM refresh_tokens WHERE id = ?").run(row.id);
    return null;
  }
  return row;
}

/**
 * Supprime un refresh token spécifique (logout ou rotation).
 * @param {string} token
 */
export function deleteRefreshToken(token) {
  db.prepare("DELETE FROM refresh_tokens WHERE token = ?").run(token);
}

/**
 * Supprime tous les refresh tokens d'un utilisateur (logout global).
 * @param {number} userId
 */
export function deleteUserRefreshTokens(userId) {
  db.prepare("DELETE FROM refresh_tokens WHERE user_id = ?").run(userId);
}

/**
 * Supprime les refresh tokens expirés (à appeler périodiquement au démarrage ou via cron).
 */
export function cleanExpiredRefreshTokens() {
  db.prepare("DELETE FROM refresh_tokens WHERE expires_at <= datetime('now')").run();
}
