/** Référence contrat HTTP avec les apps : repo « myfidpass » (`Services/API/APIEndpoint.swift`, Kotlin `MyfidpassApi.kt`) — préfixe `/api`. */
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
import { isProductionEnvironment } from "./lib/production-env.js";
import {
  DATA_DIR_PATH,
  DB_FILE_PATH,
  getPassRegistrationsTotalCount,
  syncAdminEmailsFromEnv,
  applyAdminInitialPasswordFromEnv,
} from "./db.js";
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
import paymentRouter, { paymentWebhookHandler, applePaymentWebhookHandler } from "./routes/payment.js";
import paymentClaimRouter from "./routes/payment-claim.js";
import webhooksGbpPubsubRouter from "./routes/webhooks-gbp-pubsub.js";
import adminRouter from "./routes/admin.js";
import loyaltyGroupsRouter from "./routes/loyalty-groups.js";
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
import { ensureGoogleWalletClassForDiagnostics } from "./google-wallet.js";
import {
  isEmailConfigured,
  getEmailTransportLabel,
  isSmtpConfigured,
  getEmailEnvPresence,
} from "./email.js";
import { runCampaignAutomationCron } from "./lib/campaign-automation-cron.js";
import { syncAllGoogleBusinessReviews } from "./services/google-business-reviews-sync.js";
import { runCampaignEventJobsCron } from "./lib/campaign-event-jobs.js";
import { startNotificationJobWorker, getQueueStats as getNotificationQueueStats } from "./lib/notification-job-queue.js";
import { startFlyerGenerationJobWorker } from "./lib/flyer-generation-jobs.js";
import { withCronLock, cleanExpiredCronLocks } from "./lib/cron-lock.js";
import { syncWorldCup2026Matches, ensureWorldCupCatalogSeeded } from "./lib/world-cup-match-sync.js";
import { checkpointWAL, getDb } from "./db/connection.js";

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

if (isProductionEnvironment()) {
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
//
// SÉCURITÉ : `trust proxy: 1` accepte X-Forwarded-For depuis le 1er proxy en amont.
// Sur Railway il y a un seul proxy edge → 1 est correct. Si tu changes d'hébergeur,
// adapte ce nombre (Cloudflare devant Railway = 2, etc.). NE PAS mettre `true` (n'importe qui peut spoof).
if (process.env.NODE_ENV === "production") {
  const trustProxyHops = Math.max(
    1,
    parseInt(String(process.env.TRUST_PROXY_HOPS || "1"), 10) || 1,
  );
  app.set("trust proxy", trustProxyHops);
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
// CORS hardening : méthodes/headers explicites (au lieu du défaut "tout").
// `maxAge` réduit le nombre de preflights OPTIONS → moins de hits API.
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "Accept",
      "X-Dashboard-Token",
      "X-Dev-Bypass-Payment",
      "X-Dev-Bypass-Flyer-AI-Quota",
      "X-Demo-Secret",
      "X-Requested-With",
      "If-Modified-Since",
      "If-None-Match",
    ],
    exposedHeaders: ["X-Notification-Job-Id", "X-Flyer-Job-Id", "RateLimit-Remaining", "RateLimit-Reset"],
    maxAge: 86400, // 24h cache CORS preflight
  }),
);
// Sans cross-origin : CORP same-origin (défaut Helmet) bloque les <img src> depuis myfidpass.fr
// vers api.myfidpass.fr (origines distinctes) → logo QR / page fidélité cassé.
//
// CSP basique pour /api : on n'expose pas de pages HTML interactives, donc une CSP très restrictive
// est sûre. Les routes qui retournent du HTML (rare : page de retour OAuth) sont préfixées
// `/api/oauth/*` et marquées spécifiquement si besoin.
app.use(
  helmet({
    contentSecurityPolicy:
      process.env.NODE_ENV === "production"
        ? {
            useDefaults: true,
            directives: {
              "default-src": ["'none'"],
              // Apple PassKit / fidelity img sur /api/businesses/.../logo
              "img-src": ["'self'", "data:", "https:"],
              "script-src": ["'self'"],
              "style-src": ["'self'", "'unsafe-inline'"],
              "connect-src": ["'self'"],
              "frame-ancestors": ["'none'"],
              "form-action": ["'self'"],
              "base-uri": ["'self'"],
              "object-src": ["'none'"],
              "upgrade-insecure-requests": [],
            },
          }
        : false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // HSTS : 1 an + preload (uniquement en prod, pas en dev où l'on est en HTTP)
    hsts:
      process.env.NODE_ENV === "production"
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }),
);

