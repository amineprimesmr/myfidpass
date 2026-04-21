/**
 * Proxy Google Places (autocomplete) pour l'app iOS et le web — clé API côté serveur uniquement.
 * GET /api/places/autocomplete?input=...
 */
import { Router } from "express";

const router = Router();
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";

router.get("/autocomplete", async (req, res) => {
  const input = String(req.query.input || "").trim();
  if (input.length < 2) {
    return res.status(400).json({ error: "Saisissez au moins 2 caractères" });
  }
  if (input.length > 120) {
    return res.status(400).json({ error: "Requête trop longue" });
  }
  if (!GOOGLE_PLACES_API_KEY) {
    return res.status(503).json({ error: "Recherche d'établissements indisponible" });
  }
  try {
    // Si l'input ressemble à un Place ID (alphanumérique sans espace), essayer /details directement.
    const looksLikePlaceId = /^[A-Za-z0-9_\-]{10,}$/.test(input);
    if (looksLikePlaceId) {
      const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(input)}&fields=name,formatted_address&language=fr&key=${GOOGLE_PLACES_API_KEY}`;
      const dr = await fetch(detailUrl);
      const dd = await dr.json();
      if (dd.status === "OK" && dd.result) {
        const name = dd.result.name || "";
        const addr = dd.result.formatted_address || "";
        return res.json({
          predictions: [{
            place_id: input,
            description: addr ? `${name}, ${addr}` : name,
            main_text: name,
            secondary_text: addr,
          }],
        });
      }
    }

    // Text Search — même index que Google Search, trouve toutes les branches d'une chaîne
    // et les petits commerces récents qu'Autocomplete ignore.
    const params = new URLSearchParams({
      query: input,
      type: "establishment",
      language: "fr",
      region: "fr",
      key: GOOGLE_PLACES_API_KEY,
    });
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`;
    const r = await fetch(url);
    const data = await r.json();
    if (data.status === "REQUEST_DENIED" || data.status === "OVER_QUERY_LIMIT") {
      return res.status(503).json({ error: "Service de recherche temporairement indisponible", code: data.status });
    }
    const predictions = (data.results || []).slice(0, 10).map((p) => {
      const name = p.name || "";
      const addr = p.formatted_address || "";
      return {
        place_id: p.place_id,
        description: addr ? `${name}, ${addr}` : name,
        main_text: name,
        secondary_text: addr,
      };
    });
    return res.json({ predictions });
  } catch (err) {
    console.error("[places/autocomplete]", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

/**
 * Détails légers d’un lieu (nom + adresse) pour préremplir l’UI quand on n’a que le place_id.
 * GET /api/places/details?place_id=...
 */
router.get("/details", async (req, res) => {
  const placeId = String(req.query.place_id || "").trim();
  if (!placeId || placeId.length > 300) {
    return res.status(400).json({ error: "place_id invalide" });
  }
  if (!GOOGLE_PLACES_API_KEY) {
    return res.status(503).json({ error: "Service indisponible" });
  }
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=name,formatted_address&language=fr&key=${GOOGLE_PLACES_API_KEY}`;
    const r = await fetch(url);
    const data = await r.json();
    if (data.status !== "OK" || !data.result) {
      return res.status(404).json({ error: "Lieu introuvable", code: data.status });
    }
    return res.json({
      place_id: placeId,
      name: data.result.name || "",
      formatted_address: data.result.formatted_address || "",
    });
  } catch (err) {
    console.error("[places/details]", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
