/**
 * Page choix d'offre / abonnement : paiement intégré (Stripe Payment Element), sans checkout hébergé.
 */
import { API_BASE, getAuthHeaders, isDevBypassPayment, setDevBypassPayment } from "../config.js";
import { initEmbeddedSubscriptionCheckout } from "./embedded-subscription.js";

/** Accès opérationnel sans fenêtre d’essai 24 h = abonnement Stripe payant. */
function shouldRedirectLoggedInUserToApp(data) {
  if (isDevBypassPayment()) return true;
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

/**
 * @param {object} [route]
 * @param {boolean} [route.subscriptionLanding] — `/abonnement`
 */
export function initOffersPage(route = {}) {
  rememberAppEmbeddedFromUrl();

  const subscriptionLanding = route.subscriptionLanding === true;
  const root = document.getElementById("offers-app");

  if (subscriptionLanding) {
    if (root) root.classList.add("offers-app--abonnement");
    document.title = "Abonnement — Myfidpass";
    const titleEl = document.querySelector("#offers-title");
    if (titleEl) titleEl.textContent = "Abonnez-vous pour 1 €";
    const subEl = document.querySelector("#offers-subtitle");
    if (subEl) {
      subEl.textContent =
        "Réglez en quelques secondes sur cette page (carte, Apple Pay ou Google Pay). Après l’essai de 24 h, ce paiement débloque votre abonnement sans quitter Myfidpass.";
    }
  } else {
    document.title = "Tarifs — Myfidpass";
    const titleEl = document.querySelector("#offers-title");
    if (titleEl) titleEl.textContent = "Souscrire à Myfidpass";
    const subEl = document.querySelector("#offers-subtitle");
    if (subEl) {
      subEl.textContent =
        "Accès complet au logiciel, aux cartes Wallet et à l’application commerçant. Paiement sécurisé ci-dessous, sans quitter le site.";
    }
  }

  const devBypassBtn = document.getElementById("offers-dev-bypass-btn");
  if (devBypassBtn) {
    devBypassBtn.addEventListener("click", () => {
      setDevBypassPayment(true);
      window.location.replace("/app");
    });
  }

  (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (shouldRedirectLoggedInUserToApp(data)) {
          window.location.replace("/app");
          return;
        }
      }
      await initEmbeddedSubscriptionCheckout({
        paymentElementContainerId: "offers-payment-element",
        submitButtonId: "offers-pay-submit",
        errorContainerId: "offers-payment-error",
        statusContainerId: "offers-payment-status",
      });
    } catch (e) {
      const errEl = document.getElementById("offers-payment-error");
      if (errEl) {
        errEl.textContent = e?.message || "Erreur lors du chargement du paiement.";
        errEl.classList.remove("hidden");
      }
      const loadEl = document.getElementById("offers-payment-loading");
      if (loadEl) loadEl.classList.add("hidden");
    }
  })();
}
