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
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FLYER_WHEEL_ASSETS_DIR = join(__dirname, "../assets");
/** Priorité : `rouegpt.png` (roue officielle GPT / flyer), puis repli `flyer-wheel-template.png`. */
const FLYER_WHEEL_ROUEGPT_PATH = join(FLYER_WHEEL_ASSETS_DIR, "rouegpt.png");
const FLYER_WHEEL_TEMPLATE_FALLBACK_PATH = join(FLYER_WHEEL_ASSETS_DIR, "flyer-wheel-template.png");

function resolveFlyerWheelAssetPathForAI() {
  if (existsSync(FLYER_WHEEL_ROUEGPT_PATH)) return FLYER_WHEEL_ROUEGPT_PATH;
  if (existsSync(FLYER_WHEEL_TEMPLATE_FALLBACK_PATH)) return FLYER_WHEEL_TEMPLATE_FALLBACK_PATH;
  return null;
}

/** @type {string | null | undefined} */
let cachedFlyerWheelDataUrl;

function flyerAiCanonicalWheelEnvOn() {
  const v = process.env.FLYER_AI_USE_CANONICAL_WHEEL;
  if (v === "0" || v === "false" || v === "no") return false;
  return true;
}

/**
 * Data URL PNG de la roue modèle (cache process). `null` si fichier absent.
 * @returns {string | null}
 */
export function getFlyerWheelTemplateDataUrl() {
  if (cachedFlyerWheelDataUrl !== undefined) return cachedFlyerWheelDataUrl;
  try {
    const wheelPath = resolveFlyerWheelAssetPathForAI();
    if (!wheelPath) {
      cachedFlyerWheelDataUrl = null;
      return null;
    }
    const buf = readFileSync(wheelPath);
    if (buf.length < 64) {
      cachedFlyerWheelDataUrl = null;
      return null;
    }
    cachedFlyerWheelDataUrl = `data:image/png;base64,${buf.toString("base64")}`;
    return cachedFlyerWheelDataUrl;
  } catch {
    cachedFlyerWheelDataUrl = null;
    return null;
  }
}

/**
 * Ajoute la roue canonique en dernière image (max 4 refs OpenAI) : logo + jusqu’à 2 inspirations + roue,
 * ou 3 inspirations + roue sans logo.
 *
 * @param {{ images: Array<{ image_url: string }>, hasLogo: boolean, styleRefCount: number }} multimodal
 * @returns {{ multimodal: { images: Array<{ image_url: string }>, hasLogo: boolean, styleRefCount: number, hasTemplateWheel?: boolean }, hasTemplateWheel: boolean }}
 */
export function mergeFlyerWheelTemplateMultimodal(multimodal) {
  const m = multimodal || { images: [], hasLogo: false, styleRefCount: 0 };
  if (!flyerAiCanonicalWheelEnvOn()) {
    return { multimodal: { ...m, hasTemplateWheel: false }, hasTemplateWheel: false };
  }
  const wheelUrl = getFlyerWheelTemplateDataUrl();
  if (!wheelUrl) {
    return { multimodal: { ...m, hasTemplateWheel: false }, hasTemplateWheel: false };
  }
  const hasLogo = Boolean(m.hasLogo);
  const src = Array.isArray(m.images) ? [...m.images] : [];
  const maxRefs = hasLogo ? 2 : 3;
  /** @type {Array<{ image_url: string }>} */
  const built = [];
  if (hasLogo && src.length > 0) {
    built.push(src[0]);
    for (let i = 1; i < Math.min(src.length, 1 + maxRefs); i++) {
      built.push(src[i]);
    }
  } else {
    for (let i = 0; i < Math.min(src.length, maxRefs); i++) {
      built.push(src[i]);
    }
  }
  built.push({ image_url: wheelUrl });
  const refSlots = Math.max(0, built.length - (hasLogo ? 1 : 0) - 1);
  return {
    multimodal: {
      images: built,
      hasLogo,
      styleRefCount: refSlots,
      hasTemplateWheel: true,
    },
    hasTemplateWheel: true,
  };
}

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
    "premium multi-sector retail poster, soft even studio light, restrained smooth gradients, matte or satin surfaces, crisp print-ready finish — calm and expensive, never busy",
  energetic:
    "high-impact commercial loyalty poster, saturated accent colors as CLEAN flat fields and smooth blends, strong contrast via color blocks — not glossy sparkle, sector-agnostic",
  minimal:
    "Swiss editorial layout, generous margins, thin rules, one hero focal point, almost no ornament",
  street:
    "urban commercial energy, contemporary signage mood, large flat color shapes and smooth gradients — backdrop stays clean, no gritty noise or scattered highlights",
  gourmet:
    "refined artisan / craft poster: soft even lighting, smooth backgrounds; hero food or product only where the brief asks — background remains uncluttered, no bokeh orbs or sparkle",
  playful:
    "friendly commercial graphics: rounded flat color shapes and pastel fields — playful through COLOR and layout only; never literal bubbles, balloons-as-bokeh, glitter, or confetti",
};

