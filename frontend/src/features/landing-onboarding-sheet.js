/**
 * Bottom sheet onboarding — overlay sur la landing, drawer depuis le bas.
 * Utilise le nom d'établissement du hero. Onboarding builder (logo, style, objectifs, etc.).
 * Après « Terminer », affiche card beam + création de compte.
 */
import { API_BASE, getAuthToken, setAuthToken } from "../config.js";
import { initRouting } from "../router/index.js";
import { initBuilderOnboarding } from "./onboarding/builder-onboarding.js";
import { BUILDER_DRAFT_KEY, CARD_TEMPLATES } from "../constants/builder.js";

function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  const s = email.trim();
  return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function templateIdFromOnboardingStyle(stylePreset) {
  if (stylePreset === "stamps") return "fastfood-tampons";
  return "bold";
}

function templateIdToCategoryFormat(templateId) {
  if (!templateId) return { category: "fastfood", format: "tampons" };
  if (["classic", "bold", "elegant"].includes(templateId)) return { category: "classic", format: "points" };
  const match = String(templateId).match(/^(.+)-(points|tampons)$/);
  if (match) return { category: match[1], format: match[2] };
  return { category: "fastfood", format: "tampons" };
}

function getTemplateIdFromCategoryFormat(category, format) {
  if (category === "classic") return "classic";
  return `${category}-${format}`;
}

function computeSelectedTemplateId(stylePreset) {
  const templateId = templateIdFromOnboardingStyle(stylePreset);
  return CARD_TEMPLATES.some((t) => t.id === templateId) ? templateId : "fastfood-tampons";
}

let onboardingController = null;

export function openOnboardingSheet() {
  const sheet = document.getElementById("landing-onboarding-sheet");
  const onboardingMount = document.getElementById("landing-onboarding-sheet-onboarding");
  if (!sheet || !onboardingMount) return;

  const menuOverlay = document.getElementById("landing-menu-overlay");
  if (menuOverlay?.classList.contains("is-open")) {
    menuOverlay.classList.remove("is-open");
    menuOverlay.setAttribute("aria-hidden", "true");
    document.getElementById("landing-menu-toggle")?.setAttribute("aria-expanded", "false");
  }

  sheet.classList.add("is-open");
  sheet.setAttribute("aria-hidden", "false");
  document.body.classList.add("onboarding-open");
  document.body.style.overflow = "hidden";

  const heroInput = document.getElementById("landing-etablissement");
  const heroPlaceId = document.getElementById("landing-place-id");
  const organizationName = heroInput?.value?.trim() || "votre établissement";
  const placeId = heroPlaceId?.value?.trim() || "";

  showOnboardingInSheet(organizationName, placeId);
}

export function closeOnboardingSheet() {
  const sheet = document.getElementById("landing-onboarding-sheet");
  if (!sheet) return;
  sheet.classList.remove("is-open", "is-expanded");
  sheet.setAttribute("aria-hidden", "true");
  document.body.classList.remove("onboarding-open");
  document.body.style.overflow = "";
  onboardingController = null;
}

function goToCheckout() {
  closeOnboardingSheet();
  history.pushState({}, "", "/checkout");
  initRouting();
}

