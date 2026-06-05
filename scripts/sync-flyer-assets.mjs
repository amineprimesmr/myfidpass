#!/usr/bin/env node
/**
 * Sync assets flyer : source unique → apps iOS + Android.
 *
 * Source : fidelity/frontend/public/assets/
 *   - flyers/template{n}.png + manifest.json
 *   - flyer-wheels/flyergame.png, giftflyer.png
 *
 * Cibles :
 *   - myfidpass/Assets.xcassets/fondtemplate/template{n}.imageset/
 *   - myfidpass/Assets.xcassets/flyergame.imageset/ + giftflyer.imageset/
 *   - myfidpass/android/.../drawable-nodpi/flyer_template_{n}.png
 *
 * Usage : npm run sync-flyer-assets
 * Env   : MYFIDPASS_ROOT=/chemin/vers/myfidpass ( défaut : ../myfidpass depuis fidelity )
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIDELITY_ROOT = join(__dirname, "..");
const PUBLIC = join(FIDELITY_ROOT, "frontend", "public", "assets");
const FLYERS_DIR = join(PUBLIC, "flyers");
const WHEELS_DIR = join(PUBLIC, "flyer-wheels");
const MYFIDPASS_ROOT = process.env.MYFIDPASS_ROOT || join(FIDELITY_ROOT, "..", "myfidpass");
const IOS_FOND = join(MYFIDPASS_ROOT, "myfidpass", "Assets.xcassets", "fondtemplate");
const IOS_XCASSETS = join(MYFIDPASS_ROOT, "myfidpass", "Assets.xcassets");
const ANDROID_DRAWABLE = join(MYFIDPASS_ROOT, "android", "app", "src", "main", "res", "drawable-nodpi");

const FLYER_EXPORT_W = 4096;
const FLYER_EXPORT_H = 6144;

function pngSize(path) {
  try {
    const buf = readFileSync(path);
    if (buf.length < 24 || buf[0] !== 0x89) return null;
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  } catch {
    return null;
  }
}

function imagesetContents(pngName) {
  return {
    images: [{ filename: pngName, idiom: "universal", scale: "1x" }],
    info: { author: "sync-flyer-assets", version: 1 },
  };
}

function syncTemplate(n, srcPath) {
  const key = `template${n}`;
  const iosSet = join(IOS_FOND, `${key}.imageset`);
  const destName = `${key}.png`;
  mkdirSync(iosSet, { recursive: true });
  for (const f of readdirSync(iosSet)) {
    if (f === "Contents.json") continue;
    rmSync(join(iosSet, f), { force: true });
  }
  copyFileSync(srcPath, join(iosSet, destName));
  writeFileSync(join(iosSet, "Contents.json"), `${JSON.stringify(imagesetContents(destName), null, 2)}\n`);
  copyFileSync(srcPath, join(ANDROID_DRAWABLE, `flyer_template_${n}.png`));
}

/** @param {"flyergame"|"giftflyer"} assetName */
function syncWheelImageset(assetName, srcPath) {
  const set = join(IOS_XCASSETS, `${assetName}.imageset`);
  const destName = `${assetName}.png`;
  mkdirSync(set, { recursive: true });
  for (const f of readdirSync(set)) {
    if (f === "Contents.json") continue;
    rmSync(join(set, f), { force: true });
  }
  copyFileSync(srcPath, join(set, destName));
  writeFileSync(join(set, "Contents.json"), `${JSON.stringify(imagesetContents(destName), null, 2)}\n`);
  copyFileSync(srcPath, join(ANDROID_DRAWABLE, `flyer_${assetName}.png`));
}

function main() {
  if (!statSync(FLYERS_DIR).isDirectory()) {
    console.error("Dossier introuvable:", FLYERS_DIR);
    process.exit(1);
  }
  if (!statSync(MYFIDPASS_ROOT).isDirectory()) {
    console.error("myfidpass introuvable:", MYFIDPASS_ROOT, "— définir MYFIDPASS_ROOT");
    process.exit(1);
  }

  mkdirSync(IOS_FOND, { recursive: true });
  mkdirSync(ANDROID_DRAWABLE, { recursive: true });

  const manifestPath = join(FLYERS_DIR, "manifest.json");
  /** @type {{ file: string }[]} */
  let manifest = [];
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    console.warn("manifest.json illisible — scan template*.png");
  }

  const templateFiles =
    manifest.length > 0
      ? manifest.map((e) => String(e.file || "").trim()).filter((f) => /^template\d+\.png$/i.test(f))
      : readdirSync(FLYERS_DIR).filter((f) => /^template\d+\.png$/i.test(f));

  if (!templateFiles.length) {
    console.error("Aucun template*.png dans", FLYERS_DIR);
    process.exit(1);
  }

  console.log("Sync flyer templates → iOS + Android");
  for (const file of templateFiles) {
    const m = /^template(\d+)\.png$/i.exec(file);
    if (!m) continue;
    const n = Number(m[1]);
    const src = join(FLYERS_DIR, file);
    if (!statSync(src).isFile()) {
      console.warn("  skip (manquant):", file);
      continue;
    }
    const dim = pngSize(src);
    if (dim) {
      const ratio = dim.w / dim.h;
      const targetRatio = FLYER_EXPORT_W / FLYER_EXPORT_H;
      const ratioOk = Math.abs(ratio - targetRatio) < 0.02;
      const resOk = dim.w >= FLYER_EXPORT_W * 0.9 && dim.h >= FLYER_EXPORT_H * 0.9;
      if (!resOk) {
        console.warn(
          `  ⚠ ${file} ${dim.w}×${dim.h} — cible 4K : ${FLYER_EXPORT_W}×${FLYER_EXPORT_H} (ratio 2:3)`
        );
      } else if (!ratioOk) {
        console.warn(`  ⚠ ${file} ratio ${ratio.toFixed(3)} ≠ 2:3`);
      }
    }
    syncTemplate(n, src);
    console.log(`  ✓ ${file} → fondtemplate/${file} + flyer_template_${n}.png`);
  }

  console.log("\nSync roue / cadeau → iOS xcassets + Android");
  for (const [assetName, file] of [
    ["flyergame", "flyergame.png"],
    ["giftflyer", "giftflyer.png"],
  ]) {
    const p = join(WHEELS_DIR, file);
    try {
      if (!statSync(p).isFile()) {
        console.warn(`  ⚠ manquant: flyer-wheels/${file}`);
        continue;
      }
      const dim = pngSize(p);
      syncWheelImageset(assetName, p);
      console.log(
        `  ✓ ${file}${dim ? ` (${dim.w}×${dim.h})` : ""} → ${assetName}.imageset + flyer_${assetName}.png`
      );
    } catch {
      console.warn(`  ⚠ manquant: flyer-wheels/${file}`);
    }
  }

  console.log("\nTerminé. Source unique : fidelity/frontend/public/assets/");
  console.log("Prochaine étape qualité 4K : remplacer template*.png par des PNG 4096×6144 puis relancer ce script.");
}

main();