/** Exigence surface / texture (tous prompts image flyer & fond fidélité). */
const FLYER_SURFACE_CLEANLINESS_EN =
  "SURFACE QUALITY (mandatory): Background must look SMOOTH and PROFESSIONAL — large-scale gradients, soft vignettes, or very subtle uniform paper texture only. " +
  "FORBIDDEN visual noise: no bokeh circles, no lens orbs, no soap bubbles, no glitter, no star sparkles, no confetti, no scattered white dots, no high-frequency grain, no speckled / noisy texture, no bubbly halftone, no 'sparkle' or 'magical particle' effects. " +
  "If you show food or products, keep their edges clean; the surrounding color fields stay smooth and flat-to-gradient.";

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
/**
 * Génération « fond seul » : pas de logo ni roue dans les refs OpenAI — le canvas éditeur compose logo, roue, textes, QR.
 *
 * @param {{ images: Array<{ image_url: string }>, hasLogo: boolean, styleRefCount: number }} multimodal
 * @returns {{ images: Array<{ image_url: string }>, hasLogo: boolean, styleRefCount: number, hasTemplateWheel?: false }}
 */
export function multimodalForFlyerBackgroundOnly(multimodal) {
  const m = multimodal || { images: [], hasLogo: false, styleRefCount: 0 };
  const imgs = Array.isArray(m.images) ? [...m.images] : [];
  /** Jusqu’à 3 refs (logo éventuel + inspirations) : ambiance / palette uniquement — pas de collage logo dans le prompt. */
  const capped = imgs.slice(0, 3);
  return {
    images: capped,
    hasLogo: false,
    styleRefCount: capped.length,
    hasTemplateWheel: false,
  };
}

/**
 * Prompt : plaque de fond 2:3 uniquement. Zone centrale réservée à la roue (douce, peu détaillée) — pas de roue dessinée.
 *
 * @param {z.infer<typeof bodySchema>} input
 * @param {{ styleRefCount: number }} multimodalHint
 */
