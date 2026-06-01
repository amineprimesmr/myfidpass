/**
 * Réclamation d’un abonnement Stripe après Payment Link / Checkout (sans compte au moment du paiement).
 */
import Stripe from "stripe";
import {
  createUserWithEmailOtp,
  getSubscriptionByStripeSubscriptionId,
  getUserByEmail,
  getUserById,
  hasOperationalMerchantAccess,
  getBusinessesByUserId,
} from "../db.js";
import { sendMail } from "../email.js";
import { isReservedStaffEmailOnly } from "../db/users.js";
import { issueAuthTokensForUser, getAuthPayloadForUser } from "../routes/auth-tokens.js";
import {
  isValidCheckoutSessionId,
  isValidStripeSubscriptionId,
} from "./stripe-checkout-ids.js";
import { finalizeBusinessForClaimedUser } from "./bootstrap-first-business.js";
import {
  createPaymentClaimToken,
  parsePaymentClaimToken,
  buildPaymentClaimConfirmUrl,
} from "./payment-claim-token.js";

async function loadStripeSyncHelpers() {
  const mod = await import("../routes/payment.js");
  return {
    syncSubscriptionFromStripeObject: mod.syncSubscriptionFromStripeObject,
    payerEmailFromCheckoutSession: mod.payerEmailFromCheckoutSession,
    extractCheckoutSubscriptionId: mod.extractCheckoutSubscriptionId,
    isStripeSubscriptionStatusPaying: mod.isStripeSubscriptionStatusPaying,
    subscriptionRowStatusFromStripeObject: mod.subscriptionRowStatusFromStripeObject,
  };
}

const stripe =
  process.env.STRIPE_SECRET_KEY && String(process.env.STRIPE_SECRET_KEY).startsWith("sk_")
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

function planLabelFromSession(session) {
  const meta = session?.metadata?.plan || session?.subscription?.metadata?.plan;
  if (String(meta || "").toLowerCase() === "annual") return "Annuel — 399 €/an";
  return "Mensuel — 49,99 €/mois";
}

async function retrieveCheckoutSession(sessionId) {
  if (!stripe) throw Object.assign(new Error("stripe_not_configured"), { code: "stripe_not_configured" });
  return stripe.checkout.sessions.retrieve(String(sessionId).trim(), { expand: ["subscription"] });
}

async function retrieveSubscriptionExpanded(subscriptionId) {
  if (!stripe) throw Object.assign(new Error("stripe_not_configured"), { code: "stripe_not_configured" });
  return stripe.subscriptions.retrieve(String(subscriptionId).trim(), {
    expand: ["pending_setup_intent", "latest_invoice.payment_intent"],
  });
}

async function subscriptionIsClaimable(stripeSub, checkoutSession, helpers) {
  const { extractCheckoutSubscriptionId, isStripeSubscriptionStatusPaying, subscriptionRowStatusFromStripeObject } =
    helpers;

  if (checkoutSession && sessionIsPaidSubscription(checkoutSession, extractCheckoutSubscriptionId)) {
    return true;
  }

  const raw = String(stripeSub?.status || "").toLowerCase();
  if (isStripeSubscriptionStatusPaying(raw)) return true;

  const normalized = subscriptionRowStatusFromStripeObject(stripeSub);
  if (isStripeSubscriptionStatusPaying(normalized)) return true;

  return false;
}

