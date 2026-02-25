import { Router } from "express";
import { resetAllData } from "../db.js";

const router = Router();
const isProduction = process.env.NODE_ENV === "production";
const resetSecret = process.env.RESET_SECRET;

/**
 * POST /api/dev/reset
 * Supprime tous les comptes, cartes, membres, transactions, abonnements.
 * - En production : exige body.secret === RESET_SECRET (variable d'env à définir sur Railway).
 * - En dev (NODE_ENV !== production) : si RESET_SECRET non défini, accepte sans secret.
 */
router.post("/reset", (req, res) => {
  if (isProduction && !resetSecret) {
    return res.status(404).json({ error: "Route désactivée en production" });
  }
  if (resetSecret) {
    const secret = req.body?.secret;
    if (secret !== resetSecret) {
      return res.status(403).json({ error: "Secret incorrect", code: "reset_secret_required" });
    }
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