export function buildFlyerImagePromptBackgroundOnly(input, multimodalHint = { styleRefCount: 0 }) {
  const accent = input.accent_color_hex.trim();
  const secondaryHex = input.secondary_color_hex?.trim();
  const mood = MOOD_EN_UNIVERSAL[input.visual_mood] || MOOD_EN_UNIVERSAL.energetic;
  const merchantBrief = buildMerchantBriefForPrompt(input);
  const colorHint = secondaryHex
    ? `Primary hue ${accent}; secondary ${secondaryHex} — blend in gradients and decor (not flat 50/50).`
    : `Primary hue ${accent}; support with cream, white, or deep neutral from the same family.`;

  const multimodalLines = [];
  if (multimodalHint.styleRefCount > 0) {
    multimodalLines.push(
      "REFERENCE IMAGE(S): moodboard / brand vibe only — palette, lighting, materials. NEVER reproduce logos, text, QR codes, or wheels from references onto the canvas. NEVER composite a readable logo mark into the output (software adds the official logo separately)."
    );
  }

  const lines = [
    "MERCHANT BRIEF (authoritative): " + merchantBrief,
    "SECTOR FIDELITY (critical): Decorative imagery MUST match the MERCHANT BRIEF only. If ambiguous, use abstract brand-colored shapes.",
    "TASK: ONE portrait 2:3 BACKGROUND PLATE only, full bleed, no outer frame, no white border.",
    "NOT A FINISHED FLYER: Our software will draw on top, in fixed positions: commerce logo, prize wheel (PNG), headline text, QR code, footer steps. Your output is ONLY the wallpaper behind those layers.",
    "Z-ORDER / REALITY: This PNG is the bottom layer only. Requests like « put a mascot above the QR » cannot be honored here — the QR is painted in software on top. Keep hero subjects, mascots, or products in side margins or upper band only; avoid the bottom-right quadrant (QR overlay) and the reserved wheel center.",
    "════════════════ ABSOLUTE BANS — NEVER VIOLATE ═══════════════",
    "NEVER draw any prize wheel, roulette, spinner, pie chart with segments, dial, or circular game divided into wedges.",
    "NEVER draw any text, letters, numbers, slogans, logos, wordmarks, or typographic mockups.",
    "NEVER draw QR codes, barcodes, Data Matrix, or square black-and-white module grids.",
    "NEVER draw footer strips, numbered steps, phone mockups, or « scan to play » style phrases.",
    "NEVER draw the merchant logo or brand mark (logo is composited in software).",
    "NEVER use bokeh, glitter, bubble textures, star sparkles, confetti, or speckled noise on the background — keep color fields smooth.",
    "════════════════ RESERVED WHEEL ZONE (empty of game UI) ═══════════════",
    "Leave a SOFT, LOW-DETAIL circular or elliptical area centered at X=50% width and Y=48% of canvas height from top, diameter about 60–64% of image WIDTH. Inside this zone: only smooth gradient, gentle vignette, or subtle texture — NO wheel shape, NO segments, NO pointer, NO hub detail. This zone must stay visually calm so a separate wheel asset sits on top without visual clash.",
    "Above that zone (~top 0–18%): calmer band for a logo overlay (do not draw a logo — just uncluttered background).",
    "Below ~62% from top: richer atmosphere matching the brief; keep bottom ~14% relatively calm for footer graphics added in software.",
    FLYER_SURFACE_CLEANLINESS_EN,
    "BACKGROUND: Smooth, layered COLOR only — soft radial or linear gradients, gentle vignette, optional very subtle uniform paper feel. Not flat posterboard, but NO busy texture. " +
      colorHint +
      " Atmosphere: " +
      mood +
      ". At most 3–4 cohesive colors.",
    "STYLE: Bold commercial ambience via color and composition only; print-ready; even, coherent lighting — no decorative noise.",
    "SELF-CHECK: (1) zero wheels; (2) zero text; (3) zero QR; (4) zero logos; (5) central zone soft for overlay; (6) zero bokeh/glitter/bubble noise.",
    ...multimodalLines,
  ];

  return lines.filter(Boolean).join(" ");
}

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
 * Flyer IA avec **roue canonique** (PNG serveur) : l’IA recolore les parts et compose le décor ;
 * elle ne redessine pas la roue ni les libellés GAGNÉ / PERDU.
 *
 * @param {z.infer<typeof bodySchema>} input
 * @param {{ hasLogo: boolean, styleRefCount: number }} multimodalHint
 */
