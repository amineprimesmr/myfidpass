/**
 * Page choix d'offre / abonnement (publique : sans compte → inscription, puis Stripe).
 * Référence : REFONTE-REGLES.md — un module par écran.
 */
import {
  API_BASE,
  getAuthToken,
  getAuthHeaders,
  isDevBypassPayment,
  setDevBypassPayment,
} from "../config.js";
import { navigateToLanding } from "../router/index.js";

/** Essai sans compte app : même lien que l’ancien parcours onboarding (Stripe collecte l’email). */
const STRIPE_PAYMENT_LINK = "https://buy.stripe.com/7sYcN53Z72N88et4Cr8Zq01";

export function initOffersPage() {
  document.querySelectorAll(".offers-pricing-back").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      navigateToLanding().catch((err) => console.error("[Myfidpass] retour accueil", err));
    });
  });

  const btnStarter = document.getElementById("offers-btn-starter");
  if (btnStarter) {
    btnStarter.textContent = getAuthToken()
      ? "Continuer — 49 €/mois (7 jours gratuits)"
      : "Essayer gratuitement";
  }

  (async () => {
    if (!getAuthToken()) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.hasActiveSubscription || isDevBypassPayment()) {
          window.location.replace("/app");
        }
      }
    } catch (_) {}
  })();

  const devBypassBtn = document.getElementById("offers-dev-bypass-btn");
  if (devBypassBtn) {
    devBypassBtn.addEventListener("click", () => {
      setDevBypassPayment(true);
      window.location.replace("/app");
    });
  }

  if (btnStarter) {
    btnStarter.addEventListener("click", async () => {
      if (!getAuthToken()) {
        window.location.href = STRIPE_PAYMENT_LINK;
        return;
      }
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
      btnStarter.textContent = "Continuer — 49 €/mois (7 jours gratuits)";
    });
  }
}
