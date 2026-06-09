/**
 * API PassKit Web Service (Apple Wallet) — enregistrement devices et mise à jour des passes.
 * Routes attendues par Apple : /v1/devices/..., /v1/passes/...
 * Authentification : header Authorization: ApplePass <authenticationToken>
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { createHash } from "node:crypto";
import logger from "../lib/logger.js";
import {
  getMember,
  getBusinessById,
  registerPassDevice,
  getPushTokensForMember,
  unregisterPassDevice,
  getUpdatedPassSerialNumbersForDevice,
  parsePassKitUpdateTag,
  mergeBusinessAssetsForPass,
} from "../db.js";
import { resolveBusinessProgramType } from "../db/businesses.js";
import { scheduleMerchantDashboardSyncForBusiness } from "../lib/merchant-dashboard-sync-push.js";
import { scheduleCampaignEventJobsForMember } from "../lib/campaign-event-jobs.js";
import { getPassAuthenticationToken } from "../pass.js";
import { generatePass } from "../pass.js";
import { grantWelcomeBonusIfEligible } from "../db/welcome-bonus.js";
import { resolveMemberBySerial } from "../lib/loyalty-group-resolve.js";
import { getEffectiveMemberPoints } from "../db/loyalty-groups.js";
import { clearWalletTierUnlockPending } from "../lib/wallet-reward-tier-notify.js";

const router = Router();

function memberFromPassSerial(serialNumber) {
  return resolveMemberBySerial(serialNumber)?.member ?? null;
}

/**
 * Rate limit sur l'enregistrement de devices PassKit.
 *
 * POURQUOI : sans ce limiteur, un client bugué ou malveillant pourrait envoyer des
 * milliers d'enregistrements par seconde, remplissant la table pass_registrations avec
 * des tokens parasites et rendant les campagnes impossibles à tracer.
 *
 * Limite : 20 enregistrements par deviceId toutes les 5 minutes.
 * Les iPhone légitimes n'enregistrent qu'une fois (ou lors d'un re-ajout de carte),
 * donc cette limite est très généreuse.
 *
 * keyGenerator : on utilise l'IP (X-Forwarded-For via trust proxy) plutôt que le deviceId
 * car le deviceId est dans l'URL et peut être forgé.
 */
const passkitRegisterLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20,
  message: { error: "Trop d'enregistrements depuis cette adresse. Réessayez dans 5 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { forwardedHeader: false },
});

/** Timeout maximum pour la génération d'un .pkpass (ms). */
const GENERATE_PASS_TIMEOUT_MS = 30_000;

/** Interception explicite /api/v1/v1/... (passes déjà en circulation avec ancienne webServiceURL) — au cas où les routes nommées ne matchent pas. */
const V1V1_PASSES_RE = /^\/api\/v1\/v1\/passes\/([^/]+)\/([^/]+)\/?$/;
const V1V1_DEVICES_REGISTRATIONS_RE = /^\/api\/v1\/v1\/devices\/([^/]+)\/registrations\/([^/]+)$/;
const V1V1_DEVICES_REGISTRATIONS_DELETE_RE = /^\/api\/v1\/v1\/devices\/([^/]+)\/registrations\/([^/]+)\/([^/]+)$/;
router.use((req, res, next) => {
  const p = (req.path || "").split("?")[0];
  if (req.method === "GET" && V1V1_PASSES_RE.test(p)) {
    const [, passTypeId, serialNumber] = p.match(V1V1_PASSES_RE);
    req.params = { ...req.params, passTypeId, serialNumber };
    return getPassHandler(req, res, next);
  }
  if (req.method === "GET" && V1V1_DEVICES_REGISTRATIONS_RE.test(p)) {
    const [, deviceId, passTypeId] = p.match(V1V1_DEVICES_REGISTRATIONS_RE);
    req.params = { ...req.params, deviceId, passTypeId };
    return handleGetRegistrations(req, res, next);
  }
  if (req.method === "DELETE" && V1V1_DEVICES_REGISTRATIONS_DELETE_RE.test(p)) {
    const [, deviceId, passTypeId, serialNumber] = p.match(V1V1_DEVICES_REGISTRATIONS_DELETE_RE);
    req.params = { ...req.params, deviceId, passTypeId, serialNumber };
    return handleDeviceUnregister(req, res, next);
  }
  next();
});

