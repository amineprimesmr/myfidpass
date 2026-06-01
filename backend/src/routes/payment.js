import { Router } from "express";
import Stripe from "stripe";
import {
  createOrUpdateSubscription,
  getBusinessById,
  getBusinessesByUserId,
  getBusinessSubscriptionByStripeSubscriptionId,
  getBusinessSubscriptionForUserBusiness,
  getSubscriptionByUserId,
  getUserByEmail,
  hasStripeBackedActiveSubscription,
  hasOperationalMerchantAccess,
  isUserInMerchantTrial,
  incrementFlyerAiGenerationsBonus,
  getSubscriptionByStripeSubscriptionId,
  upsertBusinessSubscription,
  upsertMerchantEntitlement,
  cancelNonStripeBackedSubscriptionRow,
  hasPaidMerchantSubscription,
} from "../db.js";
import {
  multiBusinessAnnualTotalCents,
  multiBusinessMonthlyTotalCents,
  resolveBusinessSplitAmountCents,
} from "../lib/merchant-multi-pricing.js";
import { tryBeginStripeWebhookEvent, rollbackStripeWebhookEvent } from "../db/stripe-webhook-events.js";
import { convertReferralForUser } from "../db/referrals.js";
import { requireAuth } from "../middleware/auth.js";
import { notifyAdminsPlatformEvent } from "../lib/admin-notify.js";
import {
  syncAppleSubscriptionForUser,
  reconcileAppleSubscriptionForUser,
  isAppStoreServerApiConfigured,
  handleAppleServerNotification,
} from "../lib/apple-iap.js";
import { isProductionEnvironment } from "../lib/production-env.js";
import { isDevSimulatedSubscriptionRow } from "../db/subscriptions.js";

/** Limite sync Apple : 20 req / minute / utilisateur. */
const appleSyncRateByUser = new Map();

function assertAppleSyncRateLimit(userId) {
  const key = String(userId || "").trim();
  if (!key) return;
  const now = Date.now();
  let entry = appleSyncRateByUser.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + 60_000 };
  }
  entry.count += 1;
  appleSyncRateByUser.set(key, entry);
  if (entry.count > 20) {
    const err = new Error("rate_limit");
    err.code = "apple_sync_rate_limited";
    throw err;
  }
}

function appleSyncErrorResponse(e, res) {
  const code = e?.code || "apple_sync_failed";
  console.error("[payment] apple sync:", e?.message || e);
  const messages = {
    apple_bundle_mismatch: "Transaction Apple non valide pour cette app.",
    transaction_id_mismatch: "Identifiant de transaction incohérent.",
    apple_transaction_invalid: e.message || "Transaction illisible.",
    apple_transaction_owned_by_other_user:
      "Cet abonnement App Store est déjà lié à un autre compte MyFidpass.",
    apple_app_account_token_mismatch:
      "Cet achat App Store appartient à un autre compte MyFidpass.",
    apple_unknown_product: "Produit App Store non reconnu.",
    apple_api_required: "Validation App Store indisponible. Réessayez plus tard.",
    missing_apple_transaction_id: "Identifiant de transaction requis.",
    apple_sync_rate_limited: "Trop de tentatives. Réessayez dans une minute.",
  };
  const status =
    code === "apple_sync_rate_limited"
      ? 429
      : code === "apple_api_required" || code === "apple_transaction_invalid"
        ? 503
        : 400;
  return res.status(status).json({
    error: messages[code] || "Impossible de valider l’abonnement App Store.",
    code,
  });
}

const router = Router();
const stripe =
  process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith("sk_")
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

