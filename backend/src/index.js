import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
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
import placeCategoryRouter from "./routes/place-category.js";
import findPlaceRouter from "./routes/find-place.js";
import placeEnrichmentRouter from "./routes/place-enrichment.js";
import paymentRouter, { paymentWebhookHandler } from "./routes/payment.js";
import passesRouter from "./routes/passes.js";
import passkitWebserviceRouter from "./routes/passkit-webservice.js";
import webPushRouter from "./routes/web-push.js";
import deviceRouter from "./routes/device.js";
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

const isProduction = process.env.NODE_ENV === "production";
if (isProduction) {
  console.log("[startup] Production — vérification JWT_SECRET / PASSKIT_SECRET…");
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error("[startup] ERREUR: En production, JWT_SECRET doit être défini et faire au moins 32 caractères. Railway → Variables → ajoute JWT_SECRET puis redéploie. Voir docs/RAILWAY-CRASH-DEPANNAGE.md");
    process.exit(1);
  }
  if (!process.env.PASSKIT_SECRET || process.env.PASSKIT_SECRET.length < 32) {
    console.error("[startup] ERREUR: En production, PASSKIT_SECRET doit être défini et faire au moins 32 caractères. Railway → Variables → ajoute PASSKIT_SECRET puis redéploie. Voir docs/RAILWAY-CRASH-DEPANNAGE.md");
    process.exit(1);
  }
}

const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const app = express();
// Derrière un proxy (Railway, etc.) : Express doit faire confiance à X-Forwarded-For pour que
// req.ip soit la vraie IP client et que express-rate-limit ne logue pas ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}
// CORS : en prod accepter le site + www ; en dev toute origine (pour test iPhone en local)
const allowedOrigins =
  process.env.NODE_ENV === "production"
    ? [FRONTEND_URL, FRONTEND_URL.replace(/\/$/, ""), "https://myfidpass.fr", "https://www.myfidpass.fr"].filter(Boolean)
    : true;
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(helmet({ contentSecurityPolicy: false }));

// Webhook Stripe doit recevoir le body brut (pour vérification de signature)
app.use("/api/payment/webhook", express.raw({ type: "application/json" }));
app.post("/api/payment/webhook", paymentWebhookHandler);

app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "64kb" }));

// Rate limiting : auth (login/register) 10 req / 15 min par IP
// validate.forwardedHeader: false — en prod le proxy peut envoyer "Forwarded" que Express n’utilise pas ; on s’appuie sur X-Forwarded-For (trust proxy).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Trop de tentatives. Réessayez dans 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { forwardedHeader: false },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

// Parse JWT si présent (Authorization: Bearer) pour toutes les routes
app.use(optionalAuth);

// Routes de diagnostic AVANT PassKit pour être sûrs qu’elles répondent (PassKit est monté en premier et reçoit tout)
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/api/health/db", (req, res) => {
  res.json({
    DATA_DIR: process.env.DATA_DIR ?? "(non défini, défaut backend/data)",
    dataDirResolved: DATA_DIR_PATH,
    dbPath: DB_FILE_PATH,
    dbExists: existsSync(DB_FILE_PATH),
    hint: "Sur Railway, le volume doit être monté exactement au chemin /data et DATA_DIR=/data.",
  });
});
app.get("/api/health/passkit", (req, res) => {
  try {
    const passRegCount = getPassRegistrationsTotalCount();
    const dbExists = existsSync(DB_FILE_PATH);
    res.json({
      ok: true,
      DATA_DIR: process.env.DATA_DIR ?? "(non défini)",
      dbPath: DB_FILE_PATH,
      dbExists,
      passRegistrationsCount: passRegCount,
      message: passRegCount === 0
        ? "Aucun appareil enregistré. Soit l'iPhone n'a jamais appelé POST /api/v1/devices/..., soit le volume n'est pas persistant (redémarrage = données perdues). Vérifier Railway : volume monté sur /data + variable DATA_DIR=/data."
        : `${passRegCount} appareil(s) enregistré(s). Les push devraient partir.`,
      testRegistration: "Pour tester l'API d'enregistrement : utilise la commande curl affichée sur myfidpass.fr/app#notifications. Si tu obtiens HTTP 201, l'API fonctionne.",
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// PassKit en premier à la racine : Apple envoie GET /v1/passes/... et certains proxies laissent le chemin complet
app.use(passkitWebserviceRouter);

app.use("/api/auth", authRouter);
app.use("/api/device", deviceRouter);
app.use("/api/members", membersRouter);
app.use("/api/businesses", businessesRouter);
app.use("/api/payment", paymentRouter);
app.use("/api/web-push", webPushRouter);
app.use("/api/dev", devRouter);
app.use("/api/place-photo", placePhotoRouter);
app.use("/api/place-category", placeCategoryRouter);
app.use("/api/find-place", findPlaceRouter);
app.use("/api/place-enrichment", placeEnrichmentRouter);
app.use("/api/passes", passesRouter);
app.use("/passes", passesRouter);

app.get("/api/passes/demo", handlePassDemo);
app.get("/passes/demo", handlePassDemo);

// 404 et middleware d'erreur global (réponse JSON)
app.use((req, res) => res.status(404).json({ error: "Not found" }));

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Une erreur interne est survenue." });
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

if (process.env.NODE_ENV !== "test") {
  startServer(PORT);
}

export { app };