/** GET / — permet de vérifier que /api/v1 est bien joignable (ex. https://api.myfidpass.fr/api/v1) */
router.get("/", (req, res) => {
  res.json({ ok: true, service: "PassKit Web Service", message: "Les iPhones enregistrent les passes via POST /api/v1/devices/..." });
});

function parseApplePassAuth(req) {
  const auth = req.get("Authorization");
  if (!auth || !auth.startsWith("ApplePass ")) return null;
  return auth.slice(10).trim();
}

function verifyToken(serialNumber, token) {
  if (!token || token.length < 16) return false;
  const expected = getPassAuthenticationToken(serialNumber);
  return token === expected;
}

/** Handler POST enregistrement device (partagé pour /devices/... et /v1/devices/...). */
function handleDeviceRegistration(req, res) {
  const { deviceId, passTypeId, serialNumber } = req.params;
  const token = parseApplePassAuth(req);
  if (!verifyToken(serialNumber, token)) {
    console.warn("[PassKit] Enregistrement refusé: token invalide ou manquant pour serialNumber", serialNumber?.slice(0, 8) + "...");
    return res.status(401).json({ error: "Unauthorized" });
  }
  const resolved = resolveMemberBySerial(serialNumber);
  const member = resolved?.member;
  if (!member) {
    console.warn("[PassKit] Enregistrement refusé: membre introuvable", serialNumber?.slice(0, 8) + "...");
    return res.status(404).json({ error: "Pass not found" });
  }
  const pushToken = req.body?.pushToken || null;
  try {
    registerPassDevice({
      deviceLibraryIdentifier: deviceId,
      passTypeIdentifier: passTypeId,
      serialNumber,
      pushToken,
    });
    if (member.business_id) {
      scheduleMerchantDashboardSyncForBusiness(member.business_id, "wallet_register");
      try {
        const fullBusiness = getBusinessById(member.business_id);
        if (fullBusiness) {
          scheduleCampaignEventJobsForMember({ business: fullBusiness, memberId: member.id });
          // Bonus d'inscription : accordé une seule fois à la première registration Wallet.
          try {
            const granted = grantWelcomeBonusIfEligible(fullBusiness, member.id);
            if (granted) {
              logger.info(
                { memberId: serialNumber, businessId: member.business_id, granted },
                "[welcome-bonus] bonus inscription accordé",
              );
            }
          } catch (e) {
            logger.warn({ err: e }, "[welcome-bonus] erreur bonus inscription (non bloquant)");
          }
        }
      } catch (e) {
        console.error("[campaign-event-jobs] schedule PassKit failed:", e?.message || String(e));
      }
    }
    return res.status(201).send();
  } catch (e) {
    console.error("PassKit register:", e);
    return res.status(500).json({ error: "Registration failed" });
  }
}

// Rate limit appliqué à toutes les routes d'enregistrement PassKit.
router.post("/devices/:deviceId/registrations/:passTypeId/:serialNumber", passkitRegisterLimiter, handleDeviceRegistration);
router.post("/v1/devices/:deviceId/registrations/:passTypeId/:serialNumber", passkitRegisterLimiter, handleDeviceRegistration);
// Nouveaux passes (webServiceURL = .../api) : l'iPhone envoie POST /api/v1/devices/... — sans cette route l'enregistrement ne serait jamais sauvegardé → "Aucun appareil enregistré"
router.post("/api/v1/devices/:deviceId/registrations/:passTypeId/:serialNumber", passkitRegisterLimiter, handleDeviceRegistration);

