/**
 * Assets publics (sans auth) : logo pour la page fidélité client.
 * Aligné sur le bandeau Wallet (generatePass) : image, fichier, mode texte, repli nom commerce.
 */
import { Router } from "express";
import { resolvePublicWalletLogoPng } from "../../lib/resolve-public-business-logo.js";

const router = Router();

router.get("/logo", async (req, res) => {
  const business = req.business;
  if (!business) return res.status(404).send();
  try {
    const resolved = await resolvePublicWalletLogoPng(business);
    if (!resolved?.buffer?.length) return res.status(404).send();
    res.setHeader("Content-Type", resolved.contentType || "image/png");
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.send(resolved.buffer);
  } catch (err) {
    console.warn("[public/logo]", err?.message || err);
    return res.status(500).send();
  }
});

export default router;
