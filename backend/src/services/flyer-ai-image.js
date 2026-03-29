/**
 * Génération d’image flyer via OpenAI Image API.
 *
 * Modèle **gpt-image-1.5** : dernier modèle « GPT Image » (qualité max côté OpenAI, au-delà de DALL·E 3).
 * Réglages : portrait 1024×1536, quality high, PNG opaque = le plus coûteux / le plus net pour une affiche.
 *
 * Avec **logo** et/ou **images de référence DA** : `POST /v1/images/edits` (JSON) avec `images[].image_url` (data URL).
 * Sans image : `POST /v1/images/generations` comme avant.
 *
 * Surcharge rare : `FLYER_AI_IMAGE_MODEL` (ex. `gpt-image-1` si quota) — par défaut on ne baisse pas la qualité.
 * Clé API : OPENAI_API_KEY (Railway / env).
 */

/** Dernier modèle image « state of the art » exposé sur POST /v1/images/generations (doc OpenAI 2025–2026). */
const FLYER_AI_MODEL_BEST = "gpt-image-1.5";
import { z } from "zod";

const VISUAL_MOODS = ["premium", "energetic", "minimal", "street", "gourmet", "playful"];

/** Taille max décodée par image (évite surcharge mémoire / quota). */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const bodySchema = z.object({
  brand_name: z.string().min(1, "Nom de marque requis.").max(80),
  cuisine_or_concept: z.string().min(1, "Type de commerce / concept requis.").max(160),
  tagline: z.string().max(140).optional(),
  accent_color_hex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Couleur principale invalide (#RRVVBB)."),
  secondary_color_hex: z
    .union([z.string().regex(/^#[0-9A-Fa-f]{6}$/), z.literal("")])
    .optional(),
  hero_products: z.string().max(220).optional(),
  visual_mood: z.enum(VISUAL_MOODS),
  extra_context: z.string().max(400).optional(),
  logo_base64: z.string().max(6_000_000).optional(),
  style_reference_images_base64: z.array(z.string().max(6_000_000)).max(3).optional(),
});

const MOOD_EN = {
  premium:
    "premium French retail poster, soft studio light, restrained gradients, matte paper look, Michelin-adjacent clarity",
  energetic:
    "high-energy fast-food / takeaway poster, saturated accents, punchy contrast, glossy commercial print",
  minimal:
    "Swiss editorial layout, generous margins, thin rules, one hero focal point, almost no ornament",
  street:
    "urban street-food vibe, chalk and neon accents, authentic texture, night-market energy",
  gourmet:
    "gourmet artisan food ads, shallow depth of field on dishes, warm rim light, slate or wood surfaces",
  playful:
    "kawaii-influenced retail graphics, rounded bubbles, pastel pops, friendly mascot energy without clutter",
};

/**
 * @param {string} s
 * @returns {{ dataUrl: string }}
 */
function decodeDataUrlOrBase64(s) {
  const trimmed = String(s).trim();
  let mime = "image/jpeg";
  let b64Part = trimmed;
  const m = /^data:([^;]+);base64,(.+)$/s.exec(trimmed);
  if (m) {
    mime = m[1].split(";")[0].trim();
    b64Part = m[2];
  }
  const buf = Buffer.from(b64Part.replace(/\s/g, ""), "base64");
  if (buf.length < 32) {
    throw new Error("Image invalide ou trop petite.");
  }
  if (buf.length > MAX_IMAGE_BYTES) {
    throw new Error("Chaque image doit faire au plus 2 Mo (compressez ou réduisez la résolution).");
  }
  const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
  return { dataUrl };
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: z.infer<typeof bodySchema>, multimodal: { images: Array<{ image_url: string }>, hasLogo: boolean, styleRefCount: number } } | { ok: false, error: string }}
 */
export function parseFlyerAIBody(raw) {
  const r = bodySchema.safeParse(raw || {});
  if (!r.success) {
    const first = r.error.flatten().fieldErrors;
    const msg =
      Object.values(first)[0]?.[0] ||
      r.error.issues[0]?.message ||
      "Paramètres invalides.";
    return { ok: false, error: msg };
  }
  const d = r.data;
  const value = {
    brand_name: d.brand_name.trim(),
    cuisine_or_concept: d.cuisine_or_concept.trim(),
    tagline: d.tagline?.trim() || undefined,
    accent_color_hex: d.accent_color_hex.trim(),
    secondary_color_hex:
      d.secondary_color_hex && String(d.secondary_color_hex).trim()
        ? String(d.secondary_color_hex).trim()
        : undefined,
    hero_products: d.hero_products?.trim() || undefined,
    visual_mood: d.visual_mood,
    extra_context: d.extra_context?.trim() || undefined,
  };
  if (!value.brand_name.length || !value.cuisine_or_concept.length) {
    return { ok: false, error: "Champs obligatoires vides." };
  }

  /** @type {{ images: Array<{ image_url: string }>, hasLogo: boolean, styleRefCount: number }} */
  const multimodal = { images: [], hasLogo: false, styleRefCount: 0 };

  try {
    const logoRaw = d.logo_base64?.trim();
    if (logoRaw) {
      multimodal.images.push({ image_url: decodeDataUrlOrBase64(logoRaw).dataUrl });
      multimodal.hasLogo = true;
    }
    const refs = Array.isArray(d.style_reference_images_base64) ? d.style_reference_images_base64 : [];
    for (const item of refs) {
      if (!item?.trim()) continue;
      multimodal.images.push({ image_url: decodeDataUrlOrBase64(item.trim()).dataUrl });
      multimodal.styleRefCount += 1;
    }
  } catch (e) {
    return { ok: false, error: e?.message || "Image invalide." };
  }

  if (multimodal.images.length > 4) {
    return { ok: false, error: "Trop d’images (max. 4 : 1 logo + 3 références)." };
  }

  return { ok: true, value, multimodal };
}

/**
 * Prompt détaillé (anglais + textes FR entre guillemets) — aligné affiches pros type boulangerie / pizza / bubble tea.
 * @param {z.infer<typeof bodySchema>} input
 * @param {{ hasLogo: boolean, styleRefCount: number }} multimodalHint
 */
export function buildFlyerImagePrompt(input, multimodalHint = { hasLogo: false, styleRefCount: 0 }) {
  const brand = input.brand_name.trim();
  const concept = input.cuisine_or_concept.trim();
  const accent = input.accent_color_hex.trim();
  const secondary = input.secondary_color_hex?.trim()
    ? `Secondary accent color ${input.secondary_color_hex} (use for wheel segments, ribbons, or headline word « CADEAU »).`
    : `Derive a clean secondary (white, cream, or deep black) that complements ${accent}.`;
  const tag = input.tagline?.trim()
    ? `Small subtitle under the logo, exact French text: "${input.tagline.trim()}".`
    : "Optional thin subtitle line under the logo describing the offer type (breads, pizzas, drinks…) in small clean sans-serif.";
  const products = input.hero_products?.trim()
    ? `Hero food: show photorealistic dishes as sharp cutouts around the wheel — ${input.hero_products.trim()}. On wooden boards or plates, studio lighting, subtle steam OK, no floating disconnected PNG look.`
    : "Add 2–4 photorealistic food cutouts matching the cuisine, balanced left and right of the wheel.";
  const extra = input.extra_context?.trim()
    ? `Brand constraints (respect strictly): ${input.extra_context.trim().slice(0, 450)}`
    : "";

  const mood = MOOD_EN[input.visual_mood] || MOOD_EN.energetic;

  const multimodalLines = [];
  if (multimodalHint.hasLogo || multimodalHint.styleRefCount > 0) {
    multimodalLines.push(
      "INPUT IMAGES (order matters): The API sends reference images before this text — use them seriously."
    );
    if (multimodalHint.hasLogo) {
      multimodalLines.push(
        'First reference image is the OFFICIAL BRAND LOGO. Recreate it faithfully in the flyer header (same shapes, colors, proportions, typography). Do not invent a different mark. Place it cleanly on the top brand band, high contrast, print-ready.'
      );
    }
    if (multimodalHint.styleRefCount > 0) {
      multimodalLines.push(
        `Following reference image(s) are STYLE / MOODBOARD only: copy their color palette, lighting, grain, typography personality, and overall graphic atmosphere — not their unrelated text, prices, or competitor logos. Merge that visual DNA with the layout below.`
      );
    }
  }

  return [
    "TASK: One single finished vertical FLYER / poster image (print-ready), portrait ratio ~2:3, full bleed, no device frame, no phone mockup, no app UI screenshot.",
    "REFERENCE STYLE (quality bar): French high-street loyalty flyers — crisp vector graphics + studio food photography; looks like a real printed card, not a collage.",
    "LAYOUT ZONES (top → bottom, do not crowd; keep generous breathing room):",
    `HEADER: Brand block on a solid or gradient field using ${accent} plus black/white/cream. Render the trade name prominently, exact spelling: "${brand}".`,
    `Concept line: "${concept}". ${tag}`,
    "HEADLINE (French, must be readable): Line 1: « SCANNEZ & GAGNEZ » — Line 2: « VOTRE » + « CADEAU ! » with « CADEAU ! » in the accent color or white on a color block. Bold condensed sans-serif, thick dark outline around light letters OR inverse on dark band; perfect kerning, no warped letters.",
    "CENTER: Large prize wheel (roue de la fortune) behind a QR code. Wheel: alternating segments in brand colors; readable curved text « GAGNÉ » on segments (optional subtle « PERDU » segments like real games — keep legible). Small pointer at top. Wheel must look vector-clean, symmetric.",
    `QR CODE: One large square black-on-white QR module pattern centered on the lower half of the wheel, integrated into the design (not a crooked sticker). High contrast, sharp pixels, no smear, no broken modules.`,
    "CTA: Horizontal ribbon or pill to the side of the QR, French text exactly: « SCANNE POUR JOUER » — text and fill contrast strongly.",
    products,
    "FOOTER (dark band or full-width strip): three numbered steps in a row with small simple line icons (phone → wheel → gift). Exact short French lines: (1) « Scanne le QRcode » (2) « Fais tourner la roue » (3) « Découvre ton cadeau ». Numbers 1 2 3 aligned, even spacing.",
    "Optional bottom thin strip for city + phone in tiny clean sans-serif (placeholder text OK if no address provided).",
    secondary,
    "VISUAL RULES: No misspelled French, no mirrored text, no random English, no extra fake logos, no watermarks, no stock photo marks, no muddy shadows, no greasy blur.",
    "QUALITY: 8K advertising poster, sharp edges, consistent lighting, color grading cohesive with brand, professional food styling.",
    mood + ".",
    extra,
    ...multimodalLines,
  ]
    .filter(Boolean)
    .join(" ");
}

/** @returns {{ model: string, body: Record<string, unknown> }} */
function flyerImageRequestPayload(prompt) {
  const clipped = prompt.length > 8000 ? prompt.slice(0, 8000) : prompt;
  const envModel = process.env.FLYER_AI_IMAGE_MODEL;
  const modelRaw = (envModel && String(envModel).trim()) || FLYER_AI_MODEL_BEST;
  /** Détection insensible à la casse (sinon fallback avec `response_format` → erreur sur GPT Image). */
  const m = modelRaw.toLowerCase();

  // GPT Image 1.x : pas de `response_format` (réservé DALL·E 2/3 uniquement) ; b64_json renvoyé par défaut.
  if (m.startsWith("gpt-image")) {
    return {
      model: m,
      body: {
        model: m,
        prompt: clipped,
        n: 1,
        size: "1024x1536",
        quality: "high",
        background: "opaque",
        output_format: "png",
      },
    };
  }

  // DALL·E 3 uniquement : `response_format` encore supporté ici.
  if (m.includes("dall-e-3")) {
    return {
      model: "dall-e-3",
      body: {
        model: "dall-e-3",
        prompt: clipped.length > 3800 ? clipped.slice(0, 3800) : clipped,
        n: 1,
        size: "1024x1792",
        quality: "hd",
        response_format: "b64_json",
      },
    };
  }

  // Valeur d’env inconnue : même chemin que GPT Image (sans jamais envoyer `response_format`).
  return {
    model: FLYER_AI_MODEL_BEST,
    body: {
      model: FLYER_AI_MODEL_BEST,
      prompt: clipped,
      n: 1,
      size: "1024x1536",
      quality: "high",
      background: "opaque",
      output_format: "png",
    },
  };
}

/**
 * Modèle utilisable pour /images/edits (multimodal). DALL·E 3 ne suit pas ce flux.
 * @param {boolean} needsEdits
 */
function resolveModelForFlyer(needsEdits) {
  const envModel = process.env.FLYER_AI_IMAGE_MODEL;
  const raw = (envModel && String(envModel).trim()) || FLYER_AI_MODEL_BEST;
  const m = raw.toLowerCase();
  if (needsEdits) {
    if (m.startsWith("gpt-image")) return m;
    return FLYER_AI_MODEL_BEST;
  }
  return flyerImageRequestPayload("").model;
}

/**
 * @param {string} apiKey
 * @param {string} prompt
 * @param {Array<{ image_url: string }>} images
 * @param {boolean} hasLogo
 * @returns {Promise<{ b64: string, revised?: string }>}
 */
async function openaiImageEdits(apiKey, prompt, images, hasLogo) {
  const clipped = prompt.length > 8000 ? prompt.slice(0, 8000) : prompt;
  const model = resolveModelForFlyer(true);
  const body = {
    model,
    prompt: clipped,
    images,
    n: 1,
    size: "1024x1536",
    quality: "high",
    background: "opaque",
    output_format: "png",
    input_fidelity: hasLogo ? "high" : "low",
  };

  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg =
      json?.error?.message ||
      json?.message ||
      `OpenAI HTTP ${res.status}`;
    const err = new Error(errMsg);
    /** @type {any} */ (err).status = res.status;
    throw err;
  }
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64 || typeof b64 !== "string") {
    throw new Error("Réponse OpenAI invalide (pas d’image).");
  }
  return {
    b64,
    revised: typeof json?.data?.[0]?.revised_prompt === "string" ? json.data[0].revised_prompt : undefined,
  };
}

/**
 * @param {string} apiKey
 * @param {string} prompt
 * @returns {Promise<{ b64: string, revised?: string }>}
 */
async function openaiImageGenerations(apiKey, prompt) {
  const { body } = flyerImageRequestPayload(prompt);
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg =
      json?.error?.message ||
      json?.message ||
      `OpenAI HTTP ${res.status}`;
    const err = new Error(errMsg);
    /** @type {any} */ (err).status = res.status;
    throw err;
  }
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64 || typeof b64 !== "string") {
    throw new Error("Réponse OpenAI invalide (pas d’image).");
  }
  return {
    b64,
    revised: typeof json?.data?.[0]?.revised_prompt === "string" ? json.data[0].revised_prompt : undefined,
  };
}

/**
 * @param {string} apiKey
 * @param {string} prompt
 * @param {{ images: Array<{ image_url: string }>, hasLogo: boolean }} [multimodal]
 * @returns {Promise<{ b64: string, revised?: string }>}
 */
export async function openaiGenerateFlyerImage(apiKey, prompt, multimodal) {
  const images = multimodal?.images?.length ? multimodal.images : [];
  if (images.length === 0) {
    return openaiImageGenerations(apiKey, prompt);
  }
  return openaiImageEdits(apiKey, prompt, images, Boolean(multimodal?.hasLogo));
}

export { VISUAL_MOODS };
