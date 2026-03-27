import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import logger from "./lib/logger.js";

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
import placesRouter from "./routes/places.js";
import paymentRouter, { paymentWebhookHandler } from "./routes/payment.js";
import passesRouter from "./routes/passes.js";
import passkitWebserviceRouter from "./routes/passkit-webservice.js";
import webPushRouter from "./routes/web-push.js";
import deviceRouter from "./routes/device.js";
import { generatePass } from "./pass.js";
import { logApnsStatus, logMerchantApnsStatus } from "./apns.js";
import { isEmailConfigured, getEmailTransportLabel } from "./email.js";

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
  console.log("[startup] Production — vérification des variables critiques…");
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error("[startup] ERREUR: En production, JWT_SECRET doit être défini et faire au moins 32 caractères. Railway → Variables → ajoute JWT_SECRET puis redéploie. Voir docs/RAILWAY-CRASH-DEPANNAGE.md");
    process.exit(1);
  }
  if (!process.env.PASSKIT_SECRET || process.env.PASSKIT_SECRET.length < 32) {
    console.error("[startup] ERREUR: En production, PASSKIT_SECRET doit être défini et faire au moins 32 caractères. Railway → Variables → ajoute PASSKIT_SECRET puis redéploie. Voir docs/RAILWAY-CRASH-DEPANNAGE.md");
    process.exit(1);
  }
  // DEV_BYPASS_PAYMENT ne doit JAMAIS être défini en production — si c'est le cas,
  // c'est une erreur de config critique qui permet de bypasser le paiement.
  if (process.env.DEV_BYPASS_PAYMENT === "true") {
    console.error("[startup] ERREUR CRITIQUE: DEV_BYPASS_PAYMENT=true est défini en PRODUCTION. Cette variable est réservée au développement local. Supprime-la immédiatement dans Railway → Variables.");
    process.exit(1);
  }
  // RESET_SECRET ne doit pas être défini en production (route de destruction de BDD).
  if (process.env.RESET_SECRET) {
    console.error("[startup] ERREUR: RESET_SECRET est défini en production. Cette variable active une route qui vide toute la base de données. Supprime-la dans Railway → Variables.");
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
// CORS : en prod = domaines myfidpass uniquement ; en dev = localhost Vite uniquement (plus de wildcard)
const allowedOrigins =
  process.env.NODE_ENV === "production"
    ? [FRONTEND_URL, FRONTEND_URL.replace(/\/$/, ""), "https://myfidpass.fr", "https://www.myfidpass.fr"].filter(Boolean)
    : [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        // Accès depuis un iPhone en local (IP réseau) : ajouter FRONTEND_URL dans .env si nécessaire
        ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
      ];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(helmet({ contentSecurityPolicy: false }));

// Webhook Stripe doit recevoir le body brut (pour vérification de signature)
app.use("/api/payment/webhook", express.raw({ type: "application/json" }));
app.post("/api/payment/webhook", paymentWebhookHandler);

app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "64kb" }));

// Logging structuré HTTP (toutes les requêtes) — JSON en prod, pretty en dev
// Exclure les health checks pour ne pas polluer les logs
if (process.env.NODE_ENV !== "test") {
  app.use(
    pinoHttp({
      logger,
      // Pas de log pour les health checks (Railway poll toutes les 30s)
      autoLogging: {
        ignore: (req) => req.url === "/health" || req.url === "/api/health",
      },
      // Enrichir chaque log avec userId si disponible
      customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
      customErrorMessage: (req, res, err) => `${req.method} ${req.url} ${res.statusCode} — ${err.message}`,
    })
  );
}

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

const placesSearchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 45,
  message: { error: "Trop de recherches. Réessayez dans une minute." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { forwardedHeader: false },
});
app.use("/api/places", placesSearchLimiter);
app.use("/api/places", placesRouter);

// Parse JWT si présent (Authorization: Bearer) pour toutes les routes
app.use(optionalAuth);

// Routes de diagnostic AVANT PassKit pour être sûrs qu’elles répondent (PassKit est monté en premier et reçoit tout)
app.get("/health", (req, res) => res.json({ ok: true }));
/** Même chose sous /api pour que le front dev (proxy Vite /api → backend) puisse tester sans aller à la racine PassKit. */
app.get("/api/health", (req, res) => res.json({ ok: true, service: "fidelity-api" }));
/** Diagnostic : les mails transactionnels (reset MDP) partent seulement si provider ≠ none */
app.get("/api/health/email", (req, res) => {
  res.json({
    transactionalEmailReady: isEmailConfigured(),
    provider: getEmailTransportLabel(),
  });
});
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
  logger.error({ err, url: req.url, method: req.method }, "Unhandled error");
  res.status(500).json({ error: "Une erreur interne est survenue." });
});

function startServer(port) {
  const p = Number(port) || 3001;
  const server = app.listen(p, () => {
    const port = server.address().port;
    if (process.env.NODE_ENV === "production") {
      logger.info({ port }, "Backend fidélité démarré (production)");
    } else {
      logger.info({ port, url: `http://localhost:${port}` }, "Backend fidélité démarré (développement)");
    }
    try {
      const passRegCount = getPassRegistrationsTotalCount();
      logger.info({ passRegistrations: passRegCount, dataDir: process.env.DATA_DIR || "(défaut)" }, "[PassKit] Diagnostic démarrage");
      if (passRegCount === 0 && process.env.NODE_ENV === "production") {
        logger.warn("[PassKit] Aucun appareil enregistré — vérifier volume Railway (Mount path=/data) et DATA_DIR=/data.");
      }
    } catch (e) {
      logger.warn({ err: e }, "[PassKit] Diagnostic démarrage échoué");
    }
    logApnsStatus();
    logMerchantApnsStatus();
  });
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      logger.fatal({ port: p }, `Port ${p} déjà utilisé. Arrêter l’ancien processus (lsof -nP -iTCP:${p} -sTCP:LISTEN)`);
      process.exit(1);
    }
    throw err;
  });
}

if (process.env.NODE_ENV !== "test") {
  startServer(PORT);
}

export { app };
