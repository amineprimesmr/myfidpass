/**
 * Création et mise à jour d'une entreprise (POST /, PATCH /:slug).
 * Référence : REFONTE-REGLES.md — max 15 routes, 400 lignes/fichier.
 */
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  createBusiness,
  updateBusiness,
  getBusinessBySlug,
  canCreateBusiness,
} from "../../db.js";
import { getApiBase, canAccessDashboard, normalizeHex } from "./shared.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const businessAssetsDir = join(__dirname, "..", "..", "assets", "businesses");

export function createHandler(req, res) {
  const {
    name,
    slug,
    organizationName,
    backTerms,
    backContact,
    backgroundColor,
    foregroundColor,
    labelColor,
    logoBase64,
  } = req.body || {};
  if (!name || !slug) {
    return res.status(400).json({ error: "name et slug requis" });
  }
  const devBypass =
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_BYPASS_PAYMENT === "true" &&
    req.get("X-Dev-Bypass-Payment") === "1";
  if (!devBypass && !canCreateBusiness(req.user.id)) {
    return res.status(403).json({
      error: "Abonnement requis ou limite de cartes atteinte",
      code: "subscription_required",
    });
  }
  const normalizedSlug = String(slug).trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  if (!normalizedSlug) return res.status(400).json({ error: "slug invalide" });

  if (getBusinessBySlug(normalizedSlug)) {
    return res.status(409).json({ error: "Une entreprise avec ce slug existe déjà" });
  }

  const userId = req.user.id;

  try {
    const business = createBusiness({
      name: name.trim(),
      slug: normalizedSlug,
      organizationName: (organizationName || name).trim(),
      backTerms: backTerms ? String(backTerms).trim() : null,
      backContact: backContact ? String(backContact).trim() : null,
      backgroundColor: normalizeHex(backgroundColor),
      foregroundColor: normalizeHex(foregroundColor),
      labelColor: normalizeHex(labelColor),
      userId,
    });
    const dir = join(businessAssetsDir, business.id);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    if (logoBase64 && typeof logoBase64 === "string") {
      const base64Data = logoBase64.replace(/^data:image\/\w+;base64,/, "");
      try {
        const buf = Buffer.from(base64Data, "base64");
        if (buf.length > 0 && buf.length < 5 * 1024 * 1024) {
          writeFileSync(join(dir, "logo.png"), buf);
          writeFileSync(join(dir, "logo@2x.png"), buf);
          const stored = logoBase64.startsWith("data:") ? logoBase64 : `data:image/jpeg;base64,${base64Data}`;
          updateBusiness(business.id, { logo_base64: stored });
        }
      } catch (err) {
        console.warn("Logo save failed:", err.message);
      }
    }

    const baseUrl = process.env.FRONTEND_URL || "https://myfidpass.fr";
    const dashboardUrl = `${baseUrl.replace(/\/$/, "")}/dashboard?slug=${business.slug}&token=${business.dashboard_token}`;

    res.status(201).json({
      id: business.id,
      name: business.name,
      slug: business.slug,
      organizationName: business.organization_name,
      link: `/fidelity/${business.slug}`,
      assetsPath: `backend/assets/businesses/${business.id}/`,
      dashboardUrl,
      dashboardToken: business.dashboard_token,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur création entreprise" });
  }
}

/**
 * PATCH /:slug — Mise à jour design + règles. req.business déjà défini par param('slug').
 */
export function updateHandler(req, res) {
  const business = req.business;
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const body = req.body || {};
  const {
    organizationName,
    backTerms,
    backContact,
    backgroundColor,
    foregroundColor,
    labelColor,
    locationLat,
    locationLng,
    locationRelevantText,
    locationRadiusMeters,
    locationAddress,
    slug: requestedSlug,
  } = body;
  const updates = {};
  if (requestedSlug !== undefined) {
    const normalizedSlug = String(requestedSlug).trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (!normalizedSlug) {
      return res.status(400).json({ error: "slug invalide" });
    }
    if (normalizedSlug !== business.slug) {
      const existing = getBusinessBySlug(normalizedSlug);
      if (existing && existing.id !== business.id) {
        return res.status(409).json({ error: "Ce lien est déjà utilisé" });
      }
      updates.slug = normalizedSlug;
    }
  }
  if (organizationName !== undefined) updates.organization_name = organizationName ? String(organizationName).trim() : null;
  if (backTerms !== undefined) updates.back_terms = backTerms ? String(backTerms).trim() : null;
  if (backContact !== undefined) updates.back_contact = backContact ? String(backContact).trim() : null;
  if (backgroundColor !== undefined) {
    updates.background_color = normalizeHex(backgroundColor);
    updates.strip_color = updates.background_color;
  }
  if (foregroundColor !== undefined) updates.foreground_color = normalizeHex(foregroundColor);
  if (labelColor !== undefined) updates.label_color = normalizeHex(labelColor);
  if (locationAddress !== undefined) updates.location_address = locationAddress ? String(locationAddress).trim() : null;
  if (locationLat !== undefined) updates.location_lat = locationLat === null || locationLat === "" ? null : Number(locationLat);
  if (locationLng !== undefined) updates.location_lng = locationLng === null || locationLng === "" ? null : Number(locationLng);
  if (locationRelevantText !== undefined) updates.location_relevant_text = locationRelevantText ? String(locationRelevantText).trim() : null;
  if (locationRadiusMeters !== undefined) updates.location_radius_meters = locationRadiusMeters === null || locationRadiusMeters === "" ? null : Math.min(2000, Math.max(0, Number(locationRadiusMeters) || 500));
  const logoBase64 = body.logoBase64 ?? body.logo_base64;
  if (logoBase64 !== undefined) {
    if (logoBase64 === null || logoBase64 === "") {
      updates.logo_base64 = null;
    } else if (typeof logoBase64 === "string") {
      const base64Data = logoBase64.replace(/^data:image\/\w+;base64,/, "");
      const buf = Buffer.from(base64Data, "base64");
      if (buf.length === 0 || buf.length > 4 * 1024 * 1024) {
        return res.status(400).json({ error: "Logo invalide ou trop volumineux (max 4 Mo)." });
      }
      updates.logo_base64 = logoBase64;
    }
  }
  const cardBackgroundBase64 = body.card_background_base64 ?? body.cardBackgroundBase64;
  if (cardBackgroundBase64 !== undefined) {
    if (cardBackgroundBase64 === null || (typeof cardBackgroundBase64 === "string" && cardBackgroundBase64.trim() === "")) {
      updates.card_background_base64 = null;
    } else if (typeof cardBackgroundBase64 === "string") {
      const base64Data = String(cardBackgroundBase64).replace(/^data:image\/\w+;base64,/, "");
      const buf = Buffer.from(base64Data, "base64");
      if (buf.length > 4 * 1024 * 1024) {
        return res.status(400).json({ error: "Image de fond trop volumineuse (max 4 Mo)." });
      }
      if (buf.length > 0) {
        updates.card_background_base64 = cardBackgroundBase64.startsWith("data:") ? cardBackgroundBase64 : `data:image/png;base64,${base64Data}`;
      } else {
        updates.card_background_base64 = null;
      }
    }
  }
  const stampIconBase64 = body.stampIconBase64 ?? body.stamp_icon_base64;
  if (stampIconBase64 !== undefined) {
    if (stampIconBase64 === null || (typeof stampIconBase64 === "string" && stampIconBase64.trim() === "")) {
      updates.stamp_icon_base64 = null;
    } else if (typeof stampIconBase64 === "string") {
      const base64Data = String(stampIconBase64).replace(/^data:image\/\w+;base64,/, "");
      const buf = Buffer.from(base64Data, "base64");
      if (buf.length > 512 * 1024) {
        return res.status(400).json({ error: "Icône personnalisée trop volumineuse (max 512 Ko)." });
      }
      if (buf.length > 0) {
        updates.stamp_icon_base64 = stampIconBase64.startsWith("data:") ? stampIconBase64 : `data:image/png;base64,${base64Data}`;
      } else {
        updates.stamp_icon_base64 = null;
      }
    }
  }
  const programType = body.programType ?? body.program_type;
  if (programType !== undefined) {
    const v = programType === null || programType === "" ? null : String(programType).trim().toLowerCase();
    updates.program_type = (v === "points" || v === "stamps") ? v : null;
  }
  const pointsPerEuro = body.pointsPerEuro ?? body.points_per_euro;
  if (pointsPerEuro !== undefined) {
    const n = pointsPerEuro === null || pointsPerEuro === "" ? null : Number(pointsPerEuro);
    updates.points_per_euro = Number.isFinite(n) && n >= 0 ? String(n) : "1";
  }
  const pointsPerVisit = body.pointsPerVisit ?? body.points_per_visit;
  if (pointsPerVisit !== undefined) {
    const n = pointsPerVisit === null || pointsPerVisit === "" ? null : Number(pointsPerVisit);
    updates.points_per_visit = Number.isFinite(n) && n >= 0 ? String(n) : "0";
  }
  const pointsMinAmountEur = body.pointsMinAmountEur ?? body.points_min_amount_eur;
  if (pointsMinAmountEur !== undefined) {
    const n = pointsMinAmountEur === null || pointsMinAmountEur === "" ? null : Number(pointsMinAmountEur);
    updates.points_min_amount_eur = Number.isFinite(n) && n >= 0 ? n : null;
  }
  const pointsRewardTiers = body.pointsRewardTiers ?? body.points_reward_tiers;
  const loyaltyMode = body.loyaltyMode ?? body.loyalty_mode;
  const pointsPerTicket = body.pointsPerTicket ?? body.points_per_ticket;
  if (pointsRewardTiers !== undefined) {
    if (pointsRewardTiers === null || pointsRewardTiers === "") updates.points_reward_tiers = null;
    else if (Array.isArray(pointsRewardTiers)) updates.points_reward_tiers = JSON.stringify(pointsRewardTiers);
    else if (typeof pointsRewardTiers === "string") {
      try { JSON.parse(pointsRewardTiers); updates.points_reward_tiers = pointsRewardTiers; } catch (_) { updates.points_reward_tiers = null; }
    }
  }
  if (loyaltyMode !== undefined) {
    const mode = String(loyaltyMode || "").trim().toLowerCase();
    updates.loyalty_mode = mode === "points_game_tickets" ? "points_game_tickets" : "points_cash";
  }
  if (pointsPerTicket !== undefined) {
    const n = Number(pointsPerTicket);
    updates.points_per_ticket = Number.isInteger(n) && n > 0 ? n : 10;
  }
  const sector = body.sector;
  if (sector !== undefined) updates.sector = sector ? String(sector).trim().slice(0, 64) : null;
  const requiredStamps = body.requiredStamps ?? body.required_stamps;
  if (requiredStamps !== undefined) {
    const n = requiredStamps === null || requiredStamps === "" ? null : Number(requiredStamps);
    updates.required_stamps = Number.isInteger(n) && n >= 0 ? n : null;
  }
  const stampEmoji = body.stampEmoji ?? body.stamp_emoji;
  if (stampEmoji !== undefined) {
    const v = stampEmoji == null || stampEmoji === "" ? null : String(stampEmoji).trim().slice(0, 8);
    updates.stamp_emoji = v || null;
  }
  const stampRewardLabel = body.stampRewardLabel ?? body.stamp_reward_label;
  if (stampRewardLabel !== undefined) {
    const v = stampRewardLabel == null || stampRewardLabel === "" ? null : String(stampRewardLabel).trim().slice(0, 120);
    updates.stamp_reward_label = v || null;
  }
  const labelRestants = body.labelRestants ?? body.label_restants;
  if (labelRestants !== undefined) {
    const v = labelRestants == null || labelRestants === "" ? null : String(labelRestants).trim().slice(0, 32);
    updates.label_restants = v || null;
  }
  const labelMember = body.labelMember ?? body.label_member;
  if (labelMember !== undefined) {
    const v = labelMember == null || labelMember === "" ? null : String(labelMember).trim().slice(0, 32);
    updates.label_member = v || null;
  }
  const headerRightText = body.headerRightText ?? body.header_right_text;
  if (headerRightText !== undefined) {
    const v = headerRightText == null || headerRightText === "" ? null : String(headerRightText).trim().slice(0, 32);
    updates.header_right_text = v || null;
  }
  const stripColor = body.stripColor ?? body.strip_color;
  if (stripColor !== undefined) {
    updates.strip_color = stripColor === null || stripColor === "" ? null : normalizeHex(stripColor);
  }

  const updated = updateBusiness(business.id, updates);
  if (!updated) return res.status(500).json({ error: "Erreur mise à jour" });

  res.json({
    id: updated.id,
    name: updated.name,
    slug: updated.slug,
    organizationName: updated.organization_name,
    backgroundColor: updated.background_color ?? undefined,
    foregroundColor: updated.foreground_color ?? undefined,
    labelColor: updated.label_color ?? undefined,
    locationLat: updated.location_lat != null ? Number(updated.location_lat) : undefined,
    locationLng: updated.location_lng != null ? Number(updated.location_lng) : undefined,
    locationRelevantText: updated.location_relevant_text ?? undefined,
    locationRadiusMeters: updated.location_radius_meters != null ? Number(updated.location_radius_meters) : undefined,
    locationAddress: updated.location_address ?? undefined,
  });
}
