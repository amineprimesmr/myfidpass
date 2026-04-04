import { Router } from "express";
import Stripe from "stripe";
import {
  createOrUpdateSubscription,
  getBusinessById,
  getBusinessesByUserId,
  getSubscriptionByUserId,
  getUserByEmail,
  hasActiveSubscription,
  incrementFlyerAiGenerationsBonus,
  getSubscriptionByStripeSubscriptionId,
} from "../db.js";
import { tryBeginStripeWebhookEvent, rollbackStripeWebhookEvent } from "../db/stripe-webhook-events.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const stripe =
  process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith("sk_")
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

const FRONTEND_URL = (process.env.FRONTEND_URL || "https://myfidpass.fr").replace(/\/$/, "");
const PRICE_ID_STARTER = process.env.STRIPE_PRICE_ID_STARTER || null;
/** Prix Stripe (mode paiement unique) — pack « créations flyer ». */
const PRICE_ID_FLYER_PACK = process.env.STRIPE_PRICE_ID_FLYER_PACK || null;
/** Nombre de générations créditées par achat (surcharge possible via metadata session). */
const FLYER_PACK_GENERATIONS = Math.max(1, parseInt(process.env.FLYER_PACK_GENERATIONS || "25", 10) || 25);

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
 * POST /api/payment/create-flyer-pack-session
 * Paiement unique (pack créations flyer IA). Webhook : crédite `flyer_ai_generations_bonus`.
 * Body: { business_id: string }
 */
router.post("/create-flyer-pack-session", requireAuth, async (req, res) => {
  if (!stripe || !PRICE_ID_FLYER_PACK) {
    return res.status(503).json({
      error: "Achat de créations flyer non configuré",
      code: "stripe_flyer_pack_not_configured",
    });
  }
  const businessId = String(req.body?.business_id || req.body?.businessId || "").trim();
  if (!businessId) {
    return res.status(400).json({ error: "business_id requis" });
  }
  const owned = getBusinessesByUserId(req.user.id);
  if (!owned.some((b) => b.id === businessId)) {
    return res.status(403).json({ error: "Commerce non autorisé" });
  }
  const email = req.user.email;
  if (!email) {
    return res.status(400).json({ error: "Email utilisateur requis" });
  }
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      line_items: [{ price: PRICE_ID_FLYER_PACK, quantity: 1 }],
      success_url: `${FRONTEND_URL}/app?flyer_credits_success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/app?flyer_credits_cancel=1`,
      metadata: {
        user_id: req.user.id,
        business_id: businessId,
        purpose: "flyer_pack",
        flyer_generations: String(FLYER_PACK_GENERATIONS),
      },
    });
    return res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe flyer pack session error:", err);
    return res.status(500).json({
      error: err.message || "Impossible de créer la session de paiement",
    });
  }
});

function isStripeSubscriptionStatusPaying(status) {
  const st = String(status || "").toLowerCase();
  return st === "active" || st === "trialing" || st === "past_due";
}

/**
 * POST /api/payment/reconcile-subscription
 * Remet la ligne `subscriptions` en phase avec Stripe (webhook manquant, email ≠ client Stripe, etc.).
 * Ordre : recherche par metadata user_id (checkout créé par notre API) → abo déjà stocké → clients avec l’email du compte.
 */
