/**
 * Abonnement intégré sur myfidpass.fr (Stripe Payment Element : carte, Apple Pay, Google Pay).
 * Pas de redirection vers checkout.stripe.com.
 */
import { API_BASE, STRIPE_PUBLISHABLE_KEY, getAuthHeaders } from "../config.js";

const STRIPE_JS = "https://js.stripe.com/v3/";

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (src === STRIPE_JS && window.Stripe) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Chargement Stripe.js impossible"));
    document.head.appendChild(s);
  });
}

function showError(containerId, message) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("hidden", !message);
}

function clearError(containerId) {
  showError(containerId, "");
}

function setLoadingVisible(visible) {
  const el = document.getElementById("offers-payment-loading");
  const wrap = document.getElementById("offers-payment-element-wrap");
  if (el) el.classList.toggle("hidden", !visible);
  if (wrap && visible) wrap.classList.add("hidden");
  if (wrap && !visible) wrap.classList.remove("hidden");
}

/** @returns {boolean} */
function isAppEmbeddedSession() {
  try {
    if (sessionStorage.getItem("fidpass_app_embedded") === "1") return true;
    const u = new URL(window.location.href);
    return u.searchParams.get("app_embedded") === "1";
  } catch (_) {
    return false;
  }
}

function rememberAppEmbeddedFromUrl() {
  try {
    const u = new URL(window.location.href);
    if (u.searchParams.get("app_embedded") === "1") {
      sessionStorage.setItem("fidpass_app_embedded", "1");
    }
  } catch (_) {}
}

async function finalizeSuccess(pathnameForHistoryClean, statusId) {
  const statusEl = document.getElementById(statusId);
  if (statusEl) {
    statusEl.classList.remove("hidden");
    statusEl.textContent = "Activation de votre abonnement…";
  }

  await fetch(`${API_BASE}/api/payment/reconcile-subscription`, {
    method: "POST",
    headers: getAuthHeaders(),
  }).catch(() => {});

  let ok = false;
  for (let i = 0; i < 14; i++) {
    if (i) await new Promise((r) => setTimeout(r, 1200));
    const me = await fetch(`${API_BASE}/api/auth/me`, { headers: getAuthHeaders() });
    if (!me.ok) continue;
    const d = await me.json().catch(() => ({}));
    const hasOp = !!(d.has_active_subscription ?? d.hasActiveSubscription);
    const trialIso = d.merchant_trial_ends_at ?? d.merchantTrialEndsAt;
    const paid = hasOp && (trialIso == null || String(trialIso).trim() === "");
    if (paid) {
      ok = true;
      break;
    }
  }

  try {
    window.history.replaceState({}, "", pathnameForHistoryClean || window.location.pathname);
  } catch (_) {}

  if (ok) {
    if (isAppEmbeddedSession()) {
      window.location.replace("myfidpass://subscription-paid");
      return;
    }
    window.location.replace("/app");
    return;
  }

  if (statusEl) {
    statusEl.textContent =
      "Paiement bien reçu — la mise à jour de votre compte peut prendre une minute. Rechargez cette page ou votre application.";
  }
}

async function handleConfirmReturn(stripe, url, pathnameBase, statusId, errorId) {
  const redirectStatus = url.searchParams.get("redirect_status");
  const clientSecret = url.searchParams.get("payment_intent_client_secret");

  if (redirectStatus === "failed") {
    showError(errorId, "Le paiement a échoué ou a été annulé.");
    try {
      window.history.replaceState({}, "", pathnameBase);
    } catch (_) {}
    return;
  }

  if (clientSecret) {
    const { error, paymentIntent } = await stripe.retrievePaymentIntent(clientSecret);
    if (error) {
      showError(errorId, error.message);
      try {
        window.history.replaceState({}, "", pathnameBase);
      } catch (_) {}
      return;
    }
    if (paymentIntent?.status !== "succeeded") {
      showError(errorId, "Paiement non confirmé. Réessayez ou utilisez un autre moyen.");
      try {
        window.history.replaceState({}, "", pathnameBase);
      } catch (_) {}
      return;
    }
  } else if (redirectStatus !== "succeeded") {
    showError(errorId, "Retour de paiement incomplet.");
    try {
      window.history.replaceState({}, "", pathnameBase);
    } catch (_) {}
    return;
  }

  await finalizeSuccess(pathnameBase, statusId);
}

