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

const isDev = process.env.NODE_ENV !== "production";
const isTest = process.env.NODE_ENV === "test";

const logger = pino({
  // En test on coupe les logs pour ne pas polluer la sortie vitest
  level: isTest ? "silent" : isDev ? "debug" : "info",

  // En dev : pretty-print via pino-pretty si disponible, sinon JSON
  ...(isDev && !isTest
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }
    : {}),

  // Champs de base ajoutés à chaque log
  base: {
    env: process.env.NODE_ENV || "development",
  },

  // Sérialisation des erreurs
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
});

export default logger;
