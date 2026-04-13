/**
 * Page choix d'offre / abonnement : redirection vers le Payment Link Stripe (checkout hébergé).
 */
import {
  API_BASE,
  getAuthHeaders,
  isDevBypassPayment,
  setDevBypassPayment,
  buildStripeSaasPaymentUrl,
} from "../config.js";

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
        "Vous allez être redirigé vers une page de paiement sécurisée Stripe (carte, Apple Pay ou Google Pay). Le code promo partenaire est déjà appliqué.";
    }
  } else {
    document.title = "Tarifs — Myfidpass";
    const titleEl = document.querySelector("#offers-title");
    if (titleEl) titleEl.textContent = "Souscrire à Myfidpass";
    const subEl = document.querySelector("#offers-subtitle");
    if (subEl) {
      subEl.textContent =
        "Accès complet au logiciel, aux cartes Wallet et à l’application commerçant. Redirection vers le paiement sécurisé Stripe.";
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
      let meData = null;
      if (res.ok) {
        meData = await res.json();
        if (shouldRedirectLoggedInUserToApp(meData)) {
          window.location.replace("/app");
          return;
        }
      }

      const email = meData?.user?.email != null ? String(meData.user.email).trim() : "";
      window.location.href = buildStripeSaasPaymentUrl(email);
      return;
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
