/**
 * Génération logo / bandeau texte et icône pour le pass.
 * Référence : REFONTE-REGLES.md — pass.js découpé.
 */
import sharp from "sharp";
import { LOGO_WIDTH_2X, LOGO_HEIGHT_2X, LOGO_WIDTH_1X, LOGO_HEIGHT_1X, ICON_SIZE_1X, ICON_SIZE_2X, ICON_SIZE_3X } from "./constants.js";

function escapeSvgText(s) {
  if (s == null || typeof s !== "string") return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Texte à ne jamais afficher dans le bandeau (placeholder). Remplacé par "Carte fidélité". */
export function sanitizeLogoText(s) {
  const t = (s && String(s).trim()) || "";
  if (!t) return "Carte fidélité";
  if (/^0+$/.test(t) || /^0{8,}$/.test(t)) return "Carte fidélité";
  return t;
}

/**
 * Génère le logo du pass (bandeau couleur + texte) quand strip_display_mode = "text".
 * Retourne { logoPng, logoPng2x } ou null.
 */
export async function createLogoFromText(stripColorHex, text) {
  const label = sanitizeLogoText(text);
  const hex = stripColorHex && /^#?[0-9A-Fa-f]{6}$/.test(String(stripColorHex).replace(/^#/, ""))
    ? (String(stripColorHex).startsWith("#") ? stripColorHex : `#${stripColorHex}`)
    : "#0a7c42";
  const escaped = escapeSvgText(label);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${LOGO_WIDTH_2X}" height="${LOGO_HEIGHT_2X}">
  <rect width="100%" height="100%" fill="${hex}"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="28" font-family="Arial, Helvetica, sans-serif" font-weight="600">${escaped}</text>
</svg>`;
  try {
    const out2x = await sharp(Buffer.from(svg))
      .resize(LOGO_WIDTH_2X, LOGO_HEIGHT_2X)
      .png()
      .toBuffer();
    const out1x = await sharp(Buffer.from(svg))
      .resize(LOGO_WIDTH_1X, LOGO_HEIGHT_1X)
      .png()
      .toBuffer();
    return { logoPng: out1x, logoPng2x: out2x };
  } catch (err) {
    console.warn("[PassKit] createLogoFromText failed:", err?.message);
    return null;
  }
}

/**
 * Redimensionne le buffer image pour le pass (logo 320×100 / 160×50).
 */
export async function resizeLogoForPass(inputBuffer) {
  if (!inputBuffer || inputBuffer.length === 0) return null;
  const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
  try {
    const meta = await sharp(inputBuffer).metadata();
    const inW = meta.width || 100;
    const inH = meta.height || 100;
    const aspect = inW / inH;
    const h2 = LOGO_HEIGHT_2X;
    const w2 = Math.min(LOGO_WIDTH_2X, Math.round(h2 * aspect));
    const h1 = LOGO_HEIGHT_1X;
    const w1 = Math.min(LOGO_WIDTH_1X, Math.round(h1 * aspect));
    const logo2x = await sharp(inputBuffer)
      .resize(w2, h2, { fit: "contain", background: transparent })
      .png()
      .toBuffer();
    const logo1x = await sharp(inputBuffer)
      .resize(w1, h1, { fit: "contain", background: transparent })
      .png()
      .toBuffer();
    const out2x = await sharp({
      create: { width: LOGO_WIDTH_2X, height: LOGO_HEIGHT_2X, channels: 4, background: transparent },
    })
      .composite([{ input: logo2x, left: 0, top: 0 }])
      .png()
      .toBuffer();
    const out1x = await sharp({
      create: { width: LOGO_WIDTH_1X, height: LOGO_HEIGHT_1X, channels: 4, background: transparent },
    })
      .composite([{ input: logo1x, left: 0, top: 0 }])
      .png()
      .toBuffer();
    return { logoPng: out1x, logoPng2x: out2x };
  } catch (err) {
    console.warn("[PassKit] resizeLogoForPass failed:", err.message);
  }
  try {
    const out2x = await sharp(inputBuffer)
      .resize(LOGO_WIDTH_2X, LOGO_HEIGHT_2X, { fit: "contain", background: transparent })
      .png()
      .toBuffer();
    const out1x = await sharp(inputBuffer)
      .resize(LOGO_WIDTH_1X, LOGO_HEIGHT_1X, { fit: "contain", background: transparent })
      .png()
      .toBuffer();
    return { logoPng: out1x, logoPng2x: out2x };
  } catch (err2) {
    console.warn("[PassKit] resizeLogoForPass fallback failed:", err2?.message);
    return null;
  }
}

/**
 * Icônes 29/58/87 px pour notifications Wallet. Fond blanc opaque (iOS 18).
 */
export async function resizeLogoForPassIcon(inputBuffer) {
  if (!inputBuffer || inputBuffer.length === 0) return null;
  try {
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
