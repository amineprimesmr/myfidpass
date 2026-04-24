/**
 * Webhook RevenueCat → Railway (POST JSON).
 * Configure l’URL dans RevenueCat : https://api.myfidpass.fr/api/webhooks/revenuecat
 * et le même `Authorization` que la variable REVENUECAT_WEBHOOK_AUTHORIZATION.
 */

import { Router } from "express";
import logger from "../lib/logger.js";
import { getRevenueCatWebhookAuthorizationExpected, IS_PRODUCTION } from "../lib/config.js";
import { applyRevenueCatWebhookHint } from "../services/revenuecat-subscription-sync.js";

const router = Router();

router.post("/", (req, res) => {
  const expected = getRevenueCatWebhookAuthorizationExpected();

  if (expected) {
    const got = String(req.headers.authorization || "").trim();
    if (got !== expected) {
      logger.warn("[revenuecat] webhook — Authorization invalide ou manquant");
      return res.status(401).json({ error: "Unauthorized" });
    }
  } else if (IS_PRODUCTION) {
    logger.error(
      "[revenuecat] REVENUECAT_WEBHOOK_AUTHORIZATION manquant — définis-le sur Railway + RevenueCat",
    );
    return res.status(503).json({
      error: "Webhook RevenueCat non configuré",
      code: "revenuecat_webhook_not_configured",
    });
  }

  const body = req.body || {};
  const eventType = body.event?.type ?? body.type ?? "unknown";
  const appUserId = body.event?.app_user_id ?? body.app_user_id ?? null;

  logger.info(
    { eventType, appUserId, apiVersion: body.api_version },
    "[revenuecat] webhook reçu",
  );

  res.status(200).json({ ok: true });
  setImmediate(() => {
    void applyRevenueCatWebhookHint(body);
  });
});

export default router;
