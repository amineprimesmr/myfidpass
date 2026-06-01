import { API_BASE, getAuthToken, setAuthToken, setRefreshToken } from "../config.js";
import { parseCheckoutSessionId } from "./post-purchase-app-modal.js";
import { initPostPaymentPlacesSearch } from "./post-payment-places-search.js";
import { renderAppDownloadQr, wireAppStoreButtons, isMobileDevice } from "./app-download-qr.js";

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
  hide(document.getElementById("post-pay-step-form"));
  hide(document.getElementById("post-pay-step-download"));
  const err = document.getElementById("post-pay-thanks-error");
  const txt = document.getElementById("post-pay-thanks-error-text");
  if (txt) txt.textContent = msg;
  show(err);
}

/** @param {{ sessionId?: string | null, subscriptionId?: string | null }} refs */
export async function mountPostPaymentThanksPage(refs) {
  const loading = document.getElementById("post-pay-thanks-loading");
  const stepForm = document.getElementById("post-pay-step-form");
  const stepDownload = document.getElementById("post-pay-step-download");
  const setupForm = document.getElementById("post-pay-thanks-setup-form");
  const emailInput = document.getElementById("post-pay-thanks-email");
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
        window.location.replace("/get?welcome=1&stay=1");
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
  show(stepForm);

  if (preview.payer_email && emailInput) {
    emailInput.value = preview.payer_email;
  }

  // Commerce Google : toujours affiché sauf si un commerce est déjà configuré sur ce compte.
  if (preview.business_name) {
    requiresCommerce = false;
    hide(commerceField);
    const lead = document.getElementById("post-pay-thanks-lead");
    if (lead) {
      lead.textContent = `Commerce « ${preview.business_name} » déjà configuré. Validez votre e-mail pour accéder à l’app.`;
    }
  } else {
    requiresCommerce = true;
    show(commerceField);
  }

  if (preview.already_claimed && preview.claimed_user_email) {
    const claimed = preview.claimed_user_email;
    const lead = document.getElementById("post-pay-thanks-lead");
    if (lead && !preview.business_name) {
      lead.textContent = `Abonnement actif sur ${claimed}. Indiquez votre commerce Google puis validez votre e-mail.`;
    } else if (lead && preview.business_name) {
      lead.textContent = `Abonnement actif sur ${claimed}. Validez votre e-mail pour accéder à l’app.`;
    }
    if (emailInput) emailInput.value = claimed;
  }

  wireAppStoreButtons({ iosBtnId: "post-pay-store-ios", androidBtnId: "post-pay-store-android" });

  async function mountDownloadWidget() {
    if (!isMobileDevice()) {
      try {
        await renderAppDownloadQr({
          targetId: "post-pay-qr",
          containerId: "post-pay-qr-container",
          size: 250,
        });
      } catch (err) {
        console.warn("[merci] QR indisponible :", err?.message || err);
      }
    }
  }

  async function submitActivationLink() {
    const email = emailInput?.value?.trim();
    if (!email) return null;

    if (requiresCommerce) {
      if (!placesSearch?.hasSelection()) {
        window.alert("Sélectionnez votre commerce dans la liste de suggestions.");
        return null;
      }
      pendingCommerce = placesSearch.getSelection();
    } else {
      pendingCommerce = null;
    }

    const body = {
      email,
      session_id: sessionId,
      subscription_id: subscriptionId,
    };
    if (pendingCommerce?.placeId) {
      body.establishment_name = pendingCommerce.establishmentName;
      body.google_place_id = pendingCommerce.placeId;
    }

    const res = await fetch(`${API_BASE}/api/payment/claim/send-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      window.alert(data.message || "Envoi impossible.");
      return null;
    }
    return email;
  }

  async function showDownloadStep(email) {
    const toEl = document.getElementById("post-pay-email-sent-to");
    if (toEl) toEl.textContent = email;
    hide(stepForm);
    show(stepDownload);
    document.body.classList.add("post-pay-thanks--download-step");
    await mountDownloadWidget();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.getElementById("post-pay-thanks-back-setup")?.addEventListener("click", () => {
    hide(stepDownload);
    show(stepForm);
    document.body.classList.remove("post-pay-thanks--download-step");
  });

  setupForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("post-pay-thanks-send-link");
    if (btn instanceof HTMLButtonElement) btn.disabled = true;
    try {
      const email = await submitActivationLink();
      if (email) await showDownloadStep(email);
    } catch {
      window.alert("Erreur réseau.");
    } finally {
      if (btn instanceof HTMLButtonElement) btn.disabled = false;
    }
  });

  document.getElementById("post-pay-thanks-resend")?.addEventListener("click", async () => {
    const btn = document.getElementById("post-pay-thanks-resend");
    if (btn instanceof HTMLButtonElement) btn.disabled = true;
    try {
      const email = await submitActivationLink();
      if (email) window.alert(`Un nouvel e-mail a été envoyé à ${email}.`);
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
