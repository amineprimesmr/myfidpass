import { Router } from "express";
import Stripe from "stripe";
import {
  createOrUpdateSubscription,
  getBusinessById,
  getBusinessesByUserId,
  getSubscriptionByUserId,
  getUserByEmail,
  hasActiveSubscription,
  hasOperationalMerchantAccess,
  incrementFlyerAiGenerationsBonus,
  getSubscriptionByStripeSubscriptionId,
} from "../db.js";
import { tryBeginStripeWebhookEvent, rollbackStripeWebhookEvent } from "../db/stripe-webhook-events.js";
import { requireAuth } from "../middleware/auth.js";
import { notifyAdminsPlatformEvent } from "../lib/admin-notify.js";

const router = Router();
const stripe =
  process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith("sk_")
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

const FRONTEND_URL = (process.env.FRONTEND_URL || "https://myfidpass.fr").replace(/\/$/, "");
/** Prix mensuel (renouvellement 49,99 € / mois) — rétrocompat : `STRIPE_PRICE_ID_STARTER`. */
const PRICE_ID_MONTHLY = process.env.STRIPE_PRICE_ID_MONTHLY || process.env.STRIPE_PRICE_ID_STARTER || null;
/** Facturation annuelle 399 € / an (même essai 3 j que le mensuel). */
const PRICE_ID_ANNUAL = process.env.STRIPE_PRICE_ID_ANNUAL || null;
/** Rétrocompat : anciens scripts qui lisent `PRICE_ID_STARTER`. */
const PRICE_ID_STARTER = PRICE_ID_MONTHLY;
const STRIPE_SUBSCRIPTION_TRIAL_DAYS = Math.max(0, parseInt(String(process.env.STRIPE_SUBSCRIPTION_TRIAL_DAYS || "3"), 10) || 0);
/** Coupon Stripe (durée `once`) : réduit le 1er prélèvement post-essai à 1 € sur le prix mensuel (ex. 48,99 € de remise sur 49,99 €). */
const STRIPE_COUPON_ID_FIRST_MONTH_1_EUR = process.env.STRIPE_COUPON_ID_FIRST_MONTH_1_EUR
  ? String(process.env.STRIPE_COUPON_ID_FIRST_MONTH_1_EUR).trim() || null
  : null;
/** Prix Stripe (mode paiement unique) — pack « créations flyer ». */
const PRICE_ID_FLYER_PACK = process.env.STRIPE_PRICE_ID_FLYER_PACK || null;
/** Nombre de générations créditées par achat (surcharge possible via metadata session). */
const FLYER_PACK_GENERATIONS = Math.max(1, parseInt(process.env.FLYER_PACK_GENERATIONS || "25", 10) || 25);

function buildStripeSubscriptionTrialConfig() {
  if (STRIPE_SUBSCRIPTION_TRIAL_DAYS <= 0) return {};
  return { trial_period_days: STRIPE_SUBSCRIPTION_TRIAL_DAYS };
}

/**
 * POST /api/payment/create-portal-session
 * Espace client Stripe (facture, moyen de paiement, résiliation) — nécessite un `stripe_customer_id` en base.
 */
router.post("/create-portal-session", requireAuth, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({
      error: "Paiement non configuré",
      code: "stripe_not_configured",
    });
  }
  const userId = String(req.user.id);
  let sub = getSubscriptionByUserId(userId);
  let customerId = sub?.stripe_customer_id ? String(sub.stripe_customer_id).trim() : "";
  const subId = sub?.stripe_subscription_id ? String(sub.stripe_subscription_id).trim() : "";

  if (!customerId && subId) {
    try {
      const stripeSub = await stripe.subscriptions.retrieve(subId);
      await syncSubscriptionFromStripeObject(stripeSub, userId);
      sub = getSubscriptionByUserId(userId);
      customerId = sub?.stripe_customer_id ? String(sub.stripe_customer_id).trim() : "";
    } catch (e) {
      console.warn("[payment] portal: retrieve subscription for customer id:", e?.message || e);
    }
  }

  if (!customerId) {
    return res.status(400).json({
      error:
        "Aucun client Stripe lié à ce compte. Utilisez « Souscrire » pour créer l’abonnement, ou connectez-vous sur myfidpass.fr.",
      code: "no_portal_customer",
    });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${FRONTEND_URL}/app`,
    });
    return res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe billing portal session error:", err);
    return res.status(500).json({
      error:
        err.message ||
        "Impossible d’ouvrir l’espace client Stripe. Vérifiez que le portail client est activé dans le dashboard Stripe.",
    });
  }
});

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
  const plan = String(req.body?.plan || req.query?.plan || "monthly").toLowerCase() === "annual" ? "annual" : "monthly";
  if (plan === "annual" && !PRICE_ID_ANNUAL) {
    return res.status(503).json({
      error: "Prix annuel non configuré (STRIPE_PRICE_ID_ANNUAL).",
      code: "stripe_not_configured",
    });
  }
  const priceId = plan === "annual" ? PRICE_ID_ANNUAL : PRICE_ID_MONTHLY;
  try {
    const sessionPayload = {
      mode: "subscription",
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${FRONTEND_URL}/app?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/app`,
      metadata: { user_id: String(userId), plan },
      subscription_data: {
        metadata: { user_id: String(userId), plan },
        ...buildStripeSubscriptionTrialConfig(),
      },
    };
    if (plan === "monthly" && STRIPE_COUPON_ID_FIRST_MONTH_1_EUR) {
      sessionPayload.discounts = [{ coupon: STRIPE_COUPON_ID_FIRST_MONTH_1_EUR }];
    }
    const session = await stripe.checkout.sessions.create(sessionPayload);
    return res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout session error:", err);
    return res.status(500).json({
      error: err.message || "Impossible de créer la session de paiement",
    });
  }
});

