/**
 * Page auth : login, register, forgot/reset password, OAuth Google/Apple.
 * Référence : REFONTE-REGLES.md — un module par écran, max 400 lignes.
 */
import { API_BASE, setAuthToken } from "../config.js";
import { getApiErrorMessage, showApiError } from "../utils/apiError.js";

function isAppleRedirectDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod|Android/i.test(ua) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0 && window.matchMedia("(max-width: 768px)").matches);
}

export function initAuthPage(initialTab) {
  const formLogin = document.getElementById("auth-form-login");
  const formRegister = document.getElementById("auth-form-register");
  const forgotBlock = document.getElementById("auth-forgot-block");
  const resetBlock = document.getElementById("auth-reset-block");
  const socialDivider = document.querySelector(".auth-social-divider");
  const socialButtons = document.querySelector(".auth-social-buttons");
  const authFooter = document.querySelector(".auth-footer");
  const loginError = document.getElementById("auth-login-error");
  const registerError = document.getElementById("auth-register-error");

  function setAuthSectionVisible(which) {
    const showSocial = which === "login" || which === "register";
    if (socialDivider) socialDivider.classList.toggle("hidden", !showSocial);
    if (socialButtons) socialButtons.classList.toggle("hidden", !showSocial);
    if (authFooter) authFooter.classList.toggle("hidden", !showSocial);
    if (formLogin) formLogin.classList.toggle("hidden", which !== "login");
    if (formRegister) formRegister.classList.toggle("hidden", which !== "register");
    if (forgotBlock) forgotBlock.classList.toggle("hidden", which !== "forgot");
    if (resetBlock) resetBlock.classList.toggle("hidden", which !== "reset");
  }

  function showAuthForm(mode) {
    const isLogin = mode === "login";
    setAuthSectionVisible(isLogin ? "login" : "register");
    const visibleForm = isLogin ? formLogin : formRegister;
    if (visibleForm) {
      visibleForm.classList.remove("auth-form-enter");
      visibleForm.offsetHeight;
      visibleForm.classList.add("auth-form-enter");
      window.setTimeout(() => visibleForm.classList.remove("auth-form-enter"), 450);
    }
    if (loginError) { loginError.classList.add("hidden"); loginError.textContent = ""; }
    if (registerError) { registerError.classList.add("hidden"); registerError.textContent = ""; }
    const path = isLogin ? "/login" : "/register";
    if (window.location.pathname !== path) history.replaceState(null, "", path);
  }

  const defaultMode = initialTab === "register" ? "register" : "login";
  showAuthForm(defaultMode);
  const localDbHint = document.getElementById("auth-local-db-hint");
  if (localDbHint && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
    localDbHint.classList.remove("hidden");
  }
  const initialForm = defaultMode === "register" ? formRegister : formLogin;
  if (initialForm) {
    initialForm.classList.add("auth-form-enter");
    window.setTimeout(() => initialForm.classList.remove("auth-form-enter"), 450);
  }

  const params = new URLSearchParams(window.location.search);
  const resetToken = params.get("reset");
  const resetSuccess = params.get("reset") === "success";

  if (resetToken && resetToken !== "success") {
    setAuthSectionVisible("reset");
    const tokenInput = document.getElementById("auth-reset-token");
    if (tokenInput) tokenInput.value = resetToken;
    history.replaceState(null, "", window.location.pathname + "?reset=" + encodeURIComponent(resetToken));
  } else if (resetSuccess) {
    const successEl = document.getElementById("auth-reset-success");
    if (successEl) {
      successEl.textContent = "Mot de passe mis à jour. Vous pouvez vous connecter.";
      successEl.classList.remove("hidden");
    }
    history.replaceState(null, "", window.location.pathname + (params.get("redirect") ? "?redirect=" + params.get("redirect") : ""));
  }

  const sessionCode = params.get("session");
  if (sessionCode === "expired" && loginError) {
    loginError.textContent = "Votre session a expiré. Reconnectez-vous avec votre email et mot de passe.";
    loginError.classList.remove("hidden");
  } else if (sessionCode === "user_not_found" && loginError) {
    loginError.textContent = "Votre compte n'est plus reconnu (serveur réinitialisé). Recréez un compte avec le même email si besoin.";
    loginError.classList.remove("hidden");
  }
  if (sessionCode && !resetToken) {
    history.replaceState(null, "", window.location.pathname + "?redirect=" + (params.get("redirect") || "/app"));
    showAuthForm("login");
  }

  document.getElementById("auth-forgot-password")?.addEventListener("click", (e) => {
    e.preventDefault();
    setAuthSectionVisible("forgot");
    document.getElementById("auth-forgot-success")?.classList.add("hidden");
    document.getElementById("auth-forgot-error")?.classList.add("hidden");
  });

  document.getElementById("auth-forgot-back")?.addEventListener("click", (e) => {
    e.preventDefault();
    showAuthForm("login");
  });

  document.getElementById("auth-show-register")?.addEventListener("click", () => showAuthForm("register"));
  document.getElementById("auth-show-login")?.addEventListener("click", () => showAuthForm("login"));

  document.getElementById("auth-forgot-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("auth-forgot-email")?.value?.trim();
    const errEl = document.getElementById("auth-forgot-error");
    const successEl = document.getElementById("auth-forgot-success");
    const submitBtn = document.getElementById("auth-forgot-submit");
    if (!email) return;
    if (errEl) { errEl.classList.add("hidden"); errEl.textContent = ""; }
    if (successEl) successEl.classList.add("hidden");
    if (submitBtn) submitBtn.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (successEl) {
        successEl.textContent = data.message || "Si un compte existe avec cet email, vous recevrez un lien par email.";
        successEl.classList.remove("hidden");
      }
      if (!res.ok && errEl) {
        errEl.textContent = data.error || "Erreur. Réessayez.";
        errEl.classList.remove("hidden");
      }
    } catch (_) {
      if (errEl) { errEl.textContent = "Erreur réseau. Réessayez."; errEl.classList.remove("hidden"); }
    }
    if (submitBtn) submitBtn.disabled = false;
  });

  document.getElementById("auth-reset-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = document.getElementById("auth-reset-token")?.value?.trim();
    const newPassword = document.getElementById("auth-reset-password")?.value;
    const confirmPassword = document.getElementById("auth-reset-password-confirm")?.value;
    const errEl = document.getElementById("auth-reset-error");
    if (!token) return;
    if (newPassword !== confirmPassword) {
      if (errEl) { errEl.textContent = "Les deux mots de passe ne correspondent pas."; errEl.classList.remove("hidden"); }
      return;
    }
    if (newPassword.length < 8) {
      if (errEl) { errEl.textContent = "Le mot de passe doit faire au moins 8 caractères."; errEl.classList.remove("hidden"); }
      return;
    }
    if (errEl) { errEl.classList.add("hidden"); errEl.textContent = ""; }
    try {
      const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const redirectUrl = window.location.origin + "/login?reset=success" + (params.get("redirect") ? "&redirect=" + encodeURIComponent(params.get("redirect")) : "");
        window.location.replace(redirectUrl);
        return;
      }
      if (errEl) { errEl.textContent = data.error || "Lien invalide ou expiré. Demandez un nouveau lien."; errEl.classList.remove("hidden"); }
    } catch (_) {
      if (errEl) { errEl.textContent = "Erreur réseau. Réessayez."; errEl.classList.remove("hidden"); }
    }
  });

  document.getElementById("auth-login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("auth-login-email")?.value?.trim();
    const password = document.getElementById("auth-login-password")?.value;
    if (!email || !password) {
      if (loginError) {
        loginError.textContent = !password ? "Veuillez saisir votre mot de passe. Si un gestionnaire de mots de passe (ex. iCloud) masque le champ, cliquez dans la zone mot de passe pour l'autoriser à remplir." : "Veuillez saisir votre email.";
        loginError.classList.remove("hidden");
      }
      return;
    }
    if (loginError) { loginError.classList.add("hidden"); loginError.textContent = ""; }
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (loginError) {
          let msg;
          if (res.status === 401) msg = (data?.error && typeof data.error === "string" ? data.error : "Email ou mot de passe incorrect.") + " Si vous aviez déjà un compte et que la connexion ne marche plus, l'hébergeur a peut‑être été réinitialisé : vous pouvez recréer un compte avec le même email.";
          else if (res.status >= 502 && res.status <= 503) msg = "Service temporairement indisponible. Réessayez dans un instant.";
          else msg = getApiErrorMessage(res, data);
          loginError.textContent = msg;
          loginError.classList.remove("hidden");
        }
        return;
      }
      setAuthToken(data.token);
      const redirect = new URLSearchParams(window.location.search).get("redirect") || "/app";
      window.location.replace(redirect);
    } catch (_) {
      showApiError(null, null, loginError);
    }
  });

  document.getElementById("auth-register-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("auth-register-email")?.value?.trim();
    const password = document.getElementById("auth-register-password")?.value;
    if (!email || !password) return;
    if (password.length < 8) {
      if (registerError) { registerError.textContent = "Le mot de passe doit faire au moins 8 caractères."; registerError.classList.remove("hidden"); }
      return;
    }
    if (registerError) { registerError.classList.add("hidden"); registerError.textContent = ""; }
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showApiError(res, data, registerError); return; }
      setAuthToken(data.token);
      const redirect = new URLSearchParams(window.location.search).get("redirect") || "/app";
      window.location.replace(redirect);
    } catch (_) {
      showApiError(null, null, registerError);
    }
  });

  const authGoogleClientId = typeof import.meta.env !== "undefined" ? import.meta.env.VITE_GOOGLE_CLIENT_ID : "";
  const authAppleClientId = typeof import.meta.env !== "undefined" ? import.meta.env.VITE_APPLE_CLIENT_ID : "";

  function authOAuthError(msg) {
    const errEl = formRegister?.classList.contains("hidden") ? loginError : registerError;
    if (errEl) { errEl.textContent = msg || "Connexion impossible."; errEl.classList.remove("hidden"); }
  }

  function authOAuthSuccess(data) {
    if (!data?.token) return;
    setAuthToken(data.token);
    const redirect = new URLSearchParams(window.location.search).get("redirect") || "/app";
    window.location.replace(redirect);
  }

  const authUrlParams = new URLSearchParams(window.location.search);
  const authAppleCode = authUrlParams.get("apple_code");
  const authAppleError = authUrlParams.get("apple_error");
  if (authAppleError && authAppleClientId) {
    history.replaceState({}, "", window.location.pathname + (authUrlParams.get("redirect") ? "?redirect=" + encodeURIComponent(authUrlParams.get("redirect")) : ""));
    authOAuthError(authAppleError === "no_email" ? "Email non fourni par Apple." : "Connexion Apple impossible. Réessayez.");
  } else if (authAppleCode && authAppleClientId) {
    const redirectParam = authUrlParams.get("redirect");
    history.replaceState({}, "", window.location.pathname + (redirectParam ? "?redirect=" + encodeURIComponent(redirectParam) : ""));
    fetch(`${API_BASE}/api/auth/apple-exchange?code=${encodeURIComponent(authAppleCode)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.token) authOAuthSuccess(data);
        else authOAuthError(data.error || "Session expirée. Réessayez.");
      })
      .catch(() => authOAuthError("Erreur réseau ou API inaccessible."));
  }

  if (authGoogleClientId) {
    const authGoogleWrap = document.getElementById("auth-google-btn");
    if (authGoogleWrap && !window.__fidpassAuthGoogleInited) {
      window.__fidpassAuthGoogleInited = true;
      authGoogleWrap.innerHTML = "";
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = () => {
        if (typeof google !== "undefined" && google.accounts?.id) {
          google.accounts.id.initialize({
            client_id: authGoogleClientId,
            callback: (res) => {
              if (!res?.credential) return;
              fetch(`${API_BASE}/api/auth/google`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ credential: res.credential }),
              })
                .then((r) => r.json())
                .then((data) => {
                  if (data.token) authOAuthSuccess(data);
                  else authOAuthError(data.error || "Erreur Google");
                })
                .catch(() => authOAuthError("Erreur réseau"));
            },
          });
          google.accounts.id.renderButton(authGoogleWrap, {
            type: "standard",
            theme: "outline",
            size: "large",
            text: "continue_with",
            width: 320,
            locale: "fr",
          });
        }
      };
      document.head.appendChild(script);
    }
  }

  const authAppleBtn = document.getElementById("auth-apple-btn");
  if (authAppleClientId && authAppleBtn && !window.__fidpassAuthAppleInited) {
    window.__fidpassAuthAppleInited = true;
    const authRedirectUri = API_BASE + "/api/auth/apple-redirect";
    const buildAuthAppleRedirectUrl = () =>
      "https://appleid.apple.com/auth/authorize?" +
      new URLSearchParams({
        client_id: authAppleClientId,
        redirect_uri: authRedirectUri,
        response_type: "id_token code",
        scope: "name email",
        response_mode: "form_post",
        state: "auth",
        nonce: Math.random().toString(36).slice(2) + Date.now().toString(36),
      }).toString();
    authAppleBtn.addEventListener("click", () => {
      if (isAppleRedirectDevice() || typeof AppleID === "undefined" || !AppleID?.auth) {
        window.location.href = buildAuthAppleRedirectUrl();
        return;
      }
      AppleID.auth.signIn()
        .then((res) => {
          const idToken = res?.authorization?.id_token;
          const user = res?.user;
          if (!idToken) { authOAuthError("Token Apple manquant"); return; }
          fetch(`${API_BASE}/api/auth/apple`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              idToken,
              name: user?.name ? [user.name.firstName, user.name.lastName].filter(Boolean).join(" ") : undefined,
              email: user?.email,
            }),
          })
            .then((r) => r.json())
            .then((data) => {
              if (data.token) authOAuthSuccess(data);
              else authOAuthError(data.error || "Erreur Apple");
            })
            .catch(() => authOAuthError("Erreur réseau"));
        })
        .catch((err) => {
          const msg = err?.error || err?.message || (err && String(err));
          authOAuthError(msg || "Connexion Apple annulée. Réessayez.");
        });
    });
    if (!isAppleRedirectDevice()) {
      const script = document.createElement("script");
      script.src = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en/appleid.auth.js";
      script.async = true;
      script.onload = () => {
        if (typeof AppleID !== "undefined") {
          try {
            AppleID.auth.init({
              clientId: authAppleClientId,
              scope: "name email",
              usePopup: true,
              redirectURI: window.location.origin + "/",
            });
          } catch (e) {
            console.error("Apple init error:", e);
          }
        }
      };
      document.head.appendChild(script);
    }
  }

  const authSocialHint = document.getElementById("auth-social-hint");
  function showSocialHint(msg) {
    if (loginError) { loginError.classList.add("hidden"); loginError.textContent = ""; }
    if (authSocialHint) { authSocialHint.textContent = msg || ""; authSocialHint.classList.toggle("hidden", !msg); }
  }
  if (!authGoogleClientId) {
    document.getElementById("auth-google-btn-fallback")?.addEventListener("click", () => {
      showSocialHint("Connexion Google non configurée. Ajoutez VITE_GOOGLE_CLIENT_ID dans .env (voir docs).");
    });
  }
  if (!authAppleClientId && authAppleBtn) {
    authAppleBtn.addEventListener("click", (e) => {
      e.preventDefault();
      showSocialHint("Connexion Apple non configurée. Ajoutez VITE_APPLE_CLIENT_ID dans .env (voir docs).");
    });
  }
}
