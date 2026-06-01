import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  getCheckoutSuccessPreview,
  sendClaimLoginLink,
  confirmClaimFromToken,
  claimCheckoutForUser,
} from "../lib/stripe-checkout-claim.js";
import {
  isValidCheckoutSessionId,
  isValidStripeSubscriptionId,
} from "../lib/stripe-checkout-ids.js";
import { getAuthPayloadForUser, issueAuthTokensForUser } from "./auth-tokens.js";
import { getUserById } from "../db.js";

const router = Router();

function readCheckoutRef(body, query) {
  const sessionId = String(body?.session_id || query?.session_id || "").trim();
  const subscriptionId = String(body?.subscription_id || query?.subscription_id || "").trim();
  return {
    sessionId: isValidCheckoutSessionId(sessionId) ? sessionId : null,
    subscriptionId: isValidStripeSubscriptionId(subscriptionId) ? subscriptionId : null,
  };
}

/** GET /api/payment/checkout-success — infos post-paiement (email payeur, plan). */
router.get("/checkout-success", async (req, res) => {
  try {
    const { sessionId, subscriptionId } = readCheckoutRef({}, req.query);
    const preview = await getCheckoutSuccessPreview({ sessionId, subscriptionId });
    if (!preview.ok) {
      return res.status(400).json(preview);
    }
    return res.json(preview);
  } catch (e) {
    console.error("[payment] checkout-success:", e?.message || e);
    return res.status(500).json({ ok: false, message: "Impossible de lire le paiement." });
  }
});

/** POST /api/payment/claim/send-link — envoie un lien d’activation par e-mail. */
router.post("/claim/send-link", async (req, res) => {
  try {
    const { sessionId, subscriptionId } = readCheckoutRef(req.body, {});
    const result = await sendClaimLoginLink({
      email: req.body?.email,
      sessionId,
      subscriptionId,
      establishment_name: req.body?.establishment_name,
      google_place_id: req.body?.google_place_id,
    });
    if (!result.ok) {
      const status = result.code === "email_send_failed" ? 502 : 400;
      return res.status(status).json(result);
    }
    return res.json(result);
  } catch (e) {
    console.error("[payment] claim/send-link:", e?.message || e);
    return res.status(500).json({ ok: false, message: "Envoi impossible." });
  }
});

/** Alias legacy — même comportement que send-link. */
router.post("/claim/send-code", async (req, res) => {
  try {
    const { sessionId, subscriptionId } = readCheckoutRef(req.body, {});
    const result = await sendClaimLoginLink({
      email: req.body?.email,
      sessionId,
      subscriptionId,
      establishment_name: req.body?.establishment_name,
      google_place_id: req.body?.google_place_id,
    });
    if (!result.ok) {
      const status = result.code === "email_send_failed" ? 502 : 400;
      return res.status(status).json(result);
    }
    return res.json(result);
  } catch (e) {
    console.error("[payment] claim/send-code:", e?.message || e);
    return res.status(500).json({ ok: false, message: "Envoi impossible." });
  }
});

/** GET /api/payment/claim/confirm — active le compte via le lien e-mail. */
router.get("/claim/confirm", async (req, res) => {
  try {
    const token = String(req.query?.token || req.query?.claim_token || "").trim();
    if (!token) {
      return res.status(400).json({ ok: false, message: "Lien invalide." });
    }
    const result = await confirmClaimFromToken(token);
    if (!result.ok) {
      return res.status(result.status || 400).json({
        ok: false,
        code: result.code,
        message: result.message,
      });
    }
    return res.status(result.status || 200).json({ ok: true, ...result.body });
  } catch (e) {
    console.error("[payment] claim/confirm:", e?.message || e);
    return res.status(500).json({ ok: false, message: "Activation impossible." });
  }
});

/** POST /api/payment/claim/attach — utilisateur déjà connecté : rattacher le paiement. */
router.post("/claim/attach", requireAuth, async (req, res) => {
  try {
    const userId = String(req.user.id);
    const { sessionId, subscriptionId } = readCheckoutRef(req.body, {});
    if (!sessionId && !subscriptionId) {
      return res.status(400).json({ ok: false, message: "Référence de paiement manquante." });
    }
    await claimCheckoutForUser({ sessionId, subscriptionId, userId });
    const user = getUserById(userId);
    const tokens = issueAuthTokensForUser(userId);
    return res.json({
      ok: true,
      ...getAuthPayloadForUser(user),
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      subscription_claimed: true,
    });
  } catch (e) {
    const code = e?.code || "claim_failed";
    const status = code === "subscription_already_claimed" ? 409 : 400;
    return res.status(status).json({ ok: false, code, message: e?.message || "Rattachement impossible." });
  }
});

export default router;
