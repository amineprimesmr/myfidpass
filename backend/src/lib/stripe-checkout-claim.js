/**
 * Réclamation d’un abonnement Stripe après Payment Link / Checkout (sans compte au moment du paiement).
 */
import Stripe from "stripe";
import { timingSafeEqual, createHmac } from "crypto";
import {
  createUserWithEmailOtp,
  getSubscriptionByStripeSubscriptionId,
  getUserByEmail,
  getUserById,
  hasOperationalMerchantAccess,
} from "../db.js";
import {
  deleteEmailOtpChallenge,
  getEmailOtpChallenge,
  incrementEmailOtpAttempts,
} from "../db/email-otp.js";
import { issueAndSendEmailOtp, hashEmailOtp } from "./email-otp-send.js";
import { sendMail } from "../email.js";
import { isReservedStaffEmailOnly } from "../db/users.js";
import { issueAuthTokensForUser, getAuthPayloadForUser } from "../routes/auth-tokens.js";
import {
  isValidCheckoutSessionId,
  isValidStripeSubscriptionId,
} from "./stripe-checkout-ids.js";

async function loadStripeSyncHelpers() {
  const mod = await import("../routes/payment.js");
  return {
    syncSubscriptionFromStripeObject: mod.syncSubscriptionFromStripeObject,
    payerEmailFromCheckoutSession: mod.payerEmailFromCheckoutSession,
    extractCheckoutSubscriptionId: mod.extractCheckoutSubscriptionId,
    isStripeSubscriptionStatusPaying: mod.isStripeSubscriptionStatusPaying,
  };
}

const stripe =
  process.env.STRIPE_SECRET_KEY && String(process.env.STRIPE_SECRET_KEY).startsWith("sk_")
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

const EMAIL_OTP_MAX_ATTEMPTS = 8;

function planLabelFromSession(session) {
  const meta = session?.metadata?.plan || session?.subscription?.metadata?.plan;
  if (String(meta || "").toLowerCase() === "annual") return "Annuel — 399 €/an";
  return "Mensuel — 49,99 €/mois";
}

async function retrieveCheckoutSession(sessionId) {
  if (!stripe) throw Object.assign(new Error("stripe_not_configured"), { code: "stripe_not_configured" });
  return stripe.checkout.sessions.retrieve(String(sessionId).trim(), { expand: ["subscription"] });
}

async function retrieveSubscription(subscriptionId) {
  if (!stripe) throw Object.assign(new Error("stripe_not_configured"), { code: "stripe_not_configured" });
  return stripe.subscriptions.retrieve(String(subscriptionId).trim());
}

function sessionIsPaidSubscription(session, extractCheckoutSubscriptionId) {
  if (!session || session.mode !== "subscription") return false;
  const payStatus = String(session.payment_status || "").toLowerCase();
  if (payStatus === "paid" || payStatus === "no_payment_required") return true;
  return !!extractCheckoutSubscriptionId(session);
}

export async function getCheckoutSuccessPreview({ sessionId, subscriptionId }) {
  if (!stripe) {
    return { ok: false, code: "stripe_not_configured", message: "Paiement non configuré." };
  }

  const {
    payerEmailFromCheckoutSession,
    extractCheckoutSubscriptionId,
    isStripeSubscriptionStatusPaying,
  } = await loadStripeSyncHelpers();

  let session = null;
  let stripeSubId = subscriptionId ? String(subscriptionId).trim() : null;

  if (sessionId && isValidCheckoutSessionId(sessionId)) {
    session = await retrieveCheckoutSession(sessionId);
    if (!sessionIsPaidSubscription(session, extractCheckoutSubscriptionId)) {
      return { ok: false, code: "payment_incomplete", message: "Paiement non finalisé ou session invalide." };
    }
    stripeSubId = extractCheckoutSubscriptionId(session) || stripeSubId;
  } else if (stripeSubId && isValidStripeSubscriptionId(stripeSubId)) {
    const sub = await retrieveSubscription(stripeSubId);
    if (!isStripeSubscriptionStatusPaying(sub.status)) {
      return { ok: false, code: "payment_incomplete", message: "Abonnement non actif." };
    }
  } else {
    return { ok: false, code: "invalid_reference", message: "Référence de paiement manquante ou invalide." };
  }

  if (!stripeSubId) {
    return { ok: false, code: "missing_subscription", message: "Abonnement introuvable pour cette session." };
  }

  const payerEmail = session ? payerEmailFromCheckoutSession(session) : null;
  const existingRow = getSubscriptionByStripeSubscriptionId(stripeSubId);
  const existingUser = existingRow?.user_id ? getUserById(String(existingRow.user_id)) : null;
  const emailMatchUser = payerEmail ? getUserByEmail(payerEmail) : null;

  return {
    ok: true,
    payer_email: payerEmail,
    plan_label: session ? planLabelFromSession(session) : "Abonnement Myfidpass",
    stripe_subscription_id: stripeSubId,
    already_claimed: !!(existingRow?.user_id && hasOperationalMerchantAccess(String(existingRow.user_id))),
    claimed_user_email: existingUser?.email || null,
    user_exists_for_payer_email: !!emailMatchUser,
  };
}