/**
 * GET /v1/devices/:deviceId/registrations/:passTypeId
 * Liste des passes mis à jour pour ce device (requis par Apple après une push).
 * Sans cet endpoint, l'iPhone ne sait pas quels passes récupérer → la carte ne se met pas à jour.
 * Query: passesUpdatedSince (optionnel) = tag de dernière mise à jour.
 * Réponse: { serialNumbers: string[], lastUpdated: string }
 */
function handleGetRegistrations(req, res) {
  const { deviceId, passTypeId } = req.params;
  const passesUpdatedSince = req.query.passesUpdatedSince || null;
  try {
    const { serialNumbers, lastUpdated } = getUpdatedPassSerialNumbersForDevice(deviceId, passTypeId, passesUpdatedSince);
    // Spéc Apple PassKit : 204 No Content si aucun pass mis à jour depuis passesUpdatedSince.
    // Retourner 200 avec tableau vide ferait mettre à jour le passesUpdatedSince de l'iPhone
    // au "now()" renvoyé, décalant la baseline et pouvant manquer les notifications suivantes.
    if (serialNumbers.length === 0) {
      const sinceTs = passesUpdatedSince ? parsePassKitUpdateTag(String(passesUpdatedSince)) : 0;
      console.warn(
        "[PassKit] GET registrations → 204 (aucun pass > passesUpdatedSince)",
        { deviceId: deviceId?.slice?.(0, 12), passesUpdatedSince, sinceTs },
      );
      return res.status(204).send();
    }
      res.json({ serialNumbers, lastUpdated });
  } catch (e) {
    console.error("[PassKit] GET registrations:", e);
    res.status(500).json({ error: "Server error" });
  }
}
router.get("/devices/:deviceId/registrations/:passTypeId", handleGetRegistrations);
router.get("/v1/devices/:deviceId/registrations/:passTypeId", handleGetRegistrations);
router.get("/api/v1/devices/:deviceId/registrations/:passTypeId", handleGetRegistrations);
router.get("/api/v1/v1/devices/:deviceId/registrations/:passTypeId", handleGetRegistrations);

