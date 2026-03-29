/**
 * Génération d’image flyer (DALL·E 3) pour le dashboard — prompt serveur uniquement.
 * Clé API : OPENAI_API_KEY (Railway / env).
 */
import { z } from "zod";

const VISUAL_MOODS = ["premium", "energetic", "minimal", "street", "gourmet", "playful"];

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
});

const MOOD_EN = {
  premium: "luxury high-end restaurant marketing, refined lighting, subtle gradients",
  energetic: "bold vibrant energetic fast-food poster, high contrast",
  minimal: "clean minimal Swiss-style layout, lots of whitespace, subtle",
  street: "urban street food poster, gritty authentic dynamic",
  gourmet: "gourmet artisan food styling, editorial quality",
  playful: "playful bubbly friendly, rounded shapes, soft bokeh",
};

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: z.infer<typeof bodySchema> } | { ok: false, error: string }}
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
  return { ok: true, value };
}

/**
 * Prompt en anglais (meilleurs résultats DALL·E), contenu utilisateur entre guillemets.
 * @param {z.infer<typeof bodySchema>} input
 */
export function buildFlyerImagePrompt(input) {
  const secondary = input.secondary_color_hex?.trim()
    ? `Secondary brand color ${input.secondary_color_hex}.`
    : "Harmonious secondary color complementing the accent.";
  const tag = input.tagline?.trim()
    ? `Tagline text (exact spelling): "${input.tagline.trim()}".`
    : "No tagline; focus on brand name and headline.";
  const products = input.hero_products?.trim()
    ? `Feature these foods as realistic cutout photos around the wheel: ${input.hero_products.trim()}.`
    : "Include 2–4 appetizing food photo cutouts appropriate to the concept.";
  const extra = input.extra_context?.trim()
    ? `Additional brand notes: ${input.extra_context.trim().slice(0, 400)}`
    : "";

  const mood = MOOD_EN[input.visual_mood] || MOOD_EN.energetic;

  return [
    "Professional vertical promotional flyer design, portrait 2:3 aspect, mobile poster, print-ready graphic design.",
    "NOT a screenshot, NOT a UI mockup of an app — a single flat marketing poster image.",
    "Structure from top to bottom:",
    "1) Top: brand area — logo space for text",
    `   Brand name to emphasize visually (exact): "${input.brand_name.trim()}".`,
    `   Business type / cuisine: "${input.cuisine_or_concept.trim()}".`,
    `   ${tag}`,
    "2) Large headline in French: \"SCANNEZ & GAGNEZ\" and \"VOTRE CADEAU !\" — bold sans-serif, white or light fill, thick black outline, strong shadow for readability.",
    `3) Center: prize wheel (roulette) with alternating segments, text \"GAGNÉ\" on segments. Wheel uses accent color ${input.accent_color_hex}. ${secondary}`,
    "   A large crisp black-and-white QR code placeholder centered on the lower part of the wheel (solid modules, scannable look).",
    "4) Rounded CTA pill button: text \"SCANNE POUR JOUER\" in white on accent color.",
    products,
    "5) Bottom dark horizontal band with 3 numbered steps with tiny icons: (1) scan QR (2) spin wheel (3) discover gift — short French phrases.",
    "Optional thin footer strip for address/phone in small text.",
    mood + ".",
    "High resolution, sharp typography, cohesive brand palette, no watermarks, no gibberish text, no deformed QR, no extra logos besides the brand name area.",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * @param {string} apiKey
 * @param {string} prompt
 * @returns {Promise<{ b64: string, revised?: string }>}
 */
export async function openaiGenerateFlyerImage(apiKey, prompt) {
  const clipped = prompt.length > 3800 ? prompt.slice(0, 3800) : prompt;
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt: clipped,
      n: 1,
      size: "1024x1792",
      quality: "hd",
      response_format: "b64_json",
    }),
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

export { VISUAL_MOODS };
