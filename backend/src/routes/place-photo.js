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

const CLEARBIT_SIZE = 512;
const FETCH_HTML_TIMEOUT = 6000;

/**
 * Normalise le nom d'établissement pour en tirer une "clé marque" (sans lieu, sans accents).
 * Ex. "Brioche Dorée - Gare de Lyon" → "brioche doree", "McDonald's Paris 15" → "mcdonalds"
 */
function placeNameToBrandKey(name) {
  if (!name || typeof name !== "string") return "";
  let s = name
    .replace(/\s*[-–—|]\s*.*$/, "")
    .replace(/\s+(Gare|Aéroport|Centre commercial|CC)\s+.*$/i, "")
    .replace(/\s+\d+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  s = s.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/['']/g, "").replace(/\u00ae/g, "");
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Domaines officiels des franchises (logo marque unique, haute qualité).
 * Même franchise = même logo quelle que soit la ville.
 */
const FRANCHISE_DOMAINS = {
  mcdonalds: ["mcdonalds.com", "mcdonalds.fr"],
  "mc donalds": ["mcdonalds.com", "mcdonalds.fr"],
  "brioche doree": ["briochedoree.com", "briochedoree.fr"],
  briochedoree: ["briochedoree.com", "briochedoree.fr"],
  "burger king": ["burgerking.com", "burgerking.fr"],
  burgerking: ["burgerking.com", "burgerking.fr"],
  bk: ["burgerking.com", "burgerking.fr"],
  starbucks: ["starbucks.com", "starbucks.fr"],
  subway: ["subway.com", "subway.fr"],
  "quick": ["quick.fr", "quick.com"],
  kfc: ["kfc.com", "kfc.fr"],
  "domino's": ["dominos.com", "dominos.fr"],
  dominos: ["dominos.com", "dominos.fr"],
  "pizza hut": ["pizzahut.com", "pizzahut.fr"],
  pizzahut: ["pizzahut.com", "pizzahut.fr"],
  "paul": ["paul.fr", "paul.com"],
  "auberge": ["auberge.fr"],
  "flunch": ["flunch.fr"],
  "la croissanterie": ["lacroissanterie.fr"],
  lacroissanterie: ["lacroissanterie.fr"],
  "bagelstein": ["bagelstein.fr"],
  "exki": ["exki.com", "exki.fr"],
  "pret a manger": ["pret.com", "pret.fr"],
  pret: ["pret.com", "pret.fr"],
  "costa coffee": ["costacoffee.com", "costacoffee.fr"],
  costacoffee: ["costacoffee.com", "costacoffee.fr"],
  "tim hortons": ["timhortons.com", "timhortons.ca"],
  timhortons: ["timhortons.com", "timhortons.ca"],
};

/**
 * À partir du nom d'établissement, retourne une liste de domaines à essayer pour le logo FRANCHISE (priorité).
 * "McDonald's Paris 15" ou "McDonald's Lyon" → même domaines que "McDonald's".
 */
function brandDomainsFromPlaceName(placeName) {
  const key = placeNameToBrandKey(placeName);
  if (!key) return [];
  const fromMap = FRANCHISE_DOMAINS[key];
  if (fromMap && fromMap.length) return fromMap;
  for (const [brandKey, domains] of Object.entries(FRANCHISE_DOMAINS)) {
    if (key === brandKey || key.startsWith(brandKey + " ") || key.startsWith(brandKey + "-")) return domains;
  }
  const slug = key.replace(/\s+/g, "").replace(/['']/g, "");
  if (slug.length < 2) return [];
  return [`${slug}.com`, `${slug}.fr`];
}

/** Pour un domaine (ex. mcdonalds.fr), retourne le .com si pertinent. */
function brandComDomain(domain) {
  if (!domain || domain.endsWith(".com")) return null;
  const base = domain.split(".")[0];
  if (!base || base.length < 2) return null;
  return `${base}.com`;
}

/**
 * Clearbit Logo : essaie chaque domaine puis sa variante www. (certaines marques ne répondent qu'avec www.)
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

/** Pour un domaine de site (ex. mcdonalds.fr), liste domain, www.domain, .com. */
function domainsFromPlaceWebsite(domain) {
  if (!domain) return [];
  const list = [domain];
  if (!domain.startsWith("www.")) list.push(`www.${domain}`);
  const com = brandComDomain(domain);
  if (com && !list.includes(com)) list.push(com);
  return list;
}

/**
 * Logo via site du lieu (domain + og:image). Utilisé seulement pour les enseignes non reconnues comme franchise.
 */
async function fetchLogoByDomain(domain, websiteUrl) {
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

/**
 * Pour une franchise connue : si Clearbit échoue, on récupère le logo via og:image du site OFFICIEL (ex. https://burgerking.fr).
 * Garantit le même logo pour tous les établissements de la même marque.
 */
async function fetchFranchiseLogoFromOfficialSite(domains) {
  if (!domains || domains.length === 0) return null;
  const seen = new Set();
  for (const d of domains) {
    const domain = (d && typeof d === "string") ? d.replace(/^www\./i, "").trim() : "";
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    const url = `https://${domain}`;
    const ogUrl = await fetchOgImageUrl(url);
    if (ogUrl) {
      const imgRes = await fetchImageResponse(ogUrl);
      if (imgRes) return imgRes;
    }
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
 * Priorité 1 : logo FRANCHISE (nom établissement → domaines marque → Clearbit 512px). Même enseigne = même logo.
 * Priorité 2 : logo via site du lieu (domaine + og:image).
 * Priorité 3 : photo du lieu Google (fallback).
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
        hint: "Utilisez une clé avec restriction « Aucune » (ou « Adresses IP ») pour le backend. La clé « Référents HTTP » ne fonctionne que depuis le navigateur.",
      });
      return;
    }
    if (details.status !== "OK") {
      res.status(404).json({ error: "Lieu non trouvé" });
      return;
    }

    const result = details.result;
    const placeName = result.name || "";
    const website = result.website;
    const domain = domainFromWebsite(website);

    const brandDomains = brandDomainsFromPlaceName(placeName);
    if (brandDomains.length > 0) {
      let logoRes = await fetchClearbitLogoFromDomains(brandDomains);
      if (!logoRes) logoRes = await fetchFranchiseLogoFromOfficialSite(brandDomains);
      if (logoRes) {
        res.setHeader("Content-Type", logoRes.headers.get("content-type") || "image/png");
        res.setHeader("Cache-Control", "private, max-age=86400");
        res.setHeader("X-Logo-Source", "franchise");
        Readable.fromWeb(logoRes.body).pipe(res);
        return;
      }
      // Franchise reconnue mais logo non trouvé : on ne prend pas le site du lieu (chaque magasin pourrait avoir une image différente).
    }

    const logoRes = brandDomains.length === 0 && domain ? await fetchLogoByDomain(domain, website) : null;
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
