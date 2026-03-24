/**
 * Routes assets : logo, fond de carte, icône tampon, icône notif, public/logo.
 * Médias lus depuis `business_assets` ; Cache-Control compatible URLCache iOS (Bearer).
 */
import { Router } from "express";
import { getLogoIconBuffer } from "../../notifications.js";
import { canAccessDashboard } from "./shared.js";
import { getBusinessAssetData, getAllBusinessAssetsMap } from "../../db/business-assets.js";

const router = Router();

/** Cache privé long : l’app invalide via ?v= (logo_updated_at) ; évite no-store qui vide URLCache. */
function normalizeIfNoneMatch(v) {
  if (!v || typeof v !== "string") return "";
  const t = v.trim();
  return t.startsWith("W/") ? t.slice(2).trim() : t;
}

function setAssetCacheHeaders(res, req, etagKey) {
  const inner = etagKey ? String(etagKey).replace(/"/g, "") : "";
  const etag = inner ? `W/"${inner}"` : null;
  if (etag) {
    const inm = normalizeIfNoneMatch(req.headers["if-none-match"] || "");
    const compare = `"${inner}"`;
    if (inm === compare || inm === etag || inm === inner) {
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "private, max-age=604800, stale-while-revalidate=86400");
      res.status(304).end();
      return true;
    }
    res.setHeader("ETag", etag);
  }
  res.setHeader("Cache-Control", "private, max-age=604800, stale-while-revalidate=86400");
  return false;
}

router.get("/notification-icon", async (req, res) => {
  const business = req.business;
  const assets = business?.id ? getAllBusinessAssetsMap(business.id) : null;
  const b64 =
    assets?.logo_icon ||
    assets?.logo ||
    business?.logo_icon_base64 ||
    business?.logo_base64;
  if (!business || !b64) return res.status(404).send();
  const buffer = await getLogoIconBuffer(b64);
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
  const raw = getBusinessAssetData(business.id, "logo");
  if (!raw) return res.status(404).send();
  const base64Data = String(raw).replace(/^data:image\/\w+;base64,/, "");
  const buf = Buffer.from(base64Data, "base64");
  if (buf.length === 0) return res.status(404).send();
  const isPng = raw.includes("image/png");
  res.setHeader("Content-Type", isPng ? "image/png" : "image/jpeg");
  const etagKey = `${business.id}-logo-${business.logo_updated_at || "0"}`;
  if (setAssetCacheHeaders(res, req, etagKey)) return;
  res.send(buf);
});

router.get("/logo-icon", (req, res) => {
  const business = req.business;
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const raw = getBusinessAssetData(business.id, "logo_icon");
  if (!raw) return res.status(404).send();
  const base64Data = String(raw).replace(/^data:image\/\w+;base64,/, "");
  const buf = Buffer.from(base64Data, "base64");
  if (buf.length === 0) return res.status(404).send();
  const isPng = raw.includes("image/png");
  res.setHeader("Content-Type", isPng ? "image/png" : "image/jpeg");
  const etagKey = `${business.id}-logo-icon-${business.logo_icon_updated_at || "0"}`;
  if (setAssetCacheHeaders(res, req, etagKey)) return;
  res.send(buf);
});

router.get("/card-background", (req, res) => {
  const business = req.business;
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const raw = getBusinessAssetData(business.id, "card_background");
  if (!raw) return res.status(404).send();
  const base64Data = String(raw).replace(/^data:image\/\w+;base64,/, "");
  const buf = Buffer.from(base64Data, "base64");
  if (buf.length === 0) return res.status(404).send();
  const isPng = raw.includes("image/png");
  res.setHeader("Content-Type", isPng ? "image/png" : "image/jpeg");
  const etagKey = `${business.id}-card-bg-${business.card_background_updated_at || "0"}`;
  if (setAssetCacheHeaders(res, req, etagKey)) return;
  res.send(buf);
});

router.get("/stamp-icon", (req, res) => {
  const business = req.business;
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!canAccessDashboard(business, req)) {
    return res.status(401).json({ error: "Token dashboard invalide ou manquant" });
  }
  const raw = getBusinessAssetData(business.id, "stamp_icon");
  if (!raw) return res.status(404).send();
  const base64Data = String(raw).replace(/^data:image\/\w+;base64,/, "");
  const buf = Buffer.from(base64Data, "base64");
  if (buf.length === 0) return res.status(404).send();
  const isPng = raw.includes("image/png");
  res.setHeader("Content-Type", isPng ? "image/png" : "image/jpeg");
  const etagKey = `${business.id}-stamp-${String(raw).length}-${String(raw).slice(0, 80)}`;
  if (setAssetCacheHeaders(res, req, etagKey)) return;
  res.send(buf);
});

export default router;
