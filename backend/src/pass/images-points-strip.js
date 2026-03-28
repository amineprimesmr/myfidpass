/**
 * Points sur le strip Wallet (sans image de fond).
 * Glyphes bitmap dessinés en sur-échantillonnage (×4) puis réduction Lanczos → rendu lisse
 * sans polices système ni dépendance Resvg (npm local souvent cassé).
 */
import { PNG } from "pngjs";
import { STRIP_W, STRIP_H } from "./constants.js";

const RGB_VALUE = { r: 255, g: 255, b: 255 };
const RGB_LABEL = { r: 220, g: 220, b: 220 };

/** Facteur interne avant resize vers 750×246 (adoucit les bords « pixel »). */
const SUPERSAMPLE = 4;

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
 */
export async function drawPointsOnStrip(stripPngBuffer, pointsInt, sharp) {
  const numStr = String(Math.max(0, Math.floor(Number(pointsInt) || 0)));
  const S = SUPERSAMPLE;
  const w = STRIP_W * S;
  const h = STRIP_H * S;

  const png = new PNG({ width: w, height: h });
  png.data.fill(0);

  const marginLeft = 52 * S;
  const maxContentW = w - marginLeft - 24 * S;
  let scaleBig = 12 * S;
  const digitW = 5 * scaleBig + scaleBig;
  const estNumW = numStr.length * digitW;
  if (estNumW > maxContentW && numStr.length > 0) {
    scaleBig = Math.max(7 * S, Math.floor(maxContentW / numStr.length / 6));
  }

  const yNum = 38 * S;
  let x = marginLeft;
  for (const ch of numStr) {
    const rows = GLYPHS[ch];
    if (rows) {
      drawGlyph(png, rows, x, yNum, scaleBig, RGB_VALUE);
      x += 5 * scaleBig + scaleBig;
    }
  }

  const word = "Points";
  let scaleSmall = 5 * S;
  const estLabelW = word.length * (5 * scaleSmall + scaleSmall);
  if (estLabelW > maxContentW) {
    scaleSmall = Math.max(4 * S, Math.floor(maxContentW / word.length / 6));
  }

  const yLabel = yNum + 7 * scaleBig + 14 * S;
  let x2 = marginLeft;
  for (const ch of word) {
    const rows = GLYPHS[ch];
    if (rows) {
      drawGlyph(png, rows, x2, yLabel, scaleSmall, RGB_LABEL);
      x2 += 5 * scaleSmall + scaleSmall;
    }
  }

  const raw = PNG.sync.write(png);
  const overlay = await sharp(raw)
    .resize(STRIP_W, STRIP_H, {
      kernel: sharp.kernel.lanczos3,
      fit: "fill",
    })
    .png()
    .ensureAlpha()
    .toBuffer();

  return sharp(stripPngBuffer)
    .composite([{ input: overlay, left: 0, top: 0, blend: "over" }])
    .png()
    .toBuffer();
}
