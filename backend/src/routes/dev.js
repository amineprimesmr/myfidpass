import { Router } from "express";
import { resetAllData } from "../db.js";

const router = Router();
const resetSecret = process.env.RESET_SECRET;

/**
 * POST /api/dev/reset
 * Supprime tous les comptes, cartes, membres, transactions, abonnements.
 * Exige body.secret === RESET_SECRET (variable d'env). En dev comme en prod, si RESET_SECRET
 * n'est pas défini, la route est désactivée (404).
 */
router.post("/reset", (req, res) => {
  if (!resetSecret) {
    return res.status(404).json({
      error: "Route désactivée. Définir RESET_SECRET dans .env pour l'activer (dev ou prod).",
    });
  }
  const secret = req.body?.secret;
  if (secret !== resetSecret) {
    return res.status(403).json({ error: "Secret incorrect", code: "reset_secret_required" });
  }
  try {
    resetAllData();
    res.json({ ok: true, message: "Toutes les données ont été supprimées." });
  } catch (e) {
    console.error("Reset error:", e);
    res.status(500).json({ error: "Erreur lors du reset" });
  }
});

export default router;
