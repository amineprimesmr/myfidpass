#!/usr/bin/env node
/**
 * Copie l’image `banner` (Assets.xcassets) de l’app iOS vers le PNG utilisé pour le strip Wallet
 * « sans image de fond » : backend/src/pass/assets/default-points-strip.png
 *
 * Usage :
 *   npm run sync:wallet-strip
 *   MYFIDPASS_IOS_ROOT=/absolu/vers/myfidpass/myfidpass npm run sync:wallet-strip
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(__dirname, "..");
const destDir = join(backendRoot, "src/pass/assets");
const dest = join(destDir, "default-points-strip.png");

const myfidpassRoot = process.env.MYFIDPASS_IOS_ROOT
  ? resolve(process.env.MYFIDPASS_IOS_ROOT)
  : resolve(backendRoot, "..", "..", "myfidpass", "myfidpass");

const bannerSet = join(myfidpassRoot, "Assets.xcassets", "banner.imageset");
const contentsPath = join(bannerSet, "Contents.json");

if (!existsSync(contentsPath)) {
  console.error("sync-default-strip: introuvable:", contentsPath);
  console.error("  Exporter MYFIDPASS_IOS_ROOT=/chemin/vers/myfidpass/myfidpass (dossier contenant Assets.xcassets).");
  process.exit(1);
}

const contents = JSON.parse(readFileSync(contentsPath, "utf8"));
const images = contents.images || [];
const pick = (scale) => images.find((im) => im.scale === scale && im.filename);
const filename = pick("3x")?.filename || pick("2x")?.filename || pick("1x")?.filename;
if (!filename) {
  console.error("sync-default-strip: aucune image dans banner.imageset (Contents.json).");
  process.exit(1);
}

const src = join(bannerSet, filename);
if (!existsSync(src)) {
  console.error("sync-default-strip: fichier manquant:", src);
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log("OK — bannière Wallet (mode points, sans image perso) :");
console.log(" ", src);
console.log(" →", dest);
