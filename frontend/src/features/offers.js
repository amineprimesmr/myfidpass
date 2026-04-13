/**
 * Page choix d'offre / abonnement (redirection si déjà abonné payant, bouton Stripe).
 * Référence : REFONTE-REGLES.md — un module par écran.
 */
import { API_BASE, getAuthHeaders, isDevBypassPayment, setDevBypassPayment } from "../config.js";

/** Accès opérationnel sans être en fenêtre d’essai 24 h = abonnement Stripe (ou équivalent). */
function shouldRedirectLoggedInUserToApp(data) {
  if (isDevBypassPayment()) return true;
  if (!data) return false;
  const hasOp = !!(data.has_active_subscription ?? data.hasActiveSubscription);
  if (!hasOp) return false;
  const trialIso = data.merchant_trial_ends_at ?? data.merchantTrialEndsAt;
  if (trialIso != null && String(trialIso).trim() !== "") return false;
  return true;
}

/**
 * @param {object} [route]
 * @param {boolean} [route.subscriptionLanding] — `/abonnement` (CTA pastille app)
 */
export function initOffersPage(route = {}) {
  const subscriptionLanding = route.subscriptionLanding === true;

  if (subscriptionLanding) {
    const root = document.getElementById("offers-app");
    if (root) root.classList.add("offers-app--abonnement");
    document.title = "Abonnement — Myfidpass";
    const titleEl = document.querySelector("#offers-app .offers-title");
    if (titleEl) titleEl.textContent = "Abonnez-vous pour 1 €";
    const subEl = document.querySelector("#offers-app .offers-subtitle");
    if (subEl) {
      subEl.textContent =
        "Finalisez votre abonnement en toute sécurité (Stripe). Après votre essai de 24 h, un paiement est nécessaire pour conserver l’accès complet.";
    }
    const btn = document.getElementById("offers-btn-starter");
    if (btn) btn.textContent = "Payer et continuer";
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
    } catch (_) {}
  })();

  const devBypassWrap = document.getElementById("offers-dev-bypass-wrap");
  const devBypassBtn = document.getElementById("offers-dev-bypass-btn");
  if (devBypassBtn) {
    devBypassBtn.addEventListener("click", () => {
      setDevBypassPayment(true);
      window.location.replace("/app");
    });
  }

  const btnStarter = document.getElementById("offers-btn-starter");
  if (btnStarter) {
    btnStarter.addEventListener("click", async () => {
      btnStarter.disabled = true;
      btnStarter.textContent = "Redirection…";
      try {
        const res = await fetch(`${API_BASE}/api/payment/create-checkout-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ planId: "starter" }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.url) {
          window.location.href = data.url;
          return;
        }
        if (res.status === 503 && (data.code === "stripe_not_configured" || data.error?.includes("configuré"))) {
          window.location.replace("/app");
          return;
        }
        alert(data.error || "Impossible de créer la session de paiement. Vous pouvez accéder à l'espace directement.");
        window.location.replace("/app");
      } catch (_) {
        alert("Erreur réseau. Vous pouvez accéder à l'espace directement.");
        window.location.replace("/app");
      }
      btnStarter.disabled = false;
      btnStarter.textContent = subscriptionLanding ? "Payer et continuer" : "Choisir — 49 €/mois";
    });
  }
}
