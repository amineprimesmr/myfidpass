import { Router } from "express";

const router = new Router();
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";
const REQUEST_TIMEOUT_MS = 5500;
const CACHE_TTL_MS = 15 * 60 * 1000;
const enrichCache = new Map();

function nowMs() {
  return Date.now();
}

function getCacheKey(placeId, name) {
  const p = (placeId || "").trim().toLowerCase();
  const n = (name || "").trim().toLowerCase();
  return p ? `place:${p}` : `name:${n}`;
}

function readCache(key) {
  if (!key) return null;
  const hit = enrichCache.get(key);
  if (!hit) return null;
  if (nowMs() - hit.ts > CACHE_TTL_MS) {
    enrichCache.delete(key);
    return null;
  }
  return hit.data;
}

function writeCache(key, data) {
  if (!key || !data) return;
  enrichCache.set(key, { ts: nowMs(), data });
}

async function fetchJsonWithTimeout(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTextWithTimeout(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FidpassBot/1.0)",
      },
    });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "").toLowerCase();
    if (!type.includes("text/html")) return null;
    return await res.text();
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeWebsite(website) {
  if (!website || typeof website !== "string") return null;
  const raw = website.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return `${u.protocol}//${u.host}`;
  } catch (_) {
    return null;
  }
}

function normalizeSocialUrl(candidate) {
  if (!candidate || typeof candidate !== "string") return null;
  try {
    const u = new URL(candidate);
    u.hash = "";
    u.search = "";
    if (u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch (_) {
    return null;
  }
}

function isLikelyProfileUrl(platform, url) {
  try {
    const u = new URL(url);
    const p = (u.pathname || "").toLowerCase();
    const q = (u.search || "").toLowerCase();
    if (platform === "instagram") {
      if (!u.hostname.includes("instagram.com")) return false;
      return p.startsWith("/@") || /^\/[a-z0-9._-]+$/.test(p);
    }
    if (platform === "tiktok") {
      if (!u.hostname.includes("tiktok.com")) return false;
      return p.startsWith("/@");
    }
    if (platform === "facebook") {
      if (!u.hostname.includes("facebook.com") && !u.hostname.includes("fb.com")) return false;
      if (p.includes("/sharer") || p.includes("/share.php") || p.includes("/dialog/")) return false;
      if (q.includes("share")) return false;
      return p.length > 1;
    }
    return false;
  } catch (_) {
    return false;
  }
}

function scoreCandidate(source, platform, url) {
  let score = source === "homepage" ? 0.9 : 0.7;
  if (isLikelyProfileUrl(platform, url)) score += 0.08;
  try {
    const depth = (new URL(url).pathname.split("/").filter(Boolean).length || 1);
    if (depth <= 2) score += 0.02;
  } catch (_) {}
  return Math.min(1, Number(score.toFixed(2)));
}

function extractUrlsFromHtml(html, baseUrl) {
  if (!html) return [];
  const urls = [];
  const hrefRe = /(?:href|content)\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = hrefRe.exec(html)) !== null) {
    const raw = (m[1] || "").trim();
    if (!raw || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("javascript:")) continue;
    try {
      const absolute = new URL(raw, baseUrl).toString();
      urls.push(absolute);
    } catch (_) {}
  }
  return urls;
}

function pickSocials(candidates) {
  const best = { instagram_url: null, tiktok_url: null, facebook_url: null };
  const confidence = { instagram_url: 0, tiktok_url: 0, facebook_url: 0 };
  for (const c of candidates) {
    if (c.platform === "instagram" && c.score > confidence.instagram_url) {
      best.instagram_url = c.url;
      confidence.instagram_url = c.score;
    }
    if (c.platform === "tiktok" && c.score > confidence.tiktok_url) {
      best.tiktok_url = c.url;
      confidence.tiktok_url = c.score;
    }
    if (c.platform === "facebook" && c.score > confidence.facebook_url) {
      best.facebook_url = c.url;
      confidence.facebook_url = c.score;
    }
  }
  return { socials: best, confidence };
}

