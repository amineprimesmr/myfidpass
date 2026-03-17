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
import {
  hexToRgb,
  createEmptyStampPng,
  createEmptyStampOutlinePng,
  createFilledStampCirclePng,
} from "./images-strip.js";

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

const ICON_ALIASES = {
  "2615": ["cafe", "iconcafe"],
  "1f355": ["pizza"],
  "1f354": ["burger"],
  "1f32e": ["kebab"],
  "1f363": ["sushi"],
  "1f957": ["salade"],
  "1f950": ["croissant"],
  "1f356": ["steak"],
  "1f35e": ["riz"],
  "1f956": ["baguette"],
  "1f381": ["giftgold", "giftsilver"],
  "2705": ["checkvert"],
};

function emojiToCodepoint(emoji) {
  if (!emoji || typeof emoji !== "string") return "2615";
  const str = String(emoji).trim();
  if (!str.length) return "2615";
  const parts = [];
  for (let i = 0; i < str.length; ) {
    const cp = str.codePointAt(i);
    i += cp > 0xffff ? 2 : 1;
    if (cp === 0xfe0f) continue;
    parts.push(cp.toString(16).toLowerCase());
  }
  return parts.length ? parts.join("_") : "2615";
}

async function loadCustomStampImage(emojiKey, emojiPx) {
  const sharp = await getSharp();
  const baseName = `icon_${emojiKey.replace(/-/g, "_")}`;
  const candidates = [baseName];
  const aliases = ICON_ALIASES[emojiKey];
  if (aliases) aliases.forEach((a) => candidates.push(a));
  if (emojiKey === "2615") candidates.push("iconcafe");
  let rawBuf = null;
  for (const name of candidates) {
    rawBuf = STAMP_ICONS_RAW.get(name);
    if (rawBuf) break;
  }
  if (!rawBuf) {
    console.warn("[PassKit] Aucune icône préchargée pour", emojiKey, "— candidats:", candidates.join(", "));
    return null;
  }
  try {
    const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
    return await sharp(Buffer.from(rawBuf))
      .resize(128, 128, { fit: "contain", background: transparent })
      .resize(emojiPx, emojiPx, { fit: "contain", background: transparent })
      .png()
      .toBuffer();
  } catch (e) {
    console.warn("[PassKit] Erreur resize icône", emojiKey, e?.message);
    return null;
  }
}

async function fetchEmojiPng(stampEmoji) {
  const sharp = await getSharp();
  const str = (stampEmoji && String(stampEmoji).trim()) || "";
  const emojiPxDefault = STAMP_SIZE - 8;
  const directName = str.replace(/\.png$/i, "").replace(/\s/g, "");
  if (directName.length >= 2 && directName.length <= 32 && !/[^\w\-_]/.test(directName)) {
    const normalized = directName.replace(/^Stamp/i, "").toLowerCase();
    const candidates = [directName, normalized];
    for (const name of candidates) {
      const buf = STAMP_ICONS_RAW.get(name);
      if (buf) {
        try {
          const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
          return await sharp(Buffer.from(buf))
            .resize(128, 128, { fit: "contain", background: transparent })
            .resize(emojiPxDefault, emojiPxDefault, { fit: "contain", background: transparent })
            .png()
            .toBuffer();
        } catch (e) {
          console.warn("[PassKit] resize icône par nom failed:", name, e?.message);
        }
      }
    }
  }
  const key = emojiToCodepoint(str || "☕");
  const emojiPx = key === "2615" ? STAMP_SIZE - 4 : emojiPxDefault;
  return loadCustomStampImage(key, emojiPx);
}

