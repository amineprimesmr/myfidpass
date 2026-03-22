/**
 * Page choix d'offre / abonnement (redirection si déjà abonné, bouton Stripe).
 * Référence : REFONTE-REGLES.md — un module par écran.
 */
import { API_BASE, getAuthHeaders, isDevBypassPayment, setDevBypassPayment } from "../config.js";

export function initOffersPage() {
  (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.hasActiveSubscription || isDevBypassPayment()) {
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
      btnStarter.textContent = "Choisir — 49 €/mois";
    });
  }
}
