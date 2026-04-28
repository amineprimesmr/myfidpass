import "./../creation-carte.css";
import { API_BASE, setAuthToken, setRefreshToken, setPendingEstablishment } from "../config.js";

const MYFIDPASS_SIGNUP_URL = "https://accounts.shopify.com/signup";

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildSignupUrl(email) {
  const value = String(email || "").trim();
  if (!value) return MYFIDPASS_SIGNUP_URL;
  try {
    const u = new URL(MYFIDPASS_SIGNUP_URL);
    u.searchParams.set("email", value);
    u.searchParams.set("signup_strategy", "password");
    return u.toString();
  } catch (_) {
    return MYFIDPASS_SIGNUP_URL;
  }
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
    const commerce = params.get("name") || "";

    root.innerHTML = `
      <section class="creation-carte-signup" aria-label="Inscription commerçant">
        <div class="creation-carte-signup__bg" aria-hidden="true"></div>
        <div class="creation-carte-signup__content">
          <div class="creation-carte-signup__brand" aria-hidden="true">
            <span class="creation-carte-signup__brand-bag">
              <img src="/assets/icone.png" alt="" class="creation-carte-signup__brand-icon" />
            </span>
          </div>
          <h1 class="creation-carte-signup__title">Commencer votre essai gratuit</h1>
          <p class="creation-carte-signup__subtitle">3 jours gratuits, puis le premier mois à 1€</p>
          ${
            commerce
              ? `<p class="creation-carte-signup__commerce">Commerce sélectionné : <strong>${escapeHtml(commerce)}</strong></p>`
              : ""
          }

          <form class="creation-carte-signup__card" id="creation-carte-signup-form" novalidate>
            <div class="creation-carte-signup__step creation-carte-signup__step--email" id="creation-carte-step-email">
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
                <span class="creation-carte-signup__icon">G</span>
                <span>Continuer avec Google</span>
              </button>
              <button type="button" id="creation-carte-apple-btn" class="creation-carte-signup__btn creation-carte-signup__btn--social" data-provider="apple">
                <span class="creation-carte-signup__icon"></span>
                <span>Continuer avec Apple</span>
              </button>
              <p class="creation-carte-signup__oauth-error hidden" id="creation-carte-oauth-error" aria-live="polite"></p>

              <p class="creation-carte-signup__foot">
                Vous avez déjà un compte Myfidpass ? <a href="${MYFIDPASS_SIGNUP_URL}">Se connecter</a>
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
                  minlength="8"
                  required
                />
                <button type="button" class="creation-carte-signup__password-eye" id="creation-carte-password-eye" aria-label="Afficher/Masquer mot de passe">◌</button>
              </div>
              <div class="creation-carte-signup__password-meter" aria-hidden="true">
                <span class="creation-carte-signup__password-meter-fill" id="creation-carte-password-meter-fill"></span>
              </div>
              <p class="creation-carte-signup__password-hint" id="creation-carte-password-hint">Doit contenir au moins 8 caractères.</p>

              <button type="button" class="creation-carte-signup__btn creation-carte-signup__btn--primary creation-carte-signup__btn--arrow" id="creation-carte-password-submit" aria-label="Continuer">
                <span>Créer un compte</span>
              </button>
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
    const emailReview = root.querySelector("#creation-carte-email-review");
    const commerceReview = root.querySelector("#creation-carte-commerce-review");
    const emailEdit = root.querySelector("#creation-carte-email-edit");
    const passwordSubmit = root.querySelector("#creation-carte-password-submit");
    const passwordEye = root.querySelector("#creation-carte-password-eye");
    const passwordHint = root.querySelector("#creation-carte-password-hint");
    const passwordMeterFill = root.querySelector("#creation-carte-password-meter-fill");
    const googleBtn = root.querySelector("#creation-carte-google-btn");
    const appleBtn = root.querySelector("#creation-carte-apple-btn");
    const oauthError = root.querySelector("#creation-carte-oauth-error");
    if (!(form instanceof HTMLFormElement) || !(emailInput instanceof HTMLInputElement)) return;

    const establishmentName = String(commerce || "").trim();
    const placeId = String(params.get("place_id") || "").trim();
    if (commerceReview instanceof HTMLElement) {
      commerceReview.textContent = establishmentName || "Commerce non renseigné";
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

    const handleOAuthSuccess = (data) => {
      if (!data?.token) {
        showOAuthError("Connexion réussie mais session invalide.");
        return;
      }
      setAuthToken(data.token);
      setRefreshToken(data.refreshToken || null);
      window.location.href = "/app";
    };

    const urlParams = new URLSearchParams(window.location.search);
    const appleCode = urlParams.get("apple_code");
    const appleError = urlParams.get("apple_error");
    if (appleError) {
      showOAuthError(appleError === "no_email" ? "Apple n'a pas fourni d'email." : "Connexion Apple impossible.");
    } else if (appleCode) {
      fetch(`${API_BASE}/api/auth/apple-exchange?code=${encodeURIComponent(appleCode)}`)
        .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
        .then(({ ok, data }) => {
          if (ok) handleOAuthSuccess(data);
          else showOAuthError(data?.error || "Session Apple expirée.");
        })
        .catch(() => showOAuthError("Erreur réseau lors de la connexion Apple."));
      const cleaned = new URL(window.location.href);
      cleaned.searchParams.delete("apple_code");
      cleaned.searchParams.delete("apple_error");
      window.history.replaceState({}, "", cleaned.pathname + cleaned.search);
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      emailInput.classList.remove("is-invalid");
      if (!emailInput.value.trim() || !emailInput.checkValidity()) {
        emailInput.classList.add("is-invalid");
        emailInput.focus();
        return;
      }
      if (emailReview instanceof HTMLElement) {
        emailReview.textContent = emailInput.value.trim();
      }
      stepEmail?.classList.add("is-leaving");
      window.setTimeout(() => {
        stepEmail?.classList.add("hidden");
        stepEmail?.classList.remove("is-leaving");
        stepPassword?.classList.remove("hidden");
        stepPassword?.classList.add("is-entering");
        window.setTimeout(() => stepPassword?.classList.remove("is-entering"), 340);
        if (passwordInput instanceof HTMLInputElement) passwordInput.focus();
      }, 180);
    });

    emailEdit?.addEventListener("click", () => {
      stepPassword?.classList.add("is-leaving");
      window.setTimeout(() => {
        stepPassword?.classList.add("hidden");
        stepPassword?.classList.remove("is-leaving");
        stepEmail?.classList.remove("hidden");
        stepEmail?.classList.remove("is-leaving");
        emailInput.focus();
      }, 160);
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
        passwordHint.textContent = "Doit contenir au moins 8 caractères.";
        passwordHint.classList.remove("is-ok");
      } else if (len < 8) {
        passwordHint.textContent = `Encore ${8 - len} caractère${8 - len > 1 ? "s" : ""} minimum.`;
        passwordHint.classList.remove("is-ok");
      } else {
        passwordHint.textContent = "Bien. Vous pouvez ajouter des caractères ou des symboles pour le renforcer davantage.";
        passwordHint.classList.add("is-ok");
      }
      passwordMeterFill?.classList.toggle("is-ok", len >= 8);
    };

    passwordInput?.addEventListener("input", updatePasswordMeter);
    updatePasswordMeter();

    passwordSubmit?.addEventListener("click", () => {
      if (!(passwordInput instanceof HTMLInputElement)) return;
      if (!passwordInput.value.trim() || !passwordInput.checkValidity()) {
        passwordInput.focus();
        return;
      }
      window.location.href = buildSignupUrl(emailInput.value);
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
                .catch(() => showOAuthError("Erreur réseau lors de la connexion Google."));
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
          window.google.accounts.id.prompt();
        });
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
                .catch(() => showOAuthError("Erreur réseau lors de la connexion Apple."));
            })
            .catch((err) => {
              const msg = err?.error || err?.message || "Connexion Apple annulée.";
              if (msg.toLowerCase().includes("popup") || msg.toLowerCase().includes("blocked")) {
                window.location.href = buildAppleRedirectUrl();
                return;
              }
              showOAuthError(msg);
            });
        });
      }
    }
  },
};
