/**
 * Page tarifs /abonnement : choix forfait (mensuel / annuel) + paiement Stripe (Payment Element).
 */
import { API_BASE, getAuthHeaders, buildStripeSaasPaymentUrl } from "../config.js";
import { initEmbeddedSubscriptionCheckout } from "./embedded-subscription.js";

const root = typeof document !== "undefined" ? document.getElementById("offers-app") : null;

/** Accès opérationnel : abonnement actif, sans période d'essai « compte seul » en cours. */
function shouldRedirectLoggedInUserToApp(data) {
  if (!data) return false;
  const hasOp = !!(data.has_active_subscription ?? data.hasActiveSubscription);
  if (!hasOp) return false;
  const trialIso = data.merchant_trial_ends_at ?? data.merchantTrialEndsAt;
  if (trialIso != null && String(trialIso).trim() !== "") return false;
  return true;
}

function rememberAppEmbeddedFromUrl() {
  try {
    const u = new URL(window.location.href);
    if (u.searchParams.get("app_embedded") === "1") {
      sessionStorage.setItem("fidpass_app_embedded", "1");
    }
  } catch (_) {}
}

const HINTS = {
  monthly:
    "Forfait : 3 j gratuits, puis 1,00 € le 1er mois, renouvellement 49,99 €/mois. Enregistrez un moyen de paiement pour l’essai sur Stripe (carte, Apple Pay, Google Pay).",
  annual:
    "Forfait : 3 j gratuits, puis 399,00 € facturés l’année. Enregistrez un moyen de paiement (carte, Apple Pay, Google Pay).",
};

const LEGAL = {
  monthly:
    "Période d’essai 3 jours, puis 1,00 € le 1er mois (remise gérée par le coupon STRIPE) puis 49,99 €/mois sans engagement.",
  annual: "Période d’essai 3 jours, puis 399,00 €/an, renouvellement annuel, sans engagement sur la durée (résiliable).",
};

/**
 * @param {object} [route]
 * @param {boolean} [route.subscriptionLanding] — `/abonnement`
 */
export function initOffersPage(route = {}) {
  rememberAppEmbeddedFromUrl();

  const subscriptionLanding = route.subscriptionLanding === true;
  if (subscriptionLanding && root) {
    root.classList.add("offers-app--abonnement");
  }
  if (subscriptionLanding) {
    document.title = "Abonnement — Myfidpass";
    setText("#offers-title", "Abonnement commerçant");
    setText(
      "#offers-subtitle",
      "3 j offerts, puis 1,00 € le 1er mois (mensuel) ou 399,00 €/an (annuel) — mêmes règles sur le site (Stripe) et l’app (App Store / RevenueCat)."
    );
  } else {
    document.title = "Tarifs — Myfidpass";
    setText("#offers-title", "Choisissez votre forfait");
    setText("#offers-subtitle", "3 j offerts, sans engagement — même tarification que sur l’app.");
  }

  (async function bootstrap() {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, { headers: getAuthHeaders() });
      if (res.ok) {
        const meData = await res.json();
        if (shouldRedirectLoggedInUserToApp(meData)) {
          window.location.replace("/app");
          return;
        }
      } else {
        const redirectPath = subscriptionLanding ? "/abonnement" : "/choisir-offre";
        window.location.replace(`/creer-ma-carte?mode=login&redirect=${encodeURIComponent(redirectPath)}`);
        return;
      }
    } catch (e) {
      const errEl = document.getElementById("offers-payment-error");
      if (errEl) {
        errEl.textContent = e?.message || "Impossible de vérifier la session.";
        errEl.classList.remove("hidden");
      }
      return;
    }

    wirePlanButtons();
    resumeEmbeddedCheckoutIfNeeded();
  })();
}

function setText(sel, text) {
  const el = document.querySelector(sel);
  if (el) el.textContent = text;
}

let embeddedStarted = false;
/** @type {string|null} */
let firstEmbeddedPlan = null;

function startEmbeddedForPlan(plan) {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem("fidpass_checkout_plan", plan);
  }
  setText("#offers-checkout-title", plan === "annual" ? "Paiement — forfait annuel" : "Paiement — forfait mensuel");
  setText("#offers-selected-plan-hint", HINTS[plan] || "");
  const legal = document.getElementById("offers-trial-legal");
  if (legal) legal.textContent = LEGAL[plan] || "";

  const checkout = document.getElementById("offers-checkout-section");
  if (checkout) {
    checkout.classList.remove("hidden");
    try {
      checkout.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (_) {}
  }

  embeddedStarted = true;
  firstEmbeddedPlan = plan;
  initEmbeddedSubscriptionCheckout({
    plan,
    paymentElementContainerId: "offers-payment-element",
    submitButtonId: "offers-pay-submit",
    errorContainerId: "offers-payment-error",
    statusContainerId: "offers-payment-status",
  });
}

/**
 * Rechargement après un changement d’offre (impossible de réutiliser le même `client_secret` Stripe).
 */
function resumeEmbeddedCheckoutIfNeeded() {
  try {
    if (sessionStorage.getItem("fidpass_resume_checkout") !== "1") return;
    const plan = sessionStorage.getItem("fidpass_checkout_plan");
    sessionStorage.removeItem("fidpass_resume_checkout");
    if (plan === "monthly" || plan === "annual") {
      startEmbeddedForPlan(plan);
    }
  } catch (_) {}
}

function wirePlanButtons() {
  const goEmbedded = (plan) => {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("fidpass_checkout_plan", plan);
    }
    setText("#offers-checkout-title", plan === "annual" ? "Paiement — forfait annuel" : "Paiement — forfait mensuel");
    setText("#offers-selected-plan-hint", HINTS[plan] || "");
    const legal = document.getElementById("offers-trial-legal");
    if (legal) legal.textContent = LEGAL[plan] || "";

    const checkout = document.getElementById("offers-checkout-section");
    if (checkout) {
      checkout.classList.remove("hidden");
      try {
        checkout.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (_) {}
    }

    if (embeddedStarted && firstEmbeddedPlan && firstEmbeddedPlan !== plan) {
      try {
        sessionStorage.setItem("fidpass_resume_checkout", "1");
        sessionStorage.setItem("fidpass_checkout_plan", plan);
      } catch (_) {}
      window.location.reload();
      return;
    }
    if (embeddedStarted) {
      return;
    }
    startEmbeddedForPlan(plan);
  };

  document.getElementById("offers-btn-monthly")?.addEventListener("click", () => {
    goEmbedded("monthly");
  });
  document.getElementById("offers-btn-annual")?.addEventListener("click", () => {
    goEmbedded("annual");
  });

  document.getElementById("offers-change-plan")?.addEventListener("click", () => {
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem("fidpass_checkout_plan");
      }
    } catch (_) {}
    window.location.reload();
  });
}

/**
 * Paiement hébergé (fallback) — utilisé seulement si l’on réintroduit un lien de secours côté UI.
 */
export function getStripeHostedPaymentUrl(email) {
  return buildStripeSaasPaymentUrl(email);
}