async function createFilledStampWithEmojiPng(hexColor, stampEmoji = "☕") {
  const sharp = await getSharp();
  const circleRgb = hexToRgb(hexColor || "#5d4e37");
  const circlePng = createFilledStampCirclePng(circleRgb);
  const emojiChar = (typeof stampEmoji === "string" && stampEmoji.trim()) ? stampEmoji.trim()[0] : "☕";
  try {
    const emojiBuf = await fetchEmojiPng(emojiChar);
    if (emojiBuf) {
      const padding = 2;
      return await sharp(circlePng)
        .composite([{ input: emojiBuf, left: padding, top: padding }])
        .png()
        .toBuffer();
    }
  } catch (e) {
    console.warn("[PassKit] createFilledStampWithEmojiPng composite failed:", e?.message);
  }
  return null;
}

async function createEmptyStampWithEmojiPng(strokeRgb, stampEmoji = "☕") {
  const sharp = await getSharp();
  const emojiChar = (typeof stampEmoji === "string" && stampEmoji.trim()) ? stampEmoji.trim()[0] : "☕";
  const isCoffee = emojiToCodepoint(emojiChar) === "2615";
  const emptyPng = isCoffee
    ? createEmptyStampOutlinePng(strokeRgb)
    : createEmptyStampPng(strokeRgb);
  try {
    const emojiBuf = await fetchEmojiPng(emojiChar);
    if (!emojiBuf) return emptyPng;
    const opacity = isCoffee ? 0.75 : 0.6;
    const { data, info } = await sharp(emojiBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * opacity);
    const fadedEmoji = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
    const padding = isCoffee ? 2 : 4;
    return await sharp(emptyPng)
      .composite([{ input: fadedEmoji, left: padding, top: padding }])
      .png()
      .toBuffer();
  } catch (e) {
    return emptyPng;
  }
}

async function createStampIconOnlyPng(iconBuf, opacity = 1) {
  const sharp = await getSharp();
  const size = STAMP_SIZE;
  const normalized = await sharp(iconBuf)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .png()
    .toBuffer();
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

async function createEmptyStampFromIcon(iconBuf) {
  const sharp = await getSharp();
  const size = STAMP_SIZE;
  const padding = 2;
  const normalized = await sharp(iconBuf)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .png()
    .toBuffer();
  const greyed = await sharp(normalized)
    .grayscale()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data, info } = greyed;
  const expectedLen = info.width * info.height * 4;
  if (data.length !== expectedLen) {
    return sharp({
      create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } },
    })
      .png()
      .toBuffer();
  }
  for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * 0.5);
  const input = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
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
 */
export async function drawStampsOnStrip(baseStripBuf, templateKey, filledCount, stampMax, stampEmoji, customIconBase64) {
  const sharp = await getSharp();
  const cols = 5;
  const startX = (STRIP_W - (cols * STAMP_SIZE + (cols - 1) * STAMP_GAP)) / 2 + STAMP_R;
  const row0Y = STAMP_TOP + STAMP_R;
  const row1Y = row0Y + STAMP_SIZE + STAMP_GAP;

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
    const emojiForStamp = (stampEmoji && String(stampEmoji).trim()) || "☕";
    iconBuf = await fetchEmojiPng(emojiForStamp);
  }
  if (!iconBuf) {
    if (process.env.NODE_ENV === "production") console.warn("[PassKit] Strip sans icônes (fichier introuvable pour emoji)", emojiToCodepoint((stampEmoji && String(stampEmoji).trim()) || "☕"));
    return baseStripBuf;
  }

  let emptyStampBuf = null;
  const composites = [];
  for (let i = 0; i < Math.min(stampMax, 10); i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = Math.round(startX + col * (STAMP_SIZE + STAMP_GAP));
    const cy = row === 0 ? row0Y : row1Y;
    const left = Math.max(0, cx - STAMP_R);
    const top = Math.max(0, cy - STAMP_R);
    const filled = i < filledCount;
    let stampBuf;
    try {
      if (filled) {
        stampBuf = await createStampIconOnlyPng(iconBuf, 1);
      } else {
        if (emptyStampBuf === null) emptyStampBuf = await createEmptyStampFromIcon(iconBuf);
        stampBuf = emptyStampBuf;
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