/**
 * POST /api/payment/create-embedded-subscription
 * Abonnement avec Stripe Payment Element (carte, Apple Pay, Google Pay) sur myfidpass.fr — sans redirection Checkout hébergé.
 * Réponse : { client_secret, confirm_mode, subscription_id } — `confirm_mode` = "payment" | "setup" (période d'essai Stripe = SetupIntent $0).
 */
router.post("/create-embedded-subscription", requireAuth, async (req, res) => {
  if (!stripe || !PRICE_ID_MONTHLY) {
    return res.status(503).json({
      error: "Paiement non configuré (STRIPE_PRICE_ID_MONTHLY ou STRIPE_PRICE_ID_STARTER).",
      code: "stripe_not_configured",
    });
  }
  const userId = String(req.user.id);
  const email = (req.user.email || "").trim();
  if (!email) {
    return res.status(400).json({ error: "Email utilisateur requis" });
  }
  if (hasActiveSubscription(userId)) {
    return res.status(409).json({
      error: "Un abonnement actif est déjà associé à ce compte.",
      code: "already_subscribed",
    });
  }

  const plan = String(req.body?.plan || "monthly").toLowerCase() === "annual" ? "annual" : "monthly";
  if (plan === "annual" && !PRICE_ID_ANNUAL) {
    return res.status(503).json({
      error: "Prix annuel non configuré (STRIPE_PRICE_ID_ANNUAL).",
      code: "stripe_not_configured",
    });
  }
  const priceId = plan === "annual" ? PRICE_ID_ANNUAL : PRICE_ID_MONTHLY;

  try {
    let customerId = "";
    const existingRow = getSubscriptionByUserId(userId);
    if (existingRow?.stripe_customer_id) {
      customerId = String(existingRow.stripe_customer_id).trim();
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { user_id: userId },
      });
      customerId = customer.id;
      createOrUpdateSubscription({
        userId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: existingRow?.stripe_subscription_id || null,
        planId: existingRow?.plan_id || "starter",
        status: existingRow?.status || "incomplete",
        currentPeriodEnd: existingRow?.current_period_end || null,
      });
    }

    const incomplete = await stripe.subscriptions.list({
      customer: customerId,
      status: "incomplete",
      limit: 20,
    });
    for (const s of incomplete.data) {
      try {
        await stripe.subscriptions.cancel(s.id);
      } catch (e) {
        console.warn("[payment] cancel incomplete sub:", s.id, e?.message || e);
      }
    }

    const subscriptionParams = {
      customer: customerId,
      items: [{ price: priceId, quantity: 1 }],
      metadata: { user_id: userId, plan },
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      ...buildStripeSubscriptionTrialConfig(),
      expand: [
        "latest_invoice.confirmation_secret",
        "latest_invoice.payment_intent",
        "pending_setup_intent",
      ],
    };
    if (plan === "monthly" && STRIPE_COUPON_ID_FIRST_MONTH_1_EUR) {
      subscriptionParams.discounts = [{ coupon: STRIPE_COUPON_ID_FIRST_MONTH_1_EUR }];
    }
    const subscription = await stripe.subscriptions.create(subscriptionParams);

    const secretResult = await getClientSecretForEmbeddedSubscription(subscription);
    if (!secretResult?.clientSecret) {
      const pending = subscription.pending_setup_intent;
      const pendingId = typeof pending === "string" ? pending : pending?.id;
      console.error("[payment] embedded subscription: missing client_secret", {
        subscriptionId: subscription.id,
        plan,
        trialDays: STRIPE_SUBSCRIPTION_TRIAL_DAYS,
        pendingSetupIntent: pendingId || null,
        latestInvoice:
          typeof subscription.latest_invoice === "string"
            ? subscription.latest_invoice
            : subscription.latest_invoice?.id,
      });
      try {
        await stripe.subscriptions.cancel(subscription.id);
      } catch (_) {}
      return res.status(500).json({
        error:
          "Impossible de préparer le paiement (essai : SetupIntent / sinon facture). Vérifiez STRIPE_SUBSCRIPTION_TRIAL_DAYS, les price_id et, si besoin, STRIPE_COUPON_ID_FIRST_MONTH_1_EUR côté Stripe.",
        code: "missing_payment_intent",
      });
    }

    await syncSubscriptionFromStripeObject(subscription, userId);

    return res.json({
      client_secret: secretResult.clientSecret,
      confirm_mode: secretResult.mode,
      subscription_id: subscription.id,
    });
  } catch (err) {
    console.error("Stripe embedded subscription error:", err);
    return res.status(500).json({
      error: err.message || "Impossible de créer l’abonnement",
    });
  }
});