const FRONTEND_URL = (process.env.FRONTEND_URL || "https://myfidpass.fr").replace(/\/$/, "");
/** Prix mensuel (renouvellement 49,99 € / mois) — rétrocompat : `STRIPE_PRICE_ID_STARTER`. */
const PRICE_ID_MONTHLY = process.env.STRIPE_PRICE_ID_MONTHLY || process.env.STRIPE_PRICE_ID_STARTER || null;
/** Facturation annuelle 399 € / an. */
const PRICE_ID_ANNUAL = process.env.STRIPE_PRICE_ID_ANNUAL || null;
/** Rétrocompat : anciens scripts qui lisent `PRICE_ID_STARTER`. */
const PRICE_ID_STARTER = PRICE_ID_MONTHLY;
const STRIPE_SUBSCRIPTION_TRIAL_DAYS = Math.max(0, parseInt(String(process.env.STRIPE_SUBSCRIPTION_TRIAL_DAYS || "0"), 10) || 0);
/** Essai sur l’offre annuelle (jours). Si non défini → même valeur que `STRIPE_SUBSCRIPTION_TRIAL_DAYS`. Ex. `30` ≈ 1er mois sans prélèvement puis 399 €/an. */
const RAW_STRIPE_SUBSCRIPTION_TRIAL_DAYS_ANNUAL = process.env.STRIPE_SUBSCRIPTION_TRIAL_DAYS_ANNUAL;
/** Coupon Stripe (durée `once`) : réduit le 1er prélèvement post-essai à 1 € sur le prix mensuel (ex. 48,99 € de remise sur 49,99 €). */
const STRIPE_COUPON_ID_FIRST_MONTH_1_EUR = process.env.STRIPE_COUPON_ID_FIRST_MONTH_1_EUR
  ? String(process.env.STRIPE_COUPON_ID_FIRST_MONTH_1_EUR).trim() || null
  : null;
/** Coupon Stripe (durée `once`) : 1ère facture annuelle à 1 € sur un prix 399,00 €/an (remise fixe 398,00 €). */
const STRIPE_COUPON_ID_ANNUAL_FIRST_1_EUR = process.env.STRIPE_COUPON_ID_ANNUAL_FIRST_1_EUR
  ? String(process.env.STRIPE_COUPON_ID_ANNUAL_FIRST_1_EUR).trim() || null
  : null;
/** Prix Stripe (mode paiement unique) — pack « créations flyer ». */
const PRICE_ID_FLYER_PACK = process.env.STRIPE_PRICE_ID_FLYER_PACK || null;
/** Nombre de générations créditées par achat (surcharge possible via metadata session). */
const FLYER_PACK_GENERATIONS = Math.max(1, parseInt(process.env.FLYER_PACK_GENERATIONS || "25", 10) || 25);

function normalizeBusinessSplitInterval(input) {
  return String(input || "month").trim().toLowerCase() === "year" ? "year" : "month";
}

/** @param {Record<string, unknown>} body */
function parseMerchantSlotCount(body) {
  const raw = body?.slots ?? body?.business_count ?? body?.merchant_slots;
  const n = parseInt(String(raw ?? "1"), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(5, Math.floor(n));
}

function getTrialDaysForPlan(plan) {
  const p = String(plan || "").toLowerCase();
  if (p !== "annual") return STRIPE_SUBSCRIPTION_TRIAL_DAYS;
  const raw = RAW_STRIPE_SUBSCRIPTION_TRIAL_DAYS_ANNUAL;
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return STRIPE_SUBSCRIPTION_TRIAL_DAYS;
  }
  return Math.max(0, parseInt(String(raw), 10) || 0);
}

/**
 * Jours d’essai Stripe réellement attachés à la souscription créée.
 * **Mensuel : toujours 0** — le premier cycle est une facture immédiate (coupon premier mois à 1 €), pas un SetupIntent à 0 €.
 * Annuel : selon `STRIPE_SUBSCRIPTION_TRIAL_DAYS_ANNUAL` / `STRIPE_SUBSCRIPTION_TRIAL_DAYS`.
 */
function stripeTrialDaysOnSubscription(plan) {
  const p = String(plan || "").toLowerCase();
  if (p === "monthly") return 0;
  return getTrialDaysForPlan(plan);
}

function buildStripeSubscriptionTrialConfig(plan) {
  const days = stripeTrialDaysOnSubscription(plan);
  if (days <= 0) return {};
  return { trial_period_days: days };
}

function subscriptionIdOf(row) {
  return row?.stripe_subscription_id ? String(row.stripe_subscription_id).trim() : "";
}