async function assertSubscriptionClaimable(stripeSubId, userId) {
  const existingRow = getSubscriptionByStripeSubscriptionId(stripeSubId);
  if (existingRow?.user_id && String(existingRow.user_id) !== String(userId)) {
    const err = new Error("Cet abonnement est déjà associé à un autre compte Myfidpass.");
    err.code = "subscription_already_claimed";
    throw err;
  }
}

export async function attachStripeSubscriptionToUser(stripeSubId, userId) {
  const { syncSubscriptionFromStripeObject, isStripeSubscriptionStatusPaying } =
    await loadStripeSyncHelpers();
  const sub = await retrieveSubscription(stripeSubId);
  if (!isStripeSubscriptionStatusPaying(sub.status)) {
    const err = new Error("Abonnement Stripe inactif.");
    err.code = "payment_incomplete";
    throw err;
  }
  await assertSubscriptionClaimable(sub.id, userId);
  await syncSubscriptionFromStripeObject(sub, userId);
  try {
    await stripe.subscriptions.update(sub.id, {
      metadata: { ...(sub.metadata || {}), user_id: String(userId) },
    });
  } catch (e) {
    console.warn("[stripe claim] metadata update:", e?.message || e);
  }
  return sub;
}

export async function claimCheckoutForUser({ sessionId, subscriptionId, userId }) {
  const { extractCheckoutSubscriptionId } = await loadStripeSyncHelpers();
  let stripeSubId = subscriptionId ? String(subscriptionId).trim() : null;
  if (sessionId && isValidCheckoutSessionId(sessionId)) {
    const session = await retrieveCheckoutSession(sessionId);
    if (!sessionIsPaidSubscription(session, extractCheckoutSubscriptionId)) {
      const err = new Error("Paiement non finalisé.");
      err.code = "payment_incomplete";
      throw err;
    }
    stripeSubId = extractCheckoutSubscriptionId(session) || stripeSubId;
  }
  if (!stripeSubId || !isValidStripeSubscriptionId(stripeSubId)) {
    const err = new Error("Référence d’abonnement invalide.");
    err.code = "invalid_reference";
    throw err;
  }
  await attachStripeSubscriptionToUser(stripeSubId, userId);
  return { stripe_subscription_id: stripeSubId };
}

export async function sendPostPurchaseWelcomeEmail(email, planLabel) {
  const to = String(email || "").trim().toLowerCase();
  if (!to) return { sent: false };
  const plan = planLabel || "Myfidpass Pro";
  const appUrl = (process.env.FRONTEND_URL || "https://myfidpass.fr").replace(/\/$/, "") + "/app";
  const getUrl = (process.env.FRONTEND_URL || "https://myfidpass.fr").replace(/\/$/, "") + "/get";
  return sendMail({
    to,
    subject: "Merci — votre abonnement Myfidpass est actif",
    text: `Merci pour votre achat.\n\nVotre abonnement ${plan} est maintenant actif sur Myfidpass.\n\nOuvrez l’application commerçant : ${appUrl}\nTéléchargez l’app mobile : ${getUrl}\n\n— L’équipe Myfidpass`,
    html: `<p>Merci pour votre achat.</p><p>Votre abonnement <strong>${plan}</strong> est maintenant actif sur Myfidpass.</p><p><a href="${appUrl}">Ouvrir l’espace commerçant</a> · <a href="${getUrl}">Télécharger l’app</a></p><p>— L’équipe Myfidpass</p>`,
  });
}