router.post("/reconcile-subscription", requireAuth, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({
      error: "Paiement non configuré",
      code: "stripe_not_configured",
    });
  }
  const userId = String(req.user.id);
  const email = (req.user.email || "").trim().toLowerCase();

  const jsonOk = (sub, source) =>
    res.json({
      ok: true,
      source,
      subscription_status: sub.status,
      has_active_subscription: hasActiveSubscription(userId),
    });

  try {
    // 1) Stripe Search — metadata user_id posée par POST /create-checkout-session (ne dépend pas de l’email Stripe)
    try {
      const safe = userId.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      const { data: fromSearch } = await stripe.subscriptions.search({
        query: `metadata['user_id']:'${safe}'`,
        limit: 20,
      });
      for (const s of fromSearch) {
        if (isStripeSubscriptionStatusPaying(s.status)) {
          await syncSubscriptionFromStripeObject(s, userId);
          return jsonOk(s, "stripe_search_metadata");
        }
      }
    } catch (searchErr) {
      console.warn("[payment] reconcile subscription search:", searchErr?.message || searchErr);
    }

    // 2) Réutiliser stripe_subscription_id déjà en base (statut local obsolète / incomplet)
    const existing = getSubscriptionByUserId(userId);
    if (existing?.stripe_subscription_id) {
      try {
        const s = await stripe.subscriptions.retrieve(existing.stripe_subscription_id);
        await syncSubscriptionFromStripeObject(s, userId);
        if (hasActiveSubscription(userId)) {
          return jsonOk(s, "stripe_retrieve_existing_row");
        }
      } catch (e) {
        console.warn("[payment] reconcile retrieve by row:", e?.message || e);
      }
    }

    // 3) Clients Stripe avec le même email que le compte MyFidpass
    if (!email) {
      return res.json({
        ok: false,
        has_active_subscription: hasActiveSubscription(userId),
        message: "Aucun email sur le compte : impossible de chercher le client Stripe par email.",
      });
    }
    const customers = await stripe.customers.list({ email, limit: 10 });
    for (const c of customers.data) {
      const cEmail = (c.email || "").trim().toLowerCase();
      if (cEmail !== email) continue;
      const subs = await stripe.subscriptions.list({ customer: c.id, status: "all", limit: 20 });
      for (const s of subs.data) {
        if (isStripeSubscriptionStatusPaying(s.status)) {
          await syncSubscriptionFromStripeObject(s, userId);
          return jsonOk(s, "stripe_customer_email");
        }
      }
    }

    return res.json({
      ok: false,
      has_active_subscription: hasActiveSubscription(userId),
      message: "Aucun abonnement Stripe actif trouvé pour ce compte (metadata, base locale, email).",
    });
  } catch (e) {
    console.error("[payment] reconcile-subscription:", e);
    return res.status(500).json({ error: "Impossible de synchroniser avec Stripe." });
  }
});

/**
 * Gestionnaire webhook Stripe (`checkout.session.completed`).
 * À enregistrer avec express.raw({ type: 'application/json' }) pour cette route uniquement.
 */
export async function paymentWebhookHandler(req, res) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret || !stripe) {
    return res.status(503).send("Webhook not configured");
  }
  const sig = req.headers["stripe-signature"];
  const rawBody = req.body;
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

  const handledTypes = new Set([
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
  ]);
  if (!handledTypes.has(event.type)) {
    return res.json({ received: true });
  }

  const begun = tryBeginStripeWebhookEvent(event.id);
  if (!begun) {
    return res.json({ received: true, duplicate: true });
  }

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutSessionCompleted(event.data.object);
    } else if (event.type === "customer.subscription.created") {
      await syncSubscriptionFromStripeObject(event.data.object, null);
    } else if (event.type === "customer.subscription.updated") {
      await syncSubscriptionFromStripeObject(event.data.object, null);
    } else if (event.type === "customer.subscription.deleted") {
      const stripeSub = event.data.object;
      const row = getSubscriptionByStripeSubscriptionId(stripeSub.id);
      if (row?.user_id) {
        createOrUpdateSubscription({
          userId: row.user_id,
          stripeCustomerId: row.stripe_customer_id || null,
          stripeSubscriptionId: stripeSub.id,
          planId: row.plan_id || "starter",
          status: "canceled",
          currentPeriodEnd: row.current_period_end || null,
        });
      }
    }
  } catch (err) {
    console.error("Stripe webhook handler error:", err);
    rollbackStripeWebhookEvent(event.id);
    return res.status(500).send("Webhook handler failed");
  }
  return res.json({ received: true });
}

/**
 * @param {import("stripe").Stripe.Subscription} stripeSub
 * @param {string | null} fallbackUserId — ex. metadata checkout.session
 */