function buildFlyerImagePromptTemplateWheel(input, multimodalHint = { hasLogo: false, styleRefCount: 0 }) {
  const accent = input.accent_color_hex.trim();
  const secondaryHex = input.secondary_color_hex?.trim();
  const secondary = secondaryHex
    ? `WEDGE FILLS ONLY (six segments, clockwise from the top segment under the pointer): recolor flat fill of wedges 1,3,5 to ${accent}; wedges 2,4,6 to ${secondaryHex}. Strict alternation.`
    : `WEDGE FILLS ONLY (six segments, clockwise from the top segment under the pointer): recolor wedges 1,3,5 to ${accent}; wedges 2,4,6 to clean white or warm cream. Strict alternation.`;
  const mood = MOOD_EN_UNIVERSAL[input.visual_mood] || MOOD_EN_UNIVERSAL.energetic;
  const merchantBrief = buildMerchantBriefForPrompt(input);
  const concept = input.cuisine_or_concept.trim();

  const sectorFidelity =
    "SECTOR FIDELITY (critical): Decorative imagery around the wheel MUST match the MERCHANT BRIEF only. Do NOT substitute unrelated stock subjects. If ambiguous, use brand-colored abstract shapes.";

  const multimodalLines = [];
  if (multimodalHint.hasLogo) {
    multimodalLines.push(
      "REFERENCE IMAGE #1 = OFFICIAL MERCHANT LOGO. Composite at TOP of flyer (0–20% height): centered, crisp, faithful — no duplicate logo elsewhere."
    );
  }
  if (multimodalHint.styleRefCount > 0) {
    multimodalLines.push(
      "Intermediate reference image(s) after the logo (if any): MOODBOARD / STYLE ONLY — palette, lighting, materials; NEVER copy foreign logos, QR codes, or extra wheels."
    );
  }
  multimodalLines.push(
    "FINAL REFERENCE IMAGE = OFFICIAL ROUE GPT ASSET (MyFidpass « rouegpt » PNG — exact wheel master). This raster is the SINGLE source of truth for wheel shape, rim, hub, pointer, segment boundaries, shadows, and ALL existing typography (GAGNÉ / PERDU and any other text already painted in the asset). ABSOLUTE RULES: (1) Do NOT draw a second wheel or alternate geometry. (2) Do NOT redraw, replace, move, warp, or re-type any letter or number — keep text pixel-stable. (3) ONLY adjust the flat fill color inside each of the six wedge regions to match the brand alternation below; preserve edge anti-aliasing and legibility. (4) Keep hub, pointer, outlines, and highlights coherent with the new fills."
  );

  const lines = [
    "MERCHANT BRIEF (authoritative): " + merchantBrief,
    sectorFidelity,
    "TASK: ONE print-ready portrait 2:3 flyer, full bleed, no outer frame. Software will add headline, QR, footer — never draw those.",
    "════════════════ STRICT BANS — NEVER VIOLATE ═══════════════",
    "NEVER draw any QR code, barcode, Data Matrix, or square black-and-white module grid ANYWHERE.",
    "NEVER draw footer instruction strips, numbered steps (1,2,3), phone mockups, or « Scannez & Gagnez » style slogans.",
    "FORBIDDEN: Do not print the raw brief sentence « " + concept + " » as poster text (unless inside the provided logo).",
    "ABSOLUTE BAN — QR-LIKE HUB: Do not turn the wheel hub into a QR-like grid.",
    "STYLE: Bold commercial print — cohesive lighting between background decor and the composited wheel.",
    "════════════════ LAYOUT (TOP → BOTTOM) ═══════════════",
    "ZONE A — TOP 0–20%: Logo band when logo reference provided; calm background only otherwise.",
    "ZONE B — CENTER ~20–82%: Composit the canonical wheel (last reference) centered at X=50%, center Y≈44% of canvas height, diameter ≈58–62% of image WIDTH — uniform scale, preserve aspect ratio. Add 1–3 decorative elements left/right per MERCHANT BRIEF; they may overlap the rim slightly.",
    "ZONE C — BOTTOM 82–100%: Clean continuation of background only — no new objects.",
    FLYER_SURFACE_CLEANLINESS_EN,
    "BACKGROUND: Smooth color fields and soft gradients around the wheel. Primary hue " +
      accent +
      ". Atmosphere: " +
      mood +
      ". Max 3–4 cohesive colors outside wedge recoloring — no speckles or bokeh orbs.",
    secondary,
    "SELF-CHECK: (1) exactly one wheel (the provided asset); (2) all original wheel text unchanged; (3) only wedge fills recolored; (4) no QR anywhere; (5) bottom 18% clean.",
    "QUALITY: Crisp print, clean edges.",
    ...multimodalLines,
  ];

  return lines.filter(Boolean).join(" ");
}

