import { createHmac } from "crypto";
import { PKPass } from "passkit-generator";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";
import sharp from "sharp";
import { getLevel } from "./db.js";

/** Dimensions Apple pour le logo du pass : logo@2x = 320×100 px, logo = 160×50 px. */
const LOGO_WIDTH_2X = 320;
const LOGO_HEIGHT_2X = 100;
const LOGO_WIDTH_1X = 160;
const LOGO_HEIGHT_1X = 50;

/** Dimensions Apple pour l’icône du pass (affichée dans les notifications et sur l’écran de verrouillage). */
const ICON_SIZE_1X = 29;
const ICON_SIZE_2X = 58;
const ICON_SIZE_3X = 87;

/**
 * Redimensionne et convertit en PNG le buffer image (PNG/JPEG) pour respecter les specs Apple.
 * Retourne { logoPng: Buffer (160×50), logoPng2x: Buffer (320×100) } ou null en cas d'erreur.
 */
async function resizeLogoForPass(inputBuffer) {
  if (!inputBuffer || inputBuffer.length === 0) return null;
  try {
    const pipeline = sharp(inputBuffer);
    const meta = await pipeline.metadata();
    if (!meta.width || !meta.height) return null;
    const out2x = await sharp(inputBuffer)
      .resize(LOGO_WIDTH_2X, LOGO_HEIGHT_2X, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const out1x = await sharp(inputBuffer)
      .resize(LOGO_WIDTH_1X, LOGO_HEIGHT_1X, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    return { logoPng: out1x, logoPng2x: out2x };
  } catch (err) {
    console.warn("[PassKit] resizeLogoForPass failed:", err.message);
    return null;
  }
}

/**
 * Génère les icônes du pass (29×29, 58×58, 87×87) à partir du logo.
 * C’est cette icône qui s’affiche dans les notifications Wallet sur l’iPhone.
 * iOS 18 : fond transparent → rendu incorrect (carré vert / placeholder). On utilise un fond blanc opaque.
 * Retourne { iconPng, iconPng2x, iconPng3x } ou null.
 */
async function resizeLogoForPassIcon(inputBuffer) {
  if (!inputBuffer || inputBuffer.length === 0) return null;
  try {
    // Fond blanc opaque pour éviter le bug iOS 18 (icône notification non affichée avec fond transparent)
    const opts = { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } };
    const [iconPng, iconPng2x, iconPng3x] = await Promise.all([
      sharp(inputBuffer).resize(ICON_SIZE_1X, ICON_SIZE_1X, opts).png().toBuffer(),
      sharp(inputBuffer).resize(ICON_SIZE_2X, ICON_SIZE_2X, opts).png().toBuffer(),
      sharp(inputBuffer).resize(ICON_SIZE_3X, ICON_SIZE_3X, opts).png().toBuffer(),
    ]);
    return { iconPng, iconPng2x, iconPng3x };
  } catch (err) {
    console.warn("[PassKit] resizeLogoForPassIcon failed:", err.message);
    return null;
  }
}

/** Token d'authentification PassKit (HMAC sur serialNumber) — min 16 caractères requis par Apple. */
export function getPassAuthenticationToken(serialNumber) {
  const secret = process.env.PASSKIT_SECRET || "fidpass-default-secret-change-in-production";
  return createHmac("sha256", secret).update(serialNumber).digest("hex").slice(0, 32);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(__dirname, "..", "assets");
const certsDir = join(__dirname, "..", "certs");

/** Génère une icône PNG 29x29 (requise par Apple). Couleur grise par défaut, ou couleur du template (labelColor) pour un rendu plus pro. */
function createDefaultIconBuffer(templateKey) {
  const size = 29;
  const colors = templateKey && PASS_TEMPLATES[templateKey] ? hexToRgb(PASS_TEMPLATES[templateKey].labelColor) : { r: 0x6b, g: 0x6b, b: 0x6b };
  const png = new PNG({ width: size, height: size });
  png.data = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const i = (y * size + x) * 4;
      if (d <= r) {
        png.data[i] = colors.r;
        png.data[i + 1] = colors.g;
        png.data[i + 2] = colors.b;
        png.data[i + 3] = 255;
      } else {
        png.data[i] = 0;
        png.data[i + 1] = 0;
        png.data[i + 2] = 0;
        png.data[i + 3] = 0;
      }
    }
  }
  return PNG.sync.write(png);
}

