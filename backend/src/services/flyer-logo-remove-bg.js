/**
 * Détourage logo flyer — @imgly/background-removal-node (ONNX ISNET, gratuit, 100 % Node.js).
 * Aucune dépendance Python, aucun appel API payant.
 * Repli optionnel remove.bg uniquement si REMOVEBG_API_KEY est défini (secours).
 */
import sharp from "sharp";
import { removeBackground } from "@imgly/background-removal-node";

const REMOVE_BG_URL = "https://api.remove.bg/v1.0/removebg";

/** isnet_quant (~12 MB) : bon compromis qualité/vitesse pour Railway (cold-start minimal). */
const IMGLY_CONFIG = {
  model: "isnet_quant",
  output: { format: "image/png", quality: 1.0 },
};

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

  const imgly = await removeWithImglyNode(pngBuf);
  if (imgly.ok) return imgly;

  // Repli remove.bg (uniquement si clé configurée)
  const key = (process.env.REMOVEBG_API_KEY || "").trim();
  if (key.length >= 8) {
    const fallback = await removeWithRemoveBgApi(pngBuf);
    if (fallback.ok) return fallback;
    return {
      ok: false,
      code: "LOGO_BACKGROUND_REMOVAL_FAILED",
      message: [`imgly: ${imgly.message || imgly.code}`, `remove.bg: ${fallback.message || fallback.code}`]
        .join(" — ")
        .slice(0, 900),
    };
  }

  return imgly;
}

/**
 * @param {Buffer} pngBuf — PNG déjà normalisé par sharp
 */
async function removeWithImglyNode(pngBuf) {
  try {
    const blob = await removeBackground(pngBuf, IMGLY_CONFIG);
    const out = Buffer.from(await blob.arrayBuffer());
    if (!out || out.length < 32) {
      return { ok: false, code: "IMGLY_EMPTY_OUTPUT", message: "Sortie vide." };
    }
    return { ok: true, png: out };
  } catch (e) {
    return { ok: false, code: "IMGLY_FAILED", message: String(e?.message || e).slice(0, 900) };
  }
}

/**
 * Ancien fournisseur payant — uniquement si REMOVEBG_API_KEY est présent (secours).
 * @param {Buffer} pngBuf
 */
async function removeWithRemoveBgApi(pngBuf) {
  const key = (process.env.REMOVEBG_API_KEY || "").trim();
  if (!key || key.length < 8) {
    return { ok: false, code: "REMOVEBG_NOT_CONFIGURED" };
  }
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
    return { ok: false, code: "REMOVEBG_HTTP_ERROR", message: `status ${res.status} ${t}` };
  }
  const ab = await res.arrayBuffer();
  const out = Buffer.from(ab);
  if (out.length < 32) return { ok: false, code: "REMOVEBG_EMPTY" };
  return { ok: true, png: out };
}
