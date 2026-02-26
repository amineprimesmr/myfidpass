import { Router } from "express";
import Stripe from "stripe";
import { createOrUpdateSubscription } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const stripe =
  process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith("sk_")
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

const FRONTEND_URL = (process.env.FRONTEND_URL || "https://myfidpass.fr").replace(/\/$/, "");
const PRICE_ID_STARTER = process.env.STRIPE_PRICE_ID_STARTER || null;

/**
 * POST /api/payment/create-checkout-session
 * Crée une session Stripe Checkout pour l'abonnement Starter.
 * Body: { planId?: 'starter' }
 * Réponse: { url } pour rediriger l'utilisateur vers Stripe.
 */
router.post("/create-checkout-session", requireAuth, async (req, res) => {
  if (!stripe || !PRICE_ID_STARTER) {
    return res.status(503).json({
      error: "Paiement non configuré",
      code: "stripe_not_configured",
    });
  }
  const userId = req.user.id;
  const email = req.user.email;
  if (!email) {
    return res.status(400).json({ error: "Email utilisateur requis" });
  }
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: email,
      line_items: [
        {
          price: PRICE_ID_STARTER,
          quantity: 1,
        },
      ],
      success_url: `${FRONTEND_URL}/app?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/choisir-offre`,
      metadata: { user_id: userId },
      subscription_data: {
        metadata: { user_id: userId },
        trial_period_days: 7,
      },
    });
    return res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout session error:", err);
    return res.status(500).json({
      error: err.message || "Impossible de créer la session de paiement",
    });
  }
});

/**
 * Gestionnaire webhook Stripe (checkout.session.completed).
 * À enregistrer avec express.raw({ type: 'application/json' }) pour cette route uniquement.
 */
export async function paymentWebhookHandler(req, res) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret || !stripe) {
    return res.status(503).send("Webhook not configured");
  }
  const sig = req.headers["stripe-signature"];
  const rawBody = req.body; // Buffer (avec express.raw)
  if (!sig || !rawBody) {
    return res.status(400).send("Missing signature or body");
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.warn("Stripe webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type !== "checkout.session.completed") {
    return res.json({ received: true });
  }
  const session = event.data.object;
  const userId = session.metadata?.user_id;
  if (!userId) {
    console.warn("Webhook checkout.session.completed: no user_id in metadata");
    return res.json({ received: true });
  }
  try {
    let stripeSubscriptionId = session.subscription;
    let currentPeriodEnd = null;
    let stripeCustomerId = session.customer || null;
    if (stripeSubscriptionId) {
      const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      currentPeriodEnd = sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null;
      if (!stripeCustomerId && sub.customer) stripeCustomerId = sub.customer;
    }
    createOrUpdateSubscription({
      userId,
      stripeCustomerId: stripeCustomerId || null,
      stripeSubscriptionId: stripeSubscriptionId || null,
      planId: "starter",
      status: "active",
      currentPeriodEnd,
    });
  } catch (err) {
    console.error("Webhook createOrUpdateSubscription error:", err);
    return res.status(500).send("Webhook handler failed");
  }
  res.json({ received: true });
}

export default router;
