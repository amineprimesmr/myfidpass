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

const CLEARBIT_SIZE = 400;
const FETCH_HTML_TIMEOUT = 6000;

/** Pour les franchises (ex. mcdonalds.fr), retourne le domaine .com de la marque. */
function brandComDomain(domain) {
  if (!domain || domain.endsWith(".com")) return null;
  const base = domain.split(".")[0];
  if (!base || base.length < 2) return null;
  return `${base}.com`;
}

/** Clearbit Logo en haute résolution. Essaie domain, www.domain, puis brand.com (franchises). */
async function fetchClearbitLogo(domain) {
  const domainsToTry = [domain];
  if (!domain.startsWith("www.")) domainsToTry.push(`www.${domain}`);
  const com = brandComDomain(domain);
  if (com && !domainsToTry.includes(com)) domainsToTry.push(com);
  for (const d of domainsToTry) {
    try {
      const url = `https://logo.clearbit.com/${encodeURIComponent(d)}?size=${CLEARBIT_SIZE}`;
      const r = await fetch(url, { redirect: "follow" });
      if (r.ok && r.headers.get("content-type")?.startsWith("image/")) return r;
    } catch (_) {}
  }
  return null;
}

/** Récupère l'URL og:image ou twitter:image du site (logo / image marque). */
async function fetchOgImageUrl(websiteUrl) {
  if (!websiteUrl || typeof websiteUrl !== "string") return null;
  const url = websiteUrl.trim().startsWith("http") ? websiteUrl : `https://${websiteUrl}`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_HTML_TIMEOUT);
    const r = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const html = await r.text();
    const resolveUrl = (imgUrl) => {
      const u = imgUrl.trim();
      if (u.startsWith("http")) return u;
      try {
        return new URL(u, url).href;
      } catch {
        return null;
      }
    };
    const patterns = [
      /<meta[^>]+property\s*=\s*["']og:image["'][^>]+content\s*=\s*["']([^"']+)["']/i,
      /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+property\s*=\s*["']og:image["']/i,
      /<meta[^>]+name\s*=\s*["']og:image["'][^>]+content\s*=\s*["']([^"']+)["']/i,
      /<meta[^>]+property\s*=\s*["']twitter:image["'][^>]+content\s*=\s*["']([^"']+)["']/i,
      /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+property\s*=\s*["']twitter:image["']/i,
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m && m[1]) {
        const resolved = resolveUrl(m[1]);
        if (resolved) return resolved;
      }
    }
  } catch (_) {}
  return null;
}

async function fetchImageResponse(imageUrl) {
  if (!imageUrl) return null;
  try {
    const r = await fetch(imageUrl, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; Fidpass/1.0)" } });
    if (r.ok && r.headers.get("content-type")?.startsWith("image/")) return r;
  } catch (_) {}
  return null;
}

/**
 * Logo marque : Clearbit et og:image en parallèle, on prend le premier succès (priorité Clearbit si les deux marchent).
 */
async function fetchLogoByDomain(domain, websiteUrl) {
  if (!domain) return null;
  const [clearbit, ogUrl] = await Promise.all([
    fetchClearbitLogo(domain),
    websiteUrl ? fetchOgImageUrl(websiteUrl) : Promise.resolve(null),
  ]);
  if (clearbit) return clearbit;
  if (ogUrl) {
    const imgRes = await fetchImageResponse(ogUrl);
    if (imgRes) return imgRes;
  }
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
 * Priorité 1 : logo marque (Clearbit 400px, puis og:image du site). Pas de favicon (qualité trop faible).
 * Priorité 2 : photo du lieu Google (fallback).
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

    const logoRes = domain ? await fetchLogoByDomain(domain, website) : null;
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
