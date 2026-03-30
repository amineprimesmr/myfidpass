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

/** @deprecated Utiliser `FLYER_AI_FREE_PER_MONTH` dans `flyer-ai-quota.js`. */
export { FLYER_AI_FREE_PER_MONTH as FLYER_AI_FREE_GENERATIONS } from "./flyer-ai-quota.js";

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

/**
 * Ambiances **neutres tous secteurs** (restauration, artisanat, auto, beauté, pêche, etc.) —
 * même outil que les solutions type carte fidélité multi-métiers : pas de défaut implicite « resto » ou « auto ».
 */
const MOOD_EN_UNIVERSAL = {
  premium:
    "premium multi-sector retail poster, soft studio light, restrained gradients, matte paper look, crisp print-ready finish",
  energetic:
    "high-impact commercial loyalty poster, saturated accents, punchy contrast, glossy print — sector-agnostic",
  minimal:
    "Swiss editorial layout, generous margins, thin rules, one hero focal point, almost no ornament",
  street:
    "urban commercial energy, contemporary signage mood, authentic texture, city retail context",
  gourmet:
    "refined artisan / craft poster: shallow depth of field, warm rim light, noble materials (wood, metal, stone, fabric, fresh produce, or product surfaces as appropriate to the brief)",
  playful:
    "friendly commercial graphics, rounded bubbles, pastel pops, approachable mascot or icon energy without clutter",
};

/**
 * Brief marchand unique (prioritaire sur toute supposition du modèle).
 * @param {z.infer<typeof bodySchema>} input
 */
function buildMerchantBriefForPrompt(input) {
  const parts = [
    `Brand name: « ${input.brand_name.trim()} ».`,
    `Business type / activity (this may be ANY sector — food, automotive, beauty, fishing, crafts, services, etc.): « ${input.cuisine_or_concept.trim()} ».`,
  ];
  if (input.hero_products?.trim()) {
    parts.push(`Products, services, or hero visuals to feature around the wheel (interpret literally for this sector): « ${input.hero_products.trim()} ».`);
  }
  if (input.tagline?.trim()) {
    parts.push(`Tagline context (do NOT render as text on the poster): « ${input.tagline.trim()} ».`);
  }
  if (input.extra_context?.trim()) {
    parts.push(`Owner constraints: « ${input.extra_context.trim().slice(0, 400)} ».`);
  }
  return parts.join(" ");
}

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
 * Prompt détaillé — **tous secteurs** (restauration, artisanat, pêche, auto, esthétique, etc.) :
 * le brief marchand fait foi ; aucune industrie par défaut.
 * @param {z.infer<typeof bodySchema>} input
 * @param {{ hasLogo: boolean, styleRefCount: number }} multimodalHint
 */
