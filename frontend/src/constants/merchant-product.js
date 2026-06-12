/**
 * Stratégie produit : dashboard commerçant = apps iOS/Android uniquement.
 * Le web /app reste accessible pour les sessions existantes (checkout redirect, support)
 * mais n’est plus la cible des nouvelles features.
 */
export const MERCHANT_WEB_APP_FROZEN = true;

/** Liens stores — mis à jour lors des publications. */
export const MERCHANT_APP_DOWNLOAD_PATH = "/get";

export const MERCHANT_WEB_APP_FROZEN_BANNER =
  "L’espace commerçant web n’est plus maintenu. Utilisez l’application MyFidpass (iOS ou Android) pour gérer votre commerce.";
