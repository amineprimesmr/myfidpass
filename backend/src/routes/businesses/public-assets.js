/**
 * Assets publics (sans auth) : logo pour la page fidélité client.
 */
import { Router } from "express";

const router = Router();

router.get("/logo", (req, res) => {
  const business = req.business;
  if (!business) return res.status(404).send();
  if (business.logo_base64) {
    const base64Data = String(business.logo_base64).replace(/^data:image\/\w+;base64,/, "");
    const buf = Buffer.from(base64Data, "base64");
    if (buf.length > 0) {
      const isPng = business.logo_base64.includes("image/png");
      res.setHeader("Content-Type", isPng ? "image/png" : "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.send(buf);
    }
  }
  return res.status(404).send();
});

export default router;
