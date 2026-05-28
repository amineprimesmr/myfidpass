import { Router } from "express";
import {
  createMember,
  getMember,
  addPoints,
  getBusinessBySlug,
  getBusinessById,
  getPushTokensForMember,
  mergeBusinessAssetsForPass,
} from "../db.js";
import { generatePass } from "../pass.js";
import { pushPassKitUpdateForMember } from "../lib/passkit-member-push.js";
import { syncGoogleWalletObjectForMember } from "../google-wallet.js";
import { randomUUID } from "crypto";

const router = Router();

/**
 * POST /api/members
 * Body: { email, name } — crée un membre pour la business "demo" (rétrocompat).
 */
router.post("/", (req, res) => {
  try {
    const { email, name } = req.body || {};
    if (!email || !name) {
      return res.status(400).json({ error: "email et name requis" });
    }
    const demo = getBusinessBySlug("demo");
    if (!demo) return res.status(500).json({ error: "Business demo manquante" });
    const member = createMember({
      id: randomUUID(),
      businessId: demo.id,
      email: email.trim(),
      name: name.trim(),
    });
    res.status(201).json({
      memberId: member.id,
      member: { id: member.id, email: member.email, name: member.name, points: member.points },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur création membre" });
  }
});

/**
 * GET /api/members/:memberId
 * Retourne les infos du membre.
 */
router.get("/:memberId", (req, res) => {
  const member = getMember(req.params.memberId);
  if (!member) {
    return res.status(404).json({ error: "Membre introuvable" });
  }
  res.json({
    id: member.id,
    email: member.email,
    name: member.name,
    points: member.points,
  });
});

/**
 * POST /api/members/:memberId/points
 * Body: { points: number }
 * Ajoute des points au membre (ex: caisse).
 */
router.post("/:memberId/points", async (req, res) => {
  const points = Number(req.body?.points);
  if (!Number.isInteger(points) || points < 0) {
    return res.status(400).json({ error: "points doit être un entier positif" });
  }
  const member = addPoints(req.params.memberId, points);
  if (!member) {
    return res.status(404).json({ error: "Membre introuvable" });
  }
  await pushPassKitUpdateForMember(member.business_id, member.id, "legacy_points_add");
  if (member.business_id) {
    const business = mergeBusinessAssetsForPass(getBusinessById(member.business_id));
    if (business) {
      try {
        const apiBase = (process.env.API_URL || "").replace(/\/$/, "") || (req.protocol + "://" + (req.get("host") || ""));
        const result = await syncGoogleWalletObjectForMember(member, business, apiBase);
        if (!result.ok) {
          console.warn("[Google Wallet] sync membre rétrocompat échouée:", {
            slug: business?.slug,
            memberId: member?.id,
            googleStatus: result.googleStatus,
            googleError: result.googleError?.message || result.error,
          });
        }
      } catch (e) {
        console.warn("[Google Wallet] sync membre rétrocompat exception:", e?.message || String(e));
      }
    }
  }
  res.json({
    id: member.id,
    points: member.points,
  });
});

/**
 * GET /api/members/:memberId/pass
 * Télécharge le .pkpass pour ce membre.
 */
router.get("/:memberId/pass", async (req, res) => {
  const member = getMember(req.params.memberId);
  if (!member) return res.status(404).json({ error: "Membre introuvable" });
  const business = member.business_id ? mergeBusinessAssetsForPass(getBusinessById(member.business_id)) : null;
  try {
    const buffer = await generatePass(member, business);
    const filename = `fidelity-${member.id.slice(0, 8)}.pkpass`;
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error("Génération pass:", err);
    const msg = err?.message || "";
    const isCert = /certificat|PASS_TYPE_ID|TEAM_ID|manquant|WWDR|SIGNER/i.test(msg);
    const userMessage = isCert
      ? "Configuration Wallet manquante ou invalide sur le serveur. Vérifiez les certificats (Railway → Variables, voir docs/APPLE-WALLET-SETUP.md)."
      : "Impossible de générer la carte. Réessayez dans un instant.";
    res.status(500).json({
      error: userMessage,
      detail: msg,
    });
  }
});

export default router;