// Webhook Stripe doit recevoir le body brut (pour vérification de signature)
app.use("/api/payment/webhook", express.raw({ type: "application/json" }));
app.post("/api/payment/webhook", paymentWebhookHandler);

// Flyer IA : logo + jusqu’à 3 images de référence (base64) peuvent dépasser 8 Mo en JSON.
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "64kb" }));
app.post("/api/payment/apple-webhook", applePaymentWebhookHandler);

// Logging structuré HTTP (toutes les requêtes) — JSON en prod, pretty en dev
// Exclure les health checks + sampling 10% sur GET 2xx hot paths pour ne pas saturer les logs
// (à 50 RPS, 100% des logs = ~1.5 GB/jour, problème Railway).
const HTTP_LOG_SAMPLE_RATE = Math.min(
  1,
  Math.max(0.01, parseFloat(String(process.env.HTTP_LOG_SAMPLE_RATE || "0.1")) || 0.1),
);
function shouldIgnoreHttpRequest(req, res) {
  if (req.url === "/health" || req.url === "/api/health") return true;
  if (req.url?.startsWith("/api/health/")) return true;
  // En prod, sample 10 % des GET 2xx (succès attendus). On garde 100 % des erreurs (>= 400).
  if (process.env.NODE_ENV === "production") {
    const isSuccessGet = req.method === "GET" && res && res.statusCode < 400;
    if (isSuccessGet && Math.random() > HTTP_LOG_SAMPLE_RATE) return true;
  }
  return false;
}
if (process.env.NODE_ENV !== "test") {
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: shouldIgnoreHttpRequest },
      customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
      customErrorMessage: (req, res, err) => `${req.method} ${req.url} ${res.statusCode} — ${err.message}`,
      // Redact des champs sensibles si jamais ils apparaissent dans des logs custom
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers['x-dashboard-token']",
          "req.headers.cookie",
          'req.headers["x-demo-secret"]',
          "req.body.password",
          "req.body.newPassword",
          "req.body.refreshToken",
        ],
        censor: "[REDACTED]",
      },
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
app.use("/api/auth/check-google-place", authAccountProbeLimiter);
app.use("/api/auth/phone/send-code", authLimiter);
app.use("/api/auth/phone/verify", authLimiter);
app.use("/api/auth/email/send-code", authLimiter);
app.use("/api/auth/email/verify", authLimiter);

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
/** File campagnes : stats temps réel (pending/running/done/failed/dead, oldest). */
app.get("/api/health/notifications", (req, res) => {
  try {
    res.json({ ok: true, queue: getNotificationQueueStats() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
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
app.get("/api/health/google-wallet", async (req, res) => {
  try {
    const result = await ensureGoogleWalletClassForDiagnostics();
    res.status(result.ok ? 200 : 500).json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
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
app.use("/api/loyalty-groups", loyaltyGroupsRouter);
app.use("/api/payment", paymentClaimRouter);
app.use("/api/payment", paymentRouter);
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

/**
 * Tous les crons in-process passent par un verrou distribué SQLite : si tu mets à l'échelle
 * à 2+ instances Railway, un seul process exécutera chaque cron à un instant T (pas de
 * doublons d'envoi de campagne / mail / push). Le TTL est calé sur 5× la durée estimée du job.
 */

/** Campagnes auto Wallet — désactivées (manuel + périmètre uniquement). */
function scheduleCampaignAutomationLoop() {
  if (process.env.NODE_ENV === "test") return;
  logger.info("[campaign-automation] désactivé — envoi manuel et périmètre Wallet uniquement");
}

/** Campaign event jobs — désactivés. */
function scheduleCampaignEventJobsLoop() {
  if (process.env.NODE_ENV === "test") return;
  logger.info("[campaign-event-jobs] désactivé — envoi manuel et périmètre Wallet uniquement");
}

/** Google Business Profile : pull avis + push APNs nouveaux avis, toutes les 10 min. */
function scheduleGoogleBusinessReviewsSyncLoop() {
  if (process.env.NODE_ENV === "test") return;
  const INTERVAL_MS = 10 * 60 * 1000;
  const LOCK_TTL_MS = 8 * 60 * 1000; // 8 min — un sync complet dure 1-3 min
  const run = () => {
    withCronLock("gbp-reviews-sync", LOCK_TTL_MS, () => syncAllGoogleBusinessReviews())
      .catch((err) => logger.error({ err }, "[gbp-sync] cron failed"));
  };
  setTimeout(() => {
    run();
    setInterval(run, INTERVAL_MS);
  }, 3 * 60 * 1000);
  logger.info("[gbp-sync] planifié : 1er passage dans ~3 min, puis toutes les 10 min (verrou distribué)");
}

/** Coupe du monde 2026 : sync calendrier pronostics (catalogue + API-Football), toutes les 6 h. */
function scheduleWorldCupMatchSyncLoop() {
  if (process.env.NODE_ENV === "test") return;
  const INTERVAL_MS = 6 * 60 * 60 * 1000;
  const LOCK_TTL_MS = 20 * 60 * 1000;
  const run = () => {
    withCronLock("world-cup-match-sync", LOCK_TTL_MS, () => syncWorldCup2026Matches())
      .then((r) => {
        if (r?.inserted || r?.updated) {
          logger.info(
            { source: r.source, inserted: r.inserted, updated: r.updated, api_rows: r.api_rows },
            "[world-cup-sync] calendrier mis à jour",
          );
        }
      })
      .catch((err) => logger.error({ err }, "[world-cup-sync] échec"));
  };
  run();
  setInterval(run, INTERVAL_MS);
  logger.info("[world-cup-sync] planifié : immédiat au démarrage, puis toutes les 6 h");
}

/** Maintenance SQLite : checkpoint WAL + nettoyage locks orphelins, toutes les heures. */
function scheduleMaintenanceLoop() {
  if (process.env.NODE_ENV === "test") return;
  const HOUR_MS = 60 * 60 * 1000;
  const run = () => {
    try { checkpointWAL(); } catch (_) {}
    try { cleanExpiredCronLocks(); } catch (_) {}
  };
  setTimeout(run, 10 * 60 * 1000); // 10 min après démarrage
  setInterval(run, HOUR_MS);
  logger.info("[maintenance] WAL checkpoint + cron-lock GC planifié (1 h)");
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
    scheduleWorldCupMatchSyncLoop();
    scheduleMaintenanceLoop();
    // Reprend les campagnes de notification interrompues par un crash ou un redémarrage.
    startNotificationJobWorker();
    startFlyerGenerationJobWorker();
  });

  // Shutdown gracieux : checkpoint WAL avant exit (sauvegarde les écritures pending).
  const gracefulShutdown = (signal) => {
    logger.info({ signal }, "[shutdown] arrêt gracieux — checkpoint WAL");
    try { checkpointWAL(); } catch (_) {}
    server.close(() => process.exit(0));
    // Garantie : si server.close() prend > 10 s, on force.
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.once("SIGINT", () => gracefulShutdown("SIGINT"));
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      logger.fatal({ port: p }, `Port ${p} déjà utilisé. Arrêter l’ancien processus (lsof -nP -iTCP:${p} -sTCP:LISTEN)`);
      process.exit(1);
    }
    throw err;
  });
}

if (process.env.NODE_ENV !== "test") {
  try {
    const seeded = ensureWorldCupCatalogSeeded(getDb());
    if (!seeded.skipped) {
      logger.info(
        { inserted: seeded.inserted, updated: seeded.updated, groupCount: seeded.groupCount },
        "[world-cup] catalogue CDM 2026 initialisé au démarrage",
      );
    }
  } catch (err) {
    logger.error({ err }, "[world-cup] seed catalogue au boot échoué");
  }
  startServer(PORT);
}

export { app };
