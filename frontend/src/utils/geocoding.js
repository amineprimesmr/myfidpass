/**
 * Géocodage / suggestions d’adresse (Photon + Nominatim) — partagé Profil, builder, etc.
 */

const PHOTON_URL = "https://photon.komoot.io/api/";

export function formatPhotonAddress(props) {
  if (!props) return "";
  const name = props.name || "";
  const street = [props.street, props.housenumber].filter(Boolean).join(" ");
  const cityPart = [props.postcode, props.city].filter(Boolean).join(", ");
  const parts = [name || street, cityPart, props.country].filter(Boolean);
  return parts.join(", ");
}

/**
 * @param {string} query
 * @param {number} [limit]
 * @returns {Promise<object[]>} features Photon
 */
export async function photonGeocodeFeatures(query, limit = 6) {
  const q = String(query || "").trim();
  if (q.length < 2) return [];
  try {
    const res = await fetch(`${PHOTON_URL}?q=${encodeURIComponent(q)}&limit=${limit}&lang=fr`);
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return data?.features || [];
  } catch {
    return [];
  }
}

/** Coordonnées pour une adresse (sauvegarde formulaires, Nominatim). */
export async function geocodeAddress(address) {
  const q = String(address).trim();
  if (!q) return null;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "MyFidpass/1.0 (https://myfidpass.fr)" },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => []);
  const first = data?.[0];
  if (!first || first.lat == null || first.lon == null) return null;
  const lat = parseFloat(first.lat);
  const lng = parseFloat(first.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}
