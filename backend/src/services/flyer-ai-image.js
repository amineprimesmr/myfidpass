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

/** Taille max décodée par image (JPEG/PNG après décodage base64). Augmenté pour photos iPhone réelles. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const bodySchema = z.object({
  brand_name: z.string().min(1, "Nom de marque requis.").max(80),
  cuisine_or_concept: z
    .string()
    .min(1, "Description de l’activité requise.")
    .max(400, "Description trop longue (400 caractères max)."),
  accent_color_hex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Couleur principale invalide (#RRVVBB)."),
  secondary_color_hex: z
    .union([z.string().regex(/^#[0-9A-Fa-f]{6}$/), z.literal("")])
    .optional(),
  visual_mood: z.enum(VISUAL_MOODS),
  extra_context: z.string().max(400).optional(),
  /** Base64 / data URL : ~33 % plus long que le binaire — marge pour 8 Mo décodés. */
  logo_base64: z.string().max(14_000_000).optional(),
  style_reference_images_base64: z.array(z.string().max(14_000_000)).max(3).optional(),
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
    `Business sector / activity AND what to show visually around the wheel (products, services, hero imagery — any sector; interpret literally): « ${input.cuisine_or_concept.trim()} ».`,
  ];
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
    throw new Error(
      `Chaque image doit faire au plus ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))} Mo après décodage (réduisez la photo ou réessayez).`
    );
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
    accent_color_hex: d.accent_color_hex.trim(),
    secondary_color_hex:
      d.secondary_color_hex && String(d.secondary_color_hex).trim()
        ? String(d.secondary_color_hex).trim()
        : undefined,
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
 * Si l’app n’a pas envoyé de logo mais qu’un logo carte existe en base, on l’injecte pour
 * forcer le flux `images/edits` (meilleure fidélité du logo en tête d’affiche).
 * @param {{ images: Array<{ image_url: string }>, hasLogo: boolean, styleRefCount: number }} multimodal
 * @param {string} businessId
 * @param {(id: string, kind: "logo") => string | null} getAssetData
 */
