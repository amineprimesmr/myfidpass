import { Router } from "express";
import { Readable } from "stream";

const router = new Router();
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";

/**
 * GET /api/place-photo?place_id=xxx
 * Récupère la première photo du lieu via Google Place Details + Photo,
 * et la renvoie en image. Permet au frontend d’extraire les couleurs
 * sans CORS (canvas tainted).
 */
router.get("/", async (req, res) => {
  const placeId = req.query.place_id?.trim();
  if (!placeId) {
    res.status(400).json({ error: "place_id requis" });
    return;
  }
  if (!GOOGLE_PLACES_API_KEY) {
    res.status(503).json({ error: "Google Places non configuré (GOOGLE_PLACES_API_KEY)" });
    return;
  }
  try {
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=photos&key=${GOOGLE_PLACES_API_KEY}`;
    const detailsRes = await fetch(detailsUrl);
    const details = await detailsRes.json();
    if (details.status === "REQUEST_DENIED" || details.status === "OVER_QUERY_LIMIT") {
      res.status(403).json({
        error: "Clé Google refusée côté serveur.",
        code: details.status,
        hint: "Utilisez une clé avec restriction « Aucune » (ou « Adresses IP ») pour le backend. La clé « Référents HTTP » ne fonctionne que depuis le navigateur.",
      });
      return;
    }
    if (details.status !== "OK" || !details.result?.photos?.length) {
      res.status(404).json({ error: "Aucune photo pour ce lieu" });
      return;
    }
    const ref = details.result.photos[0].photo_reference;
    const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${encodeURIComponent(ref)}&key=${GOOGLE_PLACES_API_KEY}`;
    const photoRes = await fetch(photoUrl, { redirect: "follow" });
    if (!photoRes.ok) {
      res.status(502).json({ error: "Impossible de récupérer la photo" });
      return;
    }
    const contentType = photoRes.headers.get("content-type") || "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    Readable.fromWeb(photoRes.body).pipe(res);
  } catch (err) {
    console.error("[place-photo]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
