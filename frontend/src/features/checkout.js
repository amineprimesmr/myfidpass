/**
 * Page checkout : récap, création compte, OAuth, paiement Stripe.
 * Référence : REFONTE-REGLES.md — un module par écran.
 */
import { API_BASE, getAuthToken, setAuthToken, setRefreshToken, clearAuthToken, getAuthHeaders, setDevBypassPayment } from "../config.js";
import { initRouting } from "../router/index.js";
import { CARD_TEMPLATES, BUILDER_DRAFT_KEY, DESIGN_CATEGORY_LABELS } from "../constants/builder.js";

/** Remettre à false pour réactiver Sign in with Apple sur le parcours checkout. */
const CHECKOUT_APPLE_SIGNIN_DISABLED = true;

function getCheckoutDraft() {
  try {
    const raw = localStorage.getItem(BUILDER_DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d?.selectedTemplateId && CARD_TEMPLATES.some((t) => t.id === d.selectedTemplateId) ? d : null;
  } catch (_) {
    return null;
  }
}

function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  const s = email.trim();
  if (s.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function isAppleRedirectDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod|Android/i.test(ua) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0 && window.matchMedia("(max-width: 768px)").matches);
}

export function initCheckoutPage() {
  const draft = getCheckoutDraft();
  if (!draft) {
    history.replaceState({}, "", "/creer-ma-carte");
    initRouting();
    return;
  }

  const tpl = CARD_TEMPLATES.find((t) => t.id === draft.selectedTemplateId);
  const recapCommerce = document.getElementById("checkout-recap-commerce");
  const recapTemplate = document.getElementById("checkout-recap-template");
  const recapType = document.getElementById("checkout-recap-type");
  const recapCategory = document.getElementById("checkout-recap-category");
  const commerceDisplayName = draft.organizationName?.trim() || "Votre établissement";
  if (recapCommerce) recapCommerce.textContent = commerceDisplayName;
  if (recapTemplate) recapTemplate.textContent = tpl?.name ?? draft.selectedTemplateId;
  if (recapType) recapType.textContent = tpl?.format === "tampons" ? "Tampons" : "Points";
  if (recapCategory) recapCategory.textContent = tpl?.design ? (DESIGN_CATEGORY_LABELS[tpl.design] || tpl.design) : "—";
  const contextNameEl = document.getElementById("checkout-commerce-context-name");
  const contextNameStep2El = document.getElementById("checkout-commerce-context-name-step2");
  if (contextNameEl) contextNameEl.textContent = commerceDisplayName;
  if (contextNameStep2El) contextNameStep2El.textContent = commerceDisplayName;

  const checkoutMain = document.querySelector(".checkout-main");
  const step1 = document.getElementById("checkout-step-1");
  const step2 = document.getElementById("checkout-step-2");
  const step3 = document.getElementById("checkout-step-3");
  const emailInput = document.getElementById("checkout-email");
  const passwordInput = document.getElementById("checkout-password");
  const nameInput = document.getElementById("checkout-name");
  const next1 = document.getElementById("checkout-next-1");
  const next2 = document.getElementById("checkout-next-2");
  const paymentBtn = document.getElementById("checkout-payment");
  const errorEl = document.getElementById("checkout-error");
  const emailErrorEl = document.getElementById("checkout-email-error");
  const oauthErrorEl = document.getElementById("checkout-oauth-error");
  const mobileContinueBtn = document.getElementById("checkout-mobile-continue");
  const mobileBackLink = document.getElementById("checkout-mobile-back");

  const isMobile = () => window.matchMedia("(max-width: 899px)").matches;

  function showOAuthError(msg) {
    if (oauthErrorEl) { oauthErrorEl.textContent = msg || ""; oauthErrorEl.classList.toggle("hidden", !msg); }
    if (errorEl) { errorEl.textContent = msg || ""; errorEl.classList.toggle("hidden", !msg); }
  }

  function setEmailValidationState() {
    const email = emailInput?.value?.trim() || "";
    const valid = isValidEmail(email);
    if (next1) next1.disabled = !valid;
    if (emailErrorEl) {
      if (valid || !email) { emailErrorEl.textContent = ""; emailErrorEl.classList.add("hidden"); }
      else { emailErrorEl.textContent = "Adresse e-mail invalide (ex. vous@exemple.fr)"; emailErrorEl.classList.remove("hidden"); }
    }
  }
  emailInput?.addEventListener("input", setEmailValidationState);
  emailInput?.addEventListener("blur", setEmailValidationState);
  setEmailValidationState();

  const googleClientId = typeof import.meta.env !== "undefined" ? import.meta.env.VITE_GOOGLE_CLIENT_ID : "";
  const appleClientId = typeof import.meta.env !== "undefined" ? import.meta.env.VITE_APPLE_CLIENT_ID : "";

  function handleOAuthSuccess(data) {
    if (!data?.token) return;
    showOAuthError("");
    setAuthToken(data.token);
    if (data.refreshToken) setRefreshToken(data.refreshToken);
    showStep(3);
    if (isMobile()) setMobileStep(3);
    step3?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (paymentBtn) paymentBtn.focus();
  }

  function handleOAuthError(msg) {
    showOAuthError(msg || "Connexion impossible. Réessayez.");
  }

  const urlParams = new URLSearchParams(window.location.search);
  const appleCode = urlParams.get("apple_code");
  const appleError = urlParams.get("apple_error");
  if (!CHECKOUT_APPLE_SIGNIN_DISABLED && appleError && appleClientId) {
    history.replaceState({}, "", window.location.pathname);
    const msg = appleError === "no_email" ? "Email non fourni par Apple. Réautorisez pour partager votre email." : "Connexion Apple impossible. Réessayez.";
    handleOAuthError(msg);
  } else if (!CHECKOUT_APPLE_SIGNIN_DISABLED && appleCode && appleClientId) {
    history.replaceState({}, "", window.location.pathname);
    fetch(`${API_BASE}/api/auth/apple-exchange?code=${encodeURIComponent(appleCode)}`)
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (ok && data?.token) handleOAuthSuccess(data);
        else handleOAuthError(data?.error || "Session expirée. Réessayez.");
      })
      .catch(() => handleOAuthError("Erreur réseau ou API inaccessible."));
  }

  if (googleClientId) {
    const googleBtnContainer = document.getElementById("checkout-google-btn");
    if (googleBtnContainer && !window.__fidpassGoogleInited) {
      window.__fidpassGoogleInited = true;
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = () => {
        if (typeof google !== "undefined" && google.accounts?.id) {
          google.accounts.id.initialize({
            client_id: googleClientId,
            callback: (res) => {
              if (!res?.credential) return;
              showOAuthError("");
              fetch(`${API_BASE}/api/auth/google`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ credential: res.credential }),
              })
                .then((r) => r.json().then((data) => ({ ok: r.ok, status: r.status, data })))
                .then(({ ok, data }) => {
                  if (ok && data?.token) handleOAuthSuccess(data);
                  else handleOAuthError(data?.error || "Erreur lors de la connexion Google. Réessayez.");
                })
                .catch(() => handleOAuthError("Erreur réseau ou API inaccessible. Vérifiez que le backend est en ligne."));
            },
          });
          google.accounts.id.renderButton(googleBtnContainer, {
            type: "standard",
            theme: "outline",
            size: "large",
            text: "continue_with",
            width: 280,
            locale: "fr",
          });
        }
      };
      document.head.appendChild(script);
    }
  }

  const appleBtn = document.getElementById("checkout-apple-btn");
  if (!CHECKOUT_APPLE_SIGNIN_DISABLED && appleClientId && appleBtn && !window.__fidpassAppleInited) {
    window.__fidpassAppleInited = true;
    const redirectUri = API_BASE + "/api/auth/apple-redirect";
    const buildAppleRedirectUrl = () =>
      "https://appleid.apple.com/auth/authorize?" +
      new URLSearchParams({
        client_id: appleClientId,
        redirect_uri: redirectUri,
        response_type: "id_token code",
        scope: "name email",
        response_mode: "form_post",
        state: "checkout",
        nonce: Math.random().toString(36).slice(2) + Date.now().toString(36),
      }).toString();
    appleBtn.addEventListener("click", () => {
      showOAuthError("");
      if (isAppleRedirectDevice() || typeof AppleID === "undefined" || !AppleID?.auth) {
        window.location.href = buildAppleRedirectUrl();
        return;
      }
      AppleID.auth.signIn()
        .then((res) => {
          const idToken = res?.authorization?.id_token;
          const user = res?.user;
          if (!idToken) { handleOAuthError("Token Apple manquant"); return; }
          fetch(`${API_BASE}/api/auth/apple`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              idToken,
              name: user?.name ? [user.name.firstName, user.name.lastName].filter(Boolean).join(" ") : undefined,
              email: user?.email,
            }),
          })
            .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
            .then(({ ok, data }) => {
              if (ok && data?.token) handleOAuthSuccess(data);
              else handleOAuthError(data?.error || "Erreur lors de la connexion Apple. Réessayez.");
            })
            .catch(() => handleOAuthError("Erreur réseau ou API inaccessible."));
        })
        .catch((err) => {
          const msg = err?.error || err?.message || (err && String(err));
          if (msg && (msg.includes("popup") || msg.includes("blocked") || msg.includes("fenêtre")))
            handleOAuthError("Autorisez les fenêtres pop-up pour ce site puis réessayez.");
          else if (msg && msg.toLowerCase().includes("invalid"))
            handleOAuthError("Configuration Apple incorrecte. Vérifiez le Services ID et les domaines dans Apple Developer.");
          else
            handleOAuthError(msg || "Connexion Apple annulée ou erreur. Réessayez.");
        });
    });
    if (!isAppleRedirectDevice()) {
      const script = document.createElement("script");
      script.src = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en/appleid.auth.js";
      script.async = true;
      script.onerror = () => {
        appleBtn.addEventListener("click", () => {
          handleOAuthError("Le script Apple n'a pas pu se charger. Désactivez le bloqueur de publicités ou réessayez.");
        }, { once: true });
      };
      script.onload = () => {
        if (typeof AppleID !== "undefined") {
          try {
            AppleID.auth.init({
              clientId: appleClientId,
              scope: "name email",
              usePopup: true,
              redirectURI: typeof window !== "undefined" ? window.location.origin + "/" : "",
            });
          } catch (e) {
            console.error("Apple init error:", e);
          }
        }
      };
      document.head.appendChild(script);
    }
  }

  const socialDivider = document.querySelector(".checkout-social-divider");
  const socialButtons = document.querySelector(".checkout-social-buttons");
  if (!googleClientId && appleBtn && !CHECKOUT_APPLE_SIGNIN_DISABLED) {
    const wrap = document.getElementById("checkout-google-btn");
    if (wrap && !wrap.querySelector("iframe")) {
      wrap.innerHTML = "<span class=\"checkout-social-placeholder\">Google (configurez VITE_GOOGLE_CLIENT_ID)</span>";
      wrap.classList.add("checkout-social-placeholder-wrap");
    }
  }
  if (!CHECKOUT_APPLE_SIGNIN_DISABLED && !appleClientId && appleBtn) {
    appleBtn.disabled = true;
    appleBtn.title = "Configurez VITE_APPLE_CLIENT_ID sur Vercel pour activer";
    appleBtn.classList.add("checkout-btn-social-disabled");
  }
  if (CHECKOUT_APPLE_SIGNIN_DISABLED && appleBtn) {
    appleBtn.classList.add("hidden");
    appleBtn.setAttribute("hidden", "true");
    appleBtn.setAttribute("aria-hidden", "true");
  }

  function showStep(stepNum) {
    [step1, step2, step3].forEach((el, i) => {
      if (el) el.classList.toggle("checkout-step-open", i + 1 === stepNum);
    });
  }

  function setMobileStep(step) {
    if (!checkoutMain) return;
    checkoutMain.setAttribute("data-mobile-step", String(step));
    if (step >= 1) showStep(step);
    window.scrollTo(0, 0);
  }

  if (getAuthToken()) {
    showStep(3);
    if (isMobile()) setMobileStep(3);
    const alreadyLoggedInHint = document.getElementById("checkout-already-logged-in-hint");
    if (alreadyLoggedInHint) alreadyLoggedInHint.classList.remove("hidden");
    document.getElementById("checkout-payment")?.focus();
  } else if (isMobile()) {
    setMobileStep(0);
  }

  const checkoutLogoutLink = document.getElementById("checkout-logout-link");
  if (checkoutLogoutLink) {
    checkoutLogoutLink.addEventListener("click", (e) => {
      e.preventDefault();
      clearAuthToken();
      const alreadyLoggedInHint = document.getElementById("checkout-already-logged-in-hint");
      if (alreadyLoggedInHint) alreadyLoggedInHint.classList.add("hidden");
      showStep(1);
      if (isMobile() && checkoutMain) setMobileStep(1);
      if (emailInput) emailInput.focus();
    });
  }

  window.addEventListener("resize", () => {
    if (!checkoutMain) return;
    if (isMobile()) {
      if (!checkoutMain.getAttribute("data-mobile-step")) setMobileStep(0);
    } else {
      checkoutMain.removeAttribute("data-mobile-step");
    }
  });

  mobileContinueBtn?.addEventListener("click", () => {
    if (!isMobile()) return;
    const current = parseInt(checkoutMain.getAttribute("data-mobile-step") || "0", 10);
    if (current !== 0) return;
    setMobileStep(1);
    emailInput?.focus();
  });

  mobileBackLink?.addEventListener("click", (e) => {
    e.preventDefault();
    if (!isMobile() || !checkoutMain) return;
    const current = parseInt(checkoutMain.getAttribute("data-mobile-step") || "0", 10);
    if (current <= 1) {
      history.pushState({}, "", "/creer-ma-carte");
      initRouting();
      return;
    }
    const prev = current - 1;
    setMobileStep(prev);
    if (prev === 1) emailInput?.focus();
    if (prev === 2) passwordInput?.focus();
  });

  function showError(msg) {
    if (errorEl) { errorEl.textContent = msg || ""; errorEl.classList.toggle("hidden", !msg); }
  }

  next1?.addEventListener("click", () => {
    const email = emailInput?.value?.trim();
    if (!email) { emailInput?.focus(); showError("Saisissez votre adresse e-mail."); return; }
    if (!isValidEmail(email)) {
      emailInput?.focus();
      showError("Adresse e-mail invalide. Utilisez une adresse valide (ex. vous@exemple.fr).");
      if (emailErrorEl) { emailErrorEl.textContent = "Adresse e-mail invalide (ex. vous@exemple.fr)"; emailErrorEl.classList.remove("hidden"); }
      return;
    }
    showError("");
    if (emailErrorEl) { emailErrorEl.textContent = ""; emailErrorEl.classList.add("hidden"); }
    showStep(2);
    if (isMobile()) setMobileStep(2);
    passwordInput?.focus();
  });

  next2?.addEventListener("click", async () => {
    const email = emailInput?.value?.trim();
    const password = passwordInput?.value;
    const name = nameInput?.value?.trim();
    if (!email) { showError("Saisissez votre adresse e-mail à l'étape 1."); return; }
    if (!password || String(password).length < 8) {
      passwordInput?.focus();
      showError("Le mot de passe doit faire au moins 8 caractères.");
      return;
    }
    showError("");
    if (next2) { next2.disabled = true; next2.textContent = "Création du compte…"; }
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 20000);
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: name || undefined }),
        signal: abortController.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showError(data.error || "Erreur lors de la création du compte."); return; }
      setAuthToken(data.token);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
      showStep(3);
      if (isMobile()) setMobileStep(3);
      if (paymentBtn) paymentBtn.focus();
    } catch (e) {
      if (e.name === "AbortError") {
        showError("Le serveur met trop de temps à répondre. Vérifiez votre connexion ou réessayez.");
      } else {
        showError("Impossible de créer le compte. Vérifiez votre connexion et que l'API est bien accessible.");
      }
    } finally {
      clearTimeout(timeoutId);
      if (next2) { next2.disabled = false; next2.textContent = "SUIVANT"; }
    }
  });

  paymentBtn?.addEventListener("click", () => initCheckoutPayment());

  const checkoutDevBypassBtn = document.getElementById("checkout-dev-bypass-btn");
  if (checkoutDevBypassBtn) {
    checkoutDevBypassBtn.addEventListener("click", () => {
      setDevBypassPayment(true);
      window.location.replace("/app");
    });
  }

  function initCheckoutPayment() {
    showError("");
    if (paymentBtn) { paymentBtn.disabled = true; paymentBtn.textContent = "Redirection…"; }
    fetch(`${API_BASE}/api/payment/create-checkout-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ planId: "starter" }),
    })
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        if (data.url) { window.location.href = data.url; return; }
        showError(data.error || "Impossible de créer la session de paiement.");
        if (paymentBtn) { paymentBtn.disabled = false; paymentBtn.textContent = "PAYER — 49 €/mois (7 jours gratuits)"; }
      })
      .catch(() => {
        showError("Erreur réseau. Réessayez.");
        if (paymentBtn) { paymentBtn.disabled = false; paymentBtn.textContent = "PAYER — 49 €/mois (7 jours gratuits)"; }
      });
  }
}
