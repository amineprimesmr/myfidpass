/**
 * Configuration centralisée — lecture des variables d'environnement critiques.
 * Toutes les routes qui ont besoin de JWT_SECRET doivent l'importer d'ici.
 * Aucun fallback en dur : si la variable est absente, on plante immédiatement
 * avec un message clair plutôt que de signer des tokens avec un secret public.
 */

function requireEnv(name, minLength = 1) {
  const value = process.env[name];
  if (!value || value.length < minLength) {
    throw new Error(
      `[config] Variable d'environnement manquante ou trop courte : ${name} ` +
      `(minimum ${minLength} caractères). ` +
      `Sur Railway : Variables → ajouter ${name} puis redéployer.`
    );
  }
  return value;
}

/**
 * Retourne le JWT_SECRET. Lance une erreur si absent ou < 32 caractères.
 * Résultat mis en cache après le premier appel.
 */
let _jwtSecret = null;
export function getJwtSecret() {
  if (!_jwtSecret) {
    _jwtSecret = requireEnv("JWT_SECRET", 32);
  }
  return _jwtSecret;
}

/**
 * Retourne le PASSKIT_SECRET. Lance une erreur si absent ou < 32 caractères.
 */
let _passkitSecret = null;
export function getPasskitSecret() {
  if (!_passkitSecret) {
    _passkitSecret = requireEnv("PASSKIT_SECRET", 32);
  }
  return _passkitSecret;
}

/**
 * Indique si on est en production (NODE_ENV === "production").
 */
export const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * URL du frontend (pour CORS, redirections Apple OAuth, etc.)
 */
export const FRONTEND_URL = (process.env.FRONTEND_URL || "https://myfidpass.fr").replace(/\/$/, "");
