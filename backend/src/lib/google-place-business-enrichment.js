/**
 * Enrichissement commerce depuis Google Place Details (nom, adresse, géométrie).
 * Même logique que l’inscription (`tryCreateFirstBusinessFromGooglePlace` dans auth) :
 * sans clé ou si l’appel échoue, on retombe sur le hint sans bloquer la création.
 */

/**
 * @param {string} placeId
 * @param {string} establishmentNameHint
 * @returns {Promise<{ name: string, lat: number | null, lng: number | null, addr: string | null }>}
 */
export async function fetchGooglePlaceBusinessEnrichment(placeId, establishmentNameHint) {
  const pid = String(placeId || "").trim();
  const hint = String(establishmentNameHint || "").trim();
  let name = hint || "Mon établissement";
  let lat = null;
  let lng = null;
  let addr = null;

  const key = process.env.GOOGLE_PLACES_API_KEY || "";
  if (!key || !pid) {
    if (!key && pid) {
      console.warn(
        "[google-place-business-enrichment] GOOGLE_PLACES_API_KEY absent — création avec Place ID seul (sans géocodage Google)."
      );
    }
    return { name, lat, lng, addr };
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(pid)}&fields=name,formatted_address,geometry&language=fr&key=${key}`;
    const r = await fetch(url);
    const data = await r.json();
    if (data.status === "OK" && data.result) {
      const result = data.result;
      name = (result.name || hint || "Mon établissement").trim() || name;
      lat = result.geometry?.location?.lat ?? null;
      lng = result.geometry?.location?.lng ?? null;
      addr = result.formatted_address?.trim() || null;
    } else {
      console.warn("[google-place-business-enrichment] place details:", data?.status || "no result");
    }
  } catch (e) {
    console.error("[google-place-business-enrichment] Places fetch:", e);
  }

  return { name, lat, lng, addr };
}
