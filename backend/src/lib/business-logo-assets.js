/**
 * Logo fichier sur disque (même source que buildBuffers pour le pass Wallet).
 * Référence : REFONTE-REGLES.md.
 */
import { join } from "path";
import { existsSync, readFileSync } from "fs";
import { assetsDir } from "../pass/constants.js";

function tryReadInDir(dir, filenames) {
  for (const name of filenames) {
    const p = join(dir, name);
    if (existsSync(p)) {
      const isPng = name.endsWith(".png");
      return { buffer: readFileSync(p), contentType: isPng ? "image/png" : "image/jpeg" };
    }
  }
  return null;
}

/**
 * @param {string} businessId
 * @returns {{ buffer: Buffer, contentType: string } | null}
 */
export function getBusinessLogoFileForPublic(businessId) {
  if (!businessId) return null;
  const dir = join(assetsDir, "businesses", businessId);
  if (!existsSync(dir)) return null;
  const fromLogo = tryReadInDir(dir, ["logo@2x.png", "logo.png"]);
  if (fromLogo) return fromLogo;
  return tryReadInDir(dir, ["icon@2x.png", "icon.png"]);
}

export function businessHasFileLogoForPublic(businessId) {
  return getBusinessLogoFileForPublic(businessId) != null;
}
