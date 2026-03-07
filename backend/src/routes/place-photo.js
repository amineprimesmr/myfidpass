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
    return url.hostname.replace(/^www\./i, "") || null;
  } catch {
    return null;
  }
}

const CLEARBIT_SIZE = 512;
const FETCH_HTML_TIMEOUT = 6000;

/** Pour un domaine (ex. boulangeriedupont.fr), retourne le .com en secours. */
function addComVariant(domain) {
  if (!domain || domain.endsWith(".com")) return [];
  const base = domain.split(".")[0];
  if (!base || base.length < 2) return [];
  return [`${base}.com`];
}

/**
 * À partir du nom d'établissement, génère des domaines possibles (slug .com / .fr).
 * Aucune liste en dur : tout commerce, indépendant ou chaîne, est traité pareil.
 * Ex. "Café du coin" → cafeducoin.com, cafeducoin.fr
 */
function domainsFromPlaceName(placeName) {
  if (!placeName || typeof placeName !== "string") return [];
  let s = placeName
    .replace(/\s*[-–—|]\s*.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  s = s.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[''®]/g, "");
  const slug = s.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
  if (slug.length < 2) return [];
  return [`${slug}.com`, `${slug}.fr`];
}

/**
 * Clearbit : essaie chaque domaine puis www.
 */
async function fetchClearbitLogoFromDomains(domains) {
  const toTry = [];
  const seen = new Set();
  for (const d of domains || []) {
    const domain = (d && typeof d === "string") ? d.replace(/^www\./i, "").trim() : "";
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    toTry.push(domain);
    toTry.push(`www.${domain}`);
  }
  for (const d of toTry) {
    try {
      const url = `https://logo.clearbit.com/${encodeURIComponent(d)}?size=${CLEARBIT_SIZE}`;
      const r = await fetch(url, { redirect: "follow" });
      if (r.ok && r.headers.get("content-type")?.startsWith("image/")) return r;
    } catch (_) {}
  }
  return null;
}

/** og:image ou twitter:image depuis une URL. */
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

/** Domaines à tenter à partir du site du lieu : domain, www, .com. */
function domainsFromPlaceWebsite(domain) {
  if (!domain) return [];
  const list = [domain];
  if (!domain.startsWith("www.")) list.push(`www.${domain}`);
  list.push(...addComVariant(domain));
  return [...new Set(list)];
}

/**
 * Logo à partir du site du lieu (domaine + og:image).
 * Même domaine = même logo (franchises avec même site officiel = même logo naturellement).
 */
async function fetchLogoFromWebsite(domain, websiteUrl) {
  if (!domain) return null;
  const list = domainsFromPlaceWebsite(domain);
  const clearbit = await fetchClearbitLogoFromDomains(list);
  if (clearbit) return clearbit;
  if (websiteUrl) {
    const ogUrl = await fetchOgImageUrl(websiteUrl);
    if (ogUrl) {
      const imgRes = await fetchImageResponse(ogUrl);
      if (imgRes) return imgRes;
    }
  }
  return null;
}

/** Photo la plus "type logo" (carrée, petite). */
function pickLogoLikePhoto(photos) {
  if (!Array.isArray(photos) || photos.length === 0) return null;
  const withScore = photos
    .filter((p) => p.photo_reference && p.width > 0 && p.height > 0)
    .map((p) => {
      const w = p.width;
      const h = p.height;
      const squareness = (w / h) >= 1 ? h / w : w / h;
      const maxDim = Math.max(w, h);
      return { ...p, squareness, maxDim, score: squareness * (1 - Math.min(maxDim, 800) / 2000) };
    })
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.maxDim - b.maxDim));
  return withScore[0] || photos[0];
}

/**
 * GET /api/place-photo?place_id=xxx
 * Universel : aucun nom d'enseigne en dur.
 * 1) Site du lieu → Clearbit(domaine) + og:image (même site = même logo).
 * 2) Nom du lieu → Clearbit(slug.com / slug.fr) pour tout commerce.
 * 3) Photo Google du lieu en secours.
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
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=photos,website,name&key=${GOOGLE_PLACES_API_KEY}`;
    const detailsRes = await fetch(detailsUrl);
    const details = await detailsRes.json();
    if (details.status === "REQUEST_DENIED" || details.status === "OVER_QUERY_LIMIT") {
      res.status(403).json({
        error: "Clé Google refusée côté serveur.",
        code: details.status,
        hint: "Utilisez une clé avec restriction « Aucune » (ou « Adresses IP ») pour le backend.",
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
    const placeName = result.name || "";

    let logoRes = domain ? await fetchLogoFromWebsite(domain, website) : null;
    if (!logoRes && placeName) {
      const nameDomains = domainsFromPlaceName(placeName);
      logoRes = await fetchClearbitLogoFromDomains(nameDomains);
      if (!logoRes) {
        for (const d of nameDomains) {
          const base = d.replace(/^www\./i, "").trim();
          const url = `https://${base}`;
          const ogUrl = await fetchOgImageUrl(url);
          if (ogUrl) {
            logoRes = await fetchImageResponse(ogUrl);
            if (logoRes) break;
          }
        }
      }
    }

    if (logoRes) {
      res.setHeader("Content-Type", logoRes.headers.get("content-type") || "image/png");
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
    const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=512&photo_reference=${encodeURIComponent(ref)}&key=${GOOGLE_PLACES_API_KEY}`;
    const photoRes = await fetch(photoUrl, { redirect: "follow" });
    if (!photoRes.ok) {
      res.status(502).json({ error: "Impossible de récupérer la photo" });
      return;
    }
    res.setHeader("Content-Type", photoRes.headers.get("content-type") || "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("X-Logo-Source", "place_photo");
    Readable.fromWeb(photoRes.body).pipe(res);
  } catch (err) {
    console.error("[place-photo]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