export function mergeServerLogoIntoMultimodal(multimodal, businessId, getAssetData) {
  if (!businessId || multimodal.hasLogo) return multimodal;
  const raw = getAssetData(String(businessId), "logo");
  if (!raw?.trim()) return multimodal;
  try {
    const { dataUrl } = decodeDataUrlOrBase64(raw);
    return {
      images: [{ image_url: dataUrl }, ...multimodal.images],
      hasLogo: true,
      styleRefCount: multimodal.styleRefCount,
    };
  } catch {
    return multimodal;
  }
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
    ? `WHEEL PAINT (exactly 6 segments, clockwise from the top segment under the pointer): segments 1,3,5 = solid ${accent}; segments 2,4,6 = solid ${secondaryHex}. Strict alternation — adjacent segments must never share the same fill.`
    : `WHEEL PAINT (exactly 6 segments, clockwise from the top segment under the pointer): segments 1,3,5 = solid ${accent}; segments 2,4,6 = solid white or warm cream. Strict alternation — adjacent segments must never share the same fill.`;
  const mood = MOOD_EN_UNIVERSAL[input.visual_mood] || MOOD_EN_UNIVERSAL.energetic;
  const merchantBrief = buildMerchantBriefForPrompt(input);

  const sectorFidelity =
    "SECTOR FIDELITY (critical): Decorative imagery MUST match the MERCHANT BRIEF only. Do NOT substitute unrelated stock subjects (no random food if the brief is automotive, etc.). If ambiguous, use brand-colored abstract shapes rather than guessing an industry.";

  const taskStructure =
    "TASK: Generate ONE print-ready promotional flyer image, portrait 2:3 aspect, full bleed to all edges, no outer frame, no white border. The merchant will add headline text, QR code, and footer UI in software — your image must NEVER include those.";

  const sideImagery =
    "SIDE DECOR: Left and right of the wheel, place 1–3 rich decorative elements consistent with the MERCHANT BRIEF (products, themed objects, sector-appropriate). They may overlap the wheel rim for depth (some behind, some in front). High-quality photorealistic or polished illustration — not generic clipart. Keep all of this inside the CENTER HERO ZONE only.";

  const referenceStyle =
    "STYLE: Bold, vibrant, professional commercial print — cohesive lighting and shadows across all layers.";

  const multimodalLines = [];
  if (multimodalHint.hasLogo) {
    multimodalLines.push(
      "REFERENCE IMAGE #1 = OFFICIAL MERCHANT LOGO (mandatory integration). Composite this exact logo at the TOP of the flyer: horizontally centered, crisp, faithful colors/shapes/typography — do NOT invent a different mark. Size ≈ 20–25% of the image width. Add a subtle premium treatment (soft glow, light shadow, or soft circular backing) so it floats cleanly above the background. Do NOT duplicate the logo elsewhere. The logo must sit entirely inside the TOP ZONE (0–20% height) — no other graphics or text in that band except the logo treatment."
    );
  }
  if (multimodalHint.styleRefCount > 0) {
    multimodalLines.push(
      "Following reference image(s) after the logo (if any): MOODBOARD / STYLE ONLY — borrow palette, lighting, materials, atmosphere; NEVER copy text, QR codes, prices, or foreign logos. Stay aligned with the MERCHANT BRIEF sector."
    );
  }

  /** @type {string[]} */
  const lines = [
    "MERCHANT BRIEF (authoritative): " + merchantBrief,
    sectorFidelity,
    taskStructure,
    "════════════════ STRICT BANS — NEVER VIOLATE ═══════════════",
    "NEVER draw any QR code, barcode, Data Matrix, Aztec, or any square black-and-white module grid ANYWHERE (including hub, corners, products, fake 'scan' graphics).",
    "NEVER draw text: « Scannez & Gagnez », « Scanner & Gagner », « Scan & Win », « Votre Cadeau », « Your Gift », « Scanne pour jouer », « Scan to play », or similar.",
    "NEVER draw numbered steps (1,2,3), instruction footers, phone mockups at the bottom, gift icons in a bottom strip, or any footer strip content — these are added in software.",
    "FORBIDDEN: Do not print the raw brief sentence « " + concept + " » as poster text (unless it already exists inside the provided logo artwork).",
    "ABSOLUTE BAN — QR-LIKE HUB: Wheel hub = ONE plain solid circle (metal cap look OK). No QR-like grid, no 3×3 finder patterns, no dense tile matrix.",
    referenceStyle,
    "════════════════ VERTICAL LAYOUT (TOP → BOTTOM) ═══════════════",
    "ZONE A — TOP 0–20% HEIGHT: Merchant logo (when reference provided) centered; subtle halo/backing allowed; NO other text, icons, or busy objects in this band.",
    "ZONE B — CENTER ~20% to ~82% HEIGHT (≈62%): Main composition — prize wheel + left/right decor. Wheel sits UPPER-MIDDLE of this zone (place the wheel center noticeably ABOVE the global vertical midpoint of the full image — target wheel center Y ≈ 44% of image height from top) so the wheel reads 'higher' on the page. Horizontal center X = 50% of image width.",
    "ZONE C — BOTTOM 82–100% HEIGHT (18%): MUST remain visually clean — only background color/gradient/texture continuing from above. NO objects, NO text, NO icons, NO wheel fragments, NO props encroaching from above.",
    sideImagery,
    "BACKGROUND: Rich layered textured background (never flat). Primary brand hue: " +
      accent +
      ". Build depth with radial gradients, subtle grain/noise, soft bokeh shapes. Atmosphere: " +
      mood +
      ". Use at most 3–4 cohesive colors total.",
    "PRIZE WHEEL — GEOMETRY: Exactly ONE circular wheel, perfect circle (no ellipse), no second wheel. EXACTLY 6 equal wedges (60° each). Six outer rim divisions. One small triangular pointer at 12 o'clock. Outer wheel diameter ≈ 58–62% of image WIDTH (slightly 'dezoomed' vs full width).",
    secondary,
    "WHEEL LABELS (clockwise from the top wedge under the pointer): Wedge1=GAGNÉ; Wedge2=GAGNÉ; Wedge3=GAGNÉ; Wedge4=GAGNÉ; Wedge5=GAGNÉ; Wedge6=PERDU. Bold uppercase French, high contrast, radially readable inside each wedge (~70% of wedge radial length). No other text on the flyer.",
    "WHEEL HUB: Small decorative metallic pin/cap at center — gold or silver OK. No QR-like texture.",
    "SELF-CHECK: (1) six wedges only; (2) labels exactly as specified; (3) hub not QR-like; (4) wheel center ≈(50% X, 44% Y from top); (5) wheel diameter ≈60% of image width; (6) bottom 18% empty of objects; (7) zero QR/barcodes.",
    "QUALITY: Crisp print, clean edges, coherent lighting, no disconnected floating artifacts.",
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
