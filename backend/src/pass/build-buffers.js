/**
 * Construction des buffers d'images pour un pass (logo, icon, strip).
 * Référence : REFONTE-REGLES.md — pass.js découpé.
 */
import { join } from "path";
import { existsSync } from "fs";
import { assetsDir } from "./constants.js";
import { createStripBuffer, createDefaultIconBuffer } from "./images-strip.js";
import { loadImageFromDir } from "./certs.js";
import { PASS_TEMPLATES } from "./constants.js";

/**
 * Priorité : dossier entreprise (assets/businesses/:id/) puis dossier global.
 */
export function buildBuffers(businessId, options = {}) {
  const buffers = {};
  const businessDir = businessId ? join(assetsDir, "businesses", businessId) : null;
  const dirs = businessDir && existsSync(businessDir) ? [businessDir, assetsDir] : [assetsDir];

  for (const dir of dirs) {
    const logo = loadImageFromDir(dir, "logo@2x.png") || loadImageFromDir(dir, "logo.png");
    const icon = loadImageFromDir(dir, "icon@2x.png") || loadImageFromDir(dir, "icon.png");
    const strip = loadImageFromDir(dir, "strip@2x.png") || loadImageFromDir(dir, "strip.png");
    if (logo) buffers["logo.png"] = logo;
    if (icon) buffers["icon.png"] = icon;
    if (strip) buffers["strip.png"] = strip;
    if (Object.keys(buffers).length > 0) break;
  }

  if (!buffers["icon.png"]) {
    buffers["icon.png"] = createDefaultIconBuffer(options.template);
  }
  if (!buffers["logo.png"] && buffers["icon.png"]) {
    buffers["logo.png"] = buffers["icon.png"];
  }
  const templateKey = options.template;
  if (!buffers["strip.png"] && templateKey && PASS_TEMPLATES[templateKey]) {
    const stripBuffer = createStripBuffer(templateKey);
    buffers["strip.png"] = stripBuffer;
    buffers["strip@2x.png"] = stripBuffer;
  }
  return buffers;
}
