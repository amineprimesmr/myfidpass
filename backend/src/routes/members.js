import { Router } from "express";
import { createMember, getMember, addPoints, getBusinessBySlug, getBusinessById, getPushTokensForMember } from "../db.js";
import { generatePass } from "../pass.js";
import { sendPassKitUpdate } from "../apns.js";
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
  // Envoyer une push APNs pour que l'iPhone mette à jour le pass et affiche "Tu as maintenant X points !"
  const tokens = getPushTokensForMember(member.id);
  if (tokens.length > 0) {
    console.log("[PassKit] Après points (API members): envoi push à", tokens.length, "appareil(s) pour membre", member.id.slice(0, 8) + "...");
    for (const token of tokens) {
      const result = await sendPassKitUpdate(token);
      if (result.sent) {
        console.log("[PassKit] Push envoyée OK pour membre", member.id.slice(0, 8) + "...");
      } else {
        console.warn("[PassKit] Push refusée:", result.error || "inconnu");
      }
    }
  } else {
    console.log("[PassKit] Aucun appareil enregistré pour ce membre — pas de push.");
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
  const business = member.business_id ? getBusinessById(member.business_id) : null;
  try {
    const buffer = await generatePass(member, business);
    const filename = `fidelity-${member.id.slice(0, 8)}.pkpass`;
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
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

export default router;
