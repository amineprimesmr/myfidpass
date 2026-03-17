/**
 * Point d'entrée des routes /api/businesses.
 * Référence : REFONTE-REGLES.md — max 15 routes par fichier, découpage en sous-routeurs.
 */
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { getBusinessBySlug, ensureDefaultBusiness } from "../../db.js";
import { createHandler, updateHandler } from "./create.js";
import slugRouter from "./slug.js";

const router = Router();

router.param("slug", (req, res, next) => {
  let business = getBusinessBySlug(req.params.slug);
  if (!business && req.params.slug === "demo") {
    business = ensureDefaultBusiness();
  }
  if (!business) {
    return res.status(404).json({ error: "Entreprise introuvable" });
  }
  req.business = business;
  next();
});

router.post("/", requireAuth, createHandler);

router.use("/:slug", slugRouter);

// PATCH /:slug est géré dans slug.js (slugRouter.patch("/", updateHandler))
// On s'assure que slugRouter reçoit bien la route
export default router;
