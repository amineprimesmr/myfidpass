import { Router } from "express";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  getBusinessBySlug,
  createBusiness,
  createMember,
  getMemberForBusiness,
  addPoints,
  ensureDefaultBusiness,
} from "../db.js";
import { generatePass } from "../pass.js";
import { randomUUID } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const businessAssetsDir = join(__dirname, "..", "assets", "businesses");

const router = Router();

/**
 * GET /api/businesses/:slug
 * Infos publiques d'une entreprise (pour la page d'inscription).
 */
router.get("/:slug", (req, res) => {
  let business = getBusinessBySlug(req.params.slug);
  if (!business && req.params.slug === "demo") {
    business = ensureDefaultBusiness();
  }
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  res.json({
    id: business.id,
    name: business.name,
    slug: business.slug,
    organizationName: business.organization_name,
    backgroundColor: business.background_color ?? undefined,
    foregroundColor: business.foreground_color ?? undefined,
    labelColor: business.label_color ?? undefined,
  });
});

/**
 * POST /api/businesses/:slug/members
 * Créer un membre (carte fidélité) pour cette entreprise.
 * Body: { email, name }
 */
router.post("/:slug/members", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });

  const { email, name } = req.body || {};
  if (!email || !name) {
    return res.status(400).json({ error: "email et name requis" });
  }

  try {
    const member = createMember({
      id: randomUUID(),
      businessId: business.id,
      email: email.trim(),
      name: name.trim(),
    });
    res.status(201).json({
      memberId: member.id,
      member: {
        id: member.id,
        email: member.email,
        name: member.name,
        points: member.points,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur création membre" });
  }
});

/**
 * GET /api/businesses/:slug/members/:memberId
 * Infos d'un membre (vérifie qu'il appartient à cette entreprise).
 */
router.get("/:slug/members/:memberId", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });

  const member = getMemberForBusiness(req.params.memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });

  res.json({
    id: member.id,
    email: member.email,
    name: member.name,
    points: member.points,
  });
});

/**
 * POST /api/businesses/:slug/members/:memberId/points
 * Ajouter des points (caisse).
 */
router.post("/:slug/members/:memberId/points", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });

  const member = getMemberForBusiness(req.params.memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });

  const points = Number(req.body?.points);
  if (!Number.isInteger(points) || points < 0) {
    return res.status(400).json({ error: "points doit être un entier positif" });
  }

  const updated = addPoints(member.id, points);
  res.json({ id: updated.id, points: updated.points });
});

/**
 * GET /api/businesses/:slug/members/:memberId/pass
 * Télécharger le .pkpass pour ce membre (carte aux couleurs de l'entreprise).
 */
router.get("/:slug/members/:memberId/pass", async (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });

  const member = getMemberForBusiness(req.params.memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });

  const template = req.query.template || "classic";

  try {
    const buffer = await generatePass(member, business, { template });
    const filename = `fidelity-${business.slug}-${member.id.slice(0, 8)}.pkpass`;
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    // "inline" permet à Safari sur iOS d'ouvrir le pass directement dans Wallet au lieu de tenter un téléchargement
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error("Génération pass:", err);
    res.status(500).json({
      error: "Impossible de générer la carte. Vérifiez les certificats (voir docs/APPLE-WALLET-SETUP.md).",
      detail: err.message,
    });
  }
});

/**
 * POST /api/businesses (création d'une entreprise — à sécuriser en prod)
 * Body: { name, slug, organizationName?, backTerms?, backContact?, backgroundColor?, foregroundColor?, labelColor?, logoBase64? }
 */
router.post("/", (req, res) => {
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
  const normalizedSlug = String(slug).trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  if (!normalizedSlug) return res.status(400).json({ error: "slug invalide" });

  if (getBusinessBySlug(normalizedSlug)) {
    return res.status(409).json({ error: "Une entreprise avec ce slug existe déjà" });
  }

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
        }
      } catch (err) {
        console.warn("Logo save failed:", err.message);
      }
    }

    res.status(201).json({
      id: business.id,
      name: business.name,
      slug: business.slug,
      organizationName: business.organization_name,
      link: `/fidelity/${business.slug}`,
      assetsPath: `backend/assets/businesses/${business.id}/`,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur création entreprise" });
  }
});

function normalizeHex(value) {
  if (!value || typeof value !== "string") return null;
  const v = value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v;
  if (/^[0-9A-Fa-f]{6}$/.test(v)) return `#${v}`;
  return null;
}

export default router;
