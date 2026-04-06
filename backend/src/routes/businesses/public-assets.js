/**
 * Assets publics (sans auth) : logo pour la page fidélité client.
 * `/public/flyer-qr-logo` : logo importé flyer si présent, sinon même rendu que `/public/logo` (Wallet).
 */
import { Router } from "express";
import { parseFlyerPrefsCustomLogoDataUrl } from "../../lib/resolve-flyer-prefs-custom-logo.js";
import { resolvePublicWalletLogoPng } from "../../lib/resolve-public-business-logo.js";
import { resizeLogoForPass } from "../../pass/images-logo.js";

const router = Router();

router.get("/flyer-qr-logo", async (req, res) => {
  const business = req.business;
  if (!business) return res.status(404).send();
  try {
    const fromPrefs = parseFlyerPrefsCustomLogoDataUrl(business.flyer_prefs_json);
    let resolved = null;
    if (fromPrefs?.buffer?.length) {
      const resized = await resizeLogoForPass(fromPrefs.buffer);
      if (resized?.logoPng2x?.length) {
        resolved = { buffer: resized.logoPng2x, contentType: "image/png" };
      } else {
        resolved = { buffer: fromPrefs.buffer, contentType: fromPrefs.contentType || "image/png" };
      }
    }
    if (!resolved) {
      resolved = await resolvePublicWalletLogoPng(business);
    }
    if (!resolved?.buffer?.length) return res.status(404).send();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", resolved.contentType || "image/png");
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.send(resolved.buffer);
  } catch (err) {
    console.warn("[public/flyer-qr-logo]", err?.message || err);
    return res.status(500).send();
  }
});

router.get("/logo", async (req, res) => {
  const business = req.business;
  if (!business) return res.status(404).send();
  try {
    const resolved = await resolvePublicWalletLogoPng(business);
    if (!resolved?.buffer?.length) return res.status(404).send();
    /** WKWebView + flyer-embed (origine www.myfidpass.fr) : fetch cross-origin vers l’API. */
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", resolved.contentType || "image/png");
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.send(resolved.buffer);
  } catch (err) {
    console.warn("[public/logo]", err?.message || err);
    return res.status(500).send();
  }
});

export default router;