/**
 * Prompt détaillé — **tous secteurs** (restauration, artisanat, pêche, auto, esthétique, etc.) :
 * le brief marchand fait foi ; aucune industrie par défaut.
 * @param {z.infer<typeof bodySchema>} input
 * @param {{ hasLogo: boolean, styleRefCount: number, hasTemplateWheel?: boolean }} multimodalHint
 */
export function buildFlyerImagePrompt(input, multimodalHint = { hasLogo: false, styleRefCount: 0 }) {
  if (multimodalHint?.hasTemplateWheel) {
    return buildFlyerImagePromptTemplateWheel(input, multimodalHint);
  }
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
    FLYER_SURFACE_CLEANLINESS_EN,
    "BACKGROUND: Smooth blended color fields. Primary brand hue: " +
      accent +
      ". Depth from large soft radial or linear gradients and gentle vignette only — NO grain, NO bokeh, NO sparkles. Atmosphere: " +
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

/**
 * Multimodal pour le fond page fidélité : retire le logo (réf. #1) pour ne pas le « recoller » dans le PNG —
 * le logo commerce reste celui de la carte / `/public/logo`, comme sur le flyer composé dans l’app.
 * Si `stripTemplateWheel`, retire aussi la dernière image (roue canonique flyer).
 *
 * @param {{ images: Array<{ image_url: string }>, hasLogo: boolean, styleRefCount: number }} multimodal
 * @param {boolean} [stripTemplateWheel]
 */
export function multimodalForFidelityPageBackground(multimodal, stripTemplateWheel = false) {
  const m = multimodal || { images: [], hasLogo: false, styleRefCount: 0 };
  const imgs = Array.isArray(m.images) ? [...m.images] : [];
  if (m.hasLogo && imgs.length > 0) imgs.shift();
  if (stripTemplateWheel && imgs.length > 0) imgs.pop();
  return {
    images: imgs,
    hasLogo: false,
    styleRefCount: imgs.length,
  };
}

/**
 * Fond plein écran page `/fidelity/:slug` (jeu QR) : même brief marchand + couleurs + ambiance que le flyer,
 * sans roue ni texte — toile de fond pour la roue HTML + logo séparé.
 *
 * @param {z.infer<typeof bodySchema>} input
 * @param {{ styleRefCount: number }} multimodalHint
 */
export function buildFidelityClientPageBackgroundPrompt(
  input,
  multimodalHint = { styleRefCount: 0 },
) {
  const accent = input.accent_color_hex.trim();
  const secondaryHex = input.secondary_color_hex?.trim();
  const mood = MOOD_EN_UNIVERSAL[input.visual_mood] || MOOD_EN_UNIVERSAL.energetic;
  const merchantBrief = buildMerchantBriefForPrompt(input);

  const colorHarmony = secondaryHex
    ? `Primary brand color ${accent}; secondary hue ${secondaryHex} — blend both in gradients and accents (no harsh 50/50 split).`
    : `Primary brand color ${accent}; support with white, warm cream, or a deep neutral from the same family.`;

  const sectorFidelity =
    "SECTOR FIDELITY (critical): Atmosphere and textures MUST match the MERCHANT BRIEF only. If ambiguous, use abstract brand-colored shapes — do not substitute unrelated stock industries.";

  /** @type {string[]} */
  const multimodalLines = [];
  if (multimodalHint.styleRefCount > 0) {
    multimodalLines.push(
      "REFERENCE IMAGE(S): moodboard / palette / materials / lighting only — NEVER copy text, QR codes, logos, or foreign marks from references."
    );
  }

  /** @type {string[]} */
  const lines = [
    "MERCHANT BRIEF (authoritative): " + merchantBrief,
    sectorFidelity,
    "TASK: Generate ONE mobile-first full-bleed BACKGROUND wallpaper only, portrait 2:3 aspect, full bleed to all edges, no outer frame, no white border.",
    "NOT A FLYER: This image is a silent backdrop. The product will overlay HTML (title, logo image, roulette). Your output must stay empty of UI chrome.",
    "════════════════ ABSOLUTE BANS ═══════════════",
    "NEVER draw any prize wheel, roulette, spinner, pie chart with prizes, radial wedges, dial, fortune wheel, or circular game divided into segments.",
    "NEVER draw text, letters, numbers, logos, wordmarks, slogans, or typographic mockups.",
    "NEVER draw QR codes, barcodes, Data Matrix, or square black-and-white module grids.",
    "NEVER draw notification bell icons, red notification dots, lock-screen notification banners, or iOS/Android notification UI metaphors.",
    "COMPOSITION: Upper ~18% of canvas = calmer band (soft gradient or gentle vignette) so a separate logo (added in software) reads clearly when centered above the title.",
    "LAYOUT vs HTML ROULETTE (critical): A large prize wheel will be overlaid on the LEFT side of the screen (~0–58% width, roughly mid-to-lower height). Do NOT place food, products, mascots, faces, or any strong focal subject in that left zone or behind where that wheel sits. Keep ALL recognizable subjects, dishes, and high-detail props in the RIGHT half (roughly 62–100% width) and/or BOTTOM-RIGHT quadrant only. The left third must stay visually quiet — soft gradients, abstract color washes, or very subtle texture only — so nothing important is hidden behind the wheel.",
    "Lower ~82%: richer atmosphere through smooth color and soft large shapes; any concrete subjects stay bottom-right; keep contrast moderate so the HTML wheel remains readable on top.",
    FLYER_SURFACE_CLEANLINESS_EN,
    "BACKGROUND: Smooth full-bleed wallpaper. " +
      colorHarmony +
      " Depth from soft gradients and gentle vignette only — no grain, no bokeh orbs, no sparkles. Atmosphere: " +
      mood +
      ". At most 3–4 cohesive colors total.",
    "STYLE: Bold commercial ambience — polished, smooth, cohesive; no literal printed poster elements and no textured noise.",
    ...multimodalLines,
    "SELF-CHECK: (1) zero wheels or spinners; (2) zero text; (3) zero logos; (4) zero notification UI; (5) upper band calmer; (6) full bleed.",
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
 * @param {boolean} hasTemplateWheel
 * @returns {Promise<{ b64: string, revised?: string }>}
 */
async function openaiImageEdits(apiKey, prompt, images, hasLogo, hasTemplateWheel) {
  const clipped = prompt.length > 8000 ? prompt.slice(0, 8000) : prompt;
  const model = resolveModelForFlyer(true);
  const highFidelity = Boolean(hasLogo || hasTemplateWheel);
  const body = {
    model,
    prompt: clipped,
    images,
    n: 1,
    size: "1024x1536",
    quality: "high",
    background: "opaque",
    output_format: "png",
    input_fidelity: highFidelity ? "high" : "low",
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
  const hasTemplateWheel = Boolean(multimodal?.hasTemplateWheel);
  if (images.length === 0) {
    return openaiImageGenerations(apiKey, prompt);
  }
  return openaiImageEdits(apiKey, prompt, images, hasLogo, hasTemplateWheel);
}

export { VISUAL_MOODS };