function customerIdOf(row) {
  return row?.stripe_customer_id ? String(row.stripe_customer_id).trim() : "";
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
      success_url: `${FRONTEND_URL}/merci?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/`,
      metadata: { user_id: String(userId), plan },
      subscription_data: {
        metadata: { user_id: String(userId), plan },
        ...buildStripeSubscriptionTrialConfig(plan),
      },
    };
    if (plan === "monthly" && STRIPE_COUPON_ID_FIRST_MONTH_1_EUR) {
      sessionPayload.discounts = [{ coupon: STRIPE_COUPON_ID_FIRST_MONTH_1_EUR }];
    } else if (
      plan === "annual" &&
      STRIPE_COUPON_ID_ANNUAL_FIRST_1_EUR &&
      getTrialDaysForPlan("annual") <= 0
    ) {
      sessionPayload.discounts = [{ coupon: STRIPE_COUPON_ID_ANNUAL_FIRST_1_EUR }];
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
 * Réponse : { client_secret, confirm_mode, subscription_id } — `confirm_mode` = "payment" | "setup" (essai Stripe seulement sur l’annuel si jours > 0 : SetupIntent 0 €).
 */
router.post("/create-embedded-subscription", requireAuth, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({
      error: "Paiement non configuré",
      code: "stripe_not_configured",
    });
  }
  const userId = String(req.user.id);
  const email = (req.user.email || "").trim();
  if (!email) {
    return res.status(400).json({ error: "Email utilisateur requis" });
  }
  // Auto-réparation: anciens bypass dev peuvent laisser une ligne `active` qui bloque la souscription Stripe en prod.
  let subRow = getSubscriptionByUserId(userId);
  if (isDevSimulatedSubscriptionRow(subRow)) {
    createOrUpdateSubscription({
      userId,
      stripeCustomerId: customerIdOf(subRow) || null,
      stripeSubscriptionId: subscriptionIdOf(subRow) || null,
      planId: subRow?.plan_id || "starter",
      status: "canceled",
      currentPeriodEnd: subRow?.current_period_end || null,
    });
    subRow = getSubscriptionByUserId(userId);
  }
  // Anciennes lignes IAP / RevenueCat / synchros sans vrai `sub_…` : on les annule pour pouvoir créer l’abo Stripe web.
  cancelNonStripeBackedSubscriptionRow(userId);

  const plan = String(req.body?.plan || "monthly").toLowerCase() === "annual" ? "annual" : "monthly";
  const slots = parseMerchantSlotCount(req.body);
  if (slots === 1 && plan === "monthly" && !PRICE_ID_MONTHLY) {
    return res.status(503).json({
      error: "Paiement non configuré (STRIPE_PRICE_ID_MONTHLY ou STRIPE_PRICE_ID_STARTER).",
      code: "stripe_not_configured",
    });
  }
  if (slots === 1 && plan === "annual" && !PRICE_ID_ANNUAL) {
    return res.status(503).json({
      error: "Prix annuel non configuré (STRIPE_PRICE_ID_ANNUAL).",
      code: "stripe_not_configured",
    });
  }

  const planIdForMetadata = slots > 1 ? "pro" : "starter";
  const billingModeMeta = slots > 1 ? "unified_multi" : "unified_single";
  const useCatalogPrice = slots === 1;
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

    await Promise.all([
      cancelAbandonedEmbeddedCheckoutSubscriptions(customerId),
      resyncSubscriptionRowFromStripeIfNeeded(userId),
    ]);

    if (hasStripeBackedActiveSubscription(userId)) {
      return res.status(409).json({
        error: "Un abonnement actif est déjà associé à ce compte.",
        code: "already_subscribed",
      });
    }

    const baseMeta = {
      user_id: userId,
      plan,
      plan_id: planIdForMetadata,
      merchant_slots: String(slots),
      billing_mode: billingModeMeta,
    };

    /** @type {import("stripe").Stripe.SubscriptionCreateParams} */
    const subscriptionParams = {
      customer: customerId,
      metadata: baseMeta,
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      ...buildStripeSubscriptionTrialConfig(plan),
      expand: [
        "latest_invoice.confirmation_secret",
        "latest_invoice.payment_intent",
        "pending_setup_intent",
      ],
    };

    if (useCatalogPrice) {
      subscriptionParams.items = [{ price: priceId, quantity: 1 }];
      if (plan === "monthly" && STRIPE_COUPON_ID_FIRST_MONTH_1_EUR) {
        subscriptionParams.discounts = [{ coupon: STRIPE_COUPON_ID_FIRST_MONTH_1_EUR }];
      } else if (
        plan === "annual" &&
        STRIPE_COUPON_ID_ANNUAL_FIRST_1_EUR &&
        getTrialDaysForPlan("annual") <= 0
      ) {
        subscriptionParams.discounts = [{ coupon: STRIPE_COUPON_ID_ANNUAL_FIRST_1_EUR }];
      }
    } else {
      const unitAmount =
        plan === "annual" ? multiBusinessAnnualTotalCents(slots) : multiBusinessMonthlyTotalCents(slots);
      const interval = plan === "annual" ? "year" : "month";
      subscriptionParams.items = [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name:
                slots > 1
                  ? `MyFidpass — ${slots} commerces (${plan === "annual" ? "annuel" : "mensuel"})`
                  : `MyFidpass (${plan === "annual" ? "annuel" : "mensuel"})`,
            },
            recurring: { interval },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ];
    }

    const subscription = await stripe.subscriptions.create(subscriptionParams);

    const secretResult = await getClientSecretForEmbeddedSubscription(subscription);
    if (!secretResult?.clientSecret) {
      const pending = subscription.pending_setup_intent;
      const pendingId = typeof pending === "string" ? pending : pending?.id;
      console.error("[payment] embedded subscription: missing client_secret", {
        subscriptionId: subscription.id,
        plan,
        trialDays: stripeTrialDaysOnSubscription(plan),
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
          "Impossible de préparer le paiement (essai : SetupIntent / sinon facture). Vérifiez STRIPE_SUBSCRIPTION_TRIAL_DAYS, STRIPE_SUBSCRIPTION_TRIAL_DAYS_ANNUAL, les price_id et les coupons côté Stripe.",
        code: "missing_payment_intent",
      });
    }

    await syncSubscriptionFromStripeObject(subscription, userId);

    return res.json({
      client_secret: secretResult.clientSecret,
      confirm_mode: secretResult.mode,
      subscription_id: subscription.id,
      trial_days: stripeTrialDaysOnSubscription(plan),
    });
  } catch (err) {
    console.error("Stripe embedded subscription error:", err);
    return res.status(500).json({
      error: err.message || "Impossible de créer l’abonnement",
    });
  }
});