async function syncSubscriptionFromStripeObject(stripeSub, fallbackUserId) {
  if (!stripeSub?.id) return;
  let userId = stripeSub.metadata?.user_id ? String(stripeSub.metadata.user_id).trim() : null;
  if (!userId) {
    const row = getSubscriptionByStripeSubscriptionId(stripeSub.id);
    if (row?.user_id) userId = String(row.user_id);
  }
  if (!userId && fallbackUserId) userId = String(fallbackUserId).trim();
  if (!userId) {
    console.warn("[stripe webhook] subscription: cannot resolve user_id", stripeSub.id);
    return;
  }
  const cust = stripeSub.customer;
  const stripeCustomerId = typeof cust === "string" ? cust : cust?.id ?? null;
  const end = stripeSub.current_period_end
    ? new Date(stripeSub.current_period_end * 1000).toISOString()
    : null;
  const status = stripeSub.status || "incomplete";
  const planId = stripeSub.metadata?.plan_id ? String(stripeSub.metadata.plan_id) : "starter";
  createOrUpdateSubscription({
    userId,
    stripeCustomerId,
    stripeSubscriptionId: stripeSub.id,
    planId,
    status,
    currentPeriodEnd: end,
  });
}

/**
 * L’objet Checkout peut envoyer `subscription` en string (id) ou développé en objet selon la version API.
 */
function extractCheckoutSubscriptionId(session) {
  const sub = session?.subscription;
  if (!sub) return null;
  if (typeof sub === "string") return sub;
  if (typeof sub === "object" && sub && "id" in sub && sub.id) return String(sub.id);
  return null;
}

function payerEmailFromCheckoutSession(session) {
  const d = session?.customer_details;
  const fromDetails = String(d?.email || d?.email_address || "").trim();
  const top = String(session?.customer_email || "").trim();
  const raw = fromDetails || top;
  return raw ? raw.toLowerCase() : null;
}

/**
 * Rattache l’abonnement au compte MyFidpass : metadata `user_id` (session créée par notre API), sinon email payeur.
 */
function resolveUserIdForSubscriptionCheckout(session) {
  const meta = session?.metadata?.user_id;
  if (meta != null && String(meta).trim() !== "") return String(meta).trim();
  const email = payerEmailFromCheckoutSession(session);
  if (!email) return null;
  const user = getUserByEmail(email);
  return user?.id ? String(user.id) : null;
}

/** @param {Record<string, unknown>} session */
async function handleCheckoutSessionCompleted(session) {
  const mode = session.mode;
  if (mode === "subscription") {
    const stripeSubscriptionId = extractCheckoutSubscriptionId(session);
    const userId = resolveUserIdForSubscriptionCheckout(session);
    if (!stripeSubscriptionId) {
      console.error("[stripe webhook] checkout.session.completed (subscription): missing subscription id", {
        sessionId: session?.id,
        subscriptionType: session?.subscription != null ? typeof session.subscription : "undefined",
      });
      return;
    }
    if (!userId) {
      console.error(
        "[stripe webhook] checkout.session.completed (subscription): cannot resolve user_id (metadata + email)",
        {
          sessionId: session?.id,
          metadataUserId: session?.metadata?.user_id ?? null,
          payerEmail: payerEmailFromCheckoutSession(session),
        }
      );
      return;
    }
    const sub = await stripe.subscriptions.retrieve(String(stripeSubscriptionId));
    await syncSubscriptionFromStripeObject(sub, userId);
    return;
  }

  if (mode === "payment" && session.metadata?.purpose === "flyer_pack") {
    if (session.payment_status !== "paid") {
      console.warn("flyer_pack webhook: payment_status not paid", session.payment_status);
      return;
    }
    const businessId = session.metadata.business_id;
    const userId = session.metadata.user_id;
    if (!businessId) {
      console.warn("flyer_pack webhook: missing business_id");
      return;
    }
    const b = getBusinessById(businessId);
    if (!b) {
      console.warn("flyer_pack webhook: business not found", businessId);
      return;
    }
    if (userId && b.user_id && String(b.user_id) !== String(userId)) {
      console.warn("flyer_pack webhook: user_id does not own business");
      return;
    }
    let generations = parseInt(session.metadata.flyer_generations, 10);
    if (!Number.isFinite(generations) || generations <= 0) {
      generations = FLYER_PACK_GENERATIONS;
    }
    incrementFlyerAiGenerationsBonus(businessId, generations);
  }
}

export default router;
