import { Router } from "express";

const router = new Router();
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";

/**
 * Mapping types Google Places → design Myfidpass (catégorie) + template par défaut (tampons).
 * Ordre = priorité : si plusieurs types matchent, le premier l'emporte.
 */
const GOOGLE_TYPE_TO_DESIGN = [
  { types: ["cafe", "bar"], design: "cafe" },
  { types: ["bakery"], design: "boulangerie" },
  { types: ["butcher"], design: "boucherie" },
  { types: ["hair_care"], design: "coiffure" },
  { types: ["spa", "beauty_salon"], design: "beauty" },
  { types: ["restaurant", "meal_delivery", "meal_takeaway", "fast_food", "food"], design: "fastfood" },
];

const DESIGN_TO_TEMPLATE_TAMPONS = {
  cafe: "cafe-tampons",
  fastfood: "fastfood-tampons",
  boulangerie: "boulangerie-tampons",
  boucherie: "boucherie-tampons",
  coiffure: "coiffure-tampons",
  beauty: "beauty-tampons",
};

/** Mots-clés (nom d'établissement) → design. Utilisé en secours sans place_id. */
const KEYWORD_TO_DESIGN = [
  { pattern: /\b(caf[eé]|coffee|bar\b|brasserie)\b/i, design: "cafe" },
  { pattern: /\b(boulangerie|bakery|p[aâ]tisserie)\b/i, design: "boulangerie" },
  { pattern: /\b(boucherie|butcher)\b/i, design: "boucherie" },
  { pattern: /\b(coiffeur|coiffure|salon\s+de\s+coiffure|hair)\b/i, design: "coiffure" },
  { pattern: /\b(beaut[eé]|spa|institut|esth[eé]tique|nail|onglerie)\b/i, design: "beauty" },
  { pattern: /\b(restaurant|fast[\s-]?food|burger|pizza|kebab|restauration|food)\b/i, design: "fastfood" },
];

function suggestFromGoogleTypes(types) {
  if (!Array.isArray(types) || types.length === 0) return null;
  const lower = types.map((t) => String(t).toLowerCase());
  for (const { types: matchTypes, design } of GOOGLE_TYPE_TO_DESIGN) {
    if (matchTypes.some((t) => lower.includes(t))) {
      const templateId = DESIGN_TO_TEMPLATE_TAMPONS[design];
      return { suggestedCategory: design, suggestedTemplateId: templateId || `${design}-tampons` };
    }
  }
  return null;
}

function suggestFromName(name) {
  if (!name || typeof name !== "string") return null;
  const text = name.trim();
  if (!text) return null;
  for (const { pattern, design } of KEYWORD_TO_DESIGN) {
    if (pattern.test(text)) {
      const templateId = DESIGN_TO_TEMPLATE_TAMPONS[design];
      return { suggestedCategory: design, suggestedTemplateId: templateId || `${design}-tampons` };
    }
  }
  return null;
}

/**
 * GET /api/place-category?place_id=xxx  ou  ?name=xxx
 * Suggère une catégorie (design) et un template à partir de Google Place types ou du nom.
 * Réponse : { suggestedCategory, suggestedTemplateId } ou { suggestedCategory: null, suggestedTemplateId: null }
 */
router.get("/", async (req, res) => {
  const placeId = req.query.place_id?.trim();
  const name = req.query.name?.trim();

  // 1) Si place_id et clé Google : appel Place Details (types)
  if (placeId && GOOGLE_PLACES_API_KEY) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=types&key=${GOOGLE_PLACES_API_KEY}`;
      const detailsRes = await fetch(url);
      const data = await detailsRes.json();
      if (data.status === "OK" && data.result?.types?.length) {
        const suggestion = suggestFromGoogleTypes(data.result.types);
        if (suggestion) {
          return res.json(suggestion);
        }
      }
    } catch (err) {
      console.error("[place-category] Place Details error:", err.message);
    }
  }

  // 2) Secours : suggestion par mots-clés sur le nom
  if (name) {
    const suggestion = suggestFromName(name);
    if (suggestion) {
      return res.json(suggestion);
    }
  }

  res.json({ suggestedCategory: null, suggestedTemplateId: null });
});

export default router;
