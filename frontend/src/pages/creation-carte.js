import "./../creation-carte.css";
import {
  API_BASE,
  getPendingEstablishment,
  setAuthToken,
  setRefreshToken,
  setPendingEstablishment,
} from "../config.js";
import {
  showOAuthConnectingOverlay,
  hideOAuthConnectingOverlay,
  markGoogleCredentialFlowStarted,
  handleGooglePromptMoment,
} from "../oauth-connecting-overlay.js";

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function encodeAppleState(payload) {
  try {
    return btoa(JSON.stringify(payload));
  } catch (_) {
    return "creation_carte";
  }
}

export default {
  init() {
    const root = document.getElementById("builder-app");
    if (!root) return;

    const params = new URLSearchParams(window.location.search);
    const commerce = params.get("name") || params.get("etablissement") || "";
    const mode = String(params.get("mode") || "").trim().toLowerCase();
    const initialEmail = String(params.get("email") || "").trim();
    const redirectRaw = String(params.get("redirect") || "").trim();
    const redirectPath = redirectRaw.startsWith("/") && !redirectRaw.startsWith("//")
      ? redirectRaw
      : "/app";

    root.innerHTML = `
      <section class="creation-carte-signup" aria-label="Inscription commerçant">
        <div class="creation-carte-signup__bg" aria-hidden="true"></div>
        <div class="creation-carte-signup__content">
          <div class="creation-carte-signup__brand" aria-hidden="true">
            <span class="creation-carte-signup__brand-bag">
              <img src="/assets/icone.png" alt="" class="creation-carte-signup__brand-icon" />
            </span>
          </div>
          <h1 class="creation-carte-signup__title">Commencez à fidéliser pour 1€</h1>
          <p class="creation-carte-signup__subtitle">Premier mois à 1€, puis 49,99€ sans engagement</p>
          <form class="creation-carte-signup__card" id="creation-carte-signup-form" novalidate>
            <div class="creation-carte-signup__step creation-carte-signup__step--email" id="creation-carte-step-email">
              <div class="creation-carte-signup__locked-field">
                <div class="creation-carte-signup__locked-label">Commerce</div>
                <div class="creation-carte-signup__locked-value" id="creation-carte-commerce-inline"></div>
              </div>
              <label class="creation-carte-signup__sr-only" for="creation-carte-email">Adresse e-mail</label>
              <input
                id="creation-carte-email"
                name="email"
                type="email"
                class="creation-carte-signup__email"
                placeholder="Adresse e-mail"
                autocomplete="email"
                required
              />
              <button type="submit" class="creation-carte-signup__btn creation-carte-signup__btn--primary">
                Continuer avec l’e-mail
              </button>

              <div class="creation-carte-signup__sep"><span>OU</span></div>

              <button type="button" id="creation-carte-google-btn" class="creation-carte-signup__btn creation-carte-signup__btn--social" data-provider="google">
                <span class="creation-carte-signup__icon"><img src="/assets/logos/google.png" alt="" class="creation-carte-signup__icon-img" /></span>
                <span>Continuer avec Google</span>
              </button>
              <button type="button" id="creation-carte-apple-btn" class="creation-carte-signup__btn creation-carte-signup__btn--social" data-provider="apple">
                <span class="creation-carte-signup__icon"></span>
                <span>Continuer avec Apple</span>
              </button>
              <p class="creation-carte-signup__oauth-error hidden" id="creation-carte-oauth-error" aria-live="polite"></p>

              <p class="creation-carte-signup__foot">
                Vous avez déjà un compte Myfidpass ? <button type="button" class="creation-carte-signup__linklike" id="creation-carte-open-login">Se connecter</button>
              </p>
            </div>

            <div class="creation-carte-signup__step creation-carte-signup__step--password hidden" id="creation-carte-step-password">
              <div class="creation-carte-signup__locked-field">
                <div class="creation-carte-signup__locked-label">Commerce</div>
                <div class="creation-carte-signup__locked-value" id="creation-carte-commerce-review"></div>
              </div>

              <div class="creation-carte-signup__email-review">
                <div class="creation-carte-signup__email-review-label">Adresse e-mail</div>
                <div class="creation-carte-signup__email-review-value" id="creation-carte-email-review"></div>
                <button type="button" class="creation-carte-signup__email-edit" id="creation-carte-email-edit">Modifier</button>
              </div>

              <label class="creation-carte-signup__sr-only" for="creation-carte-password">Créer un mot de passe</label>
              <div class="creation-carte-signup__password-wrap">
                <input
                  id="creation-carte-password"
                  type="password"
                  class="creation-carte-signup__password"
                  placeholder="Créer un mot de passe"
                  autocomplete="new-password"
                  minlength="12"
                  required
                />
                <button type="button" class="creation-carte-signup__password-eye" id="creation-carte-password-eye" aria-label="Afficher/Masquer mot de passe">◌</button>
              </div>
              <div class="creation-carte-signup__password-meter" aria-hidden="true">
                <span class="creation-carte-signup__password-meter-fill" id="creation-carte-password-meter-fill"></span>
              </div>
              <p class="creation-carte-signup__password-hint" id="creation-carte-password-hint">Doit contenir au moins 12 caractères.</p>
              <p class="creation-carte-signup__oauth-error hidden" id="creation-carte-register-error" aria-live="polite"></p>

              <button type="button" class="creation-carte-signup__btn creation-carte-signup__btn--primary creation-carte-signup__btn--arrow" id="creation-carte-password-submit" aria-label="Continuer">
                <span>Créer un compte</span>
              </button>
            </div>

            <div class="creation-carte-signup__step creation-carte-signup__step--login hidden" id="creation-carte-step-login">
              <h2 class="creation-carte-signup__login-title">Se connecter</h2>
              <p class="creation-carte-signup__login-subtitle">Continuer vers Myfidpass</p>

              <label class="creation-carte-signup__login-label" for="creation-carte-login-email">E-mail</label>
              <input
                id="creation-carte-login-email"
                name="email"
                type="email"
                class="creation-carte-signup__email"
                placeholder="Adresse e-mail"
                autocomplete="email"
                required
              />
              <label class="creation-carte-signup__login-label" for="creation-carte-login-password">Mot de passe</label>
              <input
                id="creation-carte-login-password"
                type="password"
                class="creation-carte-signup__email"
                placeholder="Mot de passe"
                autocomplete="current-password"
                minlength="1"
                required
              />

              <button type="button" class="creation-carte-signup__btn creation-carte-signup__btn--primary" id="creation-carte-login-submit">
                Se connecter
              </button>
              <p class="creation-carte-signup__oauth-error hidden" id="creation-carte-login-error" aria-live="polite"></p>

              <div class="creation-carte-signup__social-row">
                <button type="button" class="creation-carte-signup__btn creation-carte-signup__btn--social creation-carte-signup__btn--social-mini" id="creation-carte-login-apple"></button>
                <button type="button" class="creation-carte-signup__btn creation-carte-signup__btn--social creation-carte-signup__btn--social-mini" id="creation-carte-login-google">
                  <img src="/assets/logos/google.png" alt="" class="creation-carte-signup__icon-img creation-carte-signup__icon-img--mini" />
                </button>
              </div>

              <p class="creation-carte-signup__foot creation-carte-signup__foot--login">
                Nouveau sur Myfidpass ? <button type="button" class="creation-carte-signup__linklike creation-carte-signup__linklike--cta" id="creation-carte-close-login">Démarrer →</button>
              </p>
            </div>
          </form>

          <button type="button" class="creation-carte-signup__locale" aria-label="Pays sélectionné">
            🇫🇷 France
          </button>
        </div>
      </section>
    `;

    const form = root.querySelector("#creation-carte-signup-form");
    const emailInput = root.querySelector("#creation-carte-email");
    const passwordInput = root.querySelector("#creation-carte-password");
    const stepEmail = root.querySelector("#creation-carte-step-email");
    const stepPassword = root.querySelector("#creation-carte-step-password");
    const stepLogin = root.querySelector("#creation-carte-step-login");
    const emailReview = root.querySelector("#creation-carte-email-review");
    const commerceReview = root.querySelector("#creation-carte-commerce-review");
    const commerceInline = root.querySelector("#creation-carte-commerce-inline");
    const emailEdit = root.querySelector("#creation-carte-email-edit");
    const passwordSubmit = root.querySelector("#creation-carte-password-submit");
    const passwordEye = root.querySelector("#creation-carte-password-eye");
    const passwordHint = root.querySelector("#creation-carte-password-hint");
    const passwordMeterFill = root.querySelector("#creation-carte-password-meter-fill");
    const googleBtn = root.querySelector("#creation-carte-google-btn");
    const appleBtn = root.querySelector("#creation-carte-apple-btn");
    const loginGoogleBtn = root.querySelector("#creation-carte-login-google");
    const loginAppleBtn = root.querySelector("#creation-carte-login-apple");
    const openLoginBtn = root.querySelector("#creation-carte-open-login");
    const closeLoginBtn = root.querySelector("#creation-carte-close-login");
    const loginEmailInput = root.querySelector("#creation-carte-login-email");
    const loginPasswordInput = root.querySelector("#creation-carte-login-password");
    const loginSubmitBtn = root.querySelector("#creation-carte-login-submit");
    const oauthError = root.querySelector("#creation-carte-oauth-error");
    const registerError = root.querySelector("#creation-carte-register-error");
    const loginError = root.querySelector("#creation-carte-login-error");
    const signupContent = root.querySelector(".creation-carte-signup__content");
    if (!(form instanceof HTMLFormElement) || !(emailInput instanceof HTMLInputElement)) return;

    const pendingEstablishment = getPendingEstablishment();
    const establishmentName = String(
      commerce || pendingEstablishment?.establishment_name || ""
    ).trim();
    const placeId = String(
      params.get("place_id") || pendingEstablishment?.google_place_id || ""
    ).trim();
    if (commerceReview instanceof HTMLElement) {
      commerceReview.textContent = establishmentName || "Commerce non renseigné";
    }
    if (commerceInline instanceof HTMLElement) {
      commerceInline.textContent = establishmentName || "Commerce non renseigné";
    }
    if (establishmentName && placeId) {
      setPendingEstablishment({
        establishment_name: establishmentName,
        google_place_id: placeId,
      });
    }

    const oauthPayload = establishmentName && placeId
      ? {
          establishment_name: establishmentName,
          google_place_id: placeId,
        }
      : {};
    const oauthState = encodeAppleState({
      mode: "creation_carte",
      ...oauthPayload,
    });

    const showOAuthError = (msg) => {
      if (!(oauthError instanceof HTMLElement)) return;
      const txt = String(msg || "").trim();
      oauthError.textContent = txt;
      oauthError.classList.toggle("hidden", !txt);
    };
    const showInlineError = (target, msg) => {
      if (!(target instanceof HTMLElement)) return;
      const txt = String(msg || "").trim();
      target.textContent = txt;
      target.classList.toggle("hidden", !txt);
    };

    const transitionStep = (fromStep, toStep) => {
      if (!(fromStep instanceof HTMLElement) || !(toStep instanceof HTMLElement)) return;
      fromStep.classList.add("is-leaving");
      window.setTimeout(() => {
        fromStep.classList.add("hidden");
        fromStep.classList.remove("is-leaving");
        toStep.classList.remove("hidden");
        toStep.classList.add("is-entering");
        window.setTimeout(() => toStep.classList.remove("is-entering"), 340);
      }, 180);
    };

    const handleOAuthSuccess = (data) => {
      if (!data?.token) {
        showOAuthError("Connexion réussie mais session invalide.");
        return;
      }
      setAuthToken(data.token);
      setRefreshToken(data.refreshToken || null);
      window.location.href = redirectPath;
    };

    const urlParams = new URLSearchParams(window.location.search);
    const appleCode = urlParams.get("apple_code");
    const appleError = urlParams.get("apple_error");
    if (appleError) {
      showOAuthError(appleError === "no_email" ? "Apple n'a pas fourni d'email." : "Connexion Apple impossible.");
    } else if (appleCode) {
      showOAuthConnectingOverlay("apple");
      fetch(`${API_BASE}/api/auth/apple-exchange?code=${encodeURIComponent(appleCode)}`)
        .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
        .then(({ ok, data }) => {
          if (ok) handleOAuthSuccess(data);
          else showOAuthError(data?.error || "Session Apple expirée.");
        })
        .catch(() => showOAuthError("Erreur réseau lors de la connexion Apple."))
        .finally(() => hideOAuthConnectingOverlay());
      const cleaned = new URL(window.location.href);
      cleaned.searchParams.delete("apple_code");
      cleaned.searchParams.delete("apple_error");
      window.history.replaceState({}, "", cleaned.pathname + cleaned.search);
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      showInlineError(registerError, "");
      emailInput.classList.remove("is-invalid");
      if (!emailInput.value.trim() || !emailInput.checkValidity()) {
        emailInput.classList.add("is-invalid");
        emailInput.focus();
        return;
      }
      if (emailReview instanceof HTMLElement) {
        emailReview.textContent = emailInput.value.trim();
      }
      transitionStep(stepEmail, stepPassword);
      window.setTimeout(() => {
        if (passwordInput instanceof HTMLInputElement) passwordInput.focus();
      }, 220);
    });

    emailEdit?.addEventListener("click", () => {
      transitionStep(stepPassword, stepEmail);
      window.setTimeout(() => emailInput.focus(), 220);
    });

    openLoginBtn?.addEventListener("click", () => {
      showInlineError(loginError, "");
      transitionStep(stepEmail, stepLogin);
      signupContent?.classList.add("is-login-mode");
      window.setTimeout(() => {
        if (loginEmailInput instanceof HTMLInputElement) {
          loginEmailInput.value = emailInput.value.trim();
          loginEmailInput.focus();
        }
      }, 220);
    });

    closeLoginBtn?.addEventListener("click", () => {
      transitionStep(stepLogin, stepEmail);
      signupContent?.classList.remove("is-login-mode");
      window.setTimeout(() => emailInput.focus(), 220);
    });

    loginSubmitBtn?.addEventListener("click", () => {
      const value = loginEmailInput instanceof HTMLInputElement ? loginEmailInput.value.trim() : "";
      const password = loginPasswordInput instanceof HTMLInputElement ? loginPasswordInput.value : "";
      showInlineError(loginError, "");
      if (!value || !loginEmailInput?.checkValidity()) {
        showInlineError(loginError, "Entrez une adresse e-mail valide.");
        loginEmailInput?.focus();
        return;
      }
      if (!password.trim()) {
        showInlineError(loginError, "Entrez votre mot de passe.");
        loginPasswordInput?.focus();
        return;
      }
      const btnLabel = loginSubmitBtn.textContent;
      loginSubmitBtn.disabled = true;
      loginSubmitBtn.textContent = "Connexion...";
      fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: value, password }),
      })
        .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
        .then(({ ok, data }) => {
          if (!ok) {
            showInlineError(loginError, data?.error || "Connexion impossible pour le moment.");
            return;
          }
          if (!data?.token) {
            showInlineError(loginError, "Connexion réussie mais session invalide.");
            return;
          }
          setAuthToken(data.token);
          setRefreshToken(data.refreshToken || null);
          window.location.href = redirectPath;
        })
        .catch(() => showInlineError(loginError, "Erreur réseau lors de la connexion."))
        .finally(() => {
          loginSubmitBtn.disabled = false;
          loginSubmitBtn.textContent = btnLabel || "Se connecter";
        });
    });

    passwordEye?.addEventListener("click", () => {
      if (!(passwordInput instanceof HTMLInputElement)) return;
      const isHidden = passwordInput.type === "password";
      passwordInput.type = isHidden ? "text" : "password";
      passwordEye.textContent = isHidden ? "◉" : "◌";
    });

    const updatePasswordMeter = () => {
      if (!(passwordInput instanceof HTMLInputElement)) return;
      const value = passwordInput.value || "";
      const len = value.length;
      const ratio = Math.min(1, len / 12);
      if (passwordMeterFill instanceof HTMLElement) {
        passwordMeterFill.style.width = `${Math.max(2, ratio * 100)}%`;
      }
      if (!(passwordHint instanceof HTMLElement)) return;
      if (len === 0) {
        passwordHint.textContent = "Doit contenir au moins 12 caractères.";
        passwordHint.classList.remove("is-ok");
      } else if (len < 12) {
        passwordHint.textContent = `Encore ${12 - len} caractère${12 - len > 1 ? "s" : ""} minimum.`;
        passwordHint.classList.remove("is-ok");
      } else {
        passwordHint.textContent = "Bien. Vous pouvez ajouter des caractères ou des symboles pour le renforcer davantage.";
        passwordHint.classList.add("is-ok");
      }
      passwordMeterFill?.classList.toggle("is-ok", len >= 12);
    };

    passwordInput?.addEventListener("input", updatePasswordMeter);
    updatePasswordMeter();

    passwordSubmit?.addEventListener("click", async () => {
      if (!(passwordInput instanceof HTMLInputElement)) return;
      showInlineError(registerError, "");
      if (!passwordInput.value.trim() || !passwordInput.checkValidity()) {
        showInlineError(registerError, "Le mot de passe doit contenir au moins 12 caractères.");
        passwordInput.focus();
        return;
      }
      const email = emailInput.value.trim().toLowerCase();
      if (!email || !emailInput.checkValidity()) {
        showInlineError(registerError, "Adresse e-mail invalide.");
        transitionStep(stepPassword, stepEmail);
        window.setTimeout(() => emailInput.focus(), 220);
        return;
      }
      if (!establishmentName || !placeId) {
        showInlineError(registerError, "Sélectionnez d'abord votre commerce depuis la page précédente.");
        return;
      }
      const passwordSubmitLabel = passwordSubmit.querySelector("span");
      const oldLabel = passwordSubmitLabel instanceof HTMLElement
        ? passwordSubmitLabel.textContent
        : passwordSubmit.textContent;
      passwordSubmit.disabled = true;
      if (passwordSubmitLabel instanceof HTMLElement) passwordSubmitLabel.textContent = "Création en cours...";
      else passwordSubmit.textContent = "Création en cours...";
      try {
        const response = await fetch(`${API_BASE}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password: passwordInput.value,
            establishment_name: establishmentName,
            google_place_id: placeId,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const fallback = response.status === 409
            ? "Un compte existe déjà avec cet e-mail. Utilisez Se connecter."
            : "Impossible de créer le compte pour le moment.";
          showInlineError(registerError, data?.error || fallback);
          if (response.status === 409) {
            window.setTimeout(() => {
              showInlineError(registerError, "");
              transitionStep(stepPassword, stepLogin);
              signupContent?.classList.add("is-login-mode");
              if (loginEmailInput instanceof HTMLInputElement) loginEmailInput.value = email;
            }, 250);
          }
          return;
        }
        handleOAuthSuccess(data);
      } catch (_) {
        showInlineError(registerError, "Erreur réseau. Vérifiez votre connexion puis réessayez.");
      } finally {
        passwordSubmit.disabled = false;
        const nextLabel = oldLabel || "Créer un compte";
        if (passwordSubmitLabel instanceof HTMLElement) passwordSubmitLabel.textContent = nextLabel;
        else passwordSubmit.textContent = nextLabel;
      }
    });

    if (googleBtn instanceof HTMLButtonElement) {
      const googleClientId =
        typeof import.meta.env?.VITE_GOOGLE_CLIENT_ID === "string"
          ? import.meta.env.VITE_GOOGLE_CLIENT_ID.trim()
          : "";
      if (!googleClientId) {
        googleBtn.disabled = true;
        googleBtn.title = "Connexion Google indisponible";
      } else {
        let googleReady = false;
        const bootstrapGoogle = () => {
          if (typeof window.google === "undefined" || !window.google.accounts?.id) return;
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: (res) => {
              if (!res?.credential) return;
              markGoogleCredentialFlowStarted();
              showOAuthError("");
              fetch(`${API_BASE}/api/auth/google`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  credential: res.credential,
                  ...oauthPayload,
                }),
              })
                .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
                .then(({ ok, data }) => {
                  if (ok) handleOAuthSuccess(data);
                  else showOAuthError(data?.error || "Erreur de connexion Google.");
                })
                .catch(() => showOAuthError("Erreur réseau lors de la connexion Google."))
                .finally(() => hideOAuthConnectingOverlay());
            },
          });
          googleReady = true;
        };

        if (!window.__fidpassCreationGoogleScriptLoaded) {
          window.__fidpassCreationGoogleScriptLoaded = true;
          const script = document.createElement("script");
          script.src = "https://accounts.google.com/gsi/client";
          script.async = true;
          script.onload = bootstrapGoogle;
          document.head.appendChild(script);
        } else {
          bootstrapGoogle();
        }

        googleBtn.addEventListener("click", () => {
          showOAuthError("");
          if (!googleReady || typeof window.google === "undefined" || !window.google.accounts?.id) {
            showOAuthError("Google n'est pas encore prêt. Réessayez.");
            return;
          }
          showOAuthConnectingOverlay("google");
          window.google.accounts.id.prompt(handleGooglePromptMoment);
        });
        loginGoogleBtn?.addEventListener("click", () => googleBtn.click());
      }
    }

    if (appleBtn instanceof HTMLButtonElement) {
      const appleClientId =
        typeof import.meta.env?.VITE_APPLE_CLIENT_ID === "string"
          ? import.meta.env.VITE_APPLE_CLIENT_ID.trim()
          : "";
      if (!appleClientId) {
        appleBtn.disabled = true;
        appleBtn.title = "Connexion Apple indisponible";
      } else {
        const buildAppleRedirectUrl = () =>
          "https://appleid.apple.com/auth/authorize?" +
          new URLSearchParams({
            client_id: appleClientId,
            redirect_uri: `${API_BASE}/api/auth/apple-redirect`,
            response_type: "id_token code",
            scope: "name email",
            response_mode: "form_post",
            state: oauthState,
            nonce: Math.random().toString(36).slice(2) + Date.now().toString(36),
          }).toString();

        const initAppleScript = () => {
          if (window.__fidpassCreationAppleScriptLoaded) return;
          window.__fidpassCreationAppleScriptLoaded = true;
          const script = document.createElement("script");
          script.src =
            "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en/appleid.auth.js";
          script.async = true;
          script.onload = () => {
            if (typeof AppleID === "undefined" || !AppleID?.auth) return;
            try {
              AppleID.auth.init({
                clientId: appleClientId,
                scope: "name email",
                usePopup: true,
                redirectURI: typeof window !== "undefined" ? window.location.origin + "/" : "",
              });
            } catch (_) {}
          };
          document.head.appendChild(script);
        };
        initAppleScript();

        appleBtn.addEventListener("click", () => {
          showOAuthError("");
          showOAuthConnectingOverlay("apple");
          if (typeof AppleID === "undefined" || !AppleID?.auth) {
            window.location.href = buildAppleRedirectUrl();
            return;
          }
          AppleID.auth
            .signIn()
            .then((res) => {
              const idToken = res?.authorization?.id_token;
              const user = res?.user;
              if (!idToken) {
                hideOAuthConnectingOverlay();
                showOAuthError("Token Apple manquant.");
                return;
              }
              fetch(`${API_BASE}/api/auth/apple`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  idToken,
                  name: user?.name
                    ? [user.name.firstName, user.name.lastName].filter(Boolean).join(" ")
                    : undefined,
                  email: user?.email,
                  ...oauthPayload,
                }),
              })
                .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
                .then(({ ok, data }) => {
                  if (ok) handleOAuthSuccess(data);
                  else showOAuthError(data?.error || "Erreur de connexion Apple.");
                })
                .catch(() => showOAuthError("Erreur réseau lors de la connexion Apple."))
                .finally(() => hideOAuthConnectingOverlay());
            })
            .catch((err) => {
              const msg = err?.error || err?.message || "Connexion Apple annulée.";
              if (msg.toLowerCase().includes("popup") || msg.toLowerCase().includes("blocked")) {
                window.location.href = buildAppleRedirectUrl();
                return;
              }
              hideOAuthConnectingOverlay();
              showOAuthError(msg);
            });
        });
        loginAppleBtn?.addEventListener("click", () => appleBtn.click());
      }
    }

    if (initialEmail) {
      emailInput.value = initialEmail;
      if (loginEmailInput instanceof HTMLInputElement) loginEmailInput.value = initialEmail;
    }
    if (mode === "login") {
      if (stepEmail instanceof HTMLElement) stepEmail.classList.add("hidden");
      if (stepPassword instanceof HTMLElement) stepPassword.classList.add("hidden");
      if (stepLogin instanceof HTMLElement) stepLogin.classList.remove("hidden");
      signupContent?.classList.add("is-login-mode");
      window.setTimeout(() => {
        if (loginEmailInput instanceof HTMLInputElement && !loginEmailInput.value.trim() && emailInput.value.trim()) {
          loginEmailInput.value = emailInput.value.trim();
        }
        loginEmailInput?.focus();
      }, 40);
    }
  },
};
