/**
 * Détourage logo flyer via remove.bg (API payante, clé REMOVEBG_API_KEY).
 */
import sharp from "sharp";

const REMOVE_BG_URL = "https://api.remove.bg/v1.0/removebg";

/**
 * @param {Buffer} input — PNG ou JPEG
 * @returns {Promise<{ ok: true, png: Buffer } | { ok: false, code: string, message?: string }>}
 */
export async function removeLogoBackgroundWithRemoveBg(input) {
  let pngBuf;
  try {
    pngBuf = await sharp(input)
      .rotate()
      .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 6 })
      .toBuffer();
  } catch (e) {
    return { ok: false, code: "IMAGE_DECODE_FAILED", message: String(e?.message || e) };
  }

  const key = (process.env.REMOVEBG_API_KEY || "").trim();
  if (!key || key.length < 8) {
    return { ok: false, code: "REMOVEBG_NOT_CONFIGURED", message: "REMOVEBG_API_KEY manquant ou trop court." };
  }

  try {
    const form = new FormData();
    form.set("image_file", new Blob([new Uint8Array(pngBuf)], { type: "image/png" }), "logo.png");
    form.set("size", "auto");
    const res = await fetch(REMOVE_BG_URL, {
      method: "POST",
      headers: { "X-Api-Key": key },
      body: form,
    });
    if (!res.ok) {
      const t = (await res.text().catch(() => "")).slice(0, 500);
      return { ok: false, code: "REMOVEBG_HTTP_ERROR", message: `status ${res.status} — ${t}` };
    }
    const ab = await res.arrayBuffer();
    const out = Buffer.from(ab);
    if (out.length < 32) {
      return { ok: false, code: "REMOVEBG_EMPTY", message: "Réponse vide de remove.bg." };
    }
    return { ok: true, png: out };
  } catch (e) {
    return { ok: false, code: "REMOVEBG_FETCH_ERROR", message: String(e?.message || e).slice(0, 900) };
  }
}