/** Parse une couleur hex (#rrggbb) en { r, g, b }. */
function hexToRgb(hex) {
  const n = parseInt(hex.replace(/^#/, ""), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/** Rayon terrestre en mètres (approximation WGS84). */
const EARTH_RADIUS_M = 6371000;
/** 1 degré de latitude ≈ 111.32 km. */
const METERS_PER_DEG_LAT = (Math.PI * EARTH_RADIUS_M) / 180;

/**
 * Génère jusqu'à 10 points de localisation pour le pass : 1 au centre + 9 sur un cercle.
 * Périmètre large pour que le pass s'affiche dès qu'on approche du commerce.
 * @param {number} lat - Latitude du commerce
 * @param {number} lng - Longitude du commerce
 * @param {number} radiusMeters - Rayon du cercle en mètres (défaut 500 — norme Apple non documentée, on vise large)
 * @param {string} [relevantText] - Texte affiché à l'écran de verrouillage quand on est proche
 * @returns {Array<{ latitude: number, longitude: number, relevantText?: string }>}
 */
function buildPassLocations(lat, lng, radiusMeters = 500, relevantText) {
  const latRad = (lat * Math.PI) / 180;
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos(latRad);
  const dLat = radiusMeters / METERS_PER_DEG_LAT;
  const dLng = radiusMeters / metersPerDegLng;
  const points = [];
  // Point central (le commerce)
  points.push({ latitude: lat, longitude: lng, ...(relevantText ? { relevantText } : {}) });
  // 9 points sur le cercle (max 10 au total pour Apple)
  for (let i = 0; i < 9; i++) {
    const angle = (i * 360) / 9;
    const rad = (angle * Math.PI) / 180;
    const latOffset = dLat * Math.cos(rad);
    const lngOffset = dLng * Math.sin(rad);
    points.push({
      latitude: lat + latOffset,
      longitude: lng + lngOffset,
      ...(relevantText ? { relevantText } : {}),
    });
  }
  return points;
}

/** Génère un strip PNG 750x246. Dégradé qui se fond dans le fond (dernières lignes = backgroundColor exact) pour éviter toute ligne de coupure. */
function createStripBuffer(templateKey) {
  const colors = PASS_TEMPLATES[templateKey] || PASS_TEMPLATES.classic;
  const base = hexToRgb(colors.backgroundColor);
  const w = 750;
  const h = 246;
  const blendRows = 20;
  const png = new PNG({ width: w, height: h });
  png.data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const inBlend = y >= h - blendRows;
    let lighten;
    if (inBlend) {
      const blendT = (y - (h - blendRows)) / blendRows;
      lighten = 0.92 + blendT * 0.08;
    } else {
      lighten = 0.78 + t * 0.2;
      const shine = Math.exp(-((t - 0.15) ** 2) / 0.06) * 0.18;
      lighten = Math.min(1, lighten + shine);
    }
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      png.data[i] = Math.round(Math.min(255, base.r * lighten));
      png.data[i + 1] = Math.round(Math.min(255, base.g * lighten));
      png.data[i + 2] = Math.round(Math.min(255, base.b * lighten));
      png.data[i + 3] = 255;
    }
  }
  for (let y = h - 3; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      png.data[i] = base.r;
      png.data[i + 1] = base.g;
      png.data[i + 2] = base.b;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

/** Dimensions strip Apple : 750×246. Tampons = icônes seules (sans cercle), grille remontée pour ne pas dépasser. */
const STRIP_W = 750;
const STRIP_H = 246;
const STAMP_R = 30;
const STAMP_SIZE = STAMP_R * 2;
const STAMP_GAP = 10;
const STAMP_TOP = 72;

function drawCircle(png, cx, cy, r, fillRgb, strokeRgb) {
  const w = png.width;
  const h = png.height;
  for (let y = Math.max(0, cy - r - 2); y <= Math.min(h - 1, cy + r + 2); y++) {
    for (let x = Math.max(0, cx - r - 2); x <= Math.min(w - 1, cx + r + 2); x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const i = (y * w + x) * 4;
      if (d <= r + 1) {
        if (d <= r - 1) {
          png.data[i] = fillRgb.r;
          png.data[i + 1] = fillRgb.g;
          png.data[i + 2] = fillRgb.b;
          png.data[i + 3] = 255;
        } else if (strokeRgb) {
          png.data[i] = strokeRgb.r;
          png.data[i + 1] = strokeRgb.g;
          png.data[i + 2] = strokeRgb.b;
          png.data[i + 3] = 255;
        }
      }
    }
  }
}

/** Crée un buffer PNG 76×76 : cercle vide (blanc + bordure). */
function createEmptyStampPng(strokeRgb) {
  const size = STAMP_SIZE;
  const png = new PNG({ width: size, height: size });
  png.data = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size * 4; i += 4) {
    png.data[i + 3] = 0;
  }
  drawCircle(png, size / 2, size / 2, STAMP_R - 2, { r: 255, g: 255, b: 255 }, strokeRgb);
  return PNG.sync.write(png);
}

/** Dessine uniquement le contour du cercle (anneau), pas le remplissage — fond transparent. */
function drawCircleOutline(png, cx, cy, r, strokeRgb, strokeWidth = 2) {
  const w = png.width;
  const h = png.height;
  const rOut = r + strokeWidth;
  const rIn = Math.max(0, r - strokeWidth);
  for (let y = Math.max(0, cy - rOut - 1); y <= Math.min(h - 1, cy + rOut + 1); y++) {
    for (let x = Math.max(0, cx - rOut - 1); x <= Math.min(w - 1, cx + rOut + 1); x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (d > rIn && d <= rOut && strokeRgb) {
        const i = (y * w + x) * 4;
        png.data[i] = strokeRgb.r;
        png.data[i + 1] = strokeRgb.g;
        png.data[i + 2] = strokeRgb.b;
        png.data[i + 3] = 255;
      }
    }
  }
}

/** Cercle vide : uniquement le contour (fond transparent), pour laisser l’icône PNG bien visible. */
function createEmptyStampOutlinePng(strokeRgb) {
  const size = STAMP_SIZE;
  const png = new PNG({ width: size, height: size });
  png.data = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size * 4; i += 4) png.data[i + 3] = 0;
  drawCircleOutline(png, size / 2, size / 2, STAMP_R - 2, strokeRgb, 2);
  return PNG.sync.write(png);
}

// Noto Color Emoji (Google) 128px — rendu plus proche des emojis « classiques » que Twemoji
const NOTO_EMOJI_BASE = "https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@main/png/128";
const TWEMOJI_BASE = "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72";
const cacheEmojiPng = new Map();

/** Retourne le codepoint pour un emoji (ex. "☕" → "2615", "🧋" → "1f9cb"). */
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

/** URL Noto : emoji_u2615.png (underscore entre codepoints). */
function notoEmojiUrl(codepoint) {
  return `${NOTO_EMOJI_BASE}/emoji_u${codepoint}.png`;
}

/** URL Twemoji : 2615.png. */
function twemojiUrl(codepoint) {
  const twemojiPoint = codepoint.replace(/_/g, "-");
  return `${TWEMOJI_BASE}/${twemojiPoint}.png`;
}

/** Charge l’icône personnalisée (ex. backend/assets/iconcafe.png). Pour une bonne qualité, fournir une image 128×128 ou 256×256 px ; on redimensionne d’abord en 128px puis en taille finale. */
async function loadCustomStampImage(emojiKey, emojiPx) {
  if (emojiKey !== "2615") return null;
  const customPath = join(assetsDir, "iconcafe.png");
  if (!existsSync(customPath)) return null;
  try {
    const buf = readFileSync(customPath);
    const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
    return await sharp(buf)
      .resize(128, 128, { fit: "contain", background: transparent })
      .resize(emojiPx, emojiPx, { fit: "contain", background: transparent })
      .png()
      .toBuffer();
  } catch (e) {
    return null;
  }
}

async function fetchEmojiPng(emoji) {
  const key = emojiToCodepoint(emoji);
  if (cacheEmojiPng.has(key)) return cacheEmojiPng.get(key);
  const emojiPx = key === "2615" ? STAMP_SIZE - 4 : STAMP_SIZE - 8;
  const customBuf = await loadCustomStampImage(key, emojiPx);
  if (customBuf) {
    cacheEmojiPng.set(key, customBuf);
    return customBuf;
  }
  if (key === "2615") {
    return null;
  }
  try {
    const notoUrl = notoEmojiUrl(key);
    const res = await fetch(notoUrl);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      const out = await sharp(buf).resize(emojiPx, emojiPx).png().toBuffer();
      cacheEmojiPng.set(key, out);
      return out;
    }
  } catch (e) {
    // ignore
  }
  try {
    const twUrl = twemojiUrl(key);
    const res = await fetch(twUrl);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      const out = await sharp(buf).resize(emojiPx, emojiPx).png().toBuffer();
      cacheEmojiPng.set(key, out);
      return out;
    }
  } catch (e) {
    console.warn("[PassKit] fetchEmojiPng failed:", e?.message);
  }
  return null;
}

