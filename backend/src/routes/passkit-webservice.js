/**
 * API PassKit Web Service (Apple Wallet) — enregistrement devices et mise à jour des passes.
 * Routes attendues par Apple : /v1/devices/..., /v1/passes/...
 * Authentification : header Authorization: ApplePass <authenticationToken>
 */
import { Router } from "express";
import { getMember, getBusinessById, registerPassDevice, getPushTokensForMember, unregisterPassDevice } from "../db.js";
import { getPassAuthenticationToken } from "../pass.js";
import { generatePass } from "../pass.js";

const router = Router();

/** Log toute requête entrante sur /api/v1 pour voir si l'iPhone nous contacte (diagnostic). */
router.use((req, res, next) => {
  if (process.env.NODE_ENV === "production") {
    console.log("[PassKit] Requête reçue:", req.method, req.path, "User-Agent:", (req.get("User-Agent") || "").slice(0, 60));
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
 * GET /passes/:passTypeId/:serialNumber
 * Retourne le .pkpass à jour (points, tampons, etc.).
 */
router.get("/passes/:passTypeId/:serialNumber", async (req, res) => {
  const { passTypeId, serialNumber } = req.params;
  const token = parseApplePassAuth(req);
  if (!verifyToken(serialNumber, token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const member = getMember(serialNumber);
  if (!member) return res.status(404).json({ error: "Pass not found" });
  const business = getBusinessById(member.business_id);
  if (!business) return res.status(404).json({ error: "Business not found" });
  try {
    const buffer = await generatePass(member, business, { template: "classic" });
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Content-Disposition", `inline; filename="pass.pkpass"`);
    res.send(buffer);
  } catch (err) {
    console.error("PassKit get pass:", err);
    return res.status(500).json({ error: "Failed to generate pass" });
  }
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

export default router;
