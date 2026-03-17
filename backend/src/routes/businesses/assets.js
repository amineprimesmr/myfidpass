/**
 * Routes assets : logo, fond de carte, icône tampon, icône notif, public/logo.
 * Référence : REFONTE-REGLES.md — max 15 routes par fichier.
 */
import { Router } from "express";
import { getLogoIconBuffer } from "../../notifications.js";
import { canAccessDashboard } from "./shared.js";

const router = Router();

router.get("/notification-icon", async (req, res) => {
  const business = req.business;
  if (!business || !business.logo_base64) return res.status(404).send();
  const buffer = await getLogoIconBuffer(business.logo_base64);
  if (!buffer) return res.status(404).send();
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(buffer);
});

router.get("/logo", (req, res) => {
  const business = req.business;
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  if (business.logo_base64) {
    const base64Data = String(business.logo_base64).replace(/^data:image\/\w+;base64,/, "");
    const buf = Buffer.from(base64Data, "base64");
    if (buf.length > 0) {
      const isPng = business.logo_base64.includes("image/png");
      res.setHeader("Content-Type", isPng ? "image/png" : "image/jpeg");
      res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      return res.send(buf);
    }
  }
  return res.status(404).send();
});

router.get("/card-background", (req, res) => {
  const business = req.business;
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  if (business.card_background_base64) {
    const base64Data = String(business.card_background_base64).replace(/^data:image\/\w+;base64,/, "");
    const buf = Buffer.from(base64Data, "base64");
    if (buf.length > 0) {
      const isPng = business.card_background_base64.includes("image/png");
      res.setHeader("Content-Type", isPng ? "image/png" : "image/jpeg");
      res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      return res.send(buf);
    }
  }
  return res.status(404).send();
});

router.get("/stamp-icon", (req, res) => {
  const business = req.business;
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  if (business.stamp_icon_base64) {
    const base64Data = String(business.stamp_icon_base64).replace(/^data:image\/\w+;base64,/, "");
    const buf = Buffer.from(base64Data, "base64");
    if (buf.length > 0) {
      const isPng = business.stamp_icon_base64.includes("image/png");
      res.setHeader("Content-Type", isPng ? "image/png" : "image/jpeg");
      res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      return res.send(buf);
    }
  }
  return res.status(404).send();
});

export default router;
