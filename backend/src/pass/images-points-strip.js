/**
 * Points sur le strip Wallet (sans image de fond).
 * Rendu en PNG bitmap (pngjs) : pas de dépendance aux polices système / librsvg
 * (évite le « petit carré » sur Railway quand Sharp ne rasterise pas le <text> SVG).
 */
import { PNG } from "pngjs";
import { STRIP_W, STRIP_H } from "./constants.js";

function hexToRgb(hex) {
  let h = String(hex ?? "#FFFFFF").trim();
  if (!h.startsWith("#")) h = `#${h}`;
  h = h.slice(1);
  if (h.length === 3) {
    h = h.split("").map((c) => c + c).join("");
  }
  const n = parseInt(h, 16);
  if (Number.isNaN(n) || h.length !== 6) return { r: 255, g: 255, b: 255 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Glyphes 5×7 (chaque ligne = 5 caractères '0'/'1').
 * Digits + « Points » (P,o,i,n,t,s) — même logique couleurs que l’aperçu (fg / label).
 */
const GLYPHS = {
  "0": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["10001", "10001", "10001", "11111", "00001", "00001", "00001"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  o: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  i: ["00100", "00000", "00100", "00100", "00100", "00100", "00100"],
  n: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  t: ["01110", "00100", "00100", "00100", "00100", "00100", "00110"],
  s: ["00000", "01110", "10000", "01110", "00001", "01110", "00000"],
};

function drawGlyph(png, rows, ox, oy, scale, rgb) {
  if (!rows || rows.length !== 7) return;
  for (let row = 0; row < 7; row++) {
    const line = rows[row];
    for (let col = 0; col < 5; col++) {
      if (line[col] !== "1") continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const x = ox + col * scale + dx;
          const y = oy + row * scale + dy;
          if (x < 0 || y < 0 || x >= png.width || y >= png.height) continue;
          const i = (png.width * y + x) << 2;
          png.data[i] = rgb.r;
          png.data[i + 1] = rgb.g;
          png.data[i + 2] = rgb.b;
          png.data[i + 3] = 255;
        }
      }
    }
  }
}

/**
 * @param {Buffer} stripPngBuffer — strip 750×246 (PNG)
 * @param {string} foregroundColor — couleur « accent » (chiffre), ex. #00BFFF
 * @param {string} labelColor — couleur libellé « Points », ex. #EC4899
 */
export async function drawPointsOnStrip(stripPngBuffer, pointsInt, foregroundColor, labelColor, sharp) {
  const fg = hexToRgb(foregroundColor);
  const lg = hexToRgb(labelColor);
  const numStr = String(Math.max(0, Math.floor(Number(pointsInt) || 0)));

  const png = new PNG({ width: STRIP_W, height: STRIP_H });
  png.data.fill(0);

  const marginLeft = 52;
  const maxContentW = STRIP_W - marginLeft - 24;
  let scaleBig = 12;
  const digitW = 5 * scaleBig + scaleBig;
  const estNumW = numStr.length * digitW;
  if (estNumW > maxContentW && numStr.length > 0) {
    scaleBig = Math.max(7, Math.floor(maxContentW / numStr.length / 6));
  }

  const yNum = 38;
  let x = marginLeft;
  for (const ch of numStr) {
    const rows = GLYPHS[ch];
    if (rows) {
      drawGlyph(png, rows, x, yNum, scaleBig, fg);
      x += 5 * scaleBig + scaleBig;
    }
  }

  const word = "Points";
  let scaleSmall = 5;
  const smallDigitW = 5 * scaleSmall + scaleSmall;
  const estLabelW = word.length * smallDigitW;
  if (estLabelW > maxContentW) {
    scaleSmall = Math.max(4, Math.floor(maxContentW / word.length / 6));
  }

  const yLabel = yNum + 7 * scaleBig + 14;
  let x2 = marginLeft;
  for (const ch of word) {
    const rows = GLYPHS[ch];
    if (rows) {
      drawGlyph(png, rows, x2, yLabel, scaleSmall, lg);
      x2 += 5 * scaleSmall + scaleSmall;
    }
  }

  const overlay = PNG.sync.write(png);
  return sharp(stripPngBuffer)
    .composite([{ input: overlay, left: 0, top: 0, blend: "over" }])
    .png()
    .toBuffer();
}
