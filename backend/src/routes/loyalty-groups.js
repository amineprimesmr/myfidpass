/**
 * API réseaux de fidélité partagés (multi-adresses, carte client unique).
 */
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  createLoyaltyGroup,
  createLoyaltyGroupWithBusinesses,
  deleteLoyaltyGroup,
  getLoyaltyGroupById,
  linkBusinessToLoyaltyGroup,
  listBusinessesInLoyaltyGroup,
  listLoyaltyGroupsForUser,
  unlinkBusinessFromLoyaltyGroup,
  updateLoyaltyGroupName,
} from "../db/loyalty-groups.js";
import { getBusinessBySlug, getBusinessesByUserId } from "../db/businesses.js";

const router = Router();

router.use(requireAuth);

/** GET /api/loyalty-groups — réseaux du propriétaire connecté */
router.get("/", (req, res) => {
  const groups = listLoyaltyGroupsForUser(req.user.id).map((g) => ({
    id: g.id,
    name: g.name,
    created_at: g.created_at,
    updated_at: g.updated_at,
    business_count: g.business_count ?? 0,
  }));
  res.json({ loyalty_groups: groups });
});

/** POST /api/loyalty-groups — { name, business_ids?: string[], business_slugs?: string[] } */
router.post("/", (req, res) => {
  const { name, business_ids: businessIdsRaw, business_slugs: businessSlugsRaw } = req.body || {};
  const owned = getBusinessesByUserId(req.user.id);
  const ownedIds = new Set(owned.map((b) => b.id));

  let businessIds = Array.isArray(businessIdsRaw) ? businessIdsRaw.filter((id) => ownedIds.has(id)) : [];
  if (Array.isArray(businessSlugsRaw) && businessSlugsRaw.length > 0) {
    for (const slug of businessSlugsRaw) {
      const b = getBusinessBySlug(String(slug || "").trim());
      if (b && b.user_id === req.user.id && !businessIds.includes(b.id)) businessIds.push(b.id);
    }
  }

  const { group, businesses } = createLoyaltyGroupWithBusinesses({
    ownerUserId: req.user.id,
    name,
    businessIds,
  });

  res.status(201).json({
    loyalty_group: serializeGroup(group),
    businesses: businesses.map(serializeBusinessLink),
  });
});

/** GET /api/loyalty-groups/:id */
router.get("/:id", (req, res) => {
  const group = getLoyaltyGroupById(req.params.id);
  if (!group) return res.status(404).json({ error: "Réseau introuvable" });
  if (group.owner_user_id !== req.user.id) return res.status(403).json({ error: "Accès refusé" });
  const businesses = listBusinessesInLoyaltyGroup(group.id);
  res.json({
    loyalty_group: serializeGroup(group),
    businesses: businesses.map(serializeBusinessLink),
  });
});

/** PATCH /api/loyalty-groups/:id — { name? } */
router.patch("/:id", (req, res) => {
  const group = getLoyaltyGroupById(req.params.id);
  if (!group) return res.status(404).json({ error: "Réseau introuvable" });
  if (group.owner_user_id !== req.user.id) return res.status(403).json({ error: "Accès refusé" });
  const updated = updateLoyaltyGroupName(group.id, req.body?.name);
  res.json({ loyalty_group: serializeGroup(updated) });
});

/** DELETE /api/loyalty-groups/:id */
router.delete("/:id", (req, res) => {
  const group = getLoyaltyGroupById(req.params.id);
  if (!group) return res.status(404).json({ error: "Réseau introuvable" });
  if (group.owner_user_id !== req.user.id) return res.status(403).json({ error: "Accès refusé" });
  deleteLoyaltyGroup(group.id);
  res.json({ ok: true });
});

/** POST /api/loyalty-groups/:id/businesses — { business_id?, slug? } */
router.post("/:id/businesses", (req, res) => {
  const group = getLoyaltyGroupById(req.params.id);
  if (!group) return res.status(404).json({ error: "Réseau introuvable" });
  if (group.owner_user_id !== req.user.id) return res.status(403).json({ error: "Accès refusé" });

  let businessId = req.body?.business_id;
  if (!businessId && req.body?.slug) {
    const b = getBusinessBySlug(String(req.body.slug).trim());
    businessId = b?.id;
  }
  if (!businessId) return res.status(400).json({ error: "business_id ou slug requis" });

  const result = linkBusinessToLoyaltyGroup({
    businessId,
    groupId: group.id,
    userId: req.user.id,
  });
  if (!result.ok) {
    return res.status(result.status || 400).json({
      error: result.error,
      code: result.code,
    });
  }
  res.json({
    loyalty_group: serializeGroup(result.group),
    business: serializeBusinessLink(result.business),
  });
});

/** DELETE /api/loyalty-groups/:id/businesses/:businessId */
router.delete("/:id/businesses/:businessId", (req, res) => {
  const group = getLoyaltyGroupById(req.params.id);
  if (!group) return res.status(404).json({ error: "Réseau introuvable" });
  if (group.owner_user_id !== req.user.id) return res.status(403).json({ error: "Accès refusé" });

  const biz = listBusinessesInLoyaltyGroup(group.id).find((b) => b.id === req.params.businessId);
  if (!biz) return res.status(404).json({ error: "Ce commerce n’est pas dans ce réseau" });

  const result = unlinkBusinessFromLoyaltyGroup({
    businessId: req.params.businessId,
    userId: req.user.id,
  });
  if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
  res.json({ ok: true, business: serializeBusinessLink(result.business) });
});

function serializeGroup(g) {
  if (!g) return null;
  return {
    id: g.id,
    name: g.name,
    owner_user_id: g.owner_user_id,
    created_at: g.created_at,
    updated_at: g.updated_at,
  };
}

function serializeBusinessLink(b) {
  if (!b) return null;
  return {
    id: b.id,
    name: b.name,
    slug: b.slug,
    organization_name: b.organization_name,
    loyalty_group_id: b.loyalty_group_id ?? null,
    program_type: b.program_type ?? null,
    required_stamps: b.required_stamps ?? null,
  };
}

export default router;