function showCardBeamInSheet() {
  const sheet = document.getElementById("landing-onboarding-sheet");
  const onboardingMount = document.getElementById("landing-onboarding-sheet-onboarding");
  const titleEl = document.getElementById("landing-onboarding-sheet-title");
  const progressEl = document.getElementById("landing-onboarding-sheet-progress");
  const backBtn = document.getElementById("landing-onboarding-sheet-back");
  if (!sheet || !onboardingMount) return;

  sheet.classList.add("is-expanded");
  if (titleEl) titleEl.textContent = "Création de votre carte";
  if (progressEl) progressEl.innerHTML = "";
  if (backBtn) backBtn.style.display = "none";

  const alreadyLoggedIn = !!getAuthToken();
  const googleClientId = typeof import.meta.env?.VITE_GOOGLE_CLIENT_ID === "string" ? import.meta.env.VITE_GOOGLE_CLIENT_ID : "";
  const appleClientId = typeof import.meta.env?.VITE_APPLE_CLIENT_ID === "string" ? import.meta.env.VITE_APPLE_CLIENT_ID : "";

  if (alreadyLoggedIn) {
    onboardingMount.innerHTML = `
      <div class="landing-onboarding-card-beam">
        <p class="landing-onboarding-card-beam-subtitle">Votre carte fidélité est en cours de préparation…</p>
        <div class="landing-onboarding-card-beam-wrap">
          <iframe class="landing-onboarding-card-beam-frame" src="/card-beam-reversed.html" title="Animation création carte" referrerpolicy="strict-origin-when-cross-origin"></iframe>
        </div>
        <button type="button" class="landing-onboarding-card-beam-cta" id="landing-onboarding-card-beam-cta">Voir ma carte</button>
      </div>`;
    document.getElementById("landing-onboarding-card-beam-cta")?.addEventListener("click", goToCheckout);
    return;
  }

  onboardingMount.innerHTML = `
    <div class="landing-onboarding-card-beam">
      <p class="landing-onboarding-card-beam-subtitle">Votre carte fidélité est en cours de préparation…</p>
      <div class="landing-onboarding-card-beam-wrap">
        <iframe class="landing-onboarding-card-beam-frame" src="/card-beam-reversed.html" title="Animation création carte" referrerpolicy="strict-origin-when-cross-origin"></iframe>
      </div>
      <div class="landing-onboarding-account-form">
        <p class="landing-onboarding-account-title">Créez votre compte pour accéder à votre carte</p>
        <p id="landing-onboarding-account-error" class="landing-onboarding-account-error hidden" role="alert"></p>
        ${googleClientId || appleClientId ? `<p class="landing-onboarding-account-divider">Ou continuer avec</p><div class="landing-onboarding-account-social">${googleClientId ? `<div id="landing-onboarding-google-btn" class="landing-onboarding-google-wrap"></div>` : ""}${appleClientId ? `<button type="button" id="landing-onboarding-apple-btn" class="landing-onboarding-btn-apple" aria-label="Continuer avec Apple"><span class="landing-onboarding-apple-icon" aria-hidden="true"></span>Apple</button>` : ""}</div><p class="landing-onboarding-account-divider">Ou avec votre e-mail</p>` : ""}
        <label for="landing-onboarding-email" class="landing-onboarding-account-label">Email</label>
        <input type="email" id="landing-onboarding-email" class="landing-onboarding-account-input" placeholder="vous@exemple.fr" autocomplete="email" />
        <label for="landing-onboarding-password" class="landing-onboarding-account-label">Mot de passe (8 caractères min.)</label>
        <input type="password" id="landing-onboarding-password" class="landing-onboarding-account-input" placeholder="••••••••" autocomplete="new-password" minlength="8" />
        <button type="button" id="landing-onboarding-register-btn" class="landing-onboarding-card-beam-cta">Créer mon compte</button>
      </div>
    </div>`;

  const errorEl = document.getElementById("landing-onboarding-account-error");
  const emailInput = document.getElementById("landing-onboarding-email");
  const passwordInput = document.getElementById("landing-onboarding-password");
  const registerBtn = document.getElementById("landing-onboarding-register-btn");

  function showError(msg) {
    if (errorEl) {
      errorEl.textContent = msg || "";
      errorEl.classList.toggle("hidden", !msg);
    }
  }

  function onSuccess() {
    goToCheckout();
  }

  registerBtn?.addEventListener("click", async () => {
    const email = emailInput?.value?.trim() || "";
    const password = passwordInput?.value || "";
    if (!email) {
      showError("Saisissez votre adresse e-mail.");
      emailInput?.focus();
      return;
    }
    if (!isValidEmail(email)) {
      showError("Adresse e-mail invalide (ex. vous@exemple.fr).");
      emailInput?.focus();
      return;
    }
    if (!password || password.length < 8) {
      showError("Le mot de passe doit faire au moins 8 caractères.");
      passwordInput?.focus();
      return;
    }
    showError("");
    registerBtn.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(data.error || "Erreur lors de la création du compte.");
        registerBtn.disabled = false;
        return;
      }
      if (data.token) {
        setAuthToken(data.token);
        onSuccess();
      } else {
        showError("Erreur inattendue.");
        registerBtn.disabled = false;
      }
    } catch (_) {
      showError("Erreur réseau. Réessayez.");
      registerBtn.disabled = false;
    }
  });

  if (googleClientId) {
    const googleWrap = document.getElementById("landing-onboarding-google-btn");
    if (googleWrap && !window.__fidpassOnboardingGoogleInited) {
      window.__fidpassOnboardingGoogleInited = true;
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = () => {
        if (typeof google !== "undefined" && google.accounts?.id) {
          google.accounts.id.initialize({
            client_id: googleClientId,
            callback: (res) => {
              if (!res?.credential) return;
              showError("");
              fetch(`${API_BASE}/api/auth/google`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ credential: res.credential }),
              })
                .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
                .then(({ ok, data }) => {
                  if (ok && data?.token) {
                    setAuthToken(data.token);
                    onSuccess();
                  } else {
                    showError(data?.error || "Erreur lors de la connexion Google.");
                  }
                })
                .catch(() => showError("Erreur réseau. Réessayez."));
            },
          });
          google.accounts.id.renderButton(googleWrap, {
            type: "standard",
            theme: "outline",
            size: "large",
            text: "continue_with",
            width: 260,
            locale: "fr",
          });
        }
      };
      document.head.appendChild(script);
    }
  }

  const appleBtn = document.getElementById("landing-onboarding-apple-btn");
  if (appleClientId && appleBtn) {
    appleBtn.addEventListener("click", () => {
      showError("");
      const redirectUri = API_BASE + "/api/auth/apple-redirect";
      const url = "https://appleid.apple.com/auth/authorize?" +
        new URLSearchParams({
          client_id: appleClientId,
          redirect_uri: redirectUri,
          response_type: "id_token code",
          scope: "name email",
          response_mode: "form_post",
          state: "checkout",
          nonce: Math.random().toString(36).slice(2) + Date.now().toString(36),
        }).toString();
      window.location.href = url;
    });
  }
}

