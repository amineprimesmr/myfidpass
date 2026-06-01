/**
 * Upscale fond flyer IA (OpenAI 1024×1536) → résolution export finale.
 */
import sharp from "sharp";
import { FLYER_EXPORT_WIDTH, FLYER_EXPORT_HEIGHT } from "./flyer-export-dimensions.js";

/**
 * @param {Buffer} inputPng
 * @returns {Promise<Buffer>}
 */
export async function upscaleFlyerAiBackgroundPng(inputPng) {
  return sharp(inputPng)
    .rotate()
    .resize(FLYER_EXPORT_WIDTH, FLYER_EXPORT_HEIGHT, {
      fit: "cover",
      position: "centre",
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 6, effort: 10 })
    .toBuffer();
}

/**
 * @param {string} b64 — PNG base64 sans préfixe data URL
 * @returns {Promise<string>} PNG base64 upscalé
 */
export async function upscaleFlyerAiBackgroundBase64(b64) {
  const raw = String(b64 || "").trim();
  if (!raw) throw new Error("empty_base64");
  const out = await upscaleFlyerAiBackgroundPng(Buffer.from(raw, "base64"));
  return out.toString("base64");
}
