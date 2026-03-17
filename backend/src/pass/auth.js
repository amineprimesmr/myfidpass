/**
 * Token d'authentification PassKit (HMAC sur serialNumber).
 * Référence : REFONTE-REGLES.md — pass.js découpé.
 */
import { createHmac } from "crypto";

/** Min 16 caractères requis par Apple. */
export function getPassAuthenticationToken(serialNumber) {
  const secret = process.env.PASSKIT_SECRET || "fidpass-default-secret-change-in-production";
  return createHmac("sha256", secret).update(serialNumber).digest("hex").slice(0, 32);
}
