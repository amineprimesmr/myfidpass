/**
 * API PassKit Web Service (Apple Wallet) — enregistrement devices et mise à jour des passes.
 * Routes attendues par Apple : /v1/devices/..., /v1/passes/...
 * Authentification : header Authorization: ApplePass <authenticationToken>
 */
import { Router } from "express";
import { getMember, getBusinessById, registerPassDevice, getPushTokensForMember, unregisterPassDevice, getUpdatedPassSerialNumbersForDevice } from "../db.js";
import { getPassAuthenticationToken } from "../pass.js";
import { generatePass } from "../pass.js";

const router = Router();

/** Log toute requête entrante sur /api/v1 pour voir si l'iPhone nous contacte (diagnostic). */
router.use((req, res, next) => {
  const ua = (req.get("User-Agent") || "").slice(0, 60);
  console.log("[PassKit] Requête reçue:", req.method, req.path, "User-Agent:", ua);
  if ((req.method === "GET" || req.method === "HEAD") && req.path.includes("passes")) {
    console.log("[PassKit] >>> path GET pass (exact):", JSON.stringify(req.path));
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
  console.log("[PassKit] Requête d'enregistrement reçue:", { deviceId: deviceId?.slice(0, 8) + "...", passTypeId, serialNumber: serialNumber?.slice(0, 8) + "..." });
  const token = parseApplePassAuth(req);
  if (!verifyToken(serialNumber, token)) {
    console.warn("[PassKit] Enregistrement refusé: token invalide ou manquant pour serialNumber", serialNumber?.slice(0, 8) + "...");
    return res.status(401).json({ error: "Unauthorized" });
  }
  const member = getMember(serialNumber);
  if (!member) {
    console.warn("[PassKit] Enregistrement refusé: membre introuvable", serialNumber?.slice(0, 8) + "...");
    return res.status(404).json({ error: "Pass not found" });
  }
  const pushToken = req.body?.pushToken || null;
  if (process.env.NODE_ENV === "production") {
    console.log("[PassKit] POST registration pushToken:", pushToken ? `présent (${String(pushToken).length} car.)` : "absent ou vide");
  }
  try {
    registerPassDevice({
      deviceLibraryIdentifier: deviceId,
      passTypeIdentifier: passTypeId,
      serialNumber,
      pushToken,
    });
    console.log("[PassKit] Appareil enregistré pour le membre", serialNumber.slice(0, 8) + "...", "pushToken:", pushToken ? "oui" : "non");
    return res.status(201).send();
  } catch (e) {
    console.error("PassKit register:", e);
    return res.status(500).json({ error: "Registration failed" });
  }
}

router.post("/devices/:deviceId/registrations/:passTypeId/:serialNumber", handleDeviceRegistration);
router.post("/v1/devices/:deviceId/registrations/:passTypeId/:serialNumber", handleDeviceRegistration);

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
    if (process.env.NODE_ENV === "production" && serialNumbers.length > 0) {
      console.log("[PassKit] GET registrations: device", deviceId.slice(0, 8) + "...", "→", serialNumbers.length, "pass(es) à jour, lastUpdated:", lastUpdated);
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

/** Convertit last_visit_at (SQLite) en date HTTP RFC 1123 pour Last-Modified. */
function toLastModifiedHttpDate(lastVisitAt) {
  if (!lastVisitAt) return new Date().toUTCString();
  const iso = String(lastVisitAt).replace(" ", "T") + "Z";
  return new Date(iso).toUTCString();
}

/**
 * GET /passes/:passTypeId/:serialNumber [ou avec slash final]
 * Retourne le .pkpass à jour (points, tampons, etc.).
 * Certains clients (proxy, iOS) peuvent envoyer un trailing slash → on accepte les deux.
 */
const getPassHandler = async (req, res) => {
  const { passTypeId, serialNumber } = req.params;
  const shortId = serialNumber ? String(serialNumber).slice(0, 8) + "..." : "?";
  console.log("[PassKit] GET pass: entrée handler serialNumber=", shortId);
  try {
    const token = parseApplePassAuth(req);
    if (!verifyToken(serialNumber, token)) {
      console.log("[PassKit] GET pass: 401 Unauthorized — token invalide pour", shortId);
      return res.status(401).json({ error: "Unauthorized" });
    }
    const member = getMember(serialNumber);
    if (!member) {
      console.log("[PassKit] GET pass: 404 — membre introuvable serialNumber=", shortId);
      return res.status(404).json({ error: "Pass not found" });
    }
    const business = getBusinessById(member.business_id);
    if (!business) {
      console.log("[PassKit] GET pass: 404 — business introuvable business_id=", member.business_id, "pour", shortId);
      return res.status(404).json({ error: "Business not found" });
    }

    const lastModified = toLastModifiedHttpDate(member.last_visit_at);
    console.log("[PassKit] >>> PASS ENVOYÉ —", shortId, "points:", member.points, "Last-Modified:", lastModified);
    const buffer = await generatePass(member, business, { template: "classic" });
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Content-Disposition", `inline; filename="pass.pkpass"`);
    res.setHeader("Last-Modified", lastModified);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.send(buffer);
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
  const member = getMember(serialNumber);
  if (!member) return res.status(404).end();
  const lastModified = toLastModifiedHttpDate(member.last_visit_at);
  res.setHeader("Content-Type", "application/vnd.apple.pkpass");
  res.setHeader("Last-Modified", lastModified);
  res.status(200).end();
});
router.head(["/v1/passes/:passTypeId/:serialNumber", "/v1/passes/:passTypeId/:serialNumber/"], (req, res) => {
  const { serialNumber } = req.params;
  const token = parseApplePassAuth(req);
  if (!verifyToken(serialNumber, token)) return res.status(401).end();
  const member = getMember(serialNumber);
  if (!member) return res.status(404).end();
  const lastModified = toLastModifiedHttpDate(member.last_visit_at);
  res.setHeader("Content-Type", "application/vnd.apple.pkpass");
  res.setHeader("Last-Modified", lastModified);
  res.status(200).end();
});
router.head(["/api/v1/passes/:passTypeId/:serialNumber", "/api/v1/passes/:passTypeId/:serialNumber/"], (req, res) => {
  const { serialNumber } = req.params;
  const token = parseApplePassAuth(req);
  if (!verifyToken(serialNumber, token)) return res.status(401).end();
  const member = getMember(serialNumber);
  if (!member) return res.status(404).end();
  const lastModified = toLastModifiedHttpDate(member.last_visit_at);
  res.setHeader("Content-Type", "application/vnd.apple.pkpass");
  res.setHeader("Last-Modified", lastModified);
  res.status(200).end();
});
router.head(["/api/v1/v1/passes/:passTypeId/:serialNumber", "/api/v1/v1/passes/:passTypeId/:serialNumber/"], (req, res) => {
  const { serialNumber } = req.params;
  const token = parseApplePassAuth(req);
  if (!verifyToken(serialNumber, token)) return res.status(401).end();
  const member = getMember(serialNumber);
  if (!member) return res.status(404).end();
  const lastModified = toLastModifiedHttpDate(member.last_visit_at);
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

/**
 * POST /log — Apple peut envoyer des erreurs (optionnel).
 */
router.post("/log", (req, res) => {
  if (req.body?.logs) {
    console.error("[PassKit log]", req.body.logs);
  }
  res.status(200).send();
});

/** Log toute requête GET/HEAD qui n'a matché aucune route (diagnostic). */
router.use((req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") {
    console.log("[PassKit] Aucune route ne correspond à", req.method, req.path);
  }
  next();
});

export default router;
