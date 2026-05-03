/**
 * Détourage logo flyer via Replicate (cjwbw/rembg).
 * Clé API : REPLICATE_API_TOKEN (Railway / env).
 */
import sharp from "sharp";

const REPLICATE_PREDICTIONS_URL = "https://api.replicate.com/v1/models/cjwbw/rembg/predictions";

/**
 * @param {Buffer} input — PNG ou JPEG
 * @returns {Promise<{ ok: true, png: Buffer } | { ok: false, code: string, message?: string }>}
 */
export async function removeLogoBackgroundWithRemoveBg(input) {
  // Resize + convert to JPEG pour réduire la taille du payload
  let jpegBuf;
  try {
    jpegBuf = await sharp(input)
      .rotate()
      .resize({ width: 1500, height: 1500, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();
  } catch (e) {
    return { ok: false, code: "IMAGE_DECODE_FAILED", message: String(e?.message || e) };
  }

  const token = (process.env.REPLICATE_API_TOKEN || "").trim();
  if (!token || token.length < 8) {
    return { ok: false, code: "REPLICATE_NOT_CONFIGURED", message: "REPLICATE_API_TOKEN manquant." };
  }

  const imageDataUrl = `data:image/jpeg;base64,${jpegBuf.toString("base64")}`;

  try {
    // Envoie la prédiction avec Prefer: wait (Replicate attend la réponse jusqu'à 60 s)
    const createRes = await fetch(REPLICATE_PREDICTIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({ input: { image: imageDataUrl } }),
    });

    if (!createRes.ok) {
      const t = (await createRes.text().catch(() => "")).slice(0, 500);
      return { ok: false, code: "REPLICATE_HTTP_ERROR", message: `create HTTP ${createRes.status} — ${t}` };
    }

    let prediction = await createRes.json();

    // Si Replicate n'a pas fini en 60 s (Prefer: wait), on poll
    if (prediction.status !== "succeeded" && prediction.urls?.get) {
      prediction = await pollPrediction(prediction.urls.get, token, 90_000);
    }

    if (prediction.status === "failed" || prediction.status === "canceled") {
      return { ok: false, code: "REPLICATE_FAILED", message: prediction.error ?? "Prédiction échouée." };
    }
    if (prediction.status !== "succeeded") {
      return { ok: false, code: "REPLICATE_TIMEOUT", message: "Délai dépassé." };
    }

    const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    if (!outputUrl || typeof outputUrl !== "string") {
      return { ok: false, code: "REPLICATE_NO_OUTPUT", message: "Pas d'URL de sortie." };
    }

    const imgRes = await fetch(outputUrl);
    if (!imgRes.ok) {
      return { ok: false, code: "REPLICATE_DOWNLOAD_FAILED", message: `HTTP ${imgRes.status} téléchargement PNG.` };
    }
    const ab = await imgRes.arrayBuffer();
    const png = Buffer.from(ab);
    if (png.length < 32) {
      return { ok: false, code: "REPLICATE_EMPTY", message: "PNG de sortie vide." };
    }
    return { ok: true, png };
  } catch (e) {
    return { ok: false, code: "REPLICATE_FETCH_ERROR", message: String(e?.message || e).slice(0, 900) };
  }
}

/** Poll toutes les 2 s jusqu'à succeeded/failed ou timeout. */
async function pollPrediction(getUrl, token, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(getUrl, {
      headers: { Authorization: `Token ${token}` },
    });
    if (!res.ok) continue;
    const p = await res.json();
    if (p.status === "succeeded" || p.status === "failed" || p.status === "canceled") return p;
  }
  return { status: "timeout" };
}
