/**
 * Tampons (grille d'icônes sur le strip) : emoji, icônes perso, drawStampsOnStrip.
 * Référence : REFONTE-REGLES.md — pass.js découpé.
 * sharp chargé à la demande (Node 24).
 */
import { readdirSync, readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import {
  assetsDir,
  STRIP_W,
  STRIP_H,
  STAMP_R,
  STAMP_SIZE,
  STAMP_GAP,
  STAMP_TOP,
} from "./constants.js";
let _sharp = null;
async function getSharp() {
  if (!_sharp) _sharp = (await import("sharp")).default;
  return _sharp;
}

const iconsDir = resolve(assetsDir, "icons");
const iconsDirFallback = resolve(process.cwd(), "backend", "assets", "icons");
const STAMP_ICONS_DIR = existsSync(iconsDir) ? iconsDir : (existsSync(iconsDirFallback) ? iconsDirFallback : iconsDir);

const STAMP_ICONS_RAW = new Map();
function loadStampIconsAtStartup() {
  if (!existsSync(STAMP_ICONS_DIR)) return;
  try {
    const files = readdirSync(STAMP_ICONS_DIR, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".png"));
    for (const e of files) {
      const name = e.name.replace(/\.png$/i, "");
      const p = join(STAMP_ICONS_DIR, e.name);
      try {
        STAMP_ICONS_RAW.set(name, readFileSync(p));
      } catch (_) { /* ignore */ }
    }
  } catch (_) { /* ignore */ }
}
loadStampIconsAtStartup();
if (process.env.NODE_ENV === "production") {
  console.log("[PassKit] Icônes tampons préchargées:", STAMP_ICONS_DIR, "→", STAMP_ICONS_RAW.size, "fichiers");
}

async function fetchStampIconPng(stampIconKey) {
  const sharp = await getSharp();
  const iconPx = STAMP_SIZE - 8;
  const raw = (stampIconKey && String(stampIconKey).trim()) || "";
  const directName = raw.replace(/\.png$/i, "").replace(/\s/g, "");
  const fallback = "cafe";
  const candidates = [];
  if (directName.length >= 2 && directName.length <= 32 && !/[^\w\-_]/.test(directName)) {
    candidates.push(directName, directName.replace(/^Stamp/i, "").toLowerCase());
  }
  candidates.push(fallback, "iconcafe");

  const uniqueCandidates = [...new Set(candidates)];
  for (const name of uniqueCandidates) {
    const buf = STAMP_ICONS_RAW.get(name);
    if (!buf) continue;
    try {
      const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
      return await sharp(Buffer.from(buf))
        .resize(128, 128, { fit: "contain", background: transparent })
        .resize(iconPx, iconPx, { fit: "contain", background: transparent })
        .png()
        .toBuffer();
    } catch (e) {
      console.warn("[PassKit] resize icône par nom failed:", name, e?.message);
    }
  }
  return null;
}

async function createStampIconOnlyPng(iconBuf, opacity = 1, opts = {}) {
  const sharp = await getSharp();
  const size = STAMP_SIZE;
  let pipeline = sharp(iconBuf)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha();
  if (opts.grayscale) {
    pipeline = pipeline.grayscale();
  }
  const normalized = await pipeline.png().toBuffer();
  let input = normalized;
  if (opacity < 1) {
    const { data, info } = await sharp(normalized).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const expectedLen = info.width * info.height * 4;
    if (data.length === expectedLen) {
      for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * opacity);
      input = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
    }
  }
  const padding = 2;
  const transparent = await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer();
  return sharp(transparent)
    .composite([{ input, left: padding, top: padding }])
    .png()
    .toBuffer();
}

/**
 * Grille de tampons sur le strip. customIconBase64 = image perso pour l'icône.
 * stripColorHex conservé pour compatibilité d’appel (ancien carré vide).
 */
export async function drawStampsOnStrip(
  baseStripBuf,
  templateKey,
  filledCount,
  stampMax,
  stampEmoji,
  customIconBase64,
  stripColorHex
) {
  void stripColorHex;
  const sharp = await getSharp();
  const cols = 5;
  const startX = (STRIP_W - (cols * STAMP_SIZE + (cols - 1) * STAMP_GAP)) / 2 + STAMP_R;
  const row0Y = STAMP_TOP + STAMP_R;
  const row1Y = row0Y + STAMP_SIZE + STAMP_GAP;
  const totalStamps = Math.min(Math.max(0, Number(stampMax) || 0), 10);
  const rewardIconByIndex = new Map();
  if (totalStamps >= 5) {
    const giftSilver = await fetchStampIconPng("giftsilver");
    if (giftSilver) rewardIconByIndex.set(4, giftSilver);
  }
  if (totalStamps >= 10) {
    const giftGold = await fetchStampIconPng("giftgold");
    if (giftGold) rewardIconByIndex.set(9, giftGold);
  }

  let iconBuf = null;
  if (customIconBase64 && String(customIconBase64).trim()) {
    try {
      const base64Data = String(customIconBase64).replace(/^data:image\/\w+;base64,/, "");
      const buf = Buffer.from(base64Data, "base64");
      if (buf.length > 0) {
        iconBuf = await sharp(buf)
          .resize(STAMP_SIZE, STAMP_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .ensureAlpha()
          .png()
          .toBuffer();
      }
    } catch (e) {
      if (process.env.NODE_ENV === "production") console.warn("[PassKit] Stamp custom icon failed:", e?.message);
    }
  }
  if (!iconBuf) {
    const stampIconKey = (stampEmoji && String(stampEmoji).trim()) || "cafe";
    iconBuf = await fetchStampIconPng(stampIconKey);
  }
  if (!iconBuf) {
    if (process.env.NODE_ENV === "production") {
      console.warn("[PassKit] Strip sans icônes (clé introuvable et fallback café absent)");
    }
    return baseStripBuf;
  }

  const composites = [];
  for (let i = 0; i < totalStamps; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = Math.round(startX + col * (STAMP_SIZE + STAMP_GAP));
    const cy = row === 0 ? row0Y : row1Y;
    const left = Math.max(0, cx - STAMP_R);
    const top = Math.max(0, cy - STAMP_R);
    const filled = i < filledCount;
    let stampBuf;
    try {
      const forcedRewardIcon = rewardIconByIndex.get(i) || null;
      const effectiveIcon = forcedRewardIcon || iconBuf;
      if (filled) {
        stampBuf = await createStampIconOnlyPng(effectiveIcon, 1);
      } else {
        // Même icône partout : passage non validé = désaturé + atténué (effet « non débloqué »).
        stampBuf = await createStampIconOnlyPng(effectiveIcon, 0.52, { grayscale: true });
      }
      if (stampBuf) composites.push({ input: stampBuf, left, top });
    } catch (e) {
      if (process.env.NODE_ENV === "production") console.warn("[PassKit] Stamp icon failed, skip:", e?.message);
    }
  }

  if (composites.length === 0) return baseStripBuf;
  return sharp(baseStripBuf)
    .composite(composites)
    .png()
    .toBuffer();
}