function detectSocialCandidates(urls, source) {
  const out = [];
  for (const raw of urls) {
    const normalized = normalizeSocialUrl(raw);
    if (!normalized) continue;
    const host = new URL(normalized).hostname.toLowerCase();
    if (host.includes("instagram.com")) {
      out.push({ platform: "instagram", url: normalized, score: scoreCandidate(source, "instagram", normalized) });
    } else if (host.includes("tiktok.com")) {
      out.push({ platform: "tiktok", url: normalized, score: scoreCandidate(source, "tiktok", normalized) });
    } else if (host.includes("facebook.com") || host.includes("fb.com")) {
      out.push({ platform: "facebook", url: normalized, score: scoreCandidate(source, "facebook", normalized) });
    }
  }
  return out;
}

async function resolvePlaceIdFromName(name) {
  if (!GOOGLE_PLACES_API_KEY || !name) return { place_id: null, resolved_name: name || null };
  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(name)}&inputtype=textquery&fields=place_id,name&language=fr&key=${GOOGLE_PLACES_API_KEY}`;
  const { data } = await fetchJsonWithTimeout(url);
  if (data.status === "OK" && data.candidates?.length) {
    return {
      place_id: data.candidates[0].place_id || null,
      resolved_name: data.candidates[0].name || name,
    };
  }
  return { place_id: null, resolved_name: name || null };
}

async function getPlaceDetails(placeId) {
  if (!GOOGLE_PLACES_API_KEY || !placeId) return { website: null, resolved_name: null };
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=name,website,url&language=fr&key=${GOOGLE_PLACES_API_KEY}`;
  const { data } = await fetchJsonWithTimeout(url);
  if (data.status === "OK" && data.result) {
    return {
      website: normalizeWebsite(data.result.website),
      resolved_name: data.result.name || null,
    };
  }
  return { website: null, resolved_name: null };
}

async function extractSocialsFromWebsite(website) {
  if (!website) return { socials: { instagram_url: null, tiktok_url: null, facebook_url: null }, confidence: { instagram_url: 0, tiktok_url: 0, facebook_url: 0 } };
  const pages = ["/", "/contact", "/about", "/a-propos"];
  const allCandidates = [];
  for (let i = 0; i < pages.length; i += 1) {
    const path = pages[i];
    const source = i === 0 ? "homepage" : "internal";
    let pageUrl = `${website}${path}`;
    try {
      pageUrl = new URL(path, `${website}/`).toString();
    } catch (_) {}
    const html = await fetchTextWithTimeout(pageUrl);
    if (!html) continue;
    const urls = extractUrlsFromHtml(html, pageUrl);
    allCandidates.push(...detectSocialCandidates(urls, source));
  }
  return pickSocials(allCandidates);
}

router.get("/", async (req, res) => {
  const rawPlaceId = (req.query.place_id || "").trim();
  const rawName = (req.query.name || "").trim();
  if (!rawPlaceId && !rawName) {
    return res.status(400).json({ error: "place_id ou name requis" });
  }

  const cacheKey = getCacheKey(rawPlaceId, rawName);
  const cached = readCache(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  try {
    let placeId = rawPlaceId || null;
    let resolvedName = rawName || null;

    if (!placeId && rawName) {
      const found = await resolvePlaceIdFromName(rawName);
      placeId = found.place_id;
      resolvedName = found.resolved_name || resolvedName;
    }

    const details = await getPlaceDetails(placeId);
    const website = details.website;
    resolvedName = details.resolved_name || resolvedName;

    const { socials, confidence } = await extractSocialsFromWebsite(website);
    const response = {
      place_id: placeId,
      resolved_name: resolvedName,
      website,
      socials,
      confidence,
      cached: false,
    };
    writeCache(cacheKey, response);
    return res.json(response);
  } catch (err) {
    console.error("[place-enrichment]", err?.message || err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
