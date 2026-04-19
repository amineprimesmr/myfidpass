/**
 * Webhook push Pub/Sub (Google Business Profile) — non authentifié JWT MyFidpass.
 *
 * @module routes/webhooks-gbp-pubsub
 */
import { Router } from "express";
import logger from "../lib/logger.js";
import { handleGbpPubSubPushRequest } from "../services/gbp-pubsub-push-handler.js";

const router = Router();

router.post("/gbp-pubsub", async (req, res) => {
  try {
    const result = await handleGbpPubSubPushRequest(req);
    if (!result.ok) {
      return res.status(result.status || 400).json({ error: result.error || "failed" });
    }
    return res.status(204).send();
  } catch (err) {
    logger.error({ err }, "[gbp-pubsub] webhook unhandled");
    return res.status(500).json({ error: "internal" });
  }
});

export default router;
