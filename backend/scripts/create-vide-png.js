#!/usr/bin/env node
/**
 * Crée assets/icons/vide.png (image par défaut pour les tampons non débloqués) si absent.
 * PNG 128×128 entièrement transparent. À remplacer par un design personnalisé si besoin.
 */
import { writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, "..", "assets", "icons");
const videPath = join(iconsDir, "vide.png");

if (existsSync(videPath)) {
  console.log("vide.png existe déjà, rien à faire.");
  process.exit(0);
}

const size = 128;
const transparent = await sharp({
  create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .png()
  .toBuffer();

writeFileSync(videPath, transparent);
console.log("Créé:", videPath, `(${size}×${size} px, transparent)`);
