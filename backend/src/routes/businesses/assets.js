/**
 * Routes assets : logo, fond de carte, icône tampon, icône notif, public/logo.
 * Médias lus depuis `business_assets` ; Cache-Control compatible URLCache iOS (Bearer).
 */
import { Router } from "express";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getLogoIconBuffer } from "../../notifications.js";
import { ensureDashboardAccess } from "./shared.js";
import { getBusinessAssetData, getAllBusinessAssetsMap } from "../../db/business-assets.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Icône de notification par défaut (logo app) — servi quand le commerçant n'a pas uploadé d'icône dédiée. */
const LOGONOTIF_PATH = resolve(__dirname, "../../assets/logonotif.png");

/** Buffer mis en mémoire une seule fois au premier appel pour éviter des lectures disque répétées. */
let _logonotifBuffer = null;
async function getDefaultNotifIconBuffer() {
  if (_logonotifBuffer) return _logonotifBuffer;
  try {
    _logonotifBuffer = await readFile(LOGONOTIF_PATH);
    return _logonotifBuffer;
  } catch {
    return null;
  }
}

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

/**
 * Icône **campagnes / Web Push / aperçu app Notifs** uniquement.
 * Repli : icône app `logonotif.png` quand aucun média dédié n'est configuré (évite 404 et l'image
 * du logo carte dans les notifications).
 */
router.get("/notification-icon", async (req, res) => {
  const business = req.business;
  if (!business) return res.status(404).send();

  const assets = business.id ? getAllBusinessAssetsMap(business.id) : null;
  const fromAssets = assets?.notification_icon;
  const fromRow =
    business.notification_icon_base64 && String(business.notification_icon_base64).trim()
      ? business.notification_icon_base64
      : null;
  const b64 = fromAssets || fromRow;
  const customBuffer = b64 ? await getLogoIconBuffer(b64) : null;

  if (customBuffer) {
    // Icône personnalisée : cache long, invalidé par notification_icon_updated_at
    const etagKey = `${business.id}-notification-icon-${business.notification_icon_updated_at || "0"}`;
    if (setAssetCacheHeaders(res, req, etagKey)) return;
    res.setHeader("Content-Type", "image/png");
    return res.send(customBuffer);
  }

  // Repli : logo app par défaut (logonotif) — cache court pour que l'upload d'une icône custom
  // soit pris en compte rapidement sans cache busting manuel.
  const defaultBuffer = await getDefaultNotifIconBuffer();
  if (!defaultBuffer) return res.status(404).send();
  res.setHeader("Cache-Control", "private, max-age=3600, stale-while-revalidate=300");
  res.setHeader("Content-Type", "image/png");
  return res.send(defaultBuffer);
});

router.get("/logo", (req, res) => {
  const business = req.business;
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!ensureDashboardAccess(req, res, business)) return;
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
  if (!ensureDashboardAccess(req, res, business)) return;
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
  if (!ensureDashboardAccess(req, res, business)) return;
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

/** Fond page /fidelity/:slug — lecture publique (affichage client sans token). */
router.get("/fidelity-page-background", (req, res) => {
  const business = req.business;
  if (!business) return res.status(404).send();
  const raw = getBusinessAssetData(business.id, "fidelity_page_background");
  if (!raw) return res.status(404).send();
  const base64Data = String(raw).replace(/^data:image\/\w+;base64,/, "");
  const buf = Buffer.from(base64Data, "base64");
  if (buf.length === 0) return res.status(404).send();
  const isPng = raw.includes("image/png");
  const isWebp = raw.includes("image/webp");
  res.setHeader("Content-Type", isPng ? "image/png" : isWebp ? "image/webp" : "image/jpeg");
  const etagKey = `${business.id}-fid-bg-${business.fidelity_page_background_updated_at || "0"}`;
  if (setAssetCacheHeaders(res, req, etagKey)) return;
  res.send(buf);
});

router.get("/stamp-icon", (req, res) => {
  const business = req.business;
  if (!business) return res.status(404).json({ error: "Entreprise introuvable" });
  if (!ensureDashboardAccess(req, res, business)) return;
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