async function loadClaimSession(sessionId) {
  if (!sessionId || !isValidCheckoutSessionId(sessionId)) return null;
  return retrieveCheckoutSession(sessionId);
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
    const sub = await retrieveSubscriptionExpanded(stripeSubId);
    const helpers = await loadStripeSyncHelpers();
    if (!(await subscriptionIsClaimable(sub, null, helpers))) {
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
  const claimedBusinesses = existingUser ? getBusinessesByUserId(String(existingUser.id)) : [];
  const payerBusinesses = emailMatchUser ? getBusinessesByUserId(String(emailMatchUser.id)) : [];

  return {
    ok: true,
    payer_email: payerEmail,
    plan_label: session ? planLabelFromSession(session) : "Abonnement Myfidpass",
    stripe_subscription_id: stripeSubId,
    already_claimed: !!(existingRow?.user_id && hasOperationalMerchantAccess(String(existingRow.user_id))),
    claimed_user_email: existingUser?.email || null,
    user_exists_for_payer_email: !!emailMatchUser,
    has_business: claimedBusinesses.length > 0 || payerBusinesses.length > 0,
    business_name: claimedBusinesses[0]?.name || payerBusinesses[0]?.name || null,
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

export async function attachStripeSubscriptionToUser(stripeSubId, userId, checkoutSession = null) {
  const helpers = await loadStripeSyncHelpers();
  const { syncSubscriptionFromStripeObject } = helpers;
  const sub = await retrieveSubscriptionExpanded(stripeSubId);

  if (!(await subscriptionIsClaimable(sub, checkoutSession, helpers))) {
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
  const helpers = await loadStripeSyncHelpers();
  const { extractCheckoutSubscriptionId } = helpers;
  const checkoutSession = await loadClaimSession(sessionId);
  let stripeSubId = subscriptionId ? String(subscriptionId).trim() : null;

  if (checkoutSession) {
    if (!sessionIsPaidSubscription(checkoutSession, extractCheckoutSubscriptionId)) {
      const err = new Error("Paiement non finalisé.");
      err.code = "payment_incomplete";
      throw err;
    }
    stripeSubId = extractCheckoutSubscriptionId(checkoutSession) || stripeSubId;
  }

  if (!stripeSubId || !isValidStripeSubscriptionId(stripeSubId)) {
    const err = new Error("Référence d’abonnement invalide.");
    err.code = "invalid_reference";
    throw err;
  }

  await attachStripeSubscriptionToUser(stripeSubId, userId, checkoutSession);
  return { stripe_subscription_id: stripeSubId };
}

export async function sendPostPurchaseWelcomeEmail(email, planLabel) {
  const to = String(email || "").trim().toLowerCase();
  if (!to) return { sent: false };
  const plan = planLabel || "Myfidpass Pro";
  const appUrl = (process.env.FRONTEND_URL || "https://myfidpass.fr").replace(/\/$/, "") + "/get?welcome=1&stay=1";
  const getUrl = appUrl;
  return sendMail({
    to,
    subject: "Merci — votre abonnement Myfidpass est actif",
    text: `Merci pour votre achat.\n\nVotre abonnement Myfidpass est actif.\n\nTéléchargez l’app commerçant : ${getUrl}\n\n— L’équipe Myfidpass`,
    html: `<p>Merci pour votre achat.</p><p>Votre abonnement <strong>Myfidpass</strong> est actif.</p><p><a href="${getUrl}">Télécharger l’app commerçant</a></p><p>— L’équipe Myfidpass</p>`,
  });
}

export async function sendClaimLoginLink({
  email,
  sessionId,
  subscriptionId,
  establishment_name,
  google_place_id,
}) {
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

  if (
    preview.already_claimed &&
    preview.claimed_user_email &&
    preview.claimed_user_email.toLowerCase() !== emailNorm
  ) {
    return {
      ok: false,
      code: "subscription_already_claimed",
      message: `Cet abonnement est déjà actif sur ${preview.claimed_user_email}. Utilisez cette adresse e-mail.`,
    };
  }

  const token = createPaymentClaimToken({
    email: emailNorm,
    sessionId,
    subscriptionId,
    establishment_name: establishment_name || null,
    google_place_id: google_place_id || null,
  });
  const confirmUrl = buildPaymentClaimConfirmUrl(token);

  const mail = await sendMail({
    to: emailNorm,
    subject: "Merci — activez votre compte Myfidpass",
    text: `Merci pour votre achat Myfidpass.\n\nCliquez sur le lien ci-dessous pour confirmer votre e-mail et télécharger l’application commerçant :\n\n${confirmUrl}\n\nCe lien est valable 48 heures.\n\n— L’équipe Myfidpass`,
    html: `<p>Merci pour votre achat <strong>Myfidpass</strong>.</p><p>Confirmez votre e-mail et accédez à l’application en un clic :</p><p><a href="${confirmUrl}" style="display:inline-block;padding:14px 24px;background:#18181b;color:#fff;text-decoration:none;border-radius:12px;font-weight:600">Télécharger l’app Myfidpass</a></p><p style="color:#666;font-size:13px">Ou copiez ce lien : ${confirmUrl}</p><p style="color:#888;font-size:12px">Lien valable 48 heures.</p><p>— L’équipe Myfidpass</p>`,
  });

  if (!mail?.sent && process.env.NODE_ENV === "production") {
    return {
      ok: false,
      code: "email_send_failed",
      message: "Impossible d’envoyer l’e-mail. Réessayez dans un instant.",
    };
  }

  return { ok: true, email_sent: true };
}

/** @deprecated alias — envoie un lien e-mail (plus de code OTP). */
export const sendClaimLoginCode = sendClaimLoginLink;

function buildClaimAuthBody(user, tokens, business) {
  return {
    ...getAuthPayloadForUser(user),
    token: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    subscription_claimed: true,
    business: business
      ? { id: business.id, name: business.name, slug: business.slug }
      : undefined,
  };
}

export async function completePaymentClaim({
  email,
  sessionId,
  subscriptionId,
  establishment_name,
  google_place_id,
}) {
  const emailNorm = String(email || "").trim().toLowerCase();
  const preview = await getCheckoutSuccessPreview({ sessionId, subscriptionId });
  if (!preview.ok) {
    return { ok: false, status: 400, code: preview.code, message: preview.message };
  }

  if (
    preview.already_claimed &&
    preview.claimed_user_email &&
    preview.claimed_user_email.toLowerCase() === emailNorm
  ) {
    const linkedUser = getUserByEmail(emailNorm);
    if (linkedUser?.id && hasOperationalMerchantAccess(String(linkedUser.id))) {
      const bizResult = await finalizeBusinessForClaimedUser(String(linkedUser.id), {
        establishment_name,
        google_place_id,
      });
      if (!bizResult.ok) {
        return {
          ok: false,
          status: bizResult.code === "business_place_already_linked" ? 409 : 400,
          code: bizResult.code,
          message: bizResult.message,
        };
      }
      const tokens = issueAuthTokensForUser(linkedUser.id);
      return {
        ok: true,
        status: 200,
        body: buildClaimAuthBody(linkedUser, tokens, bizResult.business),
      };
    }
  }

  if (
    preview.already_claimed &&
    preview.claimed_user_email &&
    preview.claimed_user_email.toLowerCase() !== emailNorm
  ) {
    return {
      ok: false,
      status: 409,
      code: "subscription_already_claimed",
      message: `Cet abonnement est déjà actif sur ${preview.claimed_user_email}.`,
    };
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
        console.error("[claim complete] create user:", e);
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

  const bizResult = await finalizeBusinessForClaimedUser(String(user.id), {
    establishment_name,
    google_place_id,
  });
  if (!bizResult.ok) {
    return {
      ok: false,
      status: bizResult.code === "business_place_already_linked" ? 409 : 400,
      code: bizResult.code,
      message: bizResult.message,
    };
  }

  const tokens = issueAuthTokensForUser(user.id);
  return {
    ok: true,
    status: created ? 201 : 200,
    body: buildClaimAuthBody(user, tokens, bizResult.business),
  };
}

export async function confirmClaimFromToken(token) {
  const parsed = parsePaymentClaimToken(token);
  if (!parsed.ok) {
    return { ok: false, status: 400, code: parsed.code, message: parsed.message };
  }
  const p = parsed.payload;
  return completePaymentClaim({
    email: p.email,
    sessionId: p.sessionId,
    subscriptionId: p.subscriptionId,
    establishment_name: p.establishment_name,
    google_place_id: p.google_place_id,
  });
}

/** @deprecated — préférer confirmClaimFromToken (lien e-mail). */
export async function verifyClaimAndIssueAuth(input) {
  return completePaymentClaim(input);
}
