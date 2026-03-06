import { Router } from "express";
import { Readable } from "stream";

const router = new Router();
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";

/**
 * Extrait le domaine (hostname) d'une URL de site web.
 */
function domainFromWebsite(website) {
  if (!website || typeof website !== "string") return null;
  const s = website.trim();
  if (!s) return null;
  try {
    const url = new URL(s.startsWith("http") ? s : `https://${s}`);
    const host = url.hostname.replace(/^www\./i, "");
    return host || null;
  } catch {
    return null;
  }
}

/**
 * Tente de récupérer le logo de la marque via le domaine (Clearbit, puis Google Favicon).
 * Retourne la Response fetch si une image logo est trouvée, sinon null.
 */
async function fetchLogoByDomain(domain) {
  if (!domain) return null;
  const domainsToTry = [domain];
  if (!domain.startsWith("www.")) domainsToTry.push(`www.${domain}`);

  for (const d of domainsToTry) {
    try {
      const clearbitUrl = `https://logo.clearbit.com/${d}`;
      const r = await fetch(clearbitUrl, { redirect: "follow" });
      if (r.ok && r.headers.get("content-type")?.startsWith("image/")) return r;
    } catch (_) {}
  }

  try {
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
    const r = await fetch(faviconUrl, { redirect: "follow" });
    if (r.ok && r.headers.get("content-type")?.startsWith("image/")) return r;
  } catch (_) {}

  return null;
}

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
 * Priorité 1 : logo de la marque (site web → Clearbit Logo ou Google Favicon).
 * Priorité 2 : photo du lieu Google (image la plus "type logo" : carrée, petite).
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
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=photos,website&key=${GOOGLE_PLACES_API_KEY}`;
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
    if (details.status !== "OK") {
      res.status(404).json({ error: "Lieu non trouvé" });
      return;
    }

    const result = details.result;
    const website = result.website;
    const domain = domainFromWebsite(website);

    const logoRes = domain ? await fetchLogoByDomain(domain) : null;
    if (logoRes) {
      const contentType = logoRes.headers.get("content-type") || "image/png";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "private, max-age=86400");
      res.setHeader("X-Logo-Source", "brand");
      Readable.fromWeb(logoRes.body).pipe(res);
      return;
    }

    if (!result.photos?.length) {
      res.status(404).json({ error: "Aucune photo pour ce lieu" });
      return;
    }

    const chosen = pickLogoLikePhoto(result.photos);
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
    res.setHeader("X-Logo-Source", "place_photo");
    Readable.fromWeb(photoRes.body).pipe(res);
  } catch (err) {
    console.error("[place-photo]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
