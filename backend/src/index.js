import express from "express";
import cors from "cors";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import { DATA_DIR_PATH, DB_FILE_PATH, getPassRegistrationsTotalCount } from "./db.js";

import { optionalAuth } from "./middleware/auth.js";
import membersRouter from "./routes/members.js";
import businessesRouter from "./routes/businesses.js";
import authRouter from "./routes/auth.js";
import devRouter from "./routes/dev.js";
import placePhotoRouter from "./routes/place-photo.js";
import paymentRouter, { paymentWebhookHandler } from "./routes/payment.js";
import passesRouter from "./routes/passes.js";
import passkitWebserviceRouter from "./routes/passkit-webservice.js";
import webPushRouter from "./routes/web-push.js";
import { generatePass } from "./pass.js";
import { logApnsStatus } from "./apns.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SECTOR_TEMPLATES = ["fastfood", "beauty", "coiffure", "boulangerie", "boucherie", "cafe"];
const LEGACY_TEMPLATE_MAP = { classic: "classic", bold: "modern", elegant: "warm" };

async function handlePassDemo(req, res) {
  const templateParam = (req.query.template || "fastfood-points").toLowerCase();
  let template = LEGACY_TEMPLATE_MAP[templateParam] || "classic";
  let format = "points";
  const sector = SECTOR_TEMPLATES.find((s) => templateParam === `${s}-points` || templateParam === `${s}-tampons`);
  if (sector) {
    template = sector;
    format = templateParam.endsWith("-tampons") ? "tampons" : "points";
  }
  const member = { id: `demo-${templateParam}-${Date.now()}`, name: "Marie Dupont", points: 0 };
  const organizationName = "Votre logo";
  try {
    const buffer = await generatePass(member, null, { template, format, organizationName });
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Content-Disposition", `inline; filename="fidelity-demo-${templateParam}.pkpass"`);
    res.send(buffer);
  } catch (err) {
    console.error("Génération pass démo:", err);
    res.status(500).json({ error: "Impossible de générer la carte de démo.", detail: err.message });
  }
}

dotenv.config({ path: join(__dirname, "..", ".env") });

const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const app = express();
// CORS : en prod accepter le site + www ; en dev toute origine (pour test iPhone en local)
const allowedOrigins =
  process.env.NODE_ENV === "production"
    ? [FRONTEND_URL, FRONTEND_URL.replace(/\/$/, ""), "https://myfidpass.fr", "https://www.myfidpass.fr"].filter(Boolean)
    : true;
app.use(cors({ origin: allowedOrigins, credentials: true }));

// Webhook Stripe doit recevoir le body brut (pour vérification de signature)
app.use("/api/payment/webhook", express.raw({ type: "application/json" }));
app.post("/api/payment/webhook", paymentWebhookHandler);

app.use(express.json({ limit: "8mb" }));

// Parse JWT si présent (Authorization: Bearer) pour toutes les routes
app.use(optionalAuth);

// PassKit en premier à la racine : Apple envoie GET /v1/passes/... et certains proxies laissent le chemin complet
// → le routeur doit recevoir toutes les requêtes pour matcher /v1/passes/... et /api/v1/passes/...
app.use(passkitWebserviceRouter);

app.use("/api/auth", authRouter);
app.use("/api/members", membersRouter);
app.use("/api/businesses", businessesRouter);
app.use("/api/payment", paymentRouter);
app.use("/api/web-push", webPushRouter);
app.use("/api/dev", devRouter);
app.use("/api/place-photo", placePhotoRouter);
app.use("/api/passes", passesRouter);
app.use("/passes", passesRouter);

app.get("/api/passes/demo", handlePassDemo);
app.get("/passes/demo", handlePassDemo);

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/** Diagnostic : vérifie que DATA_DIR et la base sont bien utilisés (volume persistant). */
app.get("/api/health/db", (req, res) => {
  res.json({
    DATA_DIR: process.env.DATA_DIR ?? "(non défini, défaut backend/data)",
    dataDirResolved: DATA_DIR_PATH,
    dbPath: DB_FILE_PATH,
    dbExists: existsSync(DB_FILE_PATH),
    hint: "Sur Railway, le volume doit être monté exactement au chemin /data et DATA_DIR=/data.",
  });
});

function startServer(port) {
  const p = Number(port) || 3001;
  const server = app.listen(p, () => {
    if (process.env.NODE_ENV === "production") {
      console.log(`Backend fidélité: démarré sur le port ${server.address().port} (prod — l’API est exposée par Railway, pas en localhost).`);
    } else {
      console.log(`Backend fidélité: http://localhost:${server.address().port}`);
    }
    console.log(`  API: /api/businesses/:slug, /api/members`);
    try {
      const passRegCount = getPassRegistrationsTotalCount();
      console.log(`  [PassKit] Au démarrage: DATA_DIR=${process.env.DATA_DIR || "(défaut)"}, pass_registrations=${passRegCount}`);
      if (passRegCount === 0 && process.env.NODE_ENV === "production") {
        console.warn("  [PassKit] Si les iPhones envoient des POST mais le dashboard affiche 0: vérifie volume Railway (Mount path=/data) et variable DATA_DIR=/data.");
      }
    } catch (e) {
      console.warn("  [PassKit] Diagnostic démarrage:", e.message);
    }
    logApnsStatus();
  });
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`Port ${p} occupé, tentative sur ${p + 1}...`);
      startServer(p + 1);
    } else {
      throw err;
    }
  });
}

startServer(PORT);
