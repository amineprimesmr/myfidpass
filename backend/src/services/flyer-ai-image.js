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
  /** @deprecated Clients récents envoient `palette_colors_hex` (1–3 teintes ordonnées) ; si présent, il fait foi pour le brief couleur. */
  visual_mood: z.enum(VISUAL_MOODS).optional(),
  /** Jusqu’à 3 couleurs #RRGGBB, ordre = priorité (index 0 = dominante). */
  palette_colors_hex: z.array(z.string().regex(/^#[0-9A-Fa-f]{6}$/)).max(3).optional(),
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
    "premium multi-sector retail poster, soft even studio light, restrained smooth gradients on a LIGHT background, matte or satin surfaces, crisp print-ready finish — calm and expensive, never busy, never dark",
  energetic:
    "high-impact commercial loyalty poster, saturated accent colors as CLEAN flat fields and smooth blends on a LIGHT pastel base — strong contrast via color blocks, not darkness; sector-agnostic, never dark backgrounds",
  minimal:
    "Swiss editorial layout, generous margins, thin rules, one hero focal point, almost no ornament — predominantly white or very light background",
  street:
    "urban commercial energy, contemporary signage mood, large flat LIGHT color shapes and smooth gradients — backdrop stays clean and bright, no gritty noise or scattered highlights",
  gourmet:
    "refined artisan / craft poster: soft even lighting on a LIGHT smooth background; hero food or product only where the brief asks — background remains uncluttered and bright, no bokeh orbs or sparkle",
  playful:
    "friendly commercial graphics: rounded flat color shapes and PASTEL fields on a light background — playful through COLOR and layout only; never literal bubbles, balloons-as-bokeh, glitter, or confetti",
};

/** Ambiance par défaut quand le client envoie une palette priorisée (sans `visual_mood`). */
const DEFAULT_FLYER_ATMOSPHERE_EN =
  "polished commercial loyalty creative: honor the COLOR PRIORITY strictly but keep ALL large background areas LIGHT and PALE — shift provided colors toward their pastel / tinted-white equivalent for big fills; use the pure brand colors only in smaller accent shapes. Flat smooth digital finish like a clean UI mockup — buttery gradients, print-ready, sector-agnostic, zero paper or film texture.";

/**
 * Résout primaire / secondaire / tertiaire et le texte d’atmosphère pour les prompts image.
 * @param {z.infer<typeof bodySchema>} input
 */
export function resolveFlyerColorPlan(input) {
  const accent = String(input.accent_color_hex || "").trim();
  const secFieldRaw = input.secondary_color_hex;
  const secField =
    secFieldRaw && String(secFieldRaw).trim() ? String(secFieldRaw).trim() : undefined;
  const palRaw = input.palette_colors_hex;
  const pal = Array.isArray(palRaw)
    ? palRaw.map((x) => String(x).trim()).filter((x) => /^#[0-9A-Fa-f]{6}$/.test(x)).slice(0, 3)
    : [];

  const usePalette = pal.length > 0;
  const primary = usePalette ? pal[0] : accent;
  const secondary = usePalette ? pal[1] ?? secField : secField;
  const tertiary = usePalette ? pal[2] : undefined;

  let atmosphere = DEFAULT_FLYER_ATMOSPHERE_EN;
  if (!usePalette && input.visual_mood && MOOD_EN_UNIVERSAL[input.visual_mood]) {
    atmosphere = MOOD_EN_UNIVERSAL[input.visual_mood];
  }

  return { primary, secondary, tertiary, atmosphere, usedPalette: usePalette };
}

/**
 * @param {ReturnType<typeof resolveFlyerColorPlan>} plan
 */
function buildColorPriorityHintEn(plan) {
  const { primary, secondary, tertiary } = plan;
  if (tertiary && secondary) {
    return (
      "COLOR PRIORITY (strict): (1) " +
      primary +
      " — dominant in large gradients and main background; (2) " +
      secondary +
      " — accents, mid-tones, wheel alternation partner; (3) " +
      tertiary +
      " — sparingly for depth (shadows, thin rims, small highlights). Blend smoothly — not an equal third-third-third split."
    );
  }
  if (secondary) {
    return (
      "COLOR PRIORITY: (1) " +
      primary +
      " dominant; (2) " +
      secondary +
      " for accents, secondary masses, and alternation — smooth blends."
    );
  }
  return (
    "Primary brand hue " +
    primary +
    "; expand with cream, white, or a deep neutral harmonizing with that hue."
  );
}

/** Exigence surface / texture (tous prompts image flyer & fond fidélité). */
const FLYER_SURFACE_CLEANLINESS_EN =
  "SURFACE QUALITY (mandatory — non-negotiable): The background must look like a CLEAN STUDIO PRINT or vector-grade poster: perfectly SMOOTH color with ONLY broad radial or linear gradients and soft vignettes. " +
  "ABSOLUTELY NO TEXTURES OF ANY KIND: no paper grain, no canvas weave, no linen, no brushed metal, no noise, no film grain, no JPEG-like artifacts, no scratches, no dust, no watercolor paper tooth, no concrete, no plaster, no fabric macro, no wood grain, no halftone dots, no stippling, no crosshatch, no scan lines, no digital noise, no mottling, no cloudy speckle. " +
  "FORBIDDEN visual junk: no bokeh orbs, no soap bubbles, no glitter, no star sparkles, no confetti, no scattered highlights, no high-frequency detail in empty color areas. " +
  "Color transitions must be SILKY and continuous — like a premium app UI gradient, not a photograph of a wall. If products or food appear, their surfaces can be detailed; every EMPTY area and every backdrop field stays glass-smooth.";

/**
 * Règle de luminosité / saturation du fond (obligatoire, tous prompts flyer).
 * Le fond doit rester CLAIR pour que le contenu (texte, QR, roue) ressorte bien.
 */
const FLYER_BACKGROUND_LIGHTNESS_EN =
  "BACKGROUND LIGHTNESS & SATURATION (mandatory — overrides all other instructions): " +
  "The overall background MUST be LIGHT, SOFT, and AIRY — never dark, never deep, never moody, never black or near-black. " +
  "ALL large background areas must have HIGH luminosity (think cream, off-white, pale blush, light pastel, or softly tinted linen — luminosity above 75% in HSL). " +
  "Colors must be DESATURATED and FADED — muted pastels, chalky tints, or washed-out fields only — NEVER vivid, punchy, neon, or fully saturated. Think a faded Polaroid or a sun-bleached poster: colors are present but gentle. " +
  "If the provided palette contains dark colors (navy, black, deep brown, deep red, etc.), use them ONLY for thin outlines, very small accents, or subtle detail shadows — NEVER spread them over large background areas. " +
  "Result: the background must look light enough that dark text, a dark QR code, and all overlay elements remain perfectly readable on top of it without any contrast issue.";

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
    palette_colors_hex: d.palette_colors_hex,
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
  /** Jusqu’à 4 entrées (1 logo + 3 inspirations) — aligné sur `style_reference_images_base64` max 3 + `logo_base64`. */
  const capped = imgs.slice(0, 4);
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
  const plan = resolveFlyerColorPlan(input);
  const merchantBrief = buildMerchantBriefForPrompt(input);
  const colorHint = buildColorPriorityHintEn(plan);

  const multimodalLines = [];
  if (multimodalHint.styleRefCount > 0) {
    multimodalLines.push(
      "REFERENCE IMAGE(S): moodboard only — extract COLOR PALETTE, overall MOOD, and lighting direction. NEVER transfer photographic grain, texture, noise, or surface detail from references onto the output background — the output must stay glass-smooth. If a reference is a transparent PNG (cutout logo), use it only for color/shape hints; NEVER paste it as an opaque rectangle onto the canvas. NEVER reproduce logos, text, QR codes, or wheels from references onto the output bitmap. NEVER composite a readable logo mark into the output — the app composites the official merchant logo separately at full resolution and sharp edges on top."
    );
  }

  const lines = [
    "MERCHANT BRIEF (authoritative): " + merchantBrief,
    "SECTOR FIDELITY (critical): Decorative imagery MUST match the MERCHANT BRIEF only. If ambiguous, use abstract brand-colored shapes.",
    "TASK: ONE portrait 2:3 BACKGROUND PLATE only, full bleed, no outer frame, no white border.",
    "NOT A FINISHED FLYER: Our software will draw on top, in fixed positions: commerce logo (top band, PNG with transparency), prize wheel (PNG) centered on the page, headline text, QR code bottom-right, footer steps. Your output is ONLY the wallpaper behind those layers.",
    "Z-ORDER / REALITY: This PNG is the bottom layer only. The QR is painted in software on top — keep the bottom-right corner (~68–100% width, ~74–100% height) visually calmer.",
    "════════════════ COMPOSITION — MID-FLYER / WHEEL LEVEL (highest priority) ═══════════════",
    "VERTICAL ANCHOR (critical): The prize wheel overlay in software is centered at X=50% of canvas width and Y≈53% of canvas height (measured from the TOP); its diameter is about 60% of image width. Primary decorative subjects (food, products, mascots, props that match the MERCHANT BRIEF) MUST sit at the SAME VERTICAL LEVEL as that wheel — place their visual mass around Y=49–59% (slightly below optical center), NOT squeezed into the top 0–28% « above » the wheel.",
    "CENTER OF MASS (mandatory): The centroid of each main decorative prop (cup, burger, fries, product) must lie between Y=48% and Y=60% of canvas height — NOT Y=12–35%. If you place anything in the top 0–32% band, it may only be soft empty gradient — no readable hero objects there.",
    "SIDE PLACEMENT: Put rich, readable hero imagery mainly in the LEFT column (~8–36% width) and RIGHT column (~64–92% width), vertically centered around Y≈53%, so it flanks the wheel at mid-height. The central soft disk (see RESERVED WHEEL ZONE) stays low-detail — no competing focal points inside it.",
    "FORBIDDEN LAYOUT: Do NOT park all decorative interest only in the upper third of the canvas; that looks disconnected from the wheel. Do NOT float all props high above the wheel band. Do NOT align hero food or products along a horizontal line above the wheel — they must sit beside the wheel at mid-flyer.",
    "════════════════ ABSOLUTE BANS — NEVER VIOLATE ═══════════════",
    "NEVER draw any prize wheel, roulette, spinner, pie chart with segments, dial, or circular game divided into wedges.",
    "NEVER draw any text, letters, numbers, slogans, logos, wordmarks, or typographic mockups.",
    "NEVER draw QR codes, barcodes, Data Matrix, or square black-and-white module grids.",
    "NEVER draw footer strips, numbered steps, phone mockups, or « scan to play » style phrases.",
    "NEVER draw the merchant logo or brand mark (logo is composited in software).",
    "NEVER use bokeh, glitter, bubbles, star sparkles, confetti, grain, paper texture, or any patterned noise on the background — color fields must be perfectly smooth.",
    "════════════════ RESERVED WHEEL ZONE (empty of game UI) ═══════════════",
    "Leave a SOFT, LOW-DETAIL circular or elliptical area centered at X=50% width and Y=53% of canvas height from top, diameter about 60–64% of image WIDTH. Inside this zone: ONLY an ultra-smooth flat-to-gradient color field — ZERO texture, ZERO noise — NO wheel shape, NO segments, NO pointer, NO hub detail. This zone must stay visually calm so a separate wheel asset sits on top without visual clash.",
    "TOP 0–14%: calmer band for headline + merchant logo overlay in software (do not draw a logo — uncluttered background only).",
    "BOTTOM ~12%: relatively calm for footer UI; bottom-right stays quieter for QR (see above).",
    FLYER_BACKGROUND_LIGHTNESS_EN,
    FLYER_SURFACE_CLEANLINESS_EN,
    "BACKGROUND: Pure SMOOTH COLOR FIELDS only — think luxury app onboarding screen or Apple-style gradient: soft radial + linear blends, gentle vignette, NO texture layer at all. Do NOT imitate film, print stock, or « material » surfaces. " +
      colorHint +
      " Atmosphere: " +
      plan.atmosphere +
      ". At most 3–4 cohesive colors; transitions must be buttery, not gritty.",
    "STYLE: Bold commercial look through COLOR BLOCKS and clean composition only — print-ready, even lighting — absolutely no decorative texture or atmospheric noise.",
    "SELF-CHECK: (1) zero wheels; (2) zero text; (3) zero QR; (4) zero logos; (5) central zone soft for overlay; (6) hero decor at mid-flyer (Y~49–59%) flanking the wheel; (7) zoom mentally: empty regions must look perfectly smooth — if you see grain or texture, regenerate mentally to a clean gradient; (8) overall background is LIGHT and PALE — never dark.",
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
  const plan = resolveFlyerColorPlan(input);
  const accent = plan.primary;
  const secondaryHex = plan.secondary?.trim();
  const secondary = secondaryHex
    ? `WEDGE FILLS ONLY (six segments, clockwise from the top segment under the pointer): recolor flat fill of wedges 1,3,5 to ${accent}; wedges 2,4,6 to ${secondaryHex}. Strict alternation.`
    : `WEDGE FILLS ONLY (six segments, clockwise from the top segment under the pointer): recolor wedges 1,3,5 to ${accent}; wedges 2,4,6 to clean white or warm cream. Strict alternation.`;
  const merchantBrief = buildMerchantBriefForPrompt(input);
  const concept = input.cuisine_or_concept.trim();

  const sectorFidelity =
    "SECTOR FIDELITY (critical): Decorative imagery around the wheel MUST match the MERCHANT BRIEF only. Do NOT substitute unrelated stock subjects. If ambiguous, use brand-colored abstract shapes.";

  const multimodalLines = [];
  if (multimodalHint.hasLogo) {
    multimodalLines.push(
      "REFERENCE IMAGE #1 = OFFICIAL MERCHANT LOGO (may be transparent PNG). Composite at TOP (0–18% height): centered, crisp, faithful — preserve transparency, no opaque backing plate — no duplicate logo elsewhere."
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
    "ZONE B — CENTER ~18–82%: Composit the canonical wheel (last reference) centered at X=50%, center Y≈53% of canvas height, diameter ≈58–62% of image WIDTH — uniform scale, preserve aspect ratio. Add 1–3 decorative elements left/right per MERCHANT BRIEF; their vertical center of mass MUST sit at Y≈50–58% (same band as the wheel), flanking the wheel — NOT clustered in the top 15–35% of the canvas. Props may overlap the rim slightly for depth.",
    "ZONE C — BOTTOM 82–100%: Clean continuation of background only — no new objects.",
    FLYER_BACKGROUND_LIGHTNESS_EN,
    FLYER_SURFACE_CLEANLINESS_EN,
    "BACKGROUND: Smooth color fields and soft gradients around the wheel. " +
      buildColorPriorityHintEn(plan) +
      " Atmosphere: " +
      plan.atmosphere +
      ". Max 3–4 cohesive colors outside wedge recoloring — no speckles or bokeh orbs.",
    secondary,
    "SELF-CHECK: (1) exactly one wheel (the provided asset); (2) all original wheel text unchanged; (3) only wedge fills recolored; (4) no QR anywhere; (5) bottom 18% clean; (6) overall background is LIGHT and PALE — never dark.",
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
  const plan = resolveFlyerColorPlan(input);
  const accent = plan.primary;
  const secondaryHex = plan.secondary?.trim();
  const secondary = secondaryHex
    ? `WHEEL PAINT (exactly 6 segments, clockwise from the top segment under the pointer): segments 1,3,5 = solid ${accent}; segments 2,4,6 = solid ${secondaryHex}. Strict alternation — adjacent segments must never share the same fill.`
    : `WHEEL PAINT (exactly 6 segments, clockwise from the top segment under the pointer): segments 1,3,5 = solid ${accent}; segments 2,4,6 = solid white or warm cream. Strict alternation — adjacent segments must never share the same fill.`;
  const merchantBrief = buildMerchantBriefForPrompt(input);

  const sectorFidelity =
    "SECTOR FIDELITY (critical): Decorative imagery MUST match the MERCHANT BRIEF only. Do NOT substitute unrelated stock subjects (no random food if the brief is automotive, etc.). If ambiguous, use brand-colored abstract shapes rather than guessing an industry.";

  const taskStructure =
    "TASK: Generate ONE print-ready promotional flyer image, portrait 2:3 aspect, full bleed to all edges, no outer frame, no white border. The merchant will add headline text, QR code, and footer UI in software — your image must NEVER include those.";

  const sideImagery =
    "SIDE DECOR: Left and right of the wheel, place 1–3 rich decorative elements consistent with the MERCHANT BRIEF. Their vertical center of mass MUST align with the wheel center (Y≈52–56% from top), not bunched above the wheel — FORBIDDEN: lining up cups, burgers, or hero products only in the top 10–32% of the image height. They may overlap the wheel rim for depth. High-quality photorealistic or polished illustration — not generic clipart. Keep subjects inside the mid-flyer hero band (roughly Y 42–66%).";

  const referenceStyle =
    "STYLE: Bold, vibrant, professional commercial print — cohesive lighting and shadows across all layers.";

  const multimodalLines = [];
  if (multimodalHint.hasLogo) {
    multimodalLines.push(
      "REFERENCE IMAGE #1 = OFFICIAL MERCHANT LOGO (often a transparent PNG cutout). Composite this exact mark at the TOP of the flyer (0–18% height): horizontally centered, crisp, faithful colors/shapes/typography — do NOT invent a different mark. If the reference has transparency, preserve it — do NOT add a solid rectangle behind the mark. Size ≈ 18–24% of image width. Subtle soft shadow or glow OK. Do NOT duplicate the logo elsewhere."
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
    "ZONE B — CENTER ~18% to ~82% HEIGHT: Main composition — prize wheel + left/right decor. Wheel center at X=50%, Y≈53% of full image height from top (slightly below optical middle — decor must not float too high). Decorative props flank the wheel at the SAME vertical level (mid-flyer): centroid of each side prop at Y≈50–58%, never only in the top quarter of the canvas. Horizontal center X = 50% of image width.",
    "ZONE C — BOTTOM 82–100% HEIGHT (18%): MUST remain visually clean — only smooth color/gradient continuing from above (no texture). NO objects, NO text, NO icons, NO wheel fragments, NO props encroaching from above.",
    sideImagery,
    FLYER_BACKGROUND_LIGHTNESS_EN,
    FLYER_SURFACE_CLEANLINESS_EN,
    "BACKGROUND: Smooth blended color fields. " +
      buildColorPriorityHintEn(plan) +
      " Depth from large soft radial or linear gradients and gentle vignette only — NO grain, NO bokeh, NO sparkles. Atmosphere: " +
      plan.atmosphere +
      ". Use at most 3–4 cohesive colors total.",
    "COLOR INTENSITY GUARDRAIL (mandatory): Prefer SOFT, PASTEL, LOW-CONTRAST palettes. Avoid neon, ultra-saturated magenta/orange/blue, and avoid very dark high-contrast scenes. Keep the overall backdrop bright and print-friendly.",
    "LUMINANCE TARGET: The global background should feel light (roughly equivalent to a bright mid/high key wallpaper), never moody-dark. If unsure, choose a lighter, less saturated variant.",
    "PRIZE WHEEL — GEOMETRY: Exactly ONE circular wheel, perfect circle (no ellipse), no second wheel. EXACTLY 6 equal wedges (60° each). Six outer rim divisions. One small triangular pointer at 12 o'clock. Outer wheel diameter ≈ 58–62% of image WIDTH (slightly 'dezoomed' vs full width).",
    secondary,
    "WHEEL LABELS (clockwise from the top wedge under the pointer): Wedge1=GAGNÉ; Wedge2=GAGNÉ; Wedge3=GAGNÉ; Wedge4=GAGNÉ; Wedge5=GAGNÉ; Wedge6=PERDU. Bold uppercase French, high contrast, radially readable inside each wedge (~70% of wedge radial length). No other text on the flyer.",
    "WHEEL HUB: Small decorative metallic pin/cap at center — gold or silver OK. No QR-like texture.",
    "SELF-CHECK: (1) six wedges only; (2) labels exactly as specified; (3) hub not QR-like; (4) wheel center ≈(50% X, 53% Y from top); (5) wheel diameter ≈60% of image width; (6) side decor at mid-flyer height, not only above the wheel; (7) bottom 18% empty of objects; (8) zero QR/barcodes; (9) overall background is LIGHT and PALE — never dark.",
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
  const plan = resolveFlyerColorPlan(input);
  const merchantBrief = buildMerchantBriefForPrompt(input);

  const colorHarmony = buildColorPriorityHintEn(plan);

  const sectorFidelity =
    "SECTOR FIDELITY (critical): Mood and subject choices MUST match the MERCHANT BRIEF only. If ambiguous, use abstract brand-colored shapes — do not substitute unrelated stock industries. Backdrop surfaces remain perfectly smooth (no photographic texture).";

  /** @type {string[]} */
  const multimodalLines = [];
  if (multimodalHint.styleRefCount > 0) {
    multimodalLines.push(
      "REFERENCE IMAGE(S): moodboard — palette and lighting only. NEVER copy grain, texture, or noise from references onto the wallpaper. NEVER copy text, QR codes, logos, or foreign marks from references."
    );
  }

  /** @type {string[]} */
  const lines = [
    "MERCHANT BRIEF (authoritative): " + merchantBrief,
    sectorFidelity,
    "TASK: Generate ONE mobile-first full-bleed BACKGROUND wallpaper only, portrait 2:3 aspect, full bleed to all edges, no outer frame, no white border.",
    "LIGHT & CALM (mandatory): Bright, airy, welcoming — use a SOFT VISIBLE TINT of the brand hue (roughly 6–14% saturation) or a gentle vertical gradient so the wallpaper is NEVER mistaken for plain #FFFFFF HTML white on a phone. NEVER a dark night scene; NEVER heavy black fields; NEVER dramatic low-key lighting.",
    "COLOR GUARDRAIL: pastel-to-soft tones only; avoid neon-like saturation spikes and avoid over-vivid punchy color blocks.",
    "NOT A FLYER: This image is a silent backdrop. The product will overlay HTML (title, logo image, roulette). Your output must stay empty of UI chrome.",
    "════════════════ ABSOLUTE BANS ═══════════════",
    "NEVER draw any prize wheel, roulette, spinner, pie chart with prizes, radial wedges, dial, fortune wheel, or circular game divided into segments.",
    "NEVER draw text, letters, numbers, logos, wordmarks, slogans, or typographic mockups.",
    "NEVER draw QR codes, barcodes, Data Matrix, or square black-and-white module grids.",
    "NEVER draw notification bell icons, red notification dots, lock-screen notification banners, or iOS/Android notification UI metaphors.",
    "COMPOSITION: Upper ~16% = calmer band for title + merchant logo (software); soft gradient only.",
    "LAYOUT vs HTML ROULETTE (critical): A large prize wheel is overlaid on the LEFT (~0–58% width), centered vertically around the MIDDLE of the canvas (Y≈50–56% from top). Do NOT place strong focal subjects inside the wheel footprint on the left — keep that area soft. Place recognizable subjects, dishes, and props mainly in the RIGHT half (~58–100% width) with their visual weight at MID-HEIGHT (Y≈47–62% from top) — aligned with the wheel’s vertical center, not only near the bottom corner. Bottom-right (~70–100% width, ~78–100% height) stays calmer for QR readability.",
    "FORBIDDEN: stacking all hero imagery in the top 25% or only in the extreme bottom corner — it must feel anchored to the same vertical band as the wheel.",
    FLYER_SURFACE_CLEANLINESS_EN,
    "BACKGROUND: Smooth full-bleed wallpaper — vector-clean gradients only, like a premium mobile app screen. " +
      colorHarmony +
      " Depth from soft gradients and gentle vignette only — zero paper grain, zero film noise, zero bokeh, zero sparkles, zero material textures. Atmosphere: " +
      plan.atmosphere +
      ". At most 3–4 cohesive colors total.",
    "STYLE: Bold commercial ambience — polished, glass-smooth color fields; no printed-paper simulation and no textured noise.",
    ...multimodalLines,
    "SELF-CHECK: (1) zero wheels or spinners; (2) zero text; (3) zero logos; (4) zero notification UI; (5) upper band calmer; (6) full bleed; (7) empty areas look perfectly smooth at 100% zoom — no grit.",
  ];

  return lines.filter(Boolean).join(" ");
}

/** @returns {{ model: string, body: Record<string, unknown> }} */
function flyerImageRequestPayload(prompt, options = {}) {
  const transparentBackground = options.transparentBackground === true;
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
        background: transparentBackground ? "transparent" : "opaque",
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
      background: transparentBackground ? "transparent" : "opaque",
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
async function openaiImageEdits(apiKey, prompt, images, hasLogo, hasTemplateWheel, options = {}) {
  const clipped = prompt.length > 8000 ? prompt.slice(0, 8000) : prompt;
  const transparentBackground = options.transparentBackground === true;
  const model = resolveModelForFlyer(true);
  const highFidelity = Boolean(hasLogo || hasTemplateWheel);
  const body = {
    model,
    prompt: clipped,
    images,
    n: 1,
    size: "1024x1536",
    quality: "high",
    background: transparentBackground ? "transparent" : "opaque",
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
async function openaiImageGenerations(apiKey, prompt, options = {}) {
  const { body } = flyerImageRequestPayload(prompt, options);
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
export async function openaiGenerateFlyerImage(apiKey, prompt, multimodal, options = {}) {
  const images = multimodal?.images?.length ? [...multimodal.images] : [];
  const hasLogo = Boolean(multimodal?.hasLogo);
  const hasTemplateWheel = Boolean(multimodal?.hasTemplateWheel);
  if (images.length === 0) {
    return openaiImageGenerations(apiKey, prompt, options);
  }
  return openaiImageEdits(apiKey, prompt, images, hasLogo, hasTemplateWheel, options);
}

export { VISUAL_MOODS };
