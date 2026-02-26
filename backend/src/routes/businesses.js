import { Router } from "express";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  getBusinessBySlug,
  getBusinessByDashboardToken,
  createBusiness,
  createMember,
  getMemberForBusiness,
  addPoints,
  createTransaction,
  getDashboardStats,
  getMembersForBusiness,
  getTransactionsForBusiness,
  ensureDefaultBusiness,
  canCreateBusiness,
} from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { generatePass } from "../pass.js";
import { getGoogleWalletSaveUrl } from "../google-wallet.js";
import { randomUUID } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const businessAssetsDir = join(__dirname, "..", "assets", "businesses");

const router = Router();

/** Vérifie l'accès au dashboard : token valide pour ce commerce OU utilisateur connecté propriétaire. */
function canAccessDashboard(business, req) {
  if (!business) return false;
  const token = req.query.token || req.get("X-Dashboard-Token");
  const byToken = getBusinessByDashboardToken(token);
  if (byToken && byToken.id === business.id) return true;
  if (req.user && business.user_id === req.user.id) return true;
  return false;
}

/**
 * GET /api/businesses/:slug/dashboard/stats
 * Stats pour le tableau de bord (token OU JWT propriétaire).
 */
router.get("/:slug/dashboard/stats", (req, res, next) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const stats = getDashboardStats(business.id);
  res.json({ ...stats, businessName: business.organization_name });
});

/**
 * GET /api/businesses/:slug/dashboard/members
 * Liste des membres (token OU JWT propriétaire).
 */
router.get("/:slug/dashboard/members", (req, res, next) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const search = req.query.search ?? "";
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const offset = Number(req.query.offset) || 0;
  const result = getMembersForBusiness(business.id, { search, limit, offset });
  res.json(result);
});

/**
 * GET /api/businesses/:slug/dashboard/transactions
 * Historique des transactions (token OU JWT propriétaire).
 */
router.get("/:slug/dashboard/transactions", (req, res, next) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const offset = Number(req.query.offset) || 0;
  const memberId = req.query.memberId || null;
  const result = getTransactionsForBusiness(business.id, { limit, offset, memberId });
  res.json(result);
});

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
    last_visit_at: member.last_visit_at || null,
  });
});

/**
 * POST /api/businesses/:slug/members/:memberId/points
 * Ajouter des points (caisse). Nécessite token ou JWT propriétaire.
 */
router.post("/:slug/members/:memberId/points", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Accès non autorisé" });
  }

  const member = getMemberForBusiness(req.params.memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });

  const pointsDirect = Number(req.body?.points);
  const amountEur = Number(req.body?.amount_eur);
  const visit = req.body?.visit === true;
  const perEuro = Number(business.points_per_euro) || 1;
  const perVisit = Number(business.points_per_visit) || 0;

  let points = 0;
  if (Number.isInteger(pointsDirect) && pointsDirect > 0) {
    points += pointsDirect;
  }
  if (!Number.isNaN(amountEur) && amountEur > 0) {
    points += Math.floor(amountEur * perEuro);
  }
  if (visit && perVisit > 0) {
    points += perVisit;
  }

  if (points <= 0) {
    return res.status(400).json({
      error: "Indiquez points, amount_eur (montant en €), ou visit: true (1 passage). Règles: " + perEuro + " pt/€, " + perVisit + " pt/passage.",
    });
  }

  const updated = addPoints(member.id, points);
  createTransaction({
    businessId: business.id,
    memberId: member.id,
    type: "points_add",
    points,
    metadata: amountEur > 0 || visit ? { amount_eur: amountEur || undefined, visit } : undefined,
  });
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
 * GET /api/businesses/:slug/members/:memberId/google-wallet-url
 * Retourne l'URL "Add to Google Wallet" pour ce membre (Android).
 * 200 { url } ou 503 si Google Wallet non configuré.
 */
router.get("/:slug/members/:memberId/google-wallet-url", (req, res) => {
  const business = getBusinessBySlug(req.params.slug);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });

  const member = getMemberForBusiness(req.params.memberId, business.id);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });

  const frontendOrigin = req.get("Origin") || req.get("Referer")?.replace(/\/[^/]*$/, "") || process.env.FRONTEND_URL;
  const result = getGoogleWalletSaveUrl(member, business, frontendOrigin);
  if (!result) {
    return res.status(503).json({
      error: "Google Wallet non configuré",
      code: "google_wallet_unavailable",
    });
  }
  res.json(result);
});

/**
 * POST /api/businesses (création d'une entreprise — compte et abonnement requis)
 * Body: { name, slug, organizationName?, backTerms?, backContact?, backgroundColor?, foregroundColor?, labelColor?, logoBase64? }
 */
router.post("/", requireAuth, (req, res) => {
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
  if (!canCreateBusiness(req.user.id)) {
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
});

function normalizeHex(value) {
  if (!value || typeof value !== "string") return null;
  const v = value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v;
  if (/^[0-9A-Fa-f]{6}$/.test(v)) return `#${v}`;
  return null;
}

export default router;
