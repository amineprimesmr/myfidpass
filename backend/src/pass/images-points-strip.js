/**
 * Points sur le strip Wallet (sans image de fond) — gros chiffre + « Points » à gauche, aligné app iOS.
 */
import { STRIP_W, STRIP_H } from "./constants.js";

function escapeSvgText(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {Buffer} stripPngBuffer — strip 750×246 (PNG)
 * @param {string} foregroundColor — ex. #F59E0B
 * @param {string} labelColor — ex. #EC4899
 */
export async function drawPointsOnStrip(stripPngBuffer, pointsInt, foregroundColor, labelColor, sharp) {
  const fg = escapeSvgText(String(foregroundColor || "#FFFFFF").trim());
  const lg = escapeSvgText(String(labelColor || "#CCCCCC").trim());
  const n = Math.max(0, Math.floor(Number(pointsInt) || 0));
  const num = escapeSvgText(String(n));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${STRIP_W}" height="${STRIP_H}">
  <text x="52" y="112" fill="${fg}" font-size="84" font-weight="600" font-family="Arial, Helvetica, sans-serif">${num}</text>
  <text x="52" y="182" fill="${lg}" font-size="24" font-weight="500" font-family="Arial, Helvetica, sans-serif">Points</text>
</svg>`;
  const overlay = await sharp(Buffer.from(svg)).png().toBuffer();
  return sharp(stripPngBuffer).composite([{ input: overlay, left: 0, top: 0 }]).png().toBuffer();
}
