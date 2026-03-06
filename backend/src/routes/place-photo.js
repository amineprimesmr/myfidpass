import { Router } from "express";
import { Readable } from "stream";

const router = new Router();
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";

/**
 * Choisit la photo la plus susceptible d'être un logo : format carré (ratio ~1)
 * et préférence pour les plus petites (logos souvent en petit format).
 */
function pickLogoLikePhoto(photos) {
  if (!Array.isArray(photos) || photos.length === 0) return null;
  const withScore = photos
    .filter((p) => p.photo_reference && p.width > 0 && p.height > 0)
    .map((p) => {
      const w = p.width;
      const h = p.height;
      const ratio = w / h;
      const squareness = ratio >= 1 ? h / w : w / h;
      const maxDim = Math.max(w, h);
      return {
        ...p,
        squareness,
        maxDim,
        score: squareness * (1 - Math.min(maxDim, 800) / 2000),
      };
    })
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.maxDim - b.maxDim));
  return withScore[0] || photos[0];
}

/**
 * GET /api/place-photo?place_id=xxx
 * Récupère une photo du lieu (priorité : image type logo, format carré)
 * via Google Place Details + Photo. Renvoie l'image pour affichage et extraction de couleurs.
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
    const chosen = pickLogoLikePhoto(details.result.photos);
    const ref = chosen.photo_reference;
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