function showOnboardingInSheet(organizationName, placeId) {
  const sheet = document.getElementById("landing-onboarding-sheet");
  const onboardingMount = document.getElementById("landing-onboarding-sheet-onboarding");
  const backBtn = document.getElementById("landing-onboarding-sheet-back");
  if (!sheet || !onboardingMount) return;

  sheet.classList.remove("is-expanded");
  if (backBtn) backBtn.style.display = "";
  onboardingMount.innerHTML = "";

  const titleEl = document.getElementById("landing-onboarding-sheet-title");
  const progressEl = document.getElementById("landing-onboarding-sheet-progress");
  const updateTitle = (q) => {
    if (!titleEl || !q) return;
    titleEl.style.opacity = "0";
    setTimeout(() => {
      titleEl.textContent = q;
      requestAnimationFrame(() => {
        titleEl.style.opacity = "1";
      });
    }, 150);
  };

  function saveDraftAndMaybeShowBeam(nextState) {
    const selectedTemplateId = computeSelectedTemplateId(nextState.stylePreset);
    try {
      let existing = {};
      const raw = localStorage.getItem(BUILDER_DRAFT_KEY);
      if (raw) try { existing = JSON.parse(raw); } catch (_) {}
      const payload = {
        selectedTemplateId,
        organizationName: organizationName || "",
        placeId: placeId || existing.placeId,
        onboarding: { ...nextState, completed: true },
        logoDataUrl: nextState.logoDataUrl || existing.logoDataUrl,
      };
      localStorage.setItem(BUILDER_DRAFT_KEY, JSON.stringify(payload));
    } catch (_) {}
  }

  onboardingController = initBuilderOnboarding({
    mountEl: onboardingMount,
    progressEl: progressEl || undefined,
    initialState: { placeIdHint: placeId },
    organizationName: organizationName || "votre établissement",
    apiBase: API_BASE,
    placeIdHint: placeId,
    onStateChange: (s) => {
      if (s.currentQuestion) updateTitle(s.currentQuestion);
    },
    onLogoChange: () => {},
    onStyleChange: () => {},
    onRewardChange: () => {},
    onComplete(nextState) {
      saveDraftAndMaybeShowBeam(nextState);
      showCardBeamInSheet();
    },
    getAuthToken,
    setAuthToken,
    onAccountCreated(nextState) {
      saveDraftAndMaybeShowBeam(nextState);
      goToCheckout();
    },
  });
}

export function initOnboardingSheet() {
  const sheet = document.getElementById("landing-onboarding-sheet");
  const backdrop = document.getElementById("landing-onboarding-sheet-backdrop");

  if (!sheet) return;

  function close() {
    closeOnboardingSheet();
  }

  backdrop?.addEventListener("click", close);

  const backBtn = document.getElementById("landing-onboarding-sheet-back");
  backBtn?.addEventListener("click", () => {
    const onboardingMount = document.getElementById("landing-onboarding-sheet-onboarding");
    if (onboardingController && onboardingMount) {
      const state = onboardingController.getState();
      if (state.currentStep > 0) {
        onboardingController.previousStep();
      } else {
        close();
      }
    } else {
      close();
    }
  });
}