/** Convertit une date (SQLite "YYYY-MM-DD HH:MM:SS" ou ISO "YYYY-MM-DDTHH:MM:SS.sssZ") en timestamp. */
function toTimestamp(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (!s) return null;
  const iso = /Z$|\+\d{2}:?\d{2}$/.test(s) ? s : s.replace(" ", "T") + "Z";
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Retourne la date HTTP la plus récente pour que l'iPhone refetch le pass (points, message, logos, icône campagne). */
function getPassLastModified(member, business) {
  const passMs = Number(business?.pass_last_modified_ms);
  const passMsOk = Number.isFinite(passMs) && passMs > 0 ? passMs : null;
  const timestamps = [
    toTimestamp(member?.last_visit_at),
    toTimestamp(business?.last_broadcast_at),
    toTimestamp(business?.notification_pass_layout_at),
    toTimestamp(business?.logo_updated_at),
    toTimestamp(business?.logo_icon_updated_at),
    toTimestamp(business?.notification_icon_updated_at),
    toTimestamp(business?.card_background_updated_at),
    passMsOk,
  ].filter((t) => t != null && Number.isFinite(t) && t > 0);
  const ts = timestamps.length > 0 ? Math.max(...timestamps) : 0;
  if (!Number.isFinite(ts) || ts <= 0) return new Date().toUTCString();
  return new Date(ts).toUTCString();
}

/**
 * GET /passes/:passTypeId/:serialNumber [ou avec slash final]
 * Retourne le .pkpass à jour (points, tampons, etc.).
 * Certains clients (proxy, iOS) peuvent envoyer un trailing slash → on accepte les deux.
 */
const getPassHandler = async (req, res) => {
  const { passTypeId, serialNumber } = req.params;
  try {
    const token = parseApplePassAuth(req);
    if (!verifyToken(serialNumber, token)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const resolved = resolveMemberBySerial(serialNumber);
    const member = resolved?.member;
    if (!member) {
      return res.status(404).json({ error: "Pass not found" });
    }
    const memberForPass = { ...member, points: getEffectiveMemberPoints(member) };
    const businessRow = getBusinessById(member.business_id);
    if (!businessRow) {
      return res.status(404).json({ error: "Business not found" });
    }
    const business = mergeBusinessAssetsForPass(businessRow);

    const lastModified = getPassLastModified(member, business);
    const programKind = resolveBusinessProgramType(business);
    const opts = {
      template: programKind === "stamps" ? "cafe" : "classic",
      required_stamps: business.required_stamps ?? undefined,
      program_type: business.program_type ?? undefined,
      stamp_emoji: business.stamp_emoji ?? undefined,
      organizationName: business.organization_name ?? undefined,
      notification_title_override: business.notification_title_override ?? undefined,
      notification_change_message: business.notification_change_message ?? undefined,
      background_color: business.background_color ?? undefined,
      foreground_color: business.foreground_color ?? undefined,
      label_color: business.label_color ?? undefined,
      strip_color: business.strip_color ?? undefined,
      strip_display_mode: business.strip_display_mode ?? undefined,
      strip_text: business.strip_text ?? undefined,
      card_background_base64: business.card_background_base64 ?? undefined,
    };
    // Timeout explicite sur la génération du pass — generatePass effectue des opérations crypto
    // (signature X.509) + traitement d'image (sharp resize) qui peuvent bloquer indéfiniment sur
    // une image lourde ou un pic CPU. Sans timeout, Railway coupe à 30s avec un 504 côté iPhone.
    const buffer = await Promise.race([
      generatePass(memberForPass, business, opts),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`generatePass timeout après ${GENERATE_PASS_TIMEOUT_MS}ms — image trop lourde ou CPU surchargé`)),
          GENERATE_PASS_TIMEOUT_MS
        )
      ),
    ]);
    // ETag fort dérivé du hash du buffer final — Wallet ne l'envoie pas en If-None-Match mais les
    // proxies/CDN en amont (Railway, Cloudflare) peuvent l'utiliser pour détecter un vrai changement.
    const bufferSha12 = createHash("sha256").update(buffer).digest("hex").slice(0, 12);
    res.setHeader("ETag", `"${bufferSha12}"`);
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Content-Disposition", `inline; filename="pass.pkpass"`);
    res.setHeader("Last-Modified", lastModified);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.send(buffer);
    if (Number(member.wallet_tier_unlock_pending) === 1) {
      clearWalletTierUnlockPending(member.id);
    }
  } catch (err) {
    console.error("[PassKit] GET pass: erreur", err?.message || err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to generate pass" });
  }
};
router.get(["/passes/:passTypeId/:serialNumber", "/passes/:passTypeId/:serialNumber/"], getPassHandler);
// Certains proxies / Railway envoient le chemin complet au routeur → accepter /v1/passes/..., /api/v1/passes/..., et /api/v1/v1/... (anciens passes)
router.get(["/v1/passes/:passTypeId/:serialNumber", "/v1/passes/:passTypeId/:serialNumber/"], getPassHandler);
router.get(["/api/v1/passes/:passTypeId/:serialNumber", "/api/v1/passes/:passTypeId/:serialNumber/"], getPassHandler);
router.get(["/api/v1/v1/passes/:passTypeId/:serialNumber", "/api/v1/v1/passes/:passTypeId/:serialNumber/"], getPassHandler);