/**
 * POST /api/payment/create-business-checkout-session
 * Abonnement Stripe dédié à un commerce (carte séparée par établissement).
 * Body: { business_slug?: string, business_id?: string, interval?: "month"|"year" }
 */
router.post("/create-business-checkout-session", requireAuth, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({
      error: "Paiement non configuré",
      code: "stripe_not_configured",
    });
  }
  const userId = String(req.user.id);
  const email = (req.user.email || "").trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: "Email utilisateur requis" });
  }

  const ownedBusinesses = getBusinessesByUserId(userId);
  if (!ownedBusinesses.length) {
    return res.status(404).json({ error: "Aucun commerce disponible pour ce compte." });
  }

  const bodyBusinessId = String(req.body?.business_id || req.body?.businessId || "").trim();
  const bodySlug = String(req.body?.business_slug || req.body?.businessSlug || "").trim().toLowerCase();
  const targetBusiness =
    ownedBusinesses.find((b) => b.id === bodyBusinessId) ||
    ownedBusinesses.find((b) => String(b.slug || "").trim().toLowerCase() === bodySlug) ||
    ownedBusinesses[0];

  if (!targetBusiness?.id) {
    return res.status(404).json({ error: "Commerce introuvable pour ce compte." });
  }

  const ordered = [...ownedBusinesses].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const businessIndex = Math.max(0, ordered.findIndex((b) => b.id === targetBusiness.id));
  const interval = normalizeBusinessSplitInterval(req.body?.interval);
  const amountCents = resolveBusinessSplitAmountCents(ownedBusinesses.length, businessIndex, interval);

  try {
    const existing = getBusinessSubscriptionForUserBusiness(userId, targetBusiness.id);
    let customerId = existing?.stripe_customer_id ? String(existing.stripe_customer_id).trim() : "";
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: {
          user_id: userId,
          business_id: String(targetBusiness.id),
          business_slug: String(targetBusiness.slug || ""),
          billing_mode: "per_business",
        },
      });
      customerId = customer.id;
    }

    upsertBusinessSubscription({
      userId,
      businessId: targetBusiness.id,
      stripeCustomerId: customerId,
      stripeSubscriptionId: existing?.stripe_subscription_id || null,
      status: existing?.status || "incomplete",
      amountCents,
      interval,
    });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: `Abonnement commerce — ${targetBusiness.name || targetBusiness.slug || "Commerce"}`,
            },
            recurring: { interval },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${FRONTEND_URL}/app?business_subscription_paid=1&business_id=${encodeURIComponent(String(targetBusiness.id))}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/app?business_subscription_cancel=1&business_id=${encodeURIComponent(String(targetBusiness.id))}`,
      metadata: {
        user_id: userId,
        business_id: String(targetBusiness.id),
        business_slug: String(targetBusiness.slug || ""),
        billing_mode: "per_business",
        amount_cents: String(amountCents),
      },
      subscription_data: {
        metadata: {
          user_id: userId,
          business_id: String(targetBusiness.id),
          business_slug: String(targetBusiness.slug || ""),
          billing_mode: "per_business",
          amount_cents: String(amountCents),
        },
      },
    });
    return res.json({
      url: session.url,
      business_id: targetBusiness.id,
      business_slug: targetBusiness.slug,
      amount_cents: amountCents,
      interval,
    });
  } catch (err) {
    console.error("Stripe business checkout session error:", err);
    return res.status(500).json({
      error: err.message || "Impossible de créer la session de paiement commerce.",
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
 * Stripe renvoie souvent `trialing` dès `subscriptions.create` alors que le Payment Element / SetupIntent n’est pas encore terminé.
 * Tant que ce n’est pas le cas, on persiste `incomplete` pour ne pas bloquer un nouveau `/paiement` ni faire croire à l’app que l’abo est actif.
 * @param {import("stripe").Stripe.Subscription} stripeSub
 */
function subscriptionRowStatusFromStripeObject(stripeSub) {
  const raw = String(stripeSub?.status || "incomplete").toLowerCase();
  if (raw !== "trialing") return raw;
  const dpm = stripeSub.default_payment_method;
  if (dpm != null && String(dpm).trim() !== "") return "trialing";
  const psi = stripeSub.pending_setup_intent;
  if (typeof psi === "object" && psi) {
    if (psi.status === "succeeded") return "trialing";
    return "incomplete";
  }
  const inv = stripeSub.latest_invoice;
  const invObj = typeof inv === "object" && inv ? inv : null;
  const pi = invObj?.payment_intent;
  const piObj = typeof pi === "object" && pi ? pi : null;
  if (piObj) {
    if (piObj.status === "succeeded") return "trialing";
    return "incomplete";
  }
  if (psi == null && invObj == null) return raw;
  return "incomplete";
}

/**
 * Annule les abonnements Stripe « abandonnés » (page paiement ouverte puis fermée sans CB).
 * Les essais `trialing` sans moyen de paiement ne sont pas listés en `incomplete` — il faut les annuler séparément.
 * @param {string} customerId
 */
async function cancelAbandonedEmbeddedCheckoutSubscriptions(customerId) {
  if (!stripe || !customerId) return;
  const cid = String(customerId).trim();

  const incomplete = await stripe.subscriptions.list({ customer: cid, status: "incomplete", limit: 50 });
  for (const s of incomplete.data) {
    try {
      await stripe.subscriptions.cancel(s.id);
    } catch (e) {
      console.warn("[payment] cancel incomplete sub:", s.id, e?.message || e);
    }
  }

  const trialing = await stripe.subscriptions.list({ customer: cid, status: "trialing", limit: 50 });
  for (const s of trialing.data) {
    let sub = s;
    const dpm = sub.default_payment_method;
    if (dpm != null && String(dpm).trim() !== "") continue;

    if (typeof sub.pending_setup_intent !== "object" || sub.pending_setup_intent == null) {
      try {
        sub = await stripe.subscriptions.retrieve(s.id, {
          expand: ["pending_setup_intent", "latest_invoice.payment_intent"],
        });
      } catch (e) {
        console.warn("[payment] retrieve trialing sub for cleanup:", s.id, e?.message || e);
        continue;
      }
    }

    const psi = sub.pending_setup_intent;
    const psiObj = typeof psi === "object" && psi ? psi : null;
    if (psiObj?.status === "succeeded") continue;

    const inv = sub.latest_invoice;
    const invObj = typeof inv === "object" && inv ? inv : null;
    const pi = invObj?.payment_intent;
    const piObj = typeof pi === "object" && pi ? pi : null;
    if (piObj?.status === "succeeded") continue;

    try {
      await stripe.subscriptions.cancel(s.id);
    } catch (e) {
      console.warn("[payment] cancel abandoned trialing sub:", s.id, e?.message || e);
    }
  }
}

async function resyncSubscriptionRowFromStripeIfNeeded(userId) {
  if (!stripe || !userId) return;
  const row = getSubscriptionByUserId(userId);
  const sid = row?.stripe_subscription_id ? String(row.stripe_subscription_id).trim() : "";
  if (!/^sub_[A-Za-z0-9]+$/.test(sid)) return;
  try {
    const s = await stripe.subscriptions.retrieve(sid, {
      expand: ["pending_setup_intent", "latest_invoice.payment_intent"],
    });
    await syncSubscriptionFromStripeObject(s, userId);
  } catch (e) {
    console.warn("[payment] resync subscription row: Stripe retrieve failed:", sid, e?.message || e);
    createOrUpdateSubscription({
      userId,
      stripeCustomerId: row?.stripe_customer_id || null,
      stripeSubscriptionId: null,
      planId: row?.plan_id || "starter",
      status: "canceled",
      currentPeriodEnd: row?.current_period_end || null,
    });
  }
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
        if (hasStripeBackedActiveSubscription(userId)) {
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
      const businessRow = getBusinessSubscriptionByStripeSubscriptionId(stripeSub.id);
      if (businessRow?.user_id && businessRow?.business_id) {
        upsertBusinessSubscription({
          userId: String(businessRow.user_id),
          businessId: String(businessRow.business_id),
          stripeCustomerId: businessRow.stripe_customer_id || null,
          stripeSubscriptionId: stripeSub.id,
          status: "canceled",
          amountCents: businessRow.amount_cents ?? null,
          interval: businessRow.interval || "month",
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
  let working = stripeSub;

  if (
    stripe &&
    String(stripeSub.status || "").toLowerCase() === "trialing" &&
    !stripeSub.default_payment_method &&
    (typeof stripeSub.pending_setup_intent !== "object" || stripeSub.pending_setup_intent == null)
  ) {
    try {
      working = await stripe.subscriptions.retrieve(stripeSub.id, {
        expand: ["pending_setup_intent", "latest_invoice.payment_intent"],
      });
    } catch (e) {
      console.warn("[stripe sync] retrieve subscription for status:", stripeSub.id, e?.message || e);
    }
  }

  let userId = working.metadata?.user_id ? String(working.metadata.user_id).trim() : null;
  if (!userId) {
    const row = getSubscriptionByStripeSubscriptionId(working.id);
    if (row?.user_id) userId = String(row.user_id);
  }
  if (!userId && fallbackUserId) userId = String(fallbackUserId).trim();
  if (!userId) {
    console.warn("[stripe webhook] subscription: cannot resolve user_id", working.id);
    return;
  }
  const cust = working.customer;
  const stripeCustomerId = typeof cust === "string" ? cust : cust?.id ?? null;
  const end = working.current_period_end
    ? new Date(working.current_period_end * 1000).toISOString()
    : null;
  const status = subscriptionRowStatusFromStripeObject(working);
  const planId = working.metadata?.plan_id ? String(working.metadata.plan_id).trim() : "starter";
  createOrUpdateSubscription({
    userId,
    stripeCustomerId,
    stripeSubscriptionId: working.id,
    planId: planId || "starter",
    status,
    currentPeriodEnd: end,
  });

  if (isStripeSubscriptionStatusPaying(status)) {
    try { convertReferralForUser(userId); } catch (_) {}
  }

  const slotsMeta = working.metadata?.merchant_slots;
  if (slotsMeta != null && String(slotsMeta).trim() !== "") {
    const slots = Math.min(5, Math.max(1, parseInt(String(slotsMeta), 10) || 1));
    upsertMerchantEntitlement({
      userId,
      allowedBusinesses: slots,
      billingProvider: "stripe",
      status: isStripeSubscriptionStatusPaying(status) ? "active" : "inactive",
      source: "stripe_unified_subscription",
    });
  }

  const businessIdRaw = working.metadata?.business_id ? String(working.metadata.business_id).trim() : "";
  const billingMode = String(working.metadata?.billing_mode || "").trim().toLowerCase();
  if (businessIdRaw && billingMode === "per_business") {
    const items = working.items?.data || [];
    const firstItem = items[0] || null;
    const amountCents = firstItem?.price?.unit_amount ?? null;
    const interval = normalizeBusinessSplitInterval(firstItem?.price?.recurring?.interval || "month");
    upsertBusinessSubscription({
      userId,
      businessId: businessIdRaw,
      stripeCustomerId,
      stripeSubscriptionId: working.id,
      status,
      amountCents,
      interval,
    });
  }
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

/**
 * POST /api/payment/apple/sync-transaction
 * Body: { signed_transaction_info?, transaction_id? } — StoreKit 2 (JWS + id transaction).
 */
router.post("/apple/sync-transaction", requireAuth, async (req, res) => {
  const signed = req.body?.signed_transaction_info ?? req.body?.signedTransactionInfo;
  const transactionId = req.body?.transaction_id ?? req.body?.transactionId;
  if (!signed && !transactionId) {
    return res.status(400).json({
      error: "signed_transaction_info ou transaction_id requis",
      code: "missing_apple_transaction",
    });
  }
  if (isProductionEnvironment() && !transactionId) {
    return res.status(400).json({
      error: "transaction_id requis en production.",
      code: "missing_apple_transaction_id",
    });
  }
  try {
    assertAppleSyncRateLimit(req.user.id);
    const result = await syncAppleSubscriptionForUser(req.user.id, {
      signedTransactionInfo: signed,
      transactionId,
    });
    return res.json({
      ok: true,
      source: result.source || (isAppStoreServerApiConfigured() ? "app_store_server_api" : "storekit_jws"),
      subscription_status: result.subscription_status,
      has_active_subscription: result.has_active_subscription,
      has_paid_merchant_subscription: result.has_paid_merchant_subscription,
      original_transaction_id: result.original_transaction_id,
    });
  } catch (e) {
    return appleSyncErrorResponse(e, res);
  }
});

/**
 * POST /api/payment/apple/reconcile-subscription
 * Réaligne l’accès sur la dernière transaction Apple déjà stockée (restauration achats).
 */
router.post("/apple/reconcile-subscription", requireAuth, async (req, res) => {
  try {
    assertAppleSyncRateLimit(req.user.id);
    const reconciled = await reconcileAppleSubscriptionForUser(req.user.id);
    if (reconciled) {
      return res.json({
        ok: true,
        has_active_subscription: reconciled.has_active_subscription,
        has_paid_merchant_subscription: reconciled.has_paid_merchant_subscription,
        source: "app_store_server_api",
        subscription_status: reconciled.subscription_status,
      });
    }
  } catch (e) {
    return appleSyncErrorResponse(e, res);
  }

  const signed = req.body?.signed_transaction_info ?? req.body?.signedTransactionInfo;
  const transactionId = req.body?.transaction_id ?? req.body?.transactionId;
  if (signed || transactionId) {
    try {
      assertAppleSyncRateLimit(req.user.id);
      const result = await syncAppleSubscriptionForUser(req.user.id, {
        signedTransactionInfo: signed,
        transactionId,
      });
      return res.json({
        ok: true,
        has_active_subscription: result.has_active_subscription,
        has_paid_merchant_subscription: result.has_paid_merchant_subscription,
        source: result.source || "apple_sync",
        subscription_status: result.subscription_status,
      });
    } catch (e) {
      return appleSyncErrorResponse(e, res);
    }
  }

  return res.json({
    ok: hasPaidMerchantSubscription(req.user.id),
    has_active_subscription: hasPaidMerchantSubscription(req.user.id),
    has_paid_merchant_subscription: hasPaidMerchantSubscription(req.user.id),
    source: "local_row_validated",
    message: "Aucune transaction Apple à resynchroniser.",
  });
});

/**
 * Webhook App Store Server Notifications v2.
 * Production URL : https://<api>/api/payment/apple-webhook
 */
export async function applePaymentWebhookHandler(req, res) {
  try {
    const result = await handleAppleServerNotification(req.body);
    return res.json({ received: true, ...result });
  } catch (e) {
    console.error("[payment] apple webhook:", e?.message || e);
    const code = e?.code || "apple_webhook_failed";
    const status = code === "missing_signed_payload" || code === "invalid_signed_payload" ? 400 : 500;
    return res.status(status).json({ error: "Impossible de traiter la notification Apple.", code });
  }
}

export {
  syncSubscriptionFromStripeObject,
  payerEmailFromCheckoutSession,
  extractCheckoutSubscriptionId,
  isStripeSubscriptionStatusPaying,
};

export default router;
