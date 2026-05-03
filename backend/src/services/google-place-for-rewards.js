/**
 * Récupère le contexte Google Places d'un commerce pour enrichir les suggestions IA.
 * Utilise place_id (depuis engagement_rewards) ou text search (nom + adresse).
 */

const PLACES_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";
const PLACES_TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json";

const DETAIL_FIELDS = "name,types,editorial_summary,reviews,price_level,formatted_address";

async function fetchJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function extractPlaceIdFromEngagementRewards(engagementRewardsJson) {
  if (!engagementRewardsJson || typeof engagementRewardsJson !== "string") return "";
  try {
    const o = JSON.parse(engagementRewardsJson);
    return String(o?.google_review?.place_id ?? "").trim();
  } catch {
    return "";
  }
}

function extractReviewExcerpts(reviews) {
  if (!Array.isArray(reviews) || reviews.length === 0) return [];
  return reviews
    .slice(0, 5)
    .map((r) => String(r?.text || "").trim())
    .filter((t) => t.length > 20)
    .map((t) => t.slice(0, 200));
}

function googleTypesToCategory(types) {
  if (!Array.isArray(types)) return null;
  const KNOWN = {
    bakery: "boulangerie / pâtisserie",
    meal_takeaway: "restauration rapide / à emporter",
    meal_delivery: "livraison de repas",
    restaurant: "restaurant",
    cafe: "café / salon de thé",
    bar: "bar",
    night_club: "boîte de nuit",
    beauty_salon: "salon de beauté",
    hair_care: "coiffure",
    spa: "spa / bien-être",
    gym: "salle de sport",
    supermarket: "supermarché / épicerie",
    grocery_or_supermarket: "épicerie",
    pharmacy: "pharmacie",
    clothing_store: "boutique de vêtements",
    jewelry_store: "bijouterie",
    shoe_store: "magasin de chaussures",
    book_store: "librairie",
    car_repair: "garage / réparation auto",
    car_wash: "lavage voiture",
    florist: "fleuriste",
    laundry: "laverie / pressing",
    butcher: "boucherie",
    liquor_store: "caviste / spiritueux",
    pet_store: "animalerie",
  };
  for (const t of types) {
    if (KNOWN[t]) return KNOWN[t];
  }
  return null;
}

/**
 * @param {{ organization_name?: string; location_address?: string; engagement_rewards?: string }} business
 * @param {string} apiKey GOOGLE_PLACES_API_KEY
 * @returns {Promise<{
 *   found: boolean;
 *   name?: string;
 *   googleCategory?: string;
 *   editorialSummary?: string;
 *   reviewExcerpts?: string[];
 *   priceLevel?: number;
 *   address?: string;
 * }>}
 */
export async function fetchPlaceContextForRewards(business, apiKey) {
  if (!apiKey) return { found: false };

  const placeId = extractPlaceIdFromEngagementRewards(business?.engagement_rewards);
  let resolvedPlaceId = placeId;

  // Si pas de place_id, chercher par nom + adresse
  if (!resolvedPlaceId && business?.organization_name) {
    const query = [business.organization_name, business.location_address]
      .filter(Boolean)
      .join(", ");
    const searchUrl = `${PLACES_TEXT_SEARCH_URL}?query=${encodeURIComponent(query)}&language=fr&key=${apiKey}`;
    const searchData = await fetchJson(searchUrl);
    if (searchData?.status === "OK" && searchData.results?.[0]?.place_id) {
      resolvedPlaceId = searchData.results[0].place_id;
    }
  }

  if (!resolvedPlaceId) return { found: false };

  const detailUrl = `${PLACES_DETAILS_URL}?place_id=${encodeURIComponent(resolvedPlaceId)}&fields=${DETAIL_FIELDS}&language=fr&key=${apiKey}`;
  const detail = await fetchJson(detailUrl);
  if (detail?.status !== "OK" || !detail.result) return { found: false };

  const r = detail.result;
  return {
    found: true,
    name: r.name || undefined,
    googleCategory: googleTypesToCategory(r.types),
    editorialSummary: r.editorial_summary?.overview || undefined,
    reviewExcerpts: extractReviewExcerpts(r.reviews),
    priceLevel: typeof r.price_level === "number" ? r.price_level : undefined,
    address: r.formatted_address || undefined,
  };
}
