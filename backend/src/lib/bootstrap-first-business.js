/**
 * Création du 1er commerce à partir d’un lieu Google (inscription, post-paiement /merci).
 */
import {
  createBusiness,
  updateBusiness,
  getBusinessBySlug,
  getBusinessesByUserId,
  getAnyBusinessLinkedToGooglePlaceId,
  canCreateBusiness,
} from "../db.js";
import { fetchGooglePlaceBusinessEnrichment } from "./google-place-business-enrichment.js";
import { refreshGooglePlacesSnapshotFromPlaceId } from "../services/social-metrics-service.js";

function registerSlugFromName(name) {
  let s = String(name || "commerce")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s.slice(0, 48) || "commerce";
}

/**
 * @param {string} userId
 * @param {{ establishmentName: string, placeId: string, locationAddress?: string | null, locationLat?: number | null, locationLng?: number | null }} input
 */
export async function bootstrapFirstBusinessForUser(userId, input) {
  const uid = String(userId || "").trim();
  if (!uid || !canCreateBusiness(uid)) {
    return { ok: false, code: "business_quota_reached", message: "Impossible de créer un commerce." };
  }
  if (getBusinessesByUserId(uid).length > 0) {
    return { ok: true, already_exists: true };
  }

  let establishmentName = String(input?.establishmentName || "").trim();
  const placeId = String(input?.placeId || "").trim();
  if (!establishmentName || !placeId) {
    return { ok: false, code: "missing_establishment", message: "Sélectionnez votre établissement." };
  }

  const linked = getAnyBusinessLinkedToGooglePlaceId(placeId);
  if (linked) {
    return {
      ok: false,
      code: "business_place_already_linked",
      message: "Ce commerce est déjà utilisé. Connectez-vous au compte existant ou choisissez un autre commerce.",
    };
  }

  let locationAddress = input?.locationAddress ?? null;
  let locationLat = input?.locationLat ?? null;
  let locationLng = input?.locationLng ?? null;
  const hasCoords =
    locationLat != null && locationLat !== "" && locationLng != null && locationLng !== "";
  const hasAddr = locationAddress != null && String(locationAddress).trim().length > 0;

  if (!hasAddr && !hasCoords) {
    const enriched = await fetchGooglePlaceBusinessEnrichment(placeId, establishmentName);
    establishmentName = (enriched.name || establishmentName).trim() || establishmentName;
    locationAddress = enriched.addr ?? locationAddress;
    locationLat = enriched.lat ?? locationLat;
    locationLng = enriched.lng ?? locationLng;
  }

  let baseSlug = registerSlugFromName(establishmentName);
  let slug = baseSlug;
  let suffix = 0;
  while (getBusinessBySlug(slug)) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`.slice(0, 60);
  }

  const business = createBusiness({
    name: establishmentName,
    slug,
    organizationName: establishmentName,
    userId: uid,
  });
  updateBusiness(business.id, {
    location_address: locationAddress ? String(locationAddress).trim() : null,
    location_lat: locationLat == null || locationLat === "" ? null : Number(locationLat),
    location_lng: locationLng == null || locationLng === "" ? null : Number(locationLng),
    engagement_rewards: {
      google_review: {
        enabled: true,
        points: 50,
        place_id: placeId,
        require_approval: false,
        auto_verify_enabled: true,
      },
    },
  });

  setImmediate(() => {
    refreshGooglePlacesSnapshotFromPlaceId(business.id, placeId).catch(() => {});
  });

  return { ok: true, business };
}

/**
 * @param {string} userId
 * @param {{ establishment_name?: string, google_place_id?: string }} input
 */
export async function finalizeBusinessForClaimedUser(userId, input) {
  const uid = String(userId);
  const existing = getBusinessesByUserId(uid);
  if (existing.length > 0) {
    return { ok: true, business: existing[0], already_exists: true };
  }
  const placeId = String(input?.google_place_id || "").trim();
  const establishmentName = String(input?.establishment_name || "").trim();
  if (!placeId || !establishmentName) {
    return {
      ok: false,
      code: "missing_establishment",
      message: "Sélectionnez votre établissement pour finaliser votre compte.",
    };
  }
  return bootstrapFirstBusinessForUser(uid, { establishmentName, placeId });
}
