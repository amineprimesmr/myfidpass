/**
 * Logger structuré centralisé (pino).
 *
 * En production : JSON brut → Railway l'indexe et le filtre par level/field.
 * En développement : pretty-print lisible dans le terminal.
 *
 * Usage :
 *   import logger from "../lib/logger.js";
 *   logger.info({ userId: "abc", slug: "burger-king" }, "Utilisateur connecté");
 *   logger.error({ err: e, context: "google_auth" }, "Erreur Google OAuth");
 *
 * Niveaux : trace < debug < info < warn < error < fatal
 */

import pino from "pino";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const isDev = process.env.NODE_ENV !== "production";
const isTest = process.env.NODE_ENV === "test";
const usePretty = isDev && !isTest;

/**
 * Stream pretty sans `transport` worker (évite erreurs Node 24+ / module introuvable).
 * Si `pino-pretty` n’est pas installé dans backend/, repli JSON sur stdout.
 */
function buildDestination() {
  if (!usePretty) return pino.destination(1);
  try {
    const pretty = require("pino-pretty");
    return pretty({
      colorize: true,
      translateTime: "HH:MM:ss",
      ignore: "pid,hostname",
    });
  } catch {
    return pino.destination(1);
  }
}

const logger = pino(
  {
    level: isTest ? "silent" : isDev ? "debug" : "info",
    base: {
      env: process.env.NODE_ENV || "development",
    },
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
  },
  buildDestination(),
);

export default logger;