export function buildFlyerImagePrompt(input, multimodalHint = { hasLogo: false, styleRefCount: 0 }) {
  const concept = input.cuisine_or_concept.trim();
  const accent = input.accent_color_hex.trim();
  const secondaryHex = input.secondary_color_hex?.trim();
  const secondary = secondaryHex
    ? `Wheel fill colors: odd-numbered segments (1,3,5,7,9) = solid ${accent}; even-numbered segments (2,4,6,8) = solid ${secondaryHex}. Two fills only — never two touching segments the same color.`
    : `Wheel fill colors: odd segments (1,3,5,7,9) = solid ${accent}; even segments (2,4,6,8) = solid white or cream. Never two adjacent segments the same fill.`;
  const mood = MOOD_EN_UNIVERSAL[input.visual_mood] || MOOD_EN_UNIVERSAL.energetic;
  const merchantBrief = buildMerchantBriefForPrompt(input);

  const sectorFidelity =
    "SECTOR FIDELITY (critical): This tool serves every trade — food, bakery, butcher, fisher, artisan, hairdresser, car dealer, esthetician, retail, services, and many more. ALL decorative imagery around the wheel MUST match the MERCHANT BRIEF above only. Do NOT substitute unrelated stock imagery: no burgers if the brief is automotive; no cars if the brief is a bakery; no random food if the brief is beauty or fishing. If the brief is ambiguous, prefer neutral abstract textures and brand colors over guessing an industry.";

  const taskStructure =
    "TASK: One vertical print-ready poster, portrait ~2:3, full bleed. Structure from top to bottom: (1) optional logo band at top center when a logo reference is supplied; (2) large prize wheel in the middle; (3) photorealistic or high-end illustrative cutouts around the wheel that illustrate ONLY the merchant's sector and brief (products, services, tools, vehicles, ingredients, treatments, catch of the day, craft work — as appropriate); (4) soft background. The merchant adds the real scannable QR in software — your image must NOT contain any QR.";

  const sideImagery =
    "SIDE IMAGERY: Arrange visuals left/right of the wheel that clearly belong to the same business as the MERCHANT BRIEF (same sector, same offer). Use the exact subjects implied by the brief and hero line — across all industries.";

  const referenceStyle =
    "REFERENCE STYLE: Premium multi-sector loyalty poster — crisp prize wheel, photorealistic or polished illustrative cutouts faithful to the MERCHANT BRIEF, cohesive lighting, no generic unrelated industry.";

  const multimodalLines = [];
  if (multimodalHint.hasLogo) {
    multimodalLines.push(
      "REFERENCE IMAGE #1 = OFFICIAL BRAND LOGO. Recreate it faithfully at the TOP of the poster, horizontally CENTERED, in a compact top band (~10–14% of total image height). Same shapes, colors, and typography as the reference. Do not invent a different mark. Do not repeat the logo elsewhere on the poster."
    );
  }
  if (multimodalHint.styleRefCount > 0) {
    multimodalLines.push(
      "Following reference image(s) (after the logo, if any): STYLE / MOODBOARD ONLY — borrow color palette, lighting, materials, and atmosphere from the SAME industry as the MERCHANT BRIEF and references; do NOT copy text, prices, QR codes, or unrelated logos. Match the sector shown in the references (food, auto, beauty, etc.) to the brief, not a different industry."
    );
  }

  /** @type {string[]} */
  const lines = [
    "MERCHANT BRIEF (authoritative — follow above all else): " + merchantBrief,
    sectorFidelity,
    taskStructure,
    "ABSOLUTE BAN — QR / BARCODES / GRIDS: Do NOT draw any QR code, micro-QR, Data Matrix, Aztec code, or square grid of black modules ANYWHERE — not in the wheel hub, not in corners, not on products, not as a fake 'scan' graphic. The wheel center must NEVER look like a QR: no 3×3 finder squares, no dense black-and-white tile matrix. Hub = ONE plain solid circle only.",
    "ABSOLUTE BAN — QR / BARCODES (repeat): If you are about to draw something that resembles a QR or barcode, STOP and fill with solid color or soft gradient instead.",
    "FORBIDDEN TEXT / GRAPHICS: No headline « SCANNEZ », « GAGNEZ », « CADEAU », no slogan banners, no address, phone, hours, no footer strip with numbered steps, no « Scanne le QR », « tourne la roue », no ribbon « SCANNE POUR JOUER », no phone mockups.",
    "FORBIDDEN: Do not print the internal brief phrase « " +
      concept +
      " » as text on the poster (except as logo if the logo reference already contains it).",
    referenceStyle,
    "MID LAYOUT: Below the logo area (or from top if no logo), the wheel is the hero. " + sideImagery,
    "PRIZE WHEEL — GEOMETRY (critical): Exactly ONE wheel. EXACTLY 9 equal wedges (each 360÷9 = 40°). Count segments at the outer rim: must be 9 — not 6, 8, 10, 12, or 13. Exactly 9 radial spokes from hub to rim. Small pointer at top center.",
    secondary,
    "WHEEL — NO TEXT OR LETTERS (critical): Do NOT draw any letters, words, numbers, or typography on the wheel, inside wedges, or on the hub. Wedges = solid color fills only (alternating per rule above). The export pipeline draws crisp French labels (GAGNÉ / PERDU) in software — your image must NOT attempt text on the wheel (avoids garbled, truncated, or misspelled words like GAGNI, PERDO, GAG).",
    "WHEEL — SELF-CHECK: Before finishing, mentally count wedge boundaries at the outer circle — there must be exactly nine. Hub = one plain solid circle only (no QR-like grid).",
    "WHEEL HUB (critical): ONLY a small solid FLAT circle at the geometric center — diameter about 5–10% of the wheel diameter. Fill: white or very light cream, NO texture resembling QR modules, NO grid, NO radial black-white pattern.",
    "VISUAL RULES: French words on wheel only; no watermarks; no mirrored text.",
    "QUALITY: Sharp print, clean segment edges, even color fills.",
    mood + ".",
    ...multimodalLines,
  ];

  return lines.filter(Boolean).join(" ");
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
  const images = multimodal?.images?.length ? [...multimodal.images] : [];
  const hasLogo = Boolean(multimodal?.hasLogo);
  if (images.length === 0) {
    return openaiImageGenerations(apiKey, prompt);
  }
  return openaiImageEdits(apiKey, prompt, images, hasLogo);
}

export { VISUAL_MOODS };