/**
 * @param {object} opts
 * @param {string} [opts.paymentElementContainerId]
 * @param {string} [opts.submitButtonId]
 * @param {string} [opts.errorContainerId]
 * @param {string} [opts.statusContainerId]
 */
export async function initEmbeddedSubscriptionCheckout(opts) {
  rememberAppEmbeddedFromUrl();

  const paymentElementContainerId = opts.paymentElementContainerId || "offers-payment-element";
  const submitButtonId = opts.submitButtonId || "offers-pay-submit";
  const errorContainerId = opts.errorContainerId || "offers-payment-error";
  const statusContainerId = opts.statusContainerId || "offers-payment-status";
  const pathnameBase = typeof window !== "undefined" ? window.location.pathname : "/abonnement";

  if (!STRIPE_PUBLISHABLE_KEY || !String(STRIPE_PUBLISHABLE_KEY).startsWith("pk_")) {
    setLoadingVisible(false);
    showError(
      errorContainerId,
      "Clé publique Stripe absente du site. Sur Vercel : vérifiez VITE_STRIPE_PUBLISHABLE_KEY, puis Déploiements → Redeploy (obligatoire : les variables VITE_* sont lues seulement au build, pas à l’exécution)."
    );
    return;
  }

  try {
    await loadScript(STRIPE_JS);
  } catch (e) {
    setLoadingVisible(false);
    showError(errorContainerId, e?.message || "Impossible de charger le module de paiement.");
    return;
  }

  const stripe = window.Stripe(STRIPE_PUBLISHABLE_KEY);
  const url = new URL(window.location.href);

  if (url.searchParams.get("subscription_confirm") === "1") {
    setLoadingVisible(false);
    await handleConfirmReturn(stripe, url, pathnameBase, statusContainerId, errorContainerId);
    return;
  }

  clearError(errorContainerId);

  const res = await fetch(`${API_BASE}/api/payment/create-embedded-subscription`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));

  if (res.status === 409 && data.code === "already_subscribed") {
    window.location.replace("/app");
    return;
  }

  if (!res.ok) {
    setLoadingVisible(false);
    if (res.status === 503 && data.code === "stripe_not_configured") {
      showError(errorContainerId, "Paiement temporairement indisponible.");
    } else {
      showError(errorContainerId, data.error || "Impossible de préparer le paiement.");
    }
    return;
  }

  const clientSecret = data.client_secret;
  if (!clientSecret) {
    setLoadingVisible(false);
    showError(errorContainerId, "Réponse serveur incomplète.");
    return;
  }

  const appearance = {
    theme: "stripe",
    variables: {
      colorPrimary: "#0f172a",
      colorBackground: "#ffffff",
      colorText: "#0f172a",
      colorDanger: "#b91c1c",
      fontFamily: "Outfit, system-ui, -apple-system, sans-serif",
      borderRadius: "12px",
      spacingUnit: "3px",
    },
    rules: {
      ".Tab": { border: "1px solid #e2e8f0", boxShadow: "none" },
      ".Tab:hover": { color: "#0f172a" },
      ".Tab--selected": { borderColor: "#0f172a" },
    },
  };

  const elements = stripe.elements({ clientSecret, appearance });
  const paymentElement = elements.create("payment", {
    layout: { type: "tabs", defaultCollapsed: false },
    wallets: {
      applePay: "auto",
      googlePay: "auto",
    },
  });

  const mountTarget = document.getElementById(paymentElementContainerId);
  if (!mountTarget) {
    setLoadingVisible(false);
    showError(errorContainerId, "Interface de paiement introuvable.");
    return;
  }

  paymentElement.mount(`#${paymentElementContainerId}`);
  setLoadingVisible(false);

  const submitBtn = document.getElementById(submitButtonId);
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.addEventListener("click", async () => {
      submitBtn.disabled = true;
      clearError(errorContainerId);
      const returnUrl = `${window.location.origin}${pathnameBase}?subscription_confirm=1`;
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: returnUrl,
        },
      });
      if (error) {
        showError(errorContainerId, error.message);
        submitBtn.disabled = false;
      }
    });
  }
}
