import { API_BASE, getAuthToken, setAuthToken, setRefreshToken } from "../config.js";
import { parseCheckoutSessionId } from "./post-purchase-app-modal.js";

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

function setError(msg) {
  hide(document.getElementById("post-pay-thanks-loading"));
  hide(document.getElementById("post-pay-thanks-email-form"));
  hide(document.getElementById("post-pay-thanks-code-form"));
  const err = document.getElementById("post-pay-thanks-error");
  const txt = document.getElementById("post-pay-thanks-error-text");
  if (txt) txt.textContent = msg;
  show(err);
}

/** @param {{ sessionId?: string | null, subscriptionId?: string | null }} refs */
export async function mountPostPaymentThanksPage(refs) {
  const loading = document.getElementById("post-pay-thanks-loading");
  const emailForm = document.getElementById("post-pay-thanks-email-form");
  const codeForm = document.getElementById("post-pay-thanks-code-form");
  const emailInput = document.getElementById("post-pay-thanks-email");
  const codeInput = document.getElementById("post-pay-thanks-code");
  const emailDisplay = document.getElementById("post-pay-thanks-email-display");
  const planEl = document.getElementById("post-pay-thanks-plan");
  const doneEl = document.getElementById("post-pay-thanks-done");

  const { sessionId, subscriptionId } = refs;
  if (!sessionId && !subscriptionId) {
    setError("Lien incomplet. Reprenez depuis la confirmation Stripe ou contactez le support.");
    return;
  }

  const q = checkoutQuery(sessionId, subscriptionId);

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
        window.setTimeout(() => {
          window.location.replace("/app");
        }, 1200);
        return;
      }
    } catch {
      /* continue with email flow */
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
  if (preview.plan_label && planEl) {
    planEl.textContent = preview.plan_label;
    show(planEl);
  }
  if (preview.payer_email && emailInput) {
    emailInput.value = preview.payer_email;
  }
  if (preview.already_claimed && preview.claimed_user_email) {
    const lead = document.getElementById("post-pay-thanks-lead");
    const claimed = preview.claimed_user_email;
    if (lead) {
      lead.textContent = `Cet abonnement est déjà actif sur ${claimed}. Entrez cette adresse e-mail pour vous connecter.`;
    }
    if (emailInput) {
      emailInput.value = claimed;
    }
  }
  show(emailForm);

  document.getElementById("post-pay-thanks-back-email")?.addEventListener("click", () => {
    hide(codeForm);
    show(emailForm);
    codeInput.value = "";
  });

  emailForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailInput?.value?.trim();
    if (!email) return;
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
      hide(emailForm);
      show(codeForm);
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
    try {
      const res = await fetch(`${API_BASE}/api/payment/claim/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          code,
          session_id: sessionId,
          subscription_id: subscriptionId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(data.message || "Code incorrect ou activation impossible.");
        return;
      }
      if (data.token) setAuthToken(data.token);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
      hide(codeForm);
      show(doneEl);
      window.setTimeout(() => {
        window.location.replace("/app");
      }, 1400);
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
