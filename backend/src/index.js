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
import {
  DATA_DIR_PATH,
  DB_FILE_PATH,
  getPassRegistrationsTotalCount,
  syncAdminEmailsFromEnv,
  applyAdminInitialPasswordFromEnv,
} from "./db.js";
import {
  getRevenueCatSecretApiKey,
  getRevenueCatWebhookAuthorizationExpected,
} from "./lib/config.js";

/** Admin : `ADMIN_EMAILS`, optionnellement `ADMIN_INITIAL_PASSWORD` (une fois au boot). */
function logAdminBootstrap() {
  try {
    const r = syncAdminEmailsFromEnv();
    if (r.applied > 0 || r.skipped > 0) {
      logger.info({ adminEmailsSync: r }, "[admin] synchronisation ADMIN_EMAILS");
    }
    const p = applyAdminInitialPasswordFromEnv();
    if (p.accountsCreated > 0 || p.passwordsUpdated > 0) {
      logger.warn(
        { comptesCrees: p.accountsCreated, motsDePasseMisAJour: p.passwordsUpdated },
        "[admin] Bootstrap admin terminé (ADMIN_INITIAL_PASSWORD). Supprimez ADMIN_INITIAL_PASSWORD sur Railway tout de suite.",
      );
    } else if (p.skippedAlreadyDone && (process.env.ADMIN_INITIAL_PASSWORD || "").trim()) {
      logger.warn(
        "[admin] ADMIN_INITIAL_PASSWORD est encore défini alors que le bootstrap a déjà été fait. Supprimez-la (ou ADMIN_INITIAL_PASSWORD_FORCE=true pour forcer).",
      );
    }
  } catch (e) {
    logger.error({ err: e }, "[admin] bootstrap admin échoué");
  }
}

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
import revenuecatWebhookRouter from "./routes/revenuecat-webhook.js";
import webhooksGbpPubsubRouter from "./routes/webhooks-gbp-pubsub.js";
import adminRouter from "./routes/admin.js";
import passesRouter from "./routes/passes.js";
import passkitWebserviceRouter from "./routes/passkit-webservice.js";
import webPushRouter from "./routes/web-push.js";
import deviceRouter from "./routes/device.js";
import oauthMetaRouter from "./routes/oauth-meta.js";
import oauthGoogleYoutubeRouter from "./routes/oauth-google-youtube.js";
import oauthGoogleBusinessRouter from "./routes/oauth-google-business.js";
import oauthTiktokRouter from "./routes/oauth-tiktok.js";
import { generatePass } from "./pass.js";
import { logApnsStatus, logMerchantApnsStatus, getApnsHealthForDiagnostics } from "./apns.js";
import {
  isEmailConfigured,
  getEmailTransportLabel,
  isSmtpConfigured,
  getEmailEnvPresence,
} from "./email.js";
import { runCampaignAutomationCron } from "./lib/campaign-automation-cron.js";
import { syncAllGoogleBusinessReviews } from "./services/google-business-reviews-sync.js";
import { runCampaignEventJobsCron } from "./lib/campaign-event-jobs.js";
import { startNotificationJobWorker } from "./lib/notification-job-queue.js";
import { startFlyerGenerationJobWorker } from "./lib/flyer-generation-jobs.js";

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
logAdminBootstrap();

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
  if (process.env.DEV_BYPASS_FLYER_AI_QUOTA === "true") {
    console.warn(
      "[startup] ATTENTION: DEV_BYPASS_FLYER_AI_QUOTA=true — le quota flyer IA peut être contourné avec l’en-tête X-Dev-Bypass-Flyer-AI-Quota. À utiliser uniquement sur un environnement de dev / staging, pas sur la prod client."
    );
  }
  // RESET_SECRET active POST /api/dev/reset (effacement total). Dangereux mais parfois nécessaire
  // (ex. repartir de zéro sur un environnement de démo). Le wipe exige en plus le même secret dans le body.
  if (process.env.RESET_SECRET) {
    console.warn(
      "[startup] ATTENTION: RESET_SECRET est défini — quiconque connaît ce secret peut vider la base via POST /api/dev/reset. Retirez la variable dans Railway dès que vous n’en avez plus besoin."
    );
  }
  if ((process.env.ADMIN_INITIAL_PASSWORD || "").trim()) {
    console.warn(
      "[startup] ADMIN_INITIAL_PASSWORD est défini — retirez-la sur Railway dès que la connexion admin fonctionne (évite de laisser un mot de passe dans les variables).",
    );
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
// Sans cross-origin : CORP same-origin (défaut Helmet) bloque les <img src> depuis myfidpass.fr
// vers api.myfidpass.fr (origines distinctes) → logo QR / page fidélité cassé.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

// Webhook Stripe doit recevoir le body brut (pour vérification de signature)
app.use("/api/payment/webhook", express.raw({ type: "application/json" }));
app.post("/api/payment/webhook", paymentWebhookHandler);

// Flyer IA : logo + jusqu’à 3 images de référence (base64) peuvent dépasser 8 Mo en JSON.
app.use(express.json({ limit: "15mb" }));
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
  max: process.env.NODE_ENV === "test" ? 1000 : 10,
  message: { error: "Trop de tentatives. Réessayez dans 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { forwardedHeader: false },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
/** Hors du plafond login/register (10/15 min) : sinon l’app affiche « Erreur réseau » et traite tout le monde comme nouvelle inscription. */
const authAccountProbeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "test" ? 10000 : 150,
  message: { error: "Trop de vérifications de compte. Réessayez dans 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { forwardedHeader: false },
});
app.use("/api/auth/check-email", authAccountProbeLimiter);
app.use("/api/auth/check-identifier", authAccountProbeLimiter);
app.use("/api/auth/phone/send-code", authLimiter);
app.use("/api/auth/phone/verify", authLimiter);

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
app.get("/api/health", (req, res) => res.json({ ok: true, service: "fidelity-api", v: "2026-05-04c" }));
/** Diagnostic : les mails transactionnels (reset MDP) partent seulement si provider ≠ none */
app.get("/api/health/email", (req, res) => {
  res.json({
    transactionalEmailReady: isEmailConfigured(),
    provider: getEmailTransportLabel(),
    /** Si true avec provider resend, un échec Resend peut encore partir en SMTP (secours). */
    smtpAlsoConfigured: isSmtpConfigured(),
    /** Variables présentes (true/false) — pas les valeurs. Voir docs/EMAIL-TRANSACTIONNEL.md */
    env: getEmailEnvPresence(),
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
/** APNs PassKit : clé .p8 + JWT (sans fuite de secret — longueurs seulement). */
app.get("/api/health/apns", (req, res) => {
  try {
    res.json(getApnsHealthForDiagnostics());
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
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

/**
 * RevenueCat : présence des secrets serveur (sans fuite de valeur).
 * L’app iOS utilise une autre clé (publique appl_ / test_) — voir myfidpass RevenueCatConfig.swift.
 */
app.get("/api/health/revenuecat", (req, res) => {
  const sk = getRevenueCatSecretApiKey();
  const webhook = getRevenueCatWebhookAuthorizationExpected();
  res.json({
    ok: true,
    secretApiKeyConfigured: !!sk,
    webhookAuthorizationConfigured: !!webhook,
    webhookEndpoint: `${(process.env.PUBLIC_API_URL || process.env.API_URL || "https://api.myfidpass.fr").replace(/\/$/, "")}/api/webhooks/revenuecat`,
  });
});

// PassKit en premier à la racine : Apple envoie GET /v1/passes/... et certains proxies laissent le chemin complet
app.use(passkitWebserviceRouter);

app.use("/api/auth", authRouter);
app.use("/api/device", deviceRouter);
app.use("/api/oauth", oauthMetaRouter);
app.use("/api/oauth", oauthGoogleYoutubeRouter);
app.use("/api/oauth", oauthGoogleBusinessRouter);
app.use("/api/oauth", oauthTiktokRouter);
app.use("/api/members", membersRouter);
app.use("/api/businesses", businessesRouter);
app.use("/api/payment", paymentRouter);
app.use("/api/webhooks/revenuecat", revenuecatWebhookRouter);
app.use("/api/webhooks", webhooksGbpPubsubRouter);
app.use("/api/admin", adminRouter);
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

/** Campagnes auto Wallet : exécution dans le processus (pas de CRON_SECRET ni cron externe). */
function scheduleCampaignAutomationLoop() {
  if (process.env.NODE_ENV === "test") return;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const run = () => {
    runCampaignAutomationCron().catch((err) => {
      logger.error({ err }, "[campaign-automation] job failed");
    });
  };
  setTimeout(() => {
    run();
    setInterval(run, DAY_MS);
  }, 120_000);
  logger.info("[campaign-automation] planifié : 1er passage dans ~2 min, puis toutes les 24 h");
}

/** Campaign event jobs: exécution interne, toutes ~1 min. */
function scheduleCampaignEventJobsLoop() {
  if (process.env.NODE_ENV === "test") return;
  const MIN_MS = 60 * 1000;
  const run = () => {
    runCampaignEventJobsCron({ limit: 50 }).catch((err) => {
      logger.error({ err }, "[campaign-event-jobs] job failed");
    });
  };
  setTimeout(() => {
    run();
    setInterval(run, MIN_MS);
  }, 60_000);
  logger.info("[campaign-event-jobs] planifié : 1er passage dans ~1 min, puis toutes les 1 min");
}

/** Google Business Profile : pull avis + push APNs nouveaux avis, toutes les 10 min. */
function scheduleGoogleBusinessReviewsSyncLoop() {
  if (process.env.NODE_ENV === "test") return;
  const INTERVAL_MS = 10 * 60 * 1000;
  const run = () => {
    syncAllGoogleBusinessReviews().catch((err) => {
      logger.error({ err }, "[gbp-sync] cron failed");
    });
  };
  setTimeout(() => {
    run();
    setInterval(run, INTERVAL_MS);
  }, 3 * 60 * 1000);
  logger.info("[gbp-sync] planifié : 1er passage dans ~3 min, puis toutes les 10 min");
}

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
    scheduleCampaignAutomationLoop();
    scheduleCampaignEventJobsLoop();
    scheduleGoogleBusinessReviewsSyncLoop();
    // Reprend les campagnes de notification interrompues par un crash ou un redémarrage.
    startNotificationJobWorker();
    startFlyerGenerationJobWorker();
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
