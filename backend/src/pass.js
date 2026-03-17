/**
 * Point d'entrée Pass Apple Wallet.
 * Réfonte : code découpé dans ./pass/ (auth, constants, images-logo, images-strip, images-stamps, certs, build-buffers, generate).
 */
export { getPassAuthenticationToken } from "./pass/auth.js";
export { generatePass } from "./pass/generate.js";
