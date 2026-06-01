/**
 * Assets publics (sans auth) : logo / fond pour la page fidélité client.
 * `/public/flyer-qr-logo` : logo Flyer IA (prefs) si présent, sinon logo carte fidélité Wallet (`/public/logo`).
 */
import { Router } from "express";
import {
  parseFlyerPrefsCustomBgDataUrl,
  parseFlyerPrefsCustomLogoDataUrl,
} from "../../lib/resolve-flyer-prefs-custom-logo.js";
import { resolvePublicWalletLogoPng } from "../../lib/resolve-public-business-logo.js";
import { resizeLogoForWebFlyerQrHero } from "../../pass/images-logo.js";
import { createStripBuffer } from "../../pass/images-strip.js";
import { drawStampsOnStrip } from "../../pass/images-stamps.js";
import { mergeBusinessAssetsForPass } from "../../db.js";

const router = Router();

router.get("/flyer-qr-logo", async (req, res) => {
  const business = req.business;
  if (!business) return res.status(404).send();
  try {
    const fromPrefs = parseFlyerPrefsCustomLogoDataUrl(business.flyer_prefs_json);
    let resolved = null;
    if (fromPrefs?.buffer?.length) {
      const heroBuf = await resizeLogoForWebFlyerQrHero(fromPrefs.buffer);
      if (heroBuf?.length) {
        resolved = { buffer: heroBuf, contentType: "image/png" };
      } else {
        resolved = { buffer: fromPrefs.buffer, contentType: fromPrefs.contentType || "image/png" };
      }
    }
    if (!resolved?.buffer?.length) {
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

/** Fond page jeu QR (sans image fidélité dédiée) : même PNG que le fond Flyer IA enregistré dans les prefs. */
router.get("/flyer-custom-bg", async (req, res) => {
  const business = req.business;
  if (!business) return res.status(404).send();
  try {
    const parsed = parseFlyerPrefsCustomBgDataUrl(business.flyer_prefs_json);
    if (!parsed?.buffer?.length) return res.status(404).send();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", parsed.contentType || "image/png");
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.send(parsed.buffer);
  } catch (err) {
    console.warn("[public/flyer-custom-bg]", err?.message || err);
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

/** Grille tampons (strip PassKit) pour heroImage Google Wallet — tampons mode sans fond image. */
router.get("/wallet-stamp-hero", async (req, res) => {
  const business = mergeBusinessAssetsForPass(req.business);
  if (!business) return res.status(404).send();
  try {
    const programType = String(business.program_type || "").toLowerCase();
    if (programType !== "stamps") return res.status(404).send();
    const stampMax = Math.max(1, Math.min(10, Math.floor(Number(business.required_stamps) || 10)));
    const filledRaw = parseInt(String(req.query.filled ?? "0"), 10);
    const filled = Number.isFinite(filledRaw) ? Math.min(Math.max(0, filledRaw), stampMax) : 0;
    const stripColorHex = business.background_color || "#FFFFFF";
    const baseStrip = createStripBuffer("classic", stripColorHex);
    const png = await drawStampsOnStrip(
      baseStrip,
      "classic",
      filled,
      stampMax,
      business.stamp_emoji,
      business.stamp_icon_base64,
      stripColorHex,
    );
    if (!png?.length) return res.status(500).send();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=1800");
    return res.send(png);
  } catch (err) {
    console.warn("[public/wallet-stamp-hero]", err?.message || err);
    return res.status(500).send();
  }
});

/** Image de fond carte Wallet exposée publiquement pour Google Wallet `heroImage`. */
router.get("/wallet-card-background", async (req, res) => {
  const business = mergeBusinessAssetsForPass(req.business);
  if (!business) return res.status(404).send();
  try {
    const raw = business.card_background_base64;
    if (!raw || !String(raw).trim()) return res.status(404).send();
    const base64Data = String(raw).replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    if (!buffer.length) return res.status(404).send();
    const isPng = String(raw).includes("image/png");
    const isWebp = String(raw).includes("image/webp");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", isPng ? "image/png" : isWebp ? "image/webp" : "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.send(buffer);
  } catch (err) {
    console.warn("[public/wallet-card-background]", err?.message || err);
    return res.status(500).send();
  }
});

/** Icône tampon personnalisée exposée publiquement pour les détails Google Wallet. */
router.get("/stamp-icon", async (req, res) => {
  const business = mergeBusinessAssetsForPass(req.business);
  if (!business) return res.status(404).send();
  try {
    const raw = business.stamp_icon_base64;
    if (!raw || !String(raw).trim()) return res.status(404).send();
    const base64Data = String(raw).replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    if (!buffer.length) return res.status(404).send();
    const isPng = String(raw).includes("image/png");
    const isWebp = String(raw).includes("image/webp");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", isPng ? "image/png" : isWebp ? "image/webp" : "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.send(buffer);
  } catch (err) {
    console.warn("[public/stamp-icon]", err?.message || err);
    return res.status(500).send();
  }
});

export default router;
