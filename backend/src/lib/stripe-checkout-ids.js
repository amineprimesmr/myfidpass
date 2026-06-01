/** Validation des identifiants Stripe (sans dépendance au routeur payment). */

const CHECKOUT_SESSION_RE = /^cs_[a-zA-Z0-9_]+$/;
const SUBSCRIPTION_ID_RE = /^sub_[a-zA-Z0-9_]+$/;

export function isValidCheckoutSessionId(id) {
  return typeof id === "string" && CHECKOUT_SESSION_RE.test(id.trim());
}

export function isValidStripeSubscriptionId(id) {
  return typeof id === "string" && SUBSCRIPTION_ID_RE.test(id.trim());
}
