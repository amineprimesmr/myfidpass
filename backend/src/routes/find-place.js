import { Router } from "express";

const router = new Router();
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";

/**
 * GET /api/find-place?name=xxx
 * Trouve un lieu à partir du nom (Find Place from Text) et retourne place_id + name.
 * Permet d'afficher le logo même quand l'utilisateur n'a pas sélectionné l'établissement dans l'autocomplete.
 */
router.get("/", async (req, res) => {
  const name = req.query.name?.trim();
  if (!name) {
    res.status(400).json({ error: "Paramètre name requis" });
    return;
  }
  if (!GOOGLE_PLACES_API_KEY) {
    res.status(503).json({ error: "Google Places non configuré" });
    return;
  }
  try {
    const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(name)}&inputtype=textquery&fields=place_id,name&language=fr&key=${GOOGLE_PLACES_API_KEY}`;
    const r = await fetch(url);
    const data = await r.json();
    if (data.status === "REQUEST_DENIED" || data.status === "OVER_QUERY_LIMIT") {
      res.status(403).json({ error: "Clé Google refusée ou limite dépassée", code: data.status });
      return;
    }
    if (data.status !== "OK" || !data.candidates?.length) {
      res.status(404).json({ error: "Aucun lieu trouvé pour ce nom" });
      return;
    }
    const candidate = data.candidates[0];
    res.json({
      place_id: candidate.place_id || null,
      name: candidate.name || name,
    });
  } catch (err) {
    console.error("[find-place]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
