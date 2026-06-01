import { API_BASE, getAuthToken, setAuthToken, setRefreshToken } from "../config.js";
import { parseCheckoutSessionId } from "./post-purchase-app-modal.js";
import { initPostPaymentPlacesSearch } from "./post-payment-places-search.js";

const SUBSCRIPTION_ID_RE = /^sub_[a-zA-Z0-9_]+$/;

function parseSubscriptionId(search) {
  const id = new URLSearchParams(search || "").get("subscription_id");
  if (!id || !SUBSCRIPTION_ID_RE.test(id)) return null;
  return id;
}

function checkoutQuery(sessionId, subscriptionId) {
  const sp = new URLSearchParams();
  if (sessionId) sp.set("session_id", sessionId);
  if (subscriptionId) sp.set("subscription_id", subscriptionId);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

function show(el) {
  el?.classList.remove("hidden");
}
function hide(el) {
  el?.classList.add("hidden");
}

function setStep(active) {
  document.getElementById("post-pay-step-1")?.classList.toggle("is-active", active === 1);
  document.getElementById("post-pay-step-2")?.classList.toggle("is-active", active === 2);
}

function redirectToGetApp(commerceName) {
  const params = new URLSearchParams({ welcome: "1", stay: "1" });
  if (commerceName) params.set("commerce", commerceName);
  window.location.replace(`/get?${params.toString()}`);
}

function setError(msg) {
  hide(document.getElementById("post-pay-thanks-loading"));
  hide(document.getElementById("post-pay-thanks-main"));
  hide(document.getElementById("post-pay-thanks-done"));
  const err = document.getElementById("post-pay-thanks-error");
  const txt = document.getElementById("post-pay-thanks-error-text");
  if (txt) txt.textContent = msg;
  show(err);
}

/** @param {{ sessionId?: string | null, subscriptionId?: string | null }} refs */
export async function mountPostPaymentThanksPage(refs) {
  const loading = document.getElementById("post-pay-thanks-loading");
  const mainCard = document.getElementById("post-pay-thanks-main");
  const setupForm = document.getElementById("post-pay-thanks-setup-form");
  const codeForm = document.getElementById("post-pay-thanks-code-form");
  const emailInput = document.getElementById("post-pay-thanks-email");
  const codeInput = document.getElementById("post-pay-thanks-code");
  const emailDisplay = document.getElementById("post-pay-thanks-email-display");
  const doneEl = document.getElementById("post-pay-thanks-done");
  const commerceField = document.getElementById("post-pay-commerce-field");

  const { sessionId, subscriptionId } = refs;
  if (!sessionId && !subscriptionId) {
    setError("Lien incomplet. Reprenez depuis la confirmation Stripe ou contactez le support.");
    return;
  }

  const q = checkoutQuery(sessionId, subscriptionId);
  let requiresCommerce = true;
  /** @type {{ establishmentName: string, placeId: string } | null} */
  let pendingCommerce = null;

  const placesSearch = initPostPaymentPlacesSearch({
    inputId: "post-pay-commerce",
    placeIdInputId: "post-pay-place-id",
    wrapId: "post-pay-commerce-wrap",
  });

  if (getAuthToken()) {
    try {
      const res = await fetch(`${API_BASE}/api/payment/claim/attach`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ session_id: sessionId, subscription_id: subscriptionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.token) {
        setAuthToken(data.token);
        if (data.refreshToken) setRefreshToken(data.refreshToken);
        hide(loading);
        show(doneEl);
        window.setTimeout(() => redirectToGetApp(null), 900);
        return;
      }
    } catch {
      /* continue */
    }
  }

  let preview = null;
  try {
    const res = await fetch(`${API_BASE}/api/payment/checkout-success${q}`);
    preview = await res.json().catch(() => ({}));
    if (!res.ok || !preview.ok) {
      setError(preview.message || "Paiement introuvable ou non finalisé.");
      return;
    }
  } catch {
    setError("Impossible de contacter le serveur. Réessayez dans un instant.");
    return;
  }

  hide(loading);
  show(mainCard);

  if (preview.payer_email && emailInput) {
    emailInput.value = preview.payer_email;
  }

  if (preview.has_business) {
    requiresCommerce = false;
    hide(commerceField);
    const lead = document.getElementById("post-pay-thanks-lead");
    if (lead) {
      lead.textContent = "Votre commerce est déjà configuré. Confirmez votre e-mail pour accéder à l’app.";
    }
  }

  if (preview.already_claimed && preview.claimed_user_email) {
    const claimed = preview.claimed_user_email;
    const lead = document.getElementById("post-pay-thanks-lead");
    if (lead) {
      lead.textContent = preview.has_business
        ? `Abonnement actif sur ${claimed}. Confirmez votre e-mail pour télécharger l’app.`
        : `Abonnement actif sur ${claimed}. Indiquez votre commerce puis confirmez votre e-mail.`;
    }
    if (emailInput) emailInput.value = claimed;
  }

  document.getElementById("post-pay-thanks-back-email")?.addEventListener("click", () => {
    hide(codeForm);
    show(setupForm);
    setStep(1);
    codeInput.value = "";
  });

  setupForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailInput?.value?.trim();
    if (!email) return;

    if (requiresCommerce) {
      if (!placesSearch?.hasSelection()) {
        window.alert("Sélectionnez votre commerce dans la liste de suggestions.");
        return;
      }
      pendingCommerce = placesSearch.getSelection();
    } else {
      pendingCommerce = null;
    }

    const btn = document.getElementById("post-pay-thanks-send-code");
    if (btn instanceof HTMLButtonElement) btn.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/api/payment/claim/send-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          session_id: sessionId,
          subscription_id: subscriptionId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(data.message || "Envoi impossible.");
        return;
      }
      if (emailDisplay) emailDisplay.textContent = email;
      hide(setupForm);
      show(codeForm);
      setStep(2);
      codeInput?.focus();
    } catch {
      window.alert("Erreur réseau.");
    } finally {
      if (btn instanceof HTMLButtonElement) btn.disabled = false;
    }
  });

  codeForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailInput?.value?.trim();
    const code = codeInput?.value?.trim();
    if (!email || !code) return;

    const btn = document.getElementById("post-pay-thanks-verify");
    if (btn instanceof HTMLButtonElement) btn.disabled = true;

    const body = {
      email,
      code,
      session_id: sessionId,
      subscription_id: subscriptionId,
    };
    if (pendingCommerce?.placeId) {
      body.establishment_name = pendingCommerce.establishmentName;
      body.google_place_id = pendingCommerce.placeId;
    }

    try {
      const res = await fetch(`${API_BASE}/api/payment/claim/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(data.message || "Code incorrect ou activation impossible.");
        return;
      }
      if (data.token) setAuthToken(data.token);
      if (data.refreshToken) setRefreshToken(data.refreshToken);

      const commerceName =
        data.business?.name || pendingCommerce?.establishmentName || preview?.business_name || null;

      hide(mainCard);
      show(doneEl);
      window.setTimeout(() => redirectToGetApp(commerceName), 1100);
    } catch {
      window.alert("Erreur réseau.");
    } finally {
      if (btn instanceof HTMLButtonElement) btn.disabled = false;
    }
  });
}

export function readPostPaymentRefsFromUrl() {
  const search = typeof window !== "undefined" ? window.location.search : "";
  return {
    sessionId: parseCheckoutSessionId(search),
    subscriptionId: parseSubscriptionId(search),
  };
}