/** Cercle rempli + icône au centre. Icône café = 72px (qualité), padding 2. */
async function createFilledStampWithEmojiPng(hexColor, stampEmoji = "☕") {
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

/** Crée un buffer PNG 76×76 : cercle rempli sans emoji (fallback). */
function createFilledStampCirclePng(fillRgb) {
  const size = STAMP_SIZE;
  const png = new PNG({ width: size, height: size });
  png.data = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size * 4; i += 4) png.data[i + 3] = 0;
  drawCircle(png, size / 2, size / 2, STAMP_R - 2, fillRgb, null);
  return PNG.sync.write(png);
}

/** Crée un buffer PNG 76×76 : cercle vide + emoji en filigrane (opacité 0.4) pour que l’emoji soit visible dans les cases vides. */
async function createEmptyStampWithEmojiPng(strokeRgb, stampEmoji = "☕") {
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

/** Crée un buffer tampon = uniquement l’icône centrée sur fond transparent (pas de cercle). */
async function createStampIconOnlyPng(iconBuf, opacity = 1) {
  const size = STAMP_SIZE;
  let input = iconBuf;
  if (opacity < 1) {
    const { data, info } = await sharp(iconBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * opacity);
    input = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
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
 * Grille de tampons = uniquement les icônes (iconcafe), sans cercle ni 0/8. Grille remontée pour tout afficher.
 */
async function drawStampsOnStrip(baseStripBuf, templateKey, filledCount, stampMax, stampEmoji) {
  const cols = 5;
  const startX = (STRIP_W - (cols * STAMP_SIZE + (cols - 1) * STAMP_GAP)) / 2 + STAMP_R;
  const row0Y = STAMP_TOP + STAMP_R;
  const row1Y = row0Y + STAMP_SIZE + STAMP_GAP;

  const emojiForStamp = (stampEmoji && String(stampEmoji).trim()) || "☕";
  const iconBuf = await fetchEmojiPng(emojiForStamp);
  if (!iconBuf) {
    return baseStripBuf;
  }

  const composites = [];
  for (let i = 0; i < Math.min(stampMax, 10); i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = Math.round(startX + col * (STAMP_SIZE + STAMP_GAP));
    const cy = row === 0 ? row0Y : row1Y;
    const left = Math.max(0, cx - STAMP_R);
    const top = Math.max(0, cy - STAMP_R);
    const filled = i < filledCount;
    const stampBuf = await createStampIconOnlyPng(iconBuf, filled ? 1 : 0.75);
    composites.push({ input: stampBuf, left, top });
  }

  return sharp(baseStripBuf)
    .composite(composites)
    .png()
    .toBuffer();
}

/**
 * Génère un strip 750×246 avec une grille de tampons : emoji ☕ dans les cercles remplis.
 */
async function createStripWithStamps(templateKey, filledCount, stampMax, stampEmoji) {
  const stripBuf = createStripBuffer(templateKey);
  return drawStampsOnStrip(stripBuf, templateKey, filledCount, stampMax, stampEmoji);
}

function loadCertificates() {
  const signerKeyPassphrase = process.env.SIGNER_KEY_PASSPHRASE || undefined;

  // Option 1a : certificats en PEM (variables d'environnement)
  const wwdrPem = process.env.WWDR_PEM?.trim();
  const signerCertPem = process.env.SIGNER_CERT_PEM?.trim();
  const signerKeyPem = process.env.SIGNER_KEY_PEM?.trim();
  if (wwdrPem && signerCertPem && signerKeyPem && wwdrPem.includes("BEGIN")) {
    return {
      wwdr: Buffer.from(wwdrPem, "utf8"),
      signerCert: Buffer.from(signerCertPem, "utf8"),
      signerKey: Buffer.from(signerKeyPem, "utf8"),
      ...(signerKeyPassphrase && { signerKeyPassphrase }),
    };
  }

  // Option 1b : certificats en base64 (une ligne, évite les soucis de retours à la ligne sur Railway)
  const wwdrB64 = process.env.WWDR_PEM_BASE64?.trim();
  const signerCertB64 = process.env.SIGNER_CERT_PEM_BASE64?.trim();
  const signerKeyB64 = process.env.SIGNER_KEY_PEM_BASE64?.trim();
  if (wwdrB64 && signerCertB64 && signerKeyB64) {
    return {
      wwdr: Buffer.from(wwdrB64, "base64"),
      signerCert: Buffer.from(signerCertB64, "base64"),
      signerKey: Buffer.from(signerKeyB64, "base64"),
      ...(signerKeyPassphrase && { signerKeyPassphrase }),
    };
  }

  // Option 2 : fichiers dans backend/certs/
  const wwdrPath = join(certsDir, "wwdr.pem");
  const signerCertPath = join(certsDir, "signerCert.pem");
  const signerKeyPath = join(certsDir, "signerKey.pem");

  if (!existsSync(wwdrPath) || !existsSync(signerCertPath) || !existsSync(signerKeyPath)) {
    throw new Error(
      "Certificats manquants. Railway → Variables : ajoute WWDR_PEM_BASE64, SIGNER_CERT_PEM_BASE64, SIGNER_KEY_PEM_BASE64 (voir scripts/print-cert-base64.sh). Puis redéploie."
    );
  }

  return {
    wwdr: readFileSync(wwdrPath),
    signerCert: readFileSync(signerCertPath),
    signerKey: readFileSync(signerKeyPath),
    ...(signerKeyPassphrase && { signerKeyPassphrase }),
  };
}

function loadImageFromDir(dir, name) {
  const path = join(dir, name);
  if (existsSync(path)) return readFileSync(path);
  return null;
}

/**
 * Construit les buffers d'images pour un pass.
 * Priorité : dossier de l'entreprise (assets/businesses/:id/) puis dossier global (assets/).
 * Si pas de strip trouvé et options.template = secteur (café, fastfood…), génère un strip aux couleurs du template.
 */
function buildBuffers(businessId, options = {}) {
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

/** Templates de design (couleurs du pass). Doivent correspondre aux id du frontend. */
const PASS_TEMPLATES = {
  classic: { backgroundColor: "#0a7c42", foregroundColor: "#ffffff", labelColor: "#e8f5e9" },
  modern: { backgroundColor: "#1a237e", foregroundColor: "#ffffff", labelColor: "#c5cae9" },
  dark: { backgroundColor: "#212121", foregroundColor: "#ffffff", labelColor: "#b0b0b0" },
  warm: { backgroundColor: "#bf360c", foregroundColor: "#ffffff", labelColor: "#ffccbc" },
  fastfood: { backgroundColor: "#8B2942", foregroundColor: "#ffffff", labelColor: "#ffd54f" },
  beauty: { backgroundColor: "#b76e79", foregroundColor: "#ffffff", labelColor: "#fce4ec" },
  coiffure: { backgroundColor: "#5c4a6a", foregroundColor: "#ffffff", labelColor: "#d1c4e0" },
  boulangerie: { backgroundColor: "#b8860b", foregroundColor: "#ffffff", labelColor: "#fff8e1" },
  boucherie: { backgroundColor: "#6d2c3e", foregroundColor: "#ffffff", labelColor: "#ffcdd2" },
  cafe: { backgroundColor: "#5d4e37", foregroundColor: "#ffffff", labelColor: "#d7ccc8" },
};

/**
 * Génère un fichier .pkpass (buffer) pour un membre d'une entreprise.
 * @param {Object} member - { id, name, points }
 * @param {Object} business - { id, organization_name, back_terms, back_contact } (optionnel pour rétrocompat)
 * @param {Object} options - { template, format } template = classic|fastfood|..., format = points|tampons
 * @returns {Promise<Buffer>}
 */
export async function generatePass(member, business = null, options = {}) {
  const passTypeId = process.env.PASS_TYPE_ID;
  const teamId = process.env.TEAM_ID;

  if (!passTypeId || !teamId) {
    throw new Error("PASS_TYPE_ID et TEAM_ID doivent être définis dans .env");
  }

  const organizationName =
    options.organizationName || business?.organization_name || process.env.ORGANIZATION_NAME || "Carte fidélité";
  const certificates = loadCertificates();
  const buffers = buildBuffers(business?.id, options);
  if (business?.logo_base64) {
    const base64Data = String(business.logo_base64).replace(/^data:image\/\w+;base64,/, "");
    const logoBuf = Buffer.from(base64Data, "base64");
    if (logoBuf.length > 0) {
      const resized = await resizeLogoForPass(logoBuf);
      if (resized) {
        buffers["logo.png"] = resized.logoPng;
        buffers["logo@2x.png"] = resized.logoPng2x;
      } else {
        buffers["logo.png"] = logoBuf;
        buffers["logo@2x.png"] = logoBuf;
      }
      const iconResized = await resizeLogoForPassIcon(logoBuf);
      if (iconResized) {
        buffers["icon.png"] = iconResized.iconPng;
        buffers["icon@2x.png"] = iconResized.iconPng2x;
        buffers["icon@3x.png"] = iconResized.iconPng3x;
        console.log("[PassKit] Icône notification Wallet générée depuis le logo (29/58/87px)");
      } else {
        console.warn("[PassKit] resizeLogoForPassIcon a échoué — icône par défaut utilisée");
      }
    }
  }

  const level = getLevel(member.points);
  const stampMax = options.required_stamps ?? options.stampMax ?? business?.required_stamps ?? 10;
  const useTampons = options.required_stamps != null || options.stampMax != null || (business?.required_stamps != null && business.required_stamps > 0);
  const programType = business?.program_type?.toLowerCase();
  const explicitFormat = programType === "points" ? "points" : programType === "stamps" ? "tampons" : null;
  const format = options.format || explicitFormat || (useTampons ? "tampons" : "points");
  const stamps = format === "tampons" ? Math.min(Math.max(0, Math.floor(Number(member.points) || 0)), stampMax) : null;

  // Strip : image de fond perso + grille tampons (emoji ☕ dans les cercles remplis)
  const stripTemplateKey = options.template || "cafe";
  const stripStampEmoji = (options.stamp_emoji ?? business?.stamp_emoji)?.trim() || "☕";
  if (format === "tampons") {
    let baseStrip;
    if (options.card_background_base64) {
      const base64Data = String(options.card_background_base64).replace(/^data:image\/\w+;base64,/, "");
      const buf = Buffer.from(base64Data, "base64");
      if (buf.length > 0) {
        try {
          baseStrip = await sharp(buf).resize(STRIP_W, STRIP_H).png().toBuffer();
        } catch (e) {
          console.warn("[PassKit] card_background resize failed:", e?.message);
        }
      }
    }
    if (!baseStrip) baseStrip = createStripBuffer(stripTemplateKey);
    const stripWithStamps = await drawStampsOnStrip(baseStrip, stripTemplateKey, stamps, stampMax, stripStampEmoji);
    buffers["strip.png"] = stripWithStamps;
    buffers["strip@2x.png"] = await sharp(stripWithStamps).resize(STRIP_W * 2, STRIP_H * 2).png().toBuffer();
  } else if (options.card_background_base64) {
    const base64Data = String(options.card_background_base64).replace(/^data:image\/\w+;base64,/, "");
    const buf = Buffer.from(base64Data, "base64");
    if (buf.length > 0) {
      try {
        const resized = await sharp(buf).resize(STRIP_W, STRIP_H).png().toBuffer();
        buffers["strip.png"] = resized;
        buffers["strip@2x.png"] = resized;
      } catch (e) {
        console.warn("[PassKit] card_background resize failed:", e?.message);
      }
    }
  }

  const isSectorTemplate = ["fastfood", "beauty", "coiffure", "boulangerie", "boucherie", "cafe"].includes(options.template);

  // Couleurs : priorité options (design envoyé par l'app), puis business, puis template
  const toHex = (v) => (v && String(v).trim()) ? (String(v).startsWith("#") ? v : `#${v}`) : null;
  const bgHex = toHex(options.backgroundColor ?? options.background_color) ?? toHex(business?.background_color);
  const fgHex = toHex(options.foregroundColor ?? options.foreground_color) ?? toHex(business?.foreground_color);
  const labelHex = toHex(options.label_color) ?? toHex(business?.label_color);
  const templateKey = isSectorTemplate ? options.template : options.template;
  const classic = PASS_TEMPLATES[templateKey] || PASS_TEMPLATES.classic;
  const customColors = {
    backgroundColor: bgHex || classic.backgroundColor,
    foregroundColor: fgHex || classic.foregroundColor,
    labelColor: labelHex || classic.labelColor,
  };

  const webServiceURL = process.env.PASSKIT_WEB_SERVICE_URL || process.env.API_URL;
  const authToken = getPassAuthenticationToken(member.id);
  const passOptions = {
    passTypeIdentifier: passTypeId,
    teamIdentifier: teamId,
    organizationName: "Carte fidélité",
    description: format === "tampons"
      ? `Carte fidélité — ${stamps}/${stampMax} tampons`
      : `Carte de fidélité — ${member.points} pts`,
    serialNumber: member.id,
    ...customColors,
  };
  if (webServiceURL && business) {
    const base = webServiceURL.replace(/\/$/, "");
    // Apple ajoute /v1/devices/... et /v1/passes/... à cette URL → ne pas mettre /v1 ici (sinon on reçoit /api/v1/v1/...)
    passOptions.webServiceURL = `${base}/api`;
    passOptions.authenticationToken = authToken;
    if (process.env.NODE_ENV === "production") {
      console.log("[PassKit] Pass généré avec webServiceURL:", passOptions.webServiceURL, "→ l'iPhone pourra s'enregistrer.");
    }
  } else {
    if (process.env.NODE_ENV === "production") {
      console.warn("[PassKit] Pass généré SANS webServiceURL → aucun appareil ne pourra s'enregistrer. Définir PASSKIT_WEB_SERVICE_URL sur Railway (ex. https://api.myfidpass.fr).");
    }
  }
  const pass = new PKPass(buffers, certificates, passOptions);

  pass.type = "storeCard";

  // Design secteur (fast-food, beauté, etc.) : logo/org à gauche, prénom nom client à droite en header, pas de "Niveau"
  if (isSectorTemplate) {
    pass.headerFields.push({
      key: "memberName",
      label: "",
      value: member.name,
      textAlignment: "PKTextAlignmentRight",
    });
  }

  const stampEmoji = (options.stamp_emoji ?? business?.stamp_emoji)?.trim() || "";
  if (format === "tampons") {
    const rest = stampMax - stamps;
    const rewardLabel = (options.stamp_reward_label ?? business?.stamp_reward_label)?.trim();
    let stampHint = "";
    if (rewardLabel) {
      stampHint = stamps <= 1
        ? `${stamps} tampon — ${rest} pour ${rewardLabel}`
        : `${stamps} tampons — ${rest} pour ${rewardLabel}`;
    } else {
      const isCafeStyle = options.template === "cafe" || (organizationName && /caf[eé]|coffee/i.test(organizationName)) || stampEmoji === "☕";
      if (isCafeStyle) {
        stampHint = stamps <= 1
          ? `${stamps} café collecté — ${rest} pour en avoir un offert`
          : `${stamps} cafés collectés — ${rest} pour en avoir un offert`;
      } else if (options.template === "fastfood") {
        stampHint = stamps <= 1
          ? `${stamps} tampon collecté — ${rest} restants pour une récompense`
          : `${stamps} tampons collectés — ${rest} restants pour une récompense`;
      } else {
        stampHint = `${stamps} / ${stampMax} — ${rest} restant${rest !== 1 ? "s" : ""} pour une récompense`;
      }
    }
    pass.secondaryFields.push({
      key: "stampHint",
      label: "",
      value: stampHint,
      textAlignment: "PKTextAlignmentCenter",
    });
    const stampRewardLabel = (options.stamp_reward_label ?? business?.stamp_reward_label)?.trim();
    pass.secondaryFields.push({
      key: "stampRewardFront",
      label: "Récompense",
      value: stampRewardLabel ? `${stampMax} tampons = ${stampRewardLabel}` : `${stampMax} tampons = 1 offert`,
      textAlignment: "PKTextAlignmentCenter",
    });
    pass.secondaryFields.push({
      key: "hintBack",
      label: "",
      value: "Touchez (i) en bas à droite pour voir le détail (progression, récompense).",
      textAlignment: "PKTextAlignmentCenter",
    });
    if (!isSectorTemplate) {
      pass.secondaryFields.push({ key: "member", label: "Membre", value: member.name });
    }
  } else {
    const pointsValue = stampEmoji ? `${stampEmoji} ${member.points}` : String(member.points);
    pass.primaryFields.push({
      key: "points",
      label: "Points",
      value: pointsValue,
      textAlignment: "PKTextAlignmentCenter",
      changeMessage: "Tu as maintenant %@ points !",
    });
    let tiers = business?.points_reward_tiers;
    if (typeof tiers === "string" && tiers.trim()) {
      try { tiers = JSON.parse(tiers); } catch (_) { tiers = []; }
    }
    const tierLines = Array.isArray(tiers)
      ? tiers.filter((t) => t != null && Number.isInteger(Number(t.points))).map((t) => `${t.points} pts = ${(t.label && String(t.label).trim()) || "Récompense"}`)
      : [];
    pass.secondaryFields.push({
      key: "rewardsFront",
      label: "Récompenses",
      value: tierLines.length > 0 ? tierLines.join(" · ") : "Paliers en magasin",
      textAlignment: "PKTextAlignmentCenter",
    });
    pass.secondaryFields.push({
      key: "hintBack",
      label: "",
      value: "Touchez (i) en bas à droite pour voir le détail (progression, récompense).",
      textAlignment: "PKTextAlignmentCenter",
    });
    if (!isSectorTemplate) {
      pass.secondaryFields.push({ key: "level", label: "Niveau", value: level });
      pass.auxiliaryFields.push({ key: "member", label: "Membre", value: member.name });
    }
  }

  // Pas de champ "Actualité" sur le pass (design épuré)

  // QR code uniquement (pas PDF417 ni Code128) — plus simple à scanner en caisse
  const barcodePayload = {
    message: member.id,
    format: "PKBarcodeFormatQR",
    messageEncoding: "iso-8859-1",
    altText: member.id,
  };
  pass.setBarcodes(barcodePayload);
  if (process.env.NODE_ENV === "production") {
    console.log("[PassKit] Barcode format:", barcodePayload.format);
  }

  // Localisation : jusqu'à 10 points (centre + cercle) pour afficher le pass à l'écran de verrouillage à l'approche du commerce
  const locLat = business?.location_lat != null ? Number(business.location_lat) : null;
  const locLng = business?.location_lng != null ? Number(business.location_lng) : null;
  if (Number.isFinite(locLat) && Number.isFinite(locLng)) {
    const radiusM = Math.min(Math.max(Number(business.location_radius_meters) || 500, 100), 2000);
    const relevantText =
      (business?.location_relevant_text && String(business.location_relevant_text).trim()) ||
      `Vous êtes près de ${organizationName}`;
    const locations = buildPassLocations(locLat, locLng, radiusM, relevantText);
    pass.setLocations(...locations);
    if (process.env.NODE_ENV === "production") {
      console.log("[PassKit] Pass généré avec", locations.length, "emplacements (rayon", radiusM, "m).");
    }
  }

  // ─── Dos du pass (visible par le CLIENT quand il tape sur (i) dans le Wallet) ───
  // Ordre et libellés pensés pour que le client sache : où j'en suis, quelle récompense, combien il manque, conditions.
  const backTerms = business?.back_terms || "1 point = 1 € de réduction. Valable en magasin.";
  const backContact = business?.back_contact || "contact@example.com";
  const frontendUrl = (process.env.FRONTEND_URL || process.env.API_URL || "https://myfidpass.fr").replace(/\/$/, "");
  const backUrl = business?.slug
    ? `${frontendUrl}/?ref=pass&b=${encodeURIComponent(business.slug)}`
    : `${frontendUrl}/?ref=pass`;

  if (format === "tampons") {
    const rewardLabel = (options.stamp_reward_label ?? business?.stamp_reward_label)?.trim() || "1 offert";
    const current = stamps ?? 0;
    const rest = Math.max(0, stampMax - current);

    pass.backFields.push(
      { key: "progress", label: "Votre progression", value: `${current} / ${stampMax} tampons` },
      { key: "reward", label: "Récompense", value: `${stampMax} tampons = ${rewardLabel}` },
      {
        key: "toUnlock",
        label: "Pour l'obtenir",
        value: rest === 0
          ? "Récompense disponible ! Présentez cette carte en caisse."
          : rest === 1
            ? `Il vous manque 1 tampon pour avoir ${rewardLabel}.`
            : `Il vous manque ${rest} tampons pour avoir ${rewardLabel}.`,
      },
      { key: "terms", label: "Conditions", value: backTerms },
      { key: "contact", label: "Contact", value: backContact },
      { key: "website", label: "Voir en ligne", value: backUrl, dataDetectorTypes: ["PKDataDetectorTypeLink"] }
    );
  } else {
    const pts = Math.max(0, Math.floor(Number(member.points) || 0));
    let tiers = business?.points_reward_tiers;
    if (typeof tiers === "string" && tiers.trim()) {
      try { tiers = JSON.parse(tiers); } catch (_) { tiers = []; }
    }
    const tierList = Array.isArray(tiers)
      ? tiers.filter((t) => t != null && Number.isInteger(Number(t.points))).sort((a, b) => Number(a.points) - Number(b.points))
      : [];
    const rewardLines = tierList.map((t) => `${t.points} pts = ${(t.label && String(t.label).trim()) || "Récompense"}`);
    const nextTier = tierList.find((t) => Number(t.points) > pts);
    const toUnlockText = nextTier
      ? `Encore ${Number(nextTier.points) - pts} points pour : ${(nextTier.label && String(nextTier.label).trim()) || "récompense"}.`
      : tierList.length > 0
        ? "Vous avez assez de points pour une récompense. Présentez cette carte en magasin."
        : "Consultez le commerce pour les paliers de récompenses.";

    pass.backFields.push(
      { key: "progress", label: "Votre progression", value: `${pts} points` },
      {
        key: "rewards",
        label: "Récompenses",
        value: rewardLines.length > 0 ? rewardLines.join("\n") : "Paliers définis par le commerce. Demandez en magasin.",
      },
      { key: "toUnlock", label: "Pour l'obtenir", value: toUnlockText },
      { key: "terms", label: "Conditions", value: backTerms },
      { key: "contact", label: "Contact", value: backContact },
      { key: "website", label: "Voir en ligne", value: backUrl, dataDetectorTypes: ["PKDataDetectorTypeLink"] }
    );
  }

  return pass.getAsBuffer();
}