/** HEAD /passes/:passTypeId/:serialNumber — Apple peut demander les en-têtes sans le corps. */
router.head("/passes/:passTypeId/:serialNumber", (req, res) => {
  const { serialNumber } = req.params;
  const token = parseApplePassAuth(req);
  if (!verifyToken(serialNumber, token)) return res.status(401).end();
  const member = memberFromPassSerial(serialNumber);
  if (!member) return res.status(404).end();
  const business = getBusinessById(member.business_id);
  const lastModified = getPassLastModified(member, business);
  res.setHeader("Content-Type", "application/vnd.apple.pkpass");
  res.setHeader("Last-Modified", lastModified);
  res.status(200).end();
});
router.head(["/v1/passes/:passTypeId/:serialNumber", "/v1/passes/:passTypeId/:serialNumber/"], (req, res) => {
  const { serialNumber } = req.params;
  const token = parseApplePassAuth(req);
  if (!verifyToken(serialNumber, token)) return res.status(401).end();
  const member = memberFromPassSerial(serialNumber);
  if (!member) return res.status(404).end();
  const business = getBusinessById(member.business_id);
  const lastModified = getPassLastModified(member, business);
  res.setHeader("Content-Type", "application/vnd.apple.pkpass");
  res.setHeader("Last-Modified", lastModified);
  res.status(200).end();
});
router.head(["/api/v1/passes/:passTypeId/:serialNumber", "/api/v1/passes/:passTypeId/:serialNumber/"], (req, res) => {
  const { serialNumber } = req.params;
  const token = parseApplePassAuth(req);
  if (!verifyToken(serialNumber, token)) return res.status(401).end();
  const member = memberFromPassSerial(serialNumber);
  if (!member) return res.status(404).end();
  const business = getBusinessById(member.business_id);
  const lastModified = getPassLastModified(member, business);
  res.setHeader("Content-Type", "application/vnd.apple.pkpass");
  res.setHeader("Last-Modified", lastModified);
  res.status(200).end();
});
router.head(["/api/v1/v1/passes/:passTypeId/:serialNumber", "/api/v1/v1/passes/:passTypeId/:serialNumber/"], (req, res) => {
  const { serialNumber } = req.params;
  const token = parseApplePassAuth(req);
  if (!verifyToken(serialNumber, token)) return res.status(401).end();
  const member = memberFromPassSerial(serialNumber);
  if (!member) return res.status(404).end();
  const business = getBusinessById(member.business_id);
  const lastModified = getPassLastModified(member, business);
  res.setHeader("Content-Type", "application/vnd.apple.pkpass");
  res.setHeader("Last-Modified", lastModified);
  res.status(200).end();
});

function handleDeviceUnregister(req, res) {
  const { deviceId, passTypeId, serialNumber } = req.params;
  const token = parseApplePassAuth(req);
  if (!verifyToken(serialNumber, token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    unregisterPassDevice(deviceId, passTypeId, serialNumber);
    return res.status(200).send();
  } catch (e) {
    return res.status(500).json({ error: "Unregister failed" });
  }
}
router.delete("/devices/:deviceId/registrations/:passTypeId/:serialNumber", handleDeviceUnregister);
router.delete("/v1/devices/:deviceId/registrations/:passTypeId/:serialNumber", handleDeviceUnregister);
router.delete("/api/v1/devices/:deviceId/registrations/:passTypeId/:serialNumber", handleDeviceUnregister);
router.delete("/api/v1/v1/devices/:deviceId/registrations/:passTypeId/:serialNumber", handleDeviceUnregister);

/**
 * POST /log — Apple peut envoyer des erreurs (optionnel).
 */
router.post("/log", (req, res) => {
  if (req.body?.logs) {
    console.error("[PassKit log]", req.body.logs);
  }
  res.status(200).send();
});
router.post("/api/v1/log", (req, res) => {
  if (req.body?.logs) {
    console.error("[PassKit log]", req.body.logs);
  }
  res.status(200).send();
});

router.use((req, res, next) => {
  if ((req.method === "GET" || req.method === "HEAD") && (req.path.includes("/v1/") || req.path.startsWith("/passes") || req.path.startsWith("/devices/"))) {
    logger.warn({ method: req.method, path: req.path }, "[PassKit] route non trouvée");
  }
  next();
});

export default router;
