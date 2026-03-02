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

/** Dimensions strip Apple : 750×246. Tampons en 2 lignes de 5, cercles bien visibles. */
const STRIP_W = 750;
const STRIP_H = 246;
const STAMP_R = 38;
const STAMP_SIZE = STAMP_R * 2;
const STAMP_GAP = 14;
const STAMP_TOP = 90;

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

/** Cercle blanc avec emoji café grisé (case non remplie) — les 10 cases affichent toujours ☕. */
async function createEmptyStampWithEmojiPng(emoji) {
  const size = STAMP_SIZE;
  const char = (emoji || "☕").trim().slice(0, 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="${size/2}" cy="${size/2}" r="${STAMP_R - 2}" fill="white" stroke="rgba(0,0,0,0.2)" stroke-width="2"/>
  <text x="${size/2}" y="${size/2 + 4}" font-size="36" text-anchor="middle" dominant-baseline="middle" fill="rgba(150,150,150,0.85)" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">${char}</text>
</svg>`;
  try {
    return await sharp(Buffer.from(svg))
      .resize(size, size)
      .png()
      .toBuffer();
  } catch (e) {
    console.warn("[PassKit] createEmptyStampWithEmojiPng failed:", e?.message);
    return null;
  }
}

/** Crée un buffer PNG 76×76 : cercle rempli avec emoji café (ou autre) au centre — SVG rendu via sharp. */
async function createFilledStampWithEmojiPng(hexColor, emoji) {
  const size = STAMP_SIZE;
  const hex = hexColor.replace(/^#/, "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const char = (emoji || "☕").trim().slice(0, 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="${size/2}" cy="${size/2}" r="${STAMP_R - 2}" fill="rgb(${r},${g},${b})"/>
  <text x="${size/2}" y="${size/2 + 4}" font-size="38" text-anchor="middle" dominant-baseline="middle" fill="white" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">${char}</text>
</svg>`;
  try {
    return await sharp(Buffer.from(svg))
      .resize(size, size)
      .png()
      .toBuffer();
  } catch (e) {
    console.warn("[PassKit] createFilledStampWithEmojiPng failed:", e?.message);
    return null;
  }
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

/**
 * Dessine la grille de 10 tampons : les 10 cases affichent toujours l'emoji café ☕.
 * Remplis = ☕ en couleur dans cercle marron, vides = ☕ grisé dans cercle blanc.
 */
async function drawStampsOnStrip(baseStripBuf, templateKey, filledCount, stampMax, stampEmoji) {
  const colors = PASS_TEMPLATES[templateKey] || PASS_TEMPLATES.cafe;
  const fillRgb = hexToRgb(colors.backgroundColor);
  const emoji = (stampEmoji || "☕").trim().slice(0, 2);
  const cols = 5;
  const startX = (STRIP_W - (cols * STAMP_SIZE + (cols - 1) * STAMP_GAP)) / 2 + STAMP_R;
  const row0Y = STAMP_TOP + STAMP_R;
  const row1Y = row0Y + STAMP_SIZE + STAMP_GAP;

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
    if (filled) {
      stampBuf = await createFilledStampWithEmojiPng(colors.backgroundColor, emoji);
      if (!stampBuf) stampBuf = createFilledStampCirclePng(fillRgb);
    } else {
      stampBuf = await createEmptyStampWithEmojiPng(emoji);
      if (!stampBuf) stampBuf = createEmptyStampPng(hexToRgb(colors.foregroundColor || "#ffffff"));
    }
    composites.push({ input: stampBuf, left, top });
  }

  return sharp(baseStripBuf)
    .composite(composites)
    .png()
    .toBuffer();
}

/**
 * Génère un strip 750×246 avec 10 tampons : emoji ☕ pour les remplis, cercle vide pour les restants.
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
  const format = options.format || (useTampons ? "tampons" : "points");
  const stamps = format === "tampons" ? Math.min(Math.max(0, Math.floor(Number(member.points) || 0)), stampMax) : null;

  // Strip : image de fond perso + grille 10 emojis café (☕ remplis, ○ vides), ou dégradé + grille
  const stripTemplateKey = options.template || "cafe";
  const stampEmojiForStrip = (options.stamp_emoji ?? business?.stamp_emoji)?.trim() || "☕";
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
    const stripWithStamps = await drawStampsOnStrip(baseStrip, stripTemplateKey, stamps, stampMax, stampEmojiForStrip);
    buffers["strip.png"] = stripWithStamps;
    buffers["strip@2x.png"] = stripWithStamps;
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
    organizationName,
    description: format === "tampons"
      ? `Carte fidélité ${organizationName} — ${stamps}/${stampMax} tampons`
      : `Carte de fidélité ${organizationName} — ${member.points} pts`,
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
    // Pas de "☕ 0/10" en texte : les 10 emojis café sur le strip suffisent.
    const rest = stampMax - stamps;
    let stampHint = "";
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
    pass.secondaryFields.push({
      key: "stampHint",
      label: "",
      value: stampHint,
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
    if (!isSectorTemplate) {
      pass.secondaryFields.push({ key: "level", label: "Niveau", value: level });
      pass.auxiliaryFields.push({ key: "member", label: "Membre", value: member.name });
    }
  }

  // Actualité en PRIMARY (comme Points) pour que la notif écran de verrouillage s’affiche — même mécanisme que l’ajout de points
  const lastBroadcast = (business?.last_broadcast_message || options?.lastMessage || "").trim() || "—";
  pass.primaryFields.push({ key: "news", label: "Actualité", value: lastBroadcast, changeMessage: "%@" });

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

  const backTerms = business?.back_terms || "1 point = 1 € de réduction. Valable en magasin.";
  const backContact = business?.back_contact || "contact@example.com";
  pass.backFields.push(
    { key: "terms", label: "Conditions", value: backTerms },
    { key: "contact", label: "Contact", value: backContact }
  );

  // Lien au dos du pass : ouvre le site (ou la page du commerce) — cliquable sur iPhone
  const frontendUrl = (process.env.FRONTEND_URL || process.env.API_URL || "https://myfidpass.fr").replace(/\/$/, "");
  const backUrl = business?.slug
    ? `${frontendUrl}/?ref=pass&b=${encodeURIComponent(business.slug)}`
    : `${frontendUrl}/?ref=pass`;
  pass.backFields.push({
    key: "website",
    label: "Voir en ligne",
    value: backUrl,
    dataDetectorTypes: ["PKDataDetectorTypeLink"],
  });

  return pass.getAsBuffer();
}