export async function sendClaimLoginCode({ email, sessionId, subscriptionId }) {
  const emailNorm = String(email || "").trim().toLowerCase();
  if (!emailNorm || !emailNorm.includes("@")) {
    return { ok: false, code: "invalid_email", message: "Adresse e-mail invalide." };
  }
  if (isReservedStaffEmailOnly(emailNorm)) {
    return { ok: false, code: "email_reserved", message: "Adresse e-mail invalide." };
  }

  const preview = await getCheckoutSuccessPreview({ sessionId, subscriptionId });
  if (!preview.ok) {
    return { ok: false, code: preview.code, message: preview.message };
  }

  const introText =
    "Merci pour votre achat Myfidpass. Utilisez ce code pour activer votre compte et accéder à votre abonnement.";
  const introHtml = `<p>Merci pour votre achat <strong>Myfidpass</strong>.</p><p>Utilisez ce code pour activer votre compte et accéder à votre abonnement.</p>`;

  const mail = await issueAndSendEmailOtp({
    to: emailNorm,
    subject: "Activez votre compte Myfidpass",
    introText,
    introHtml,
  });

  if (!mail.sent && process.env.NODE_ENV === "production") {
    return {
      ok: false,
      code: "email_send_failed",
      message: mail.humanError || "Impossible d’envoyer l’e-mail.",
    };
  }

  return { ok: true, plan_label: preview.plan_label };
}

function verifyOtpCode(emailNorm, code) {
  const row = getEmailOtpChallenge(emailNorm);
  if (!row) {
    return { ok: false, status: 400, message: "Aucun code en attente. Demandez un nouveau code." };
  }
  if (Date.parse(row.expires_at) < Date.now()) {
    deleteEmailOtpChallenge(emailNorm);
    return { ok: false, status: 400, message: "Code expiré. Demandez un nouveau code." };
  }
  if ((row.attempts || 0) >= EMAIL_OTP_MAX_ATTEMPTS) {
    deleteEmailOtpChallenge(emailNorm);
    return { ok: false, status: 429, message: "Trop de tentatives. Demandez un nouveau code." };
  }
  const expected = row.code_hash;
  const got = hashEmailOtp(emailNorm, String(code || "").trim());
  let a;
  let b;
  try {
    a = Buffer.from(expected, "hex");
    b = Buffer.from(got, "hex");
  } catch {
    incrementEmailOtpAttempts(emailNorm);
    return { ok: false, status: 401, message: "Code incorrect." };
  }
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    incrementEmailOtpAttempts(emailNorm);
    return { ok: false, status: 401, message: "Code incorrect." };
  }
  deleteEmailOtpChallenge(emailNorm);
  return { ok: true };
}

export async function verifyClaimAndIssueAuth({ email, code, sessionId, subscriptionId }) {
  const emailNorm = String(email || "").trim().toLowerCase();
  const otp = verifyOtpCode(emailNorm, code);
  if (!otp.ok) {
    return { ok: false, status: otp.status, message: otp.message };
  }

  const preview = await getCheckoutSuccessPreview({ sessionId, subscriptionId });
  if (!preview.ok) {
    return { ok: false, status: 400, code: preview.code, message: preview.message };
  }

  let user = getUserByEmail(emailNorm);
  let created = false;
  if (!user) {
    try {
      user = createUserWithEmailOtp({ email: emailNorm, name: null });
      created = true;
    } catch (e) {
      if (e?.code === "EMAIL_TAKEN") {
        user = getUserByEmail(emailNorm);
      } else {
        console.error("[claim verify] create user:", e);
        return { ok: false, status: 409, message: "Impossible de créer le compte." };
      }
    }
  }

  if (!user?.id) {
    return { ok: false, status: 500, message: "Compte introuvable." };
  }

  try {
    await claimCheckoutForUser({ sessionId, subscriptionId, userId: String(user.id) });
  } catch (e) {
    const codeErr = e?.code || "claim_failed";
    return {
      ok: false,
      status: codeErr === "subscription_already_claimed" ? 409 : 400,
      code: codeErr,
      message: e?.message || "Impossible d’activer l’abonnement.",
    };
  }

  try {
    await sendPostPurchaseWelcomeEmail(emailNorm, preview.plan_label);
  } catch (e) {
    console.warn("[claim verify] welcome email:", e?.message || e);
  }

  const tokens = issueAuthTokensForUser(user.id);
  return {
    ok: true,
    status: created ? 201 : 200,
    body: {
      ...getAuthPayloadForUser(user),
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      subscription_claimed: true,
    },
  };
}