/**
 * Période d'essai Stripe = facture 0 € : souvent `pending_setup_intent` (saisir CB pour la fin d'essai) ;
 * sinon `PaymentIntent` / `confirmation_secret` sur la facture.
 * @param {import("stripe").Stripe.Subscription} subscription
 * @returns {Promise<{ clientSecret: string, mode: "payment" | "setup" }|null>}
 */
async function getClientSecretForEmbeddedSubscription(subscription) {
  if (!stripe || !subscription) return null;
  let pSetup = subscription.pending_setup_intent;
  if (typeof pSetup === "string" && pSetup) {
    try {
      pSetup = await stripe.setupIntents.retrieve(pSetup);
    } catch (e) {
      pSetup = null;
    }
  }
  if (pSetup && typeof pSetup === "object" && pSetup.client_secret) {
    return { clientSecret: pSetup.client_secret, mode: "setup" };
  }
  const fromInvoice = await extractSubscriptionInvoiceClientSecret(subscription);
  if (fromInvoice) {
    return { clientSecret: fromInvoice, mode: "payment" };
  }
  return null;
}

/**
 * @param {import("stripe").Stripe.Subscription} subscription
 * @returns {Promise<string|null>}
 */
async function extractSubscriptionInvoiceClientSecret(subscription) {
  if (!stripe || !subscription?.latest_invoice) return null;

  /** @type {string|null} */
  let invoiceId =
    typeof subscription.latest_invoice === "string"
      ? subscription.latest_invoice
      : subscription.latest_invoice?.id ?? null;
  if (!invoiceId) return null;

  let invoice = await stripe.invoices.retrieve(invoiceId, {
    expand: ["payment_intent", "confirmation_secret"],
  });

  if (invoice.status === "draft") {
    try {
      invoice = await stripe.invoices.finalizeInvoice(invoice.id, {
        expand: ["payment_intent", "confirmation_secret"],
      });
    } catch (e) {
      console.error("[payment] finalizeInvoice:", invoice.id, e?.message || e);
      return null;
    }
  }

  const fromConfirm = invoice.confirmation_secret?.client_secret;
  if (fromConfirm) return fromConfirm;

  let pi = invoice.payment_intent;
  if (typeof pi === "string") {
    pi = await stripe.paymentIntents.retrieve(pi);
  }
  if (pi?.client_secret) return pi.client_secret;

  return null;
}

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
      has_active_subscription: hasOperationalMerchantAccess(userId),
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
        has_active_subscription: hasOperationalMerchantAccess(userId),
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
      has_active_subscription: hasOperationalMerchantAccess(userId),
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
    "invoice.paid",
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
      await handleCheckoutSessionCompleted(event.data.object, event.id);
    } else if (event.type === "invoice.paid") {
      const inv = event.data.object;
      const subRef = inv?.subscription;
      const subId = typeof subRef === "string" ? subRef : subRef?.id;
      if (subId) {
        const sub = await stripe.subscriptions.retrieve(String(subId));
        await syncSubscriptionFromStripeObject(sub, null);
      }
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

/**
 * @param {Record<string, unknown>} session
 * @param {string} [stripeEventId]
 */
async function handleCheckoutSessionCompleted(session, stripeEventId) {
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
    try {
      const u = getUserByEmail(payerEmailFromCheckoutSession(session) || "");
      const emailLabel = u?.email || payerEmailFromCheckoutSession(session) || userId;
      await notifyAdminsPlatformEvent({
        eventType: "stripe_subscription_checkout_paid",
        stripeEventId: stripeEventId || null,
        userId,
        description: `Nouvel abonnement (ou renouvellement checkout) — ${emailLabel}`,
        extra: { stripe_subscription_id: stripeSubscriptionId },
      });
    } catch (e) {
      console.error("[payment] admin notify subscription:", e?.message || e);
    }
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
    try {
      const owner = b.user_id ? String(b.user_id) : null;
      await notifyAdminsPlatformEvent({
        eventType: "stripe_flyer_pack_paid",
        stripeEventId: stripeEventId || null,
        userId: owner,
        businessId: String(businessId),
        amountEur: session.amount_total != null ? Number(session.amount_total) / 100 : null,
        currency: session.currency || "eur",
        description: `Achat pack créations flyer — ${b.organization_name || b.name} (${b.slug})`,
        extra: { generations, session_id: session.id },
      });
    } catch (e) {
      console.error("[payment] admin notify flyer pack:", e?.message || e);
    }
  }
}

export default router;
