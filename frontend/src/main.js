import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

const API_BASE = typeof import.meta.env?.VITE_API_URL === "string" ? import.meta.env.VITE_API_URL : "";
const AUTH_TOKEN_KEY = "fidpass_token";

const landingEl = document.getElementById("landing");
const fidelityAppEl = document.getElementById("fidelity-app");
const dashboardAppEl = document.getElementById("dashboard-app");
const authAppEl = document.getElementById("auth-app");
const appAppEl = document.getElementById("app-app");
const offersAppEl = document.getElementById("offers-app");
const checkoutAppEl = document.getElementById("checkout-app");

function getAuthToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch (_) {
    return null;
  }
}

function setAuthToken(token) {
  try {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch (_) {}
}

function clearAuthToken() {
  setAuthToken(null);
}

const DEV_BYPASS_PAYMENT_KEY = "fidpass_dev_paid";

function isDevBypassPayment() {
  try {
    return localStorage.getItem(DEV_BYPASS_PAYMENT_KEY) === "1";
  } catch (_) {
    return false;
  }
}

function setDevBypassPayment(on) {
  try {
    if (on) localStorage.setItem(DEV_BYPASS_PAYMENT_KEY, "1");
    else localStorage.removeItem(DEV_BYPASS_PAYMENT_KEY);
  } catch (_) {}
}

function getAuthHeaders() {
  const token = getAuthToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (isDevBypassPayment()) headers["X-Dev-Bypass-Payment"] = "1";
  return headers;
}

/**
 * Géocodage d'une adresse via Nominatim (OpenStreetMap). Retourne { lat, lng } ou null.
 * Respecte la politique d'usage : 1 requête / seconde, User-Agent identifié.
 */
async function geocodeAddress(address) {
  const q = String(address).trim();
  if (!q) return null;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "MyFidpass/1.0 (https://myfidpass.fr)" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const first = data?.[0];
  if (!first || first.lat == null || first.lon == null) return null;
  const lat = parseFloat(first.lat);
  const lng = parseFloat(first.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/**
 * Route : / → landing, /dashboard → tableau de bord, /app → espace connecté, /login, /register, etc.
 */
function getRoute() {
  const path = window.location.pathname.replace(/\/$/, "");
  const match = path.match(/^\/fidelity\/([^/]+)$/);
  if (match) return { type: "fidelity", slug: match[1] };
  if (path === "/dashboard") return { type: "dashboard" };
  if (path === "/app") return { type: "app" };
  if (path === "/login") return { type: "auth", tab: "login" };
  if (path === "/register") return { type: "auth", tab: "register" };
  if (path === "/creer-ma-carte") return { type: "templates" };
  if (path === "/choisir-offre") return { type: "offers" };
  if (path === "/checkout") return { type: "checkout" };
  if (path === "/mentions-legales") return { type: "legal", page: "mentions" };
  if (path === "/politique-confidentialite") return { type: "legal", page: "politique" };
  if (path === "/cgu") return { type: "legal", page: "cgu" };
  if (path === "/cgv") return { type: "legal", page: "cgv" };
  if (path === "/cookies") return { type: "legal", page: "cookies" };
  if (path === "/integration") return { type: "integration" };
  return { type: "landing" };
}

/** Met à jour l’affichage des étapes dans le header parcours (1=accueil, 2=créateur, 3=checkout). Aucun verrou : on peut toujours naviguer. */
function setBuilderHeaderStep(activeStep) {
  const headerSteps = document.querySelectorAll(".builder-header-step");
  headerSteps.forEach((el) => {
    const n = parseInt(el.getAttribute("data-step"), 10);
    el.classList.toggle("builder-header-step-active", n === activeStep);
    el.classList.remove("builder-header-step-locked");
    el.setAttribute("aria-current", n === activeStep ? "step" : null);
    el.disabled = false;
  });
}

/** Clics sur le header parcours quand on est sur la page checkout (étape 3). */
function attachBuilderHeaderNavForCheckout() {
  document.querySelectorAll(".builder-header-step").forEach((btn) => {
    const n = parseInt(btn.getAttribute("data-step"), 10);
    btn.onclick = () => {
      if (n === 3) return;
      const url = n === 1 ? "/" : n === 2 ? "/creer-ma-carte" : "/creer-ma-carte";
      history.pushState({}, "", url);
      initRouting();
    };
  });
}

function initRouting() {
  const route = getRoute();
  document.body.classList.toggle("page-checkout", route.type === "checkout");
  document.body.classList.toggle("page-app", route.type === "app");

  const builderHeader = document.getElementById("builder-header");

  if (route.type === "fidelity") {
    landingEl.classList.add("hidden");
    if (builderHeader) builderHeader.classList.add("hidden");
    if (dashboardAppEl) dashboardAppEl.classList.add("hidden");
    if (authAppEl) authAppEl.classList.add("hidden");
    if (appAppEl) appAppEl.classList.add("hidden");
    if (offersAppEl) offersAppEl.classList.add("hidden");
    if (checkoutAppEl) checkoutAppEl.classList.add("hidden");
    fidelityAppEl.classList.remove("hidden");
    return route.slug;
  }

  if (route.type === "app") {
    if (!getAuthToken()) {
      window.location.replace("/login?redirect=/app");
      return null;
    }
    landingEl.classList.add("hidden");
    if (builderHeader) builderHeader.classList.add("hidden");
    fidelityAppEl.classList.add("hidden");
    if (dashboardAppEl) dashboardAppEl.classList.add("hidden");
    if (authAppEl) authAppEl.classList.add("hidden");
    if (offersAppEl) offersAppEl.classList.add("hidden");
    if (checkoutAppEl) checkoutAppEl.classList.add("hidden");
    if (appAppEl) appAppEl.classList.remove("hidden");
    initAppPage();
    return null;
  }

  if (route.type === "auth") {
    landingEl.classList.add("hidden");
    if (builderHeader) builderHeader.classList.add("hidden");
    fidelityAppEl.classList.add("hidden");
    if (dashboardAppEl) dashboardAppEl.classList.add("hidden");
    if (appAppEl) appAppEl.classList.add("hidden");
    if (offersAppEl) offersAppEl.classList.add("hidden");
    if (checkoutAppEl) checkoutAppEl.classList.add("hidden");
    if (authAppEl) authAppEl.classList.remove("hidden");
    initAuthPage(route.tab || "login");
    return null;
  }

  if (route.type === "checkout") {
    landingEl.classList.add("hidden");
    fidelityAppEl.classList.add("hidden");
    if (dashboardAppEl) dashboardAppEl.classList.add("hidden");
    if (authAppEl) authAppEl.classList.add("hidden");
    if (appAppEl) appAppEl.classList.add("hidden");
    if (offersAppEl) offersAppEl.classList.add("hidden");
    if (checkoutAppEl) {
      checkoutAppEl.classList.remove("hidden");
      checkoutAppEl.classList.add("checkout-with-builder-header");
    }
    if (builderHeader) {
      builderHeader.classList.remove("hidden");
      builderHeader.setAttribute("aria-hidden", "false");
      setBuilderHeaderStep(3);
      attachBuilderHeaderNavForCheckout();
    }
    initCheckoutPage();
    return null;
  }

  if (route.type === "dashboard") {
    fidelityAppEl.classList.add("hidden");
    landingEl.classList.add("hidden");
    if (builderHeader) builderHeader.classList.add("hidden");
    if (authAppEl) authAppEl.classList.add("hidden");
    if (appAppEl) appAppEl.classList.add("hidden");
    if (offersAppEl) offersAppEl.classList.add("hidden");
    if (checkoutAppEl) checkoutAppEl.classList.add("hidden");
    if (dashboardAppEl) {
      dashboardAppEl.classList.remove("hidden");
      initDashboardPage();
    }
    return null;
  }

  landingEl.classList.remove("hidden");
  fidelityAppEl.classList.add("hidden");
  if (dashboardAppEl) dashboardAppEl.classList.add("hidden");
  if (authAppEl) authAppEl.classList.add("hidden");
  if (appAppEl) appAppEl.classList.add("hidden");
  if (offersAppEl) offersAppEl.classList.add("hidden");
  if (checkoutAppEl) {
    checkoutAppEl.classList.add("hidden");
    checkoutAppEl.classList.remove("checkout-with-builder-header");
  }
  const landingMain = document.getElementById("landing-main");
  const landingLegal = document.getElementById("landing-legal");
  const landingTemplates = document.getElementById("landing-templates");
  const legalContent = document.getElementById("landing-legal-content");

  if (route.type === "templates") {
    if (landingEl) landingEl.classList.add("builder-visible");
    const bannerMedia = document.getElementById("site-banner-media");
    const siteBanner = document.querySelector(".site-banner");
    const landingHeader = document.getElementById("landing-header");
    if (bannerMedia) bannerMedia.classList.add("hidden");
    if (siteBanner) siteBanner.classList.add("hidden");
    if (landingHeader) landingHeader.classList.add("hidden");
    if (builderHeader) {
      builderHeader.classList.remove("hidden");
      builderHeader.setAttribute("aria-hidden", "false");
    }
    if (landingMain) landingMain.classList.add("hidden");
    if (landingLegal) landingLegal.classList.add("hidden");
    if (landingTemplates) {
      landingTemplates.classList.remove("hidden");
      initBuilderPage();
    }
    updateAuthNavLinks();
  } else if (route.type === "offers") {
    if (!getAuthToken()) {
      window.location.replace("/login?redirect=/choisir-offre");
      return null;
    }
    landingEl.classList.add("hidden");
    fidelityAppEl.classList.add("hidden");
    if (dashboardAppEl) dashboardAppEl.classList.add("hidden");
    if (authAppEl) authAppEl.classList.add("hidden");
    if (appAppEl) appAppEl.classList.add("hidden");
    if (checkoutAppEl) checkoutAppEl.classList.add("hidden");
    const offersEl = document.getElementById("offers-app");
    if (offersEl) {
      offersEl.classList.remove("hidden");
      initOffersPage();
    }
  } else if (route.type === "legal" && landingMain && landingLegal && legalContent) {
    landingMain.classList.add("hidden");
    if (landingTemplates) landingTemplates.classList.add("hidden");
    const landingIntegration = document.getElementById("landing-integration");
    if (landingIntegration) landingIntegration.classList.add("hidden");
    landingLegal.classList.remove("hidden");
    const legalHtml = getLegalPageHtml(route.page);
    if (legalHtml) legalContent.innerHTML = legalHtml;
  } else if (route.type === "integration") {
    landingMain?.classList.add("hidden");
    if (landingTemplates) landingTemplates.classList.add("hidden");
    landingLegal?.classList.add("hidden");
    const landingIntegration = document.getElementById("landing-integration");
    if (landingIntegration) {
      landingIntegration.classList.remove("hidden");
      const slugHint = document.getElementById("integration-page-slug-hint");
      const slug = new URLSearchParams(window.location.search).get("slug");
      if (slugHint && slug) {
        slugHint.textContent = "Commerce concerné : " + slug;
        slugHint.classList.remove("hidden");
      }
    }
  } else {
    if (landingEl) landingEl.classList.remove("builder-visible");
    const bannerMedia = document.getElementById("site-banner-media");
    const siteBanner = document.querySelector(".site-banner");
    const landingHeader = document.getElementById("landing-header");
    const builderHeader = document.getElementById("builder-header");
    if (bannerMedia) bannerMedia.classList.remove("hidden");
    if (siteBanner) siteBanner.classList.remove("hidden");
    if (landingHeader) landingHeader.classList.remove("hidden");
    if (builderHeader) {
      builderHeader.classList.add("hidden");
      builderHeader.setAttribute("aria-hidden", "true");
    }
    if (landingMain) landingMain.classList.remove("hidden");
    if (landingLegal) landingLegal.classList.add("hidden");
    const landingIntegration = document.getElementById("landing-integration");
    if (landingIntegration) landingIntegration.classList.add("hidden");
    if (landingTemplates) landingTemplates.classList.add("hidden");
    updateAuthNavLinks();
  }
  return null;
}

/** Met à jour les liens "Se connecter" / "Mon espace" selon la présence du token (landing + builder). */
function updateAuthNavLinks() {
  const isLoggedIn = !!getAuthToken();
  const label = isLoggedIn ? "Mon espace" : "Se connecter";
  const landingHref = isLoggedIn ? "/app" : "/login?redirect=/app";
  document.querySelectorAll(".landing-nav-login-link, .landing-menu-drawer-login").forEach((a) => {
    a.textContent = label;
    a.href = landingHref;
  });
  const builderLogin = document.getElementById("builder-header-login");
  if (builderLogin) {
    builderLogin.textContent = label;
    builderLogin.href = isLoggedIn ? "/app" : "/login?redirect=/creer-ma-carte";
  }
}

function initAuthPage(initialTab) {
  const tabLogin = document.querySelector('#auth-tabs [data-tab="login"]');
  const tabRegister = document.querySelector('#auth-tabs [data-tab="register"]');
  const formLogin = document.getElementById("auth-form-login");
  const formRegister = document.getElementById("auth-form-register");
  const loginError = document.getElementById("auth-login-error");
  const registerError = document.getElementById("auth-register-error");

  function showTab(tab) {
    const isLogin = tab === "login";
    if (tabLogin) tabLogin.classList.toggle("active", isLogin);
    if (tabRegister) tabRegister.classList.toggle("active", !isLogin);
    if (formLogin) formLogin.classList.toggle("hidden", !isLogin);
    if (formRegister) formRegister.classList.toggle("hidden", isLogin);
    if (loginError) { loginError.classList.add("hidden"); loginError.textContent = ""; }
    if (registerError) { registerError.classList.add("hidden"); registerError.textContent = ""; }
    const path = isLogin ? "/login" : "/register";
    if (window.location.pathname !== path) history.replaceState(null, "", path);
  }

  tabLogin?.addEventListener("click", () => showTab("login"));
  tabRegister?.addEventListener("click", () => showTab("register"));
  showTab(initialTab === "register" ? "register" : "login");

  const params = new URLSearchParams(window.location.search);
  const sessionCode = params.get("session");
  if (sessionCode === "expired" && loginError) {
    loginError.textContent = "Votre session a expiré. Reconnectez-vous avec votre email et mot de passe.";
    loginError.classList.remove("hidden");
  } else if (sessionCode === "user_not_found" && loginError) {
    loginError.textContent = "Votre compte n’est plus reconnu (serveur réinitialisé). Recréez un compte avec le même email si besoin.";
    loginError.classList.remove("hidden");
  }
  if (sessionCode) {
    history.replaceState(null, "", window.location.pathname + "?redirect=" + (params.get("redirect") || "/app"));
  }

  document.getElementById("auth-login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("auth-login-email")?.value?.trim();
    const password = document.getElementById("auth-login-password")?.value;
    if (!email || !password) return;
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
          let msg = data.error || "Erreur de connexion";
          if (res.status === 401) {
            msg += " Si vous aviez déjà un compte et que la connexion ne marche plus, l’hébergeur a peut‑être été réinitialisé : vous pouvez recréer un compte avec le même email.";
          }
          loginError.textContent = msg;
          loginError.classList.remove("hidden");
        }
        return;
      }
      setAuthToken(data.token);
      const redirectParams = new URLSearchParams(window.location.search);
      const redirect = redirectParams.get("redirect") || "/app";
      window.location.replace(redirect);
    } catch (err) {
      if (loginError) {
        loginError.textContent = "Erreur réseau. Réessayez.";
        loginError.classList.remove("hidden");
      }
    }
  });

  document.getElementById("auth-register-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("auth-register-name")?.value?.trim();
    const email = document.getElementById("auth-register-email")?.value?.trim();
    const password = document.getElementById("auth-register-password")?.value;
    if (!email || !password) return;
    if (password.length < 8) {
      if (registerError) {
        registerError.textContent = "Le mot de passe doit faire au moins 8 caractères.";
        registerError.classList.remove("hidden");
      }
      return;
    }
    if (registerError) { registerError.classList.add("hidden"); registerError.textContent = ""; }
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: name || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (registerError) {
          registerError.textContent = data.error || `Erreur serveur (${res.status}). Réessayez ou testez sur myfidpass.fr si vous êtes en local.`;
          registerError.classList.remove("hidden");
        }
        return;
      }
      setAuthToken(data.token);
      const redirectParams = new URLSearchParams(window.location.search);
      const redirect = redirectParams.get("redirect") || "/app";
      window.location.replace(redirect);
    } catch (err) {
      if (registerError) {
        registerError.textContent = "Impossible de joindre l'API. En local : démarrez le backend (port 3001). Sinon testez sur myfidpass.fr.";
        registerError.classList.remove("hidden");
      }
    }
  });

  const authGoogleClientId = typeof import.meta.env !== "undefined" ? import.meta.env.VITE_GOOGLE_CLIENT_ID : "";
  const authAppleClientId = typeof import.meta.env !== "undefined" ? import.meta.env.VITE_APPLE_CLIENT_ID : "";

  function authOAuthError(msg) {
    const errEl = formRegister?.classList.contains("hidden") ? loginError : registerError;
    if (errEl) {
      errEl.textContent = msg || "Connexion impossible.";
      errEl.classList.remove("hidden");
    }
  }

  function authOAuthSuccess(data) {
    if (!data?.token) return;
    setAuthToken(data.token);
    const redirect = new URLSearchParams(window.location.search).get("redirect") || "/app";
    window.location.replace(redirect);
  }

  // Retour du flux Apple (form_post) : backend redirige vers /login?apple_code=xxx
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
            width: 280,
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
    const buildAuthAppleRedirectUrl = () => {
      const state = "auth";
      const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
      return "https://appleid.apple.com/auth/authorize?" + new URLSearchParams({
        client_id: authAppleClientId,
        redirect_uri: authRedirectUri,
        response_type: "id_token code",
        scope: "name email",
        response_mode: "form_post",
        state,
        nonce,
      }).toString();
    };
    authAppleBtn.addEventListener("click", () => {
      // Sur mobile ou si le script Apple n’a pas chargé : flux par redirection
      if (isAppleRedirectDevice() || typeof AppleID === "undefined" || !AppleID?.auth) {
        window.location.href = buildAuthAppleRedirectUrl();
        return;
      }
      AppleID.auth.signIn()
        .then((res) => {
          const idToken = res?.authorization?.id_token;
          const user = res?.user;
          if (!idToken) {
            authOAuthError("Token Apple manquant");
            return;
          }
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
  } else if (authAppleBtn) {
    authAppleBtn.style.display = "none";
  }

  // Toujours afficher la section ; boutons actifs seulement si les client IDs sont configurés.
  if (!authGoogleClientId) {
    const authGoogleWrap = document.getElementById("auth-google-btn");
    if (authGoogleWrap && !authGoogleWrap.querySelector("iframe")) {
      authGoogleWrap.innerHTML = "<span class=\"auth-social-placeholder\">Google (VITE_GOOGLE_CLIENT_ID)</span>";
      authGoogleWrap.classList.add("auth-social-placeholder-wrap");
    }
  }
  if (!authAppleClientId && authAppleBtn) {
    authAppleBtn.disabled = true;
    authAppleBtn.title = "Configurez VITE_APPLE_CLIENT_ID pour activer";
    authAppleBtn.classList.add("auth-btn-social-disabled");
  }
}

function initAppPage() {
  const emptyEl = document.getElementById("app-empty");
  const contentEl = document.getElementById("app-dashboard-content");
  const businessNameEl = document.getElementById("app-business-name");
  const userEmailEl = document.getElementById("app-user-email");
  const logoutBtn = document.getElementById("app-logout");
  const resetAllBtn = document.getElementById("app-reset-all");

  logoutBtn?.addEventListener("click", () => {
    clearAuthToken();
    window.location.replace("/");
  });

  resetAllBtn?.addEventListener("click", async () => {
    if (!confirm("Supprimer tous les comptes, cartes, membres et données ? Cette action est irréversible.")) return;
    let secret = "";
    try {
      let res = await fetch(`${API_BASE}/api/dev/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ secret: secret || undefined }),
      });
      let data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        secret = prompt("Secret requis (variable RESET_SECRET sur Railway) :");
        if (secret === null) return;
        res = await fetch(`${API_BASE}/api/dev/reset`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ secret }),
        });
        data = await res.json().catch(() => ({}));
      }
      if (res.status === 403) {
        alert("Secret incorrect.");
        return;
      }
      if (res.status === 404) {
        alert("Reset désactivé en production (définir RESET_SECRET sur Railway pour l’activer).");
        return;
      }
      if (!res.ok) {
        alert(data.error || "Erreur lors du reset.");
        return;
      }
      clearAuthToken();
      alert("Toutes les données ont été supprimées.");
      window.location.replace("/");
    } catch (e) {
      alert("Impossible de contacter l’API.");
    }
  });

  (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, { headers: getAuthHeaders() });
      if (res.status === 401) {
        const body = await res.json().catch(() => ({}));
        clearAuthToken();
        const code = body.code || "invalid";
        window.location.replace("/login?redirect=/app&session=" + code);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      const hasSubscription = data.hasActiveSubscription || isDevBypassPayment();
      if (!hasSubscription) {
        window.location.replace("/choisir-offre");
        return;
      }
      const user = data.user;
      const businesses = data.businesses || [];
      if (userEmailEl) userEmailEl.textContent = user?.email || "";
      const mobileProfilEmail = document.getElementById("app-mobile-profil-email");
      if (mobileProfilEmail) mobileProfilEmail.textContent = user?.email || "";

      if (businesses.length === 0) {
        if (emptyEl) emptyEl.classList.remove("hidden");
        if (contentEl) contentEl.classList.add("hidden");
        if (businessNameEl) businessNameEl.textContent = "Mon espace";
        return;
      }
      if (emptyEl) emptyEl.classList.add("hidden");
      if (contentEl) contentEl.classList.remove("hidden");
      const business = businesses[0];
      if (businessNameEl) businessNameEl.textContent = business.organization_name || business.name || business.slug;
      initAppSidebar();
      initAppDashboard(business.slug);
    } catch (_) {
      if (emptyEl) emptyEl.classList.remove("hidden");
      if (contentEl) contentEl.classList.add("hidden");
    }
  })();

  const emptyForm = document.getElementById("app-empty-create-form");
  const emptyName = document.getElementById("app-empty-name");
  const emptySlug = document.getElementById("app-empty-slug");
  const emptySlugPreview = document.getElementById("app-empty-slug-preview");
  const emptyCreateError = document.getElementById("app-empty-create-error");

  function updateEmptySlugPreview() {
    const s = slugify(emptySlug?.value || emptyName?.value || "");
    if (emptySlugPreview) emptySlugPreview.textContent = s || "votre-lien";
  }
  emptyName?.addEventListener("input", () => {
    if (!emptySlug?.dataset.manual) {
      const s = slugify(emptyName?.value || "");
      if (emptySlug) emptySlug.value = s;
      updateEmptySlugPreview();
    }
  });
  emptySlug?.addEventListener("input", () => {
    if (emptySlug) emptySlug.dataset.manual = "1";
    updateEmptySlugPreview();
  });

  (function prefillEmptyFromDraft() {
    try {
      const raw = localStorage.getItem(BUILDER_DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.organizationName && emptyName && !emptyName.value?.trim()) {
        emptyName.value = d.organizationName.trim();
        if (emptySlug && !emptySlug.dataset.manual) {
          emptySlug.value = slugify(d.organizationName.trim());
          updateEmptySlugPreview();
        }
      }
    } catch (_) {}
  })();

  emptyForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = emptyName?.value?.trim();
    const slugRaw = emptySlug?.value?.trim() || slugify(name || "");
    const slug = slugify(slugRaw) || slugify(name || "") || "ma-carte";
    if (!name) {
      if (emptyCreateError) {
        emptyCreateError.textContent = "Saisissez le nom de l'établissement.";
        emptyCreateError.classList.remove("hidden");
      }
      return;
    }
    if (emptyCreateError) emptyCreateError.classList.add("hidden");
    let tpl = CARD_TEMPLATES.find((t) => t.id === "classic") || CARD_TEMPLATES[0];
    let logoBase64 = null;
    try {
      const draftRaw = localStorage.getItem(BUILDER_DRAFT_KEY);
      if (draftRaw) {
        const draft = JSON.parse(draftRaw);
        if (draft.selectedTemplateId && CARD_TEMPLATES.some((t) => t.id === draft.selectedTemplateId)) {
          const draftTpl = CARD_TEMPLATES.find((t) => t.id === draft.selectedTemplateId);
          if (draftTpl) tpl = draftTpl;
        }
        if (draft.logoDataUrl && typeof draft.logoDataUrl === "string" && draft.logoDataUrl.startsWith("data:image/")) {
          logoBase64 = draft.logoDataUrl;
        }
      }
    } catch (_) {}
    const body = {
          name,
          slug,
          organizationName: name,
          backgroundColor: tpl.bg,
          foregroundColor: tpl.fg,
          labelColor: tpl.label,
    };
    if (logoBase64) body.logoBase64 = logoBase64;
    try {
      const res = await fetch(`${API_BASE}/api/businesses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) {
          if (emptyCreateError) {
            emptyCreateError.textContent = "Ce lien est déjà pris. Choisissez un autre lien.";
            emptyCreateError.classList.remove("hidden");
          }
          return;
        }
        if (res.status === 403 && (data.code === "subscription_required")) {
          if (isDevBypassPayment()) {
            if (emptyCreateError) {
              emptyCreateError.innerHTML =
                "Mode dev actif ici. Pour autoriser la création sans paiement : <strong>Railway</strong> → ton projet → service backend → <strong>Variables</strong> → <strong>+ New Variable</strong> → Nom = <code>DEV_BYPASS_PAYMENT</code>, Valeur = <code>true</code> → enregistre puis <strong>Redeploy</strong> le service. Voir docs/ETAPES-DEPLOIEMENT.md (mode dev).";
              emptyCreateError.classList.remove("hidden");
            }
            return;
          }
          window.location.replace("/choisir-offre");
          return;
        }
        if (emptyCreateError) {
          emptyCreateError.textContent = data.error || "Erreur lors de la création.";
          emptyCreateError.classList.remove("hidden");
        }
        return;
      }
      if (emptyEl) emptyEl.classList.add("hidden");
      if (contentEl) contentEl.classList.remove("hidden");
      if (businessNameEl) businessNameEl.textContent = data.organization_name || data.name || data.slug;
      initAppSidebar();
      initAppDashboard(data.slug);
    } catch (err) {
      if (emptyCreateError) {
        emptyCreateError.textContent = "Erreur réseau. Réessayez.";
        emptyCreateError.classList.remove("hidden");
      }
    }
  });
}

const APP_SECTION_IDS = ["vue-ensemble", "scanner", "caisse", "membres", "historique", "personnaliser", "carte-perimetre", "integration", "notifications", "profil"];

const APP_MOBILE_TITLES = {
  "vue-ensemble": "Tableau de bord",
  "scanner": "Scanner",
  "personnaliser": "Ma Carte",
  "carte-perimetre": "Carte & périmètre",
  "profil": "Profil",
};

function showAppSection(sectionId) {
  let normalized = sectionId === "partager" ? "personnaliser" : sectionId;
  if (normalized === "profil" && window.matchMedia("(min-width: 769px)").matches) normalized = "vue-ensemble";
  const id = APP_SECTION_IDS.includes(normalized) ? normalized : "vue-ensemble";
  const links = document.querySelectorAll("#app-app .app-sidebar-link[data-section]");
  const content = document.getElementById("app-dashboard-content");
  if (!content) return;
  content.querySelectorAll(".app-section").forEach((section) => {
    section.classList.toggle("app-section-visible", section.id === id);
  });
  links.forEach((l) => {
    l.classList.toggle("app-sidebar-link-active", l.getAttribute("data-section") === id);
  });
  document.querySelectorAll("#app-mobile-tab-bar .app-mobile-tab").forEach((t) => {
    t.classList.toggle("active", t.getAttribute("data-mobile-tab") === id);
  });
  const headerTitle = document.getElementById("app-mobile-header-title");
  if (headerTitle) headerTitle.textContent = APP_MOBILE_TITLES[id] || "Myfidpass";
  const newHash = "#" + id;
  if (window.location.hash !== newHash) {
    window.history.replaceState(null, "", window.location.pathname + newHash);
  }
  window.dispatchEvent(new CustomEvent("app-section-change", { detail: { sectionId: id } }));
}

function initAppSidebar() {
  const links = document.querySelectorAll("#app-app .app-sidebar-link[data-section]");
  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const id = link.getAttribute("data-section");
      if (APP_SECTION_IDS.includes(id)) {
        showAppSection(id);
      }
    });
  });
  const hashSection = (window.location.hash || "#vue-ensemble").slice(1);
  const sectionToShow = hashSection === "partager" ? "personnaliser" : (APP_SECTION_IDS.includes(hashSection) ? hashSection : "vue-ensemble");
  showAppSection(sectionToShow);
  window.addEventListener("hashchange", () => {
    const section = (window.location.hash || "#vue-ensemble").slice(1);
    const toShow = section === "partager" ? "personnaliser" : (APP_SECTION_IDS.includes(section) ? section : "vue-ensemble");
    showAppSection(toShow);
  });
  initAppMobile();
}

function initAppMobile() {
  const appEl = document.getElementById("app-app");
  const tabBar = document.getElementById("app-mobile-tab-bar");
  const headerScanBtn = document.getElementById("app-mobile-scan-btn");
  const mobileLogout = document.getElementById("app-mobile-logout");
  const mobileMessageInput = document.getElementById("app-mobile-message-input");
  const mobileMessageSend = document.getElementById("app-mobile-message-send");

  function setMobileMode(isMobile) {
    appEl?.classList.toggle("app-mobile", isMobile);
  }
  const mq = window.matchMedia("(max-width: 768px)");
  setMobileMode(mq.matches);
  mq.addEventListener("change", (e) => setMobileMode(e.matches));

  tabBar?.querySelectorAll(".app-mobile-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const id = tab.getAttribute("data-mobile-tab");
      if (id && APP_SECTION_IDS.includes(id)) showAppSection(id);
    });
  });
  headerScanBtn?.addEventListener("click", () => showAppSection("scanner"));

  document.querySelectorAll(".app-mobile-profil-item[data-section]").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const id = item.getAttribute("data-section");
      if (id) showAppSection(id);
    });
  });
  mobileLogout?.addEventListener("click", () => {
    clearAuthToken();
    window.location.replace("/");
  });

  if (mobileMessageSend && mobileMessageInput) {
    mobileMessageSend.addEventListener("click", () => {
      const text = (mobileMessageInput.value || "").trim();
      if (text) {
        showAppSection("notifications");
        const notifMsg = document.getElementById("app-notif-message");
        if (notifMsg) notifMsg.value = text;
      }
    });
  }

  const profileEmailEl = document.getElementById("app-mobile-profil-email");
  const userEmailEl = document.getElementById("app-user-email");
  if (profileEmailEl && userEmailEl) profileEmailEl.textContent = userEmailEl.textContent || "";
}

const DASHBOARD_TOKEN_STORAGE_KEY = "fidpass_dashboard_token";

function initAppDashboard(slug) {
  const urlParams = new URLSearchParams(window.location.search);
  let dashboardToken = urlParams.get("token");
  if (dashboardToken) {
    try {
      sessionStorage.setItem(`${DASHBOARD_TOKEN_STORAGE_KEY}_${slug}`, dashboardToken);
    } catch (_) {}
  } else {
    try {
      dashboardToken = sessionStorage.getItem(`${DASHBOARD_TOKEN_STORAGE_KEY}_${slug}`);
    } catch (_) {}
  }
  const api = (path, opts = {}) => {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${API_BASE}/api/businesses/${encodeURIComponent(slug)}${path}${dashboardToken ? `${sep}token=${encodeURIComponent(dashboardToken)}` : ""}`;
    const headers = { ...opts.headers, ...getAuthHeaders() };
    if (dashboardToken) headers["X-Dashboard-Token"] = dashboardToken;
    return fetch(url, { ...opts, headers });
  };

  const statMembers = document.getElementById("app-stat-members");
  const statPoints = document.getElementById("app-stat-points");
  const statTransactions = document.getElementById("app-stat-transactions");
  const statNew30 = document.getElementById("app-stat-new30");
  const statInactive30 = document.getElementById("app-stat-inactive30");
  const statAvgPoints = document.getElementById("app-stat-avg-points");
  const memberSearchInput = document.getElementById("app-member-search");
  const memberListEl = document.getElementById("app-member-list");
  const amountInput = document.getElementById("app-amount");
  const oneVisitBtn = document.getElementById("app-one-visit");
  const addPointsBtn = document.getElementById("app-add-points");
  const caisseMessage = document.getElementById("app-caisse-message");
  const membersSearchInput = document.getElementById("app-members-search");
  const membersTbody = document.getElementById("app-members-tbody");
  const transactionsTbody = document.getElementById("app-transactions-tbody");

  const shareLinkEl = document.getElementById("app-share-link");
  const shareQrEl = document.getElementById("app-share-qr");
  const shareCopyBtn = document.getElementById("app-share-copy");

  const fullShareLink = (typeof window !== "undefined" && window.location.origin ? window.location.origin.replace(/\/$/, "") : "") + "/fidelity/" + slug;
  if (shareLinkEl) shareLinkEl.value = fullShareLink;
  const shareSlugValueEl = document.getElementById("app-share-slug-value");
  if (shareSlugValueEl) shareSlugValueEl.textContent = slug || "";
  if (shareQrEl) shareQrEl.src = "https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=" + encodeURIComponent(fullShareLink);
  if (shareCopyBtn) {
    shareCopyBtn.addEventListener("click", () => {
      if (!shareLinkEl) return;
      shareLinkEl.select();
      navigator.clipboard.writeText(shareLinkEl.value).then(() => {
        shareCopyBtn.textContent = "Copié !";
        setTimeout(() => { shareCopyBtn.textContent = "Copier"; }, 2000);
      });
    });
  }
  const shareSmsTextEl = document.getElementById("app-share-sms-text");
  const shareCopySmsBtn = document.getElementById("app-share-copy-sms");
  const shareDownloadQrBtn = document.getElementById("app-share-download-qr");
  const sharePageLinkEl = document.getElementById("app-share-page-link");
  const smsText = "Ajoutez notre carte fidélité en un clic : " + fullShareLink;
  if (shareSmsTextEl) shareSmsTextEl.value = smsText;
  if (shareCopySmsBtn) {
    shareCopySmsBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(smsText).then(() => {
        shareCopySmsBtn.textContent = "Copié !";
        setTimeout(() => { shareCopySmsBtn.textContent = "Copier le texte"; }, 2000);
      });
    });
  }
  if (shareDownloadQrBtn && shareQrEl) {
    shareDownloadQrBtn.addEventListener("click", () => {
      const canvas = document.createElement("canvas");
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const a = document.createElement("a");
        a.download = "fidpass-qr-" + slug + ".png";
        a.href = canvas.toDataURL("image/png");
        a.click();
      };
      img.src = shareQrEl.src;
    });
  }
  if (sharePageLinkEl) {
    sharePageLinkEl.href = fullShareLink;
  }

  const integrationBaseUrlEl = document.getElementById("app-integration-base-url");
  const integrationSlugEl = document.getElementById("app-integration-slug");
  const integrationCurlEl = document.getElementById("app-integration-curl");
  const integrationPrestataireLinkEl = document.getElementById("app-integration-prestataire-link");
  const origin = typeof window !== "undefined" && window.location.origin ? window.location.origin.replace(/\/$/, "") : "";
  if (integrationBaseUrlEl) integrationBaseUrlEl.value = API_BASE || "";
  if (integrationSlugEl) integrationSlugEl.value = slug || "";
  const prestatairePageUrl = `${origin}/integration?slug=${encodeURIComponent(slug || "")}`;
  if (integrationPrestataireLinkEl) integrationPrestataireLinkEl.value = prestatairePageUrl;
  const integrationOpenPageEl = document.getElementById("app-integration-open-page");
  if (integrationOpenPageEl) integrationOpenPageEl.href = prestatairePageUrl;
  const walletPreviewQr = document.getElementById("app-wallet-preview-qr");
  if (walletPreviewQr && fullShareLink) {
    walletPreviewQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(fullShareLink)}`;
    walletPreviewQr.alt = "QR code — scannez pour ajouter la carte à Apple Wallet";
  }
  if (integrationCurlEl) {
    integrationCurlEl.textContent = `curl -X POST "${API_BASE || "https://api.myfidpass.fr"}/api/businesses/${slug || "VOTRE_SLUG"}/integration/scan" \\
  -H "Content-Type: application/json" \\
  -H "X-Dashboard-Token: VOTRE_TOKEN" \\
  -d '{"barcode":"UUID-DU-MEMBRE","amount_eur":12.50}'`;
  }
  document.getElementById("app-integration-copy-base")?.addEventListener("click", () => {
    if (!integrationBaseUrlEl) return;
    integrationBaseUrlEl.select();
    navigator.clipboard.writeText(integrationBaseUrlEl.value);
  });
  document.getElementById("app-integration-copy-prestataire-link")?.addEventListener("click", () => {
    if (!integrationPrestataireLinkEl) return;
    integrationPrestataireLinkEl.select();
    navigator.clipboard.writeText(integrationPrestataireLinkEl.value).then(() => {
      const btn = document.getElementById("app-integration-copy-prestataire-link");
      if (btn) { btn.textContent = "Copié !"; setTimeout(() => { btn.textContent = "Copier le lien"; }, 2000); }
    });
  });
  document.getElementById("app-integration-copy-curl")?.addEventListener("click", () => {
    if (!integrationCurlEl) return;
    navigator.clipboard.writeText(integrationCurlEl.textContent);
  });

  // ——— Carte & périmètre ———
  (function initCartePerimetre() {
    const mapEl = document.getElementById("app-perimetre-map");
    const addressInput = document.getElementById("app-perimetre-address");
    const addressHint = document.getElementById("app-perimetre-address-hint");
    const suggestionsEl = document.getElementById("app-perimetre-suggestions");
    const defaultSuggestionEl = document.getElementById("app-perimetre-default-suggestion");
    const defaultAddressTextEl = document.getElementById("app-perimetre-default-address-text");
    const useDefaultBtn = document.getElementById("app-perimetre-use-default");
    const geolocBtn = document.getElementById("app-perimetre-geoloc");
    const radiusSlider = document.getElementById("app-perimetre-radius");
    const radiusValueEl = document.getElementById("app-perimetre-radius-value");
    const saveBtn = document.getElementById("app-perimetre-save");
    const saveFeedback = document.getElementById("app-perimetre-save-feedback");
    const mapWrap = document.querySelector(".app-carte-perimetre-map-wrap");
    const mapHintEl = document.getElementById("app-perimetre-map-hint");
    if (!mapEl || !addressInput || !radiusSlider || !saveBtn) return;

    const mapboxToken = (typeof import.meta.env !== "undefined" && import.meta.env.VITE_MAPBOX_ACCESS_TOKEN) ? String(import.meta.env.VITE_MAPBOX_ACCESS_TOKEN).trim() : "";
    const useMapbox = !!(mapboxToken && typeof mapboxgl !== "undefined");

    let perimetreMap = null;
    let perimetreMarker = null;
    let perimetreCircle = null;
    let perimetreMapboxCircleId = null;
    let currentLat = null;
    let currentLng = null;
    let currentRadiusM = 500;
    let autocompleteAbort = null;
    let autocompleteDebounce = null;
    let defaultSuggestionData = null;

    const DEFAULT_CENTER = [48.8566, 2.3522];
    function circleGeoJSON(lat, lng, radiusMeters) {
      const km = radiusMeters / 1000;
      const points = [];
      for (let i = 0; i <= 64; i++) {
        const angle = (i / 64) * 2 * Math.PI;
        const latOffset = (km / 111.32) * Math.cos(angle);
        const lngOffset = (km / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);
        points.push([lng + lngOffset, lat + latOffset]);
      }
      return { type: "Feature", geometry: { type: "Polygon", coordinates: [points] } };
    }
    const PHOTON_URL = "https://photon.komoot.io/api/";
    const NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse";
    const AUTCOMPLETE_DEBOUNCE_MS = 320;
    const MIN_QUERY_LENGTH = 2;

    function formatPhotonAddress(props) {
      if (!props) return "";
      const name = props.name || "";
      const street = [props.street, props.housenumber].filter(Boolean).join(" ");
      const cityPart = [props.postcode, props.city].filter(Boolean).join(" ");
      const parts = [name || street, cityPart, props.country].filter(Boolean);
      return parts.join(", ");
    }

    function showSaveFeedback(msg, isError = false) {
      if (!saveFeedback) return;
      saveFeedback.textContent = msg;
      saveFeedback.classList.remove("hidden", "success", "error");
      if (isError) saveFeedback.classList.add("error"); else saveFeedback.classList.add("success");
      saveFeedback.classList.remove("hidden");
    }
    function showAddressHint(msg, isError = false) {
      if (!addressHint) return;
      addressHint.textContent = msg || "";
      addressHint.classList.toggle("hidden", !msg);
      addressHint.classList.toggle("error", isError);
    }

    function hideSuggestions() {
      if (suggestionsEl) {
        suggestionsEl.classList.add("hidden");
        suggestionsEl.innerHTML = "";
        addressInput?.setAttribute("aria-expanded", "false");
      }
    }

    function applySuggestion(lat, lng, displayAddress) {
      currentLat = lat;
      currentLng = lng;
      if (addressInput) addressInput.value = displayAddress || addressInput.value;
      hideSuggestions();
      showAddressHint("");
      const section = document.getElementById("carte-perimetre");
      if (section?.classList.contains("app-section-visible")) initMap(lat, lng);
      setCenter(lat, lng, displayAddress);
    }

    function updateRadiusUI(m) {
      currentRadiusM = m;
      if (radiusValueEl) radiusValueEl.textContent = m + " m";
      if (radiusSlider) radiusSlider.value = String(m);
      if (useMapbox && perimetreMap && perimetreMap.getSource("perimetre-circle") && currentLat != null && currentLng != null) {
        perimetreMap.getSource("perimetre-circle").setData(circleGeoJSON(currentLat, currentLng, m));
      }
      if (!useMapbox && perimetreCircle && currentLat != null && currentLng != null) {
        perimetreCircle.setRadius(m);
      }
    }

    function setCenter(lat, lng, addressText) {
      currentLat = lat;
      currentLng = lng;
      if (addressInput && addressText != null) addressInput.value = addressText;
      if (!perimetreMap) return;
      if (useMapbox) {
        perimetreMap.flyTo({ center: [lng, lat], zoom: Math.max(15, perimetreMap.getZoom()), pitch: 55, bearing: -17 });
        if (perimetreMarker) perimetreMarker.setLngLat([lng, lat]);
        if (perimetreMap.getSource("perimetre-circle")) {
          perimetreMap.getSource("perimetre-circle").setData(circleGeoJSON(lat, lng, currentRadiusM));
        }
      } else {
        perimetreMap.setView([lat, lng], perimetreMap.getZoom() < 14 ? 14 : perimetreMap.getZoom());
        if (perimetreMarker) perimetreMarker.setLatLng([lat, lng]);
        else if (typeof L !== "undefined") {
          const mhtml = `<span class="app-perimetre-marker-pin"><svg viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24C24 5.37 18.63 0 12 0z" fill="#0a7c42"/><circle cx="12" cy="12" r="5" fill="#fff"/></svg></span>`;
          const micon = L.divIcon({ html: mhtml, className: "app-perimetre-marker-icon", iconSize: [32, 44], iconAnchor: [16, 44] });
          perimetreMarker = L.marker([lat, lng], { icon: micon }).addTo(perimetreMap);
        }
        if (perimetreCircle) perimetreCircle.setLatLng([lat, lng]).setRadius(currentRadiusM);
        else if (typeof L !== "undefined") {
          perimetreCircle = L.circle([lat, lng], { radius: currentRadiusM, color: "#0a7c42", fillColor: "#0a7c42", fillOpacity: 0.12, weight: 2.5 }).addTo(perimetreMap);
        }
      }
      if (mapWrap) mapWrap.classList.add("has-map");
      if (mapHintEl) mapHintEl.classList.add("hidden");
    }

    function initMap(centerLat, centerLng) {
      const lat = centerLat != null ? centerLat : DEFAULT_CENTER[0];
      const lng = centerLng != null ? centerLng : DEFAULT_CENTER[1];

      if (useMapbox) {
        if (perimetreMap) {
          perimetreMap.flyTo({ center: [lng, lat], zoom: 15, pitch: 55, bearing: -17 });
          if (perimetreMarker) perimetreMarker.setLngLat([lng, lat]);
          if (perimetreMap.getSource("perimetre-circle")) {
            perimetreMap.getSource("perimetre-circle").setData(circleGeoJSON(lat, lng, currentRadiusM));
          }
          if (mapWrap) mapWrap.classList.add("has-map");
          if (mapHintEl) mapHintEl.classList.add("hidden");
          return;
        }
        mapboxgl.accessToken = mapboxToken;
        perimetreMap = new mapboxgl.Map({
          container: mapEl,
          style: "mapbox://styles/mapbox/dark-v11",
          center: [lng, lat],
          zoom: 15.2,
          pitch: 52,
          bearing: -17,
          antialias: true,
        });
        perimetreMap.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
        perimetreMarker = new mapboxgl.Marker({ color: "#0a7c42" }).setLngLat([lng, lat]).addTo(perimetreMap);
        perimetreMap.on("load", () => {
          try {
            if (!perimetreMap.getSource("mapbox-dem")) {
              perimetreMap.addSource("mapbox-dem", {
                type: "raster-dem",
                url: "mapbox://mapbox.mapbox-terrain-dem-v1",
                tileSize: 512,
                maxzoom: 14,
              });
            }
            perimetreMap.setTerrain({ source: "mapbox-dem", exaggeration: 1.1 });
          } catch (_) {}
          const layers = perimetreMap.getStyle().layers;
          const labelLayerId = layers.find((layer) => layer.type === "symbol" && layer.layout && layer.layout["text-field"])?.id;
          if (labelLayerId) {
            perimetreMap.addLayer({
              id: "add-3d-buildings",
              source: "composite",
              "source-layer": "building",
              filter: ["==", "extrude", "true"],
              type: "fill-extrusion",
              minzoom: 14,
              paint: {
                "fill-extrusion-color": "#3d3d3d",
                "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 14, 0, 14.05, ["get", "height"]],
                "fill-extrusion-base": ["interpolate", ["linear"], ["zoom"], 14, 0, 14.05, ["get", "min_height"]],
                "fill-extrusion-opacity": 0.9,
              },
            }, labelLayerId);
          }
          perimetreMap.addSource("perimetre-circle", { type: "geojson", data: circleGeoJSON(lat, lng, currentRadiusM) });
          perimetreMap.addLayer({
            id: "perimetre-circle-fill",
            type: "fill",
            source: "perimetre-circle",
            paint: { "fill-color": "#0a7c42", "fill-opacity": 0.2 },
          });
          perimetreMap.addLayer({
            id: "perimetre-circle-line",
            type: "line",
            source: "perimetre-circle",
            paint: { "line-color": "#0a7c42", "line-width": 3 },
          });
        });
        perimetreMap.on("click", (e) => {
          const { lng: lng_, lat: lat_ } = e.lngLat;
          currentLat = lat_;
          currentLng = lng_;
          perimetreMarker.setLngLat([lng_, lat_]);
          if (perimetreMap.getSource("perimetre-circle")) {
            perimetreMap.getSource("perimetre-circle").setData(circleGeoJSON(lat_, lng_, currentRadiusM));
          }
          fetch(`${NOMINATIM_REVERSE}?lat=${lat_}&lon=${lng_}&format=json`).then((r) => r.json()).then((data) => {
            const addr = data?.address;
            const parts = [addr?.road, addr?.suburb, addr?.city, addr?.country].filter(Boolean);
            if (addressInput) addressInput.value = parts.length ? parts.join(", ") : `${lat_.toFixed(5)}, ${lng_.toFixed(5)}`;
          }).catch(() => { if (addressInput) addressInput.value = `${lat_.toFixed(5)}, ${lng_.toFixed(5)}`; });
        });
        if (mapWrap) mapWrap.classList.add("has-map");
        if (mapHintEl) mapHintEl.classList.add("hidden");
        return;
      }

      if (typeof L === "undefined") return;
      if (perimetreMap) {
        perimetreMap.setView([lat, lng], 14);
        const mhtml = `<span class="app-perimetre-marker-pin"><svg viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24C24 5.37 18.63 0 12 0z" fill="#0a7c42"/><circle cx="12" cy="12" r="5" fill="#fff"/></svg></span>`;
        const micon = L.divIcon({ html: mhtml, className: "app-perimetre-marker-icon", iconSize: [32, 44], iconAnchor: [16, 44] });
        if (perimetreMarker) perimetreMarker.setLatLng([lat, lng]);
        else perimetreMarker = L.marker([lat, lng], { icon: micon }).addTo(perimetreMap);
        if (perimetreCircle) perimetreCircle.setLatLng([lat, lng]).setRadius(currentRadiusM);
        else perimetreCircle = L.circle([lat, lng], { radius: currentRadiusM, color: "#0a7c42", fillColor: "#0a7c42", fillOpacity: 0.12, weight: 2.5 }).addTo(perimetreMap);
        perimetreMap.invalidateSize();
        if (mapWrap) mapWrap.classList.add("has-map");
        if (mapHintEl) mapHintEl.classList.add("hidden");
        return;
      }
      perimetreMap = L.map(mapEl, { center: [lat, lng], zoom: 14, scrollWheelZoom: true, zoomControl: false });
      L.control.zoom({ position: "topright" }).addTo(perimetreMap);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap © CARTO",
        subdomains: "abcd",
        maxZoom: 20,
        maxNativeZoom: 19,
      }).addTo(perimetreMap);
      const markerHtml = `<span class="app-perimetre-marker-pin" aria-hidden="true"><svg viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24C24 5.37 18.63 0 12 0z" fill="#0a7c42"/><circle cx="12" cy="12" r="5" fill="#fff"/></svg></span>`;
      const markerIcon = L.divIcon({ html: markerHtml, className: "app-perimetre-marker-icon", iconSize: [32, 44], iconAnchor: [16, 44] });
      perimetreMarker = L.marker([lat, lng], { icon: markerIcon }).addTo(perimetreMap);
      perimetreCircle = L.circle([lat, lng], { radius: currentRadiusM, color: "#0a7c42", fillColor: "#0a7c42", fillOpacity: 0.12, weight: 2.5 }).addTo(perimetreMap);
      perimetreMap.on("click", (e) => {
        currentLat = e.latlng.lat;
        currentLng = e.latlng.lng;
        perimetreMarker.setLatLng(e.latlng);
        perimetreCircle.setLatLng(e.latlng).setRadius(currentRadiusM);
        fetch(`${NOMINATIM_REVERSE}?lat=${e.latlng.lat}&lon=${e.latlng.lng}&format=json`).then((r) => r.json()).then((data) => {
          const addr = data?.address;
          const parts = [addr?.road, addr?.suburb, addr?.city, addr?.country].filter(Boolean);
          if (addressInput) addressInput.value = parts.length ? parts.join(", ") : `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;
        }).catch(() => { if (addressInput) addressInput.value = `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`; });
      });
      if (mapWrap) mapWrap.classList.add("has-map");
      if (mapHintEl) mapHintEl.classList.add("hidden");
    }

    function fetchPhotonSuggestions(query, callback) {
      if (autocompleteAbort) autocompleteAbort.abort();
      autocompleteAbort = new AbortController();
      const q = encodeURIComponent(query.trim());
      if (q.length < MIN_QUERY_LENGTH) { callback([]); return; }
      fetch(`${PHOTON_URL}?q=${q}&limit=6&lang=fr`, { signal: autocompleteAbort.signal })
        .then((r) => r.json())
        .then((data) => {
          const features = data?.features || [];
          callback(features);
        })
        .catch((err) => { if (err.name !== "AbortError") callback([]); });
    }

    function escapeHtmlPerimetre(s) {
      if (s == null) return "";
      const div = document.createElement("div");
      div.textContent = String(s);
      return div.innerHTML;
    }
    function renderSuggestions(features) {
      if (!suggestionsEl) return;
      suggestionsEl.innerHTML = "";
      if (!features.length) { hideSuggestions(); return; }
      features.forEach((f) => {
        const coords = f.geometry?.coordinates;
        if (!coords || coords.length < 2) return;
        const lng = coords[0];
        const lat = coords[1];
        const props = f.properties || {};
        const main = props.name || [props.street, props.housenumber].filter(Boolean).join(" ") || "Adresse";
        const sub = [props.postcode, props.city, props.country].filter(Boolean).join(", ");
        const li = document.createElement("li");
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", "false");
        li.setAttribute("data-lat", String(lat));
        li.setAttribute("data-lng", String(lng));
        li.setAttribute("data-address", formatPhotonAddress(props));
        li.innerHTML = sub ? `${escapeHtmlPerimetre(main)}<small>${escapeHtmlPerimetre(sub)}</small>` : escapeHtmlPerimetre(main);
        li.addEventListener("click", () => {
          applySuggestion(lat, lng, formatPhotonAddress(props));
        });
        suggestionsEl.appendChild(li);
      });
      suggestionsEl.classList.remove("hidden");
      addressInput?.setAttribute("aria-expanded", "true");
    }

    async function loadPerimetreSettings() {
      try {
        const res = await api("/dashboard/settings");
        if (!res.ok) return;
        const data = await res.json();
        const lat = data.location_lat != null ? Number(data.location_lat) : null;
        const lng = data.location_lng != null ? Number(data.location_lng) : null;
        const radius = data.location_radius_meters != null ? Math.min(2000, Math.max(100, Number(data.location_radius_meters))) : 500;
        const address = data.location_address || "";
        const organizationName = (data.organization_name || "").trim();
        if (addressInput) addressInput.value = address;
        updateRadiusUI(radius);
        if (lat != null && lng != null) {
          currentLat = lat;
          currentLng = lng;
          const section = document.getElementById("carte-perimetre");
          if (section?.classList.contains("app-section-visible")) initMap(lat, lng);
          if (defaultSuggestionEl) defaultSuggestionEl.classList.add("hidden");
          defaultSuggestionData = null;
          return;
        }
        if (organizationName && organizationName.length >= 2) {
          const url = `${PHOTON_URL}?q=${encodeURIComponent(organizationName)}&limit=1&lang=fr`;
          try {
            const r = await fetch(url);
            const json = await r.json();
            const features = json?.features || [];
            if (features.length > 0) {
              const f = features[0];
              const coords = f.geometry?.coordinates;
              if (coords && coords.length >= 2) {
                defaultSuggestionData = {
                  lat: coords[1],
                  lng: coords[0],
                  address: formatPhotonAddress(f.properties || {}),
                };
                if (defaultAddressTextEl) defaultAddressTextEl.textContent = defaultSuggestionData.address;
                if (defaultSuggestionEl) defaultSuggestionEl.classList.remove("hidden");
              }
            }
          } catch (_) {}
        } else if (defaultSuggestionEl) defaultSuggestionEl.classList.add("hidden");
      } catch (_) {}
    }

    addressInput.addEventListener("input", () => {
      if (autocompleteDebounce) clearTimeout(autocompleteDebounce);
      const q = (addressInput.value || "").trim();
      if (q.length < MIN_QUERY_LENGTH) { hideSuggestions(); return; }
      autocompleteDebounce = setTimeout(() => {
        fetchPhotonSuggestions(q, (features) => renderSuggestions(features));
      }, AUTCOMPLETE_DEBOUNCE_MS);
    });

    addressInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { hideSuggestions(); return; }
      const items = suggestionsEl?.querySelectorAll("li[data-lat]") || [];
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const current = suggestionsEl?.querySelector("li[aria-selected='true']");
        const next = current?.nextElementSibling || items[0];
        if (next) {
          items.forEach((el) => el.setAttribute("aria-selected", "false"));
          next.setAttribute("aria-selected", "true");
          next.scrollIntoView({ block: "nearest" });
        }
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const current = suggestionsEl?.querySelector("li[aria-selected='true']");
        const prev = current?.previousElementSibling || items[items.length - 1];
        if (prev) {
          items.forEach((el) => el.setAttribute("aria-selected", "false"));
          prev.setAttribute("aria-selected", "true");
          prev.scrollIntoView({ block: "nearest" });
        }
        return;
      }
      if (e.key === "Enter") {
        const selected = suggestionsEl?.querySelector("li[aria-selected='true']") || items[0];
        if (selected) {
          e.preventDefault();
          selected.click();
        }
      }
    });

    addressInput.addEventListener("focus", () => {
      const q = (addressInput.value || "").trim();
      if (q.length >= MIN_QUERY_LENGTH) fetchPhotonSuggestions(q, (features) => renderSuggestions(features));
    });

    document.addEventListener("click", (e) => {
      if (suggestionsEl && !suggestionsEl.classList.contains("hidden") && !addressInput?.contains(e.target) && !suggestionsEl.contains(e.target)) {
        hideSuggestions();
      }
    });

    useDefaultBtn?.addEventListener("click", () => {
      if (!defaultSuggestionData) return;
      applySuggestion(defaultSuggestionData.lat, defaultSuggestionData.lng, defaultSuggestionData.address);
      if (defaultSuggestionEl) defaultSuggestionEl.classList.add("hidden");
      defaultSuggestionData = null;
    });

    geolocBtn?.addEventListener("click", () => {
      if (!navigator.geolocation) { showAddressHint("Géolocalisation non supportée.", true); return; }
      showAddressHint("Localisation…");
      geolocBtn.disabled = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          showAddressHint("");
          const section = document.getElementById("carte-perimetre");
          if (section?.classList.contains("app-section-visible")) initMap(lat, lng);
          setCenter(lat, lng, null);
          fetch(`${NOMINATIM_REVERSE}?lat=${lat}&lon=${lng}&format=json`).then((r) => r.json()).then((data) => {
            const addr = data?.address;
            const parts = [addr?.road, addr?.suburb, addr?.city, addr?.country].filter(Boolean);
            if (addressInput) addressInput.value = parts.length ? parts.join(", ") : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          }).catch(() => { if (addressInput) addressInput.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`; });
          geolocBtn.disabled = false;
        },
        () => { showAddressHint("Impossible d’obtenir la position.", true); geolocBtn.disabled = false; },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });

    radiusSlider.addEventListener("input", () => {
      const m = Math.min(2000, Math.max(100, parseInt(radiusSlider.value, 10) || 500));
      updateRadiusUI(m);
    });

    saveBtn.addEventListener("click", async () => {
      if (currentLat == null || currentLng == null) {
        showSaveFeedback("Choisissez d’abord un emplacement (adresse ou Ma position).", true);
        return;
      }
      saveBtn.disabled = true;
      saveFeedback.classList.add("hidden");
      try {
        const res = await api("/dashboard/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location_lat: currentLat,
            location_lng: currentLng,
            location_radius_meters: currentRadiusM,
            location_address: (addressInput?.value || "").trim() || undefined,
          }),
        });
        if (res.ok || res.status === 204) {
          showSaveFeedback("Périmètre enregistré. Les cartes déjà ajoutées (Apple Wallet) seront mises à jour ; les clients recevront une notification en entrant dans la zone.");
        } else {
          const data = await res.json().catch(() => ({}));
          showSaveFeedback(data.error || "Erreur lors de l’enregistrement.", true);
        }
      } catch (_) {
        showSaveFeedback("Erreur réseau.", true);
      }
      saveBtn.disabled = false;
    });

    window.addEventListener("app-section-change", (e) => {
      if (e.detail?.sectionId !== "carte-perimetre") return;
      loadPerimetreSettings();
      if (currentLat != null && currentLng != null) setTimeout(() => initMap(currentLat, currentLng), 100);
    });

    if (document.getElementById("carte-perimetre")?.classList.contains("app-section-visible")) loadPerimetreSettings();
  })();

  // ——— Personnaliser la carte ———
  const personnaliserOrg = document.getElementById("app-personnaliser-org");
  const personnaliserBg = document.getElementById("app-personnaliser-bg");
  const personnaliserBgHex = document.getElementById("app-personnaliser-bg-hex");
  const personnaliserFg = document.getElementById("app-personnaliser-fg");
  const personnaliserFgHex = document.getElementById("app-personnaliser-fg-hex");
  const personnaliserLabel = document.getElementById("app-personnaliser-label");
  const personnaliserLabelHex = document.getElementById("app-personnaliser-label-hex");
  const personnaliserStrip = document.getElementById("app-personnaliser-strip");
  const personnaliserStripHex = document.getElementById("app-personnaliser-strip-hex");
  const stripDisplayLogo = document.getElementById("app-strip-display-logo");
  const stripDisplayText = document.getElementById("app-strip-display-text");
  const stripTextWrap = document.getElementById("app-strip-text-wrap");
  const stripTextEl = document.getElementById("app-strip-text");
  const personnaliserLogoWrap = document.getElementById("app-personnaliser-logo-wrap");
  const personnaliserLogo = document.getElementById("app-personnaliser-logo");
  const personnaliserLogoPlaceholder = document.getElementById("app-personnaliser-logo-placeholder");
  const personnaliserLogoPreview = document.getElementById("app-personnaliser-logo-preview");
  const personnaliserMessage = document.getElementById("app-personnaliser-message");
  const personnaliserSave = document.getElementById("app-personnaliser-save");
  let personnaliserLogoDataUrl = "";
  const personnaliserCardBg = document.getElementById("app-personnaliser-card-bg");
  const personnaliserCardBgPlaceholder = document.getElementById("app-personnaliser-card-bg-placeholder");
  const personnaliserCardBgPreview = document.getElementById("app-personnaliser-card-bg-preview");
  const personnaliserCardBgRemove = document.getElementById("app-personnaliser-card-bg-remove");
  let personnaliserCardBgDataUrl = "";
  let personnaliserCardBgRemoveRequested = false;
  let hasCardBackgroundFromServer = false;
  const programTypePoints = document.getElementById("app-program-type-points");
  const programTypeStamps = document.getElementById("app-program-type-stamps");
  const rulesPanelPoints = document.getElementById("app-rules-points");
  const rulesPanelStamps = document.getElementById("app-rules-stamps");
  const pointsPerEuroEl = document.getElementById("app-points-per-euro");
  const pointsPerVisitEl = document.getElementById("app-points-per-visit");
  const pointsMinAmountEl = document.getElementById("app-points-min-amount");
  const pointsRewardTiersEl = document.getElementById("app-points-reward-tiers");
  const sectorEl = document.getElementById("app-sector");
  const sectorStampsEl = document.getElementById("app-sector-stamps");
  const requiredStampsEl = document.getElementById("app-required-stamps");
  const stampEmojiEl = document.getElementById("app-stamp-emoji");
  const stampRewardLabelEl = document.getElementById("app-stamp-reward-label");
  const expiryMonthsEl = document.getElementById("app-expiry-months");

  function setRulesPanelVisibility() {
    const isStamps = programTypeStamps && programTypeStamps.checked;
    if (rulesPanelPoints) rulesPanelPoints.classList.toggle("hidden", !!isStamps);
    if (rulesPanelStamps) rulesPanelStamps.classList.toggle("hidden", !isStamps);
  }
  if (programTypePoints) programTypePoints.addEventListener("change", setRulesPanelVisibility);
  if (programTypeStamps) programTypeStamps.addEventListener("change", setRulesPanelVisibility);

  /** Redimensionne et compresse l'image logo (max 640px largeur, JPEG 0.85) pour éviter dépassement taille requête. */
  function resizeLogoToDataUrl(file, maxWidth = 640, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const scale = w > maxWidth ? maxWidth / w : 1;
        const cw = Math.round(w * scale);
        const ch = Math.round(h * scale);
        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, cw, ch);
        try {
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          resolve(dataUrl);
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Image invalide"));
      };
      img.src = objectUrl;
    });
  }

  function showPersonnaliserMessage(text, isError = false) {
    if (!personnaliserMessage) return;
    personnaliserMessage.textContent = text;
    personnaliserMessage.classList.remove("hidden", "success", "error");
    personnaliserMessage.classList.add(isError ? "error" : "success");
  }
  function bindPersonnaliserColor(colorEl, hexEl) {
    if (!colorEl || !hexEl) return;
    colorEl.addEventListener("input", () => {
      hexEl.value = colorEl.value;
    });
    hexEl.addEventListener("input", () => {
      const v = hexEl.value.trim();
      if (/^#[0-9A-Fa-f]{6}$/.test(v) || /^[0-9A-Fa-f]{6}$/.test(v)) {
        colorEl.value = v.startsWith("#") ? v : "#" + v;
      }
    });
  }
  bindPersonnaliserColor(personnaliserBg, personnaliserBgHex);
  bindPersonnaliserColor(personnaliserFg, personnaliserFgHex);
  bindPersonnaliserColor(personnaliserLabel, personnaliserLabelHex);
  function syncStripToBg() {
    const bg = personnaliserBgHex?.value?.trim() || personnaliserBg?.value || "#0a7c42";
    const hex = bg.startsWith("#") ? bg : "#" + bg;
    if (personnaliserStrip) personnaliserStrip.value = hex;
    if (personnaliserStripHex) personnaliserStripHex.value = hex;
  }
  personnaliserBg?.addEventListener("input", syncStripToBg);
  personnaliserBg?.addEventListener("change", syncStripToBg);
  personnaliserBgHex?.addEventListener("input", syncStripToBg);
  personnaliserBgHex?.addEventListener("change", syncStripToBg);

  function hexToRgb(hex) {
    const n = parseInt(hex.replace(/^#/, ""), 16);
    return n >= 0 ? { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff } : null;
  }
  function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
  }
  function lightenHex(hex, factor) {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    return rgbToHex(rgb.r + (255 - rgb.r) * (1 - 1 / factor), rgb.g + (255 - rgb.g) * (1 - 1 / factor), rgb.b + (255 - rgb.b) * (1 - 1 / factor));
  }
  function darkenHex(hex, factor) {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    return rgbToHex(rgb.r / factor, rgb.g / factor, rgb.b / factor);
  }
  function setStripDisplayVisibility() {
    const isText = stripDisplayText && stripDisplayText.checked;
    if (stripTextWrap) stripTextWrap.classList.toggle("hidden", !isText);
    if (personnaliserLogoWrap) personnaliserLogoWrap.classList.toggle("hidden", !!isText);
  }
  function updatePersonnaliserPreview() {
    const card = document.getElementById("app-personnaliser-preview-card");
    const stripEl = document.getElementById("app-wallet-preview-strip");
    const stripTextPreview = document.getElementById("app-wallet-preview-strip-text");
    const orgEl = document.getElementById("app-personnaliser-preview-org");
    const valueEl = document.getElementById("app-wallet-preview-value");
    const labelEl = document.getElementById("app-wallet-preview-label");
    const logoWrap = document.getElementById("app-personnaliser-header-logo-wrap") || document.querySelector(".app-wallet-preview-logo-wrap");
    const ptsWrap = document.getElementById("app-preview-pts-wrap");
    const stampsWrap = document.getElementById("app-preview-stamps-wrap");
    const stampsGridEl = document.getElementById("app-preview-stamps-grid");
    const restantsWrap = document.getElementById("app-preview-restants-wrap");
    const restantsValueEl = document.getElementById("app-wallet-preview-restants");
    const ptsEmojiEl = document.getElementById("app-preview-pts-emoji");
    if (!card || !orgEl) return;
    const bg = personnaliserBgHex?.value?.trim() || personnaliserBg?.value || "#0a7c42";
    const fg = personnaliserFgHex?.value?.trim() || personnaliserFg?.value || "#ffffff";
    const labelColor = personnaliserLabelHex?.value?.trim() || personnaliserLabel?.value || "#e8f5e9";
    const bgHex = bg.startsWith("#") ? bg : "#" + bg;
    if (personnaliserStrip) personnaliserStrip.value = bgHex;
    if (personnaliserStripHex) personnaliserStripHex.value = bgHex;
    card.style.setProperty("--wallet-bg", bgHex);
    card.style.setProperty("--wallet-fg", fg);
    card.style.setProperty("--wallet-label", labelColor);
    if (stripEl) stripEl.style.background = bgHex;
    const bodyEl = card?.querySelector(".app-wallet-preview-body");
    const hasCardBgUrl = personnaliserCardBgDataUrl && personnaliserCardBgDataUrl.length > 0;
    const bandeauEl = document.getElementById("app-preview-bandeau");
    if (bodyEl) {
      bodyEl.style.color = fg;
      bodyEl.style.background = bgHex;
      bodyEl.style.backgroundImage = "none";
    }
    orgEl.textContent = personnaliserOrg?.value?.trim() || "Votre commerce";
    const isStamps = programTypeStamps && programTypeStamps.checked;
    const stampEmoji = (stampEmojiEl && stampEmojiEl.value.trim()) || "☕";
    const requiredStamps = 10;
    const useStripImage = stripDisplayLogo && stripDisplayLogo.checked;
    if (ptsWrap) ptsWrap.classList.toggle("hidden", !!isStamps);
    if (stampsWrap) stampsWrap.classList.toggle("hidden", !isStamps);
    if (bandeauEl) {
      if (isStamps) {
        bandeauEl.classList.remove("hidden");
        if (hasCardBgUrl) {
          bandeauEl.style.background = "transparent";
          bandeauEl.style.backgroundImage = `url(${personnaliserCardBgDataUrl})`;
          bandeauEl.style.backgroundSize = "cover";
          bandeauEl.style.backgroundPosition = "center";
        } else {
          bandeauEl.style.background = bgHex;
          bandeauEl.style.backgroundImage = "none";
        }
      } else {
        bandeauEl.style.backgroundImage = "none";
        bandeauEl.classList.add("hidden");
      }
    }
    const rewardWrap = document.getElementById("app-preview-reward-wrap");
    if (rewardWrap) rewardWrap.classList.toggle("hidden", !!isStamps);
    if (restantsWrap) restantsWrap.classList.toggle("hidden", !isStamps);
    if (restantsValueEl && isStamps) restantsValueEl.textContent = "= " + String(requiredStamps);
    const rewardValueEl = document.getElementById("app-wallet-preview-reward");
    if (rewardValueEl && !isStamps) {
      const tiersRaw = pointsRewardTiersEl?.value?.trim() || "";
      const firstLine = tiersRaw.split("\n").map((s) => s.trim()).find(Boolean);
      const raw = firstLine ? (firstLine.replace(/^\d+:\s*/, "").trim()) : "";
      rewardValueEl.textContent = raw || "Paliers en magasin";
    }
    if (valueEl) valueEl.textContent = isStamps ? "" : "0";
    if (labelEl) labelEl.textContent = isStamps ? "Tampons" : "Points";
    if (ptsEmojiEl) ptsEmojiEl.textContent = isStamps ? stampEmoji : (stampEmoji || "⭐");
    if (stampsGridEl && isStamps) {
      const emojiToIcon = { "☕": "cafe", "🍔": "burger", "🍕": "pizza", "🥐": "croissant", "🥩": "steak", "🍣": "sushi", "🥗": "salade", "🍚": "riz", "🥖": "baguette", "💄": "giftsilver", "✂️": "giftsilver" };
      const iconName = emojiToIcon[stampEmoji] || "cafe";
      const iconSrc = "/assets/icons/" + iconName + ".png";
      const filledCount = 0;
      const rows = stampsGridEl.querySelectorAll(".builder-wallet-card-stamps-row");
      let index = 0;
      rows.forEach((row) => {
        row.innerHTML = "";
        for (let i = 0; i < 5; i++) {
          const isFilled = index < filledCount;
          const span = document.createElement("span");
          span.className = "stamp stamp-img" + (isFilled ? " filled" : "");
          span.setAttribute("aria-hidden", "true");
          const img = document.createElement("img");
          img.src = iconSrc;
          img.alt = "";
          img.width = 48;
          img.height = 48;
          span.appendChild(img);
          row.appendChild(span);
          index++;
        }
      });
    }
    const useStripText = stripDisplayText && stripDisplayText.checked;
    const stripImg = document.getElementById("app-wallet-preview-strip-img");
    const hasLogoUrl = personnaliserLogoDataUrl && personnaliserLogoDataUrl.length > 0;
    if (stripImg) {
      stripImg.removeAttribute("src");
      stripImg.classList.add("hidden");
    }
    if (stripTextPreview) {
      if (useStripText) {
        stripTextPreview.textContent = stripTextEl?.value?.trim() || personnaliserOrg?.value?.trim() || "Votre commerce";
        stripTextPreview.classList.remove("hidden");
      } else {
        stripTextPreview.textContent = "";
        stripTextPreview.classList.add("hidden");
      }
    }
    if (orgEl) orgEl.classList.toggle("hidden", !!useStripText);
    if (logoWrap) {
      if (useStripText) logoWrap.style.display = "none";
      else logoWrap.style.display = "";
    }
    const walletLogo = document.getElementById("app-wallet-preview-logo");
    if (walletLogo && hasLogoUrl && !useStripText) {
      walletLogo.src = personnaliserLogoDataUrl;
      walletLogo.classList.remove("hidden");
    } else if (walletLogo) {
      if (useStripText) walletLogo.classList.add("hidden");
      else if (!hasLogoUrl) {
        walletLogo.removeAttribute("src");
        walletLogo.classList.add("hidden");
      }
    }
    const logoFallback = document.getElementById("app-wallet-preview-logo-fallback");
    if (logoFallback) logoFallback.classList.toggle("hidden", !!useStripText || !!(walletLogo && walletLogo.src && !walletLogo.classList.contains("hidden")));
  }
  [personnaliserOrg, personnaliserBg, personnaliserBgHex, personnaliserFg, personnaliserFgHex, personnaliserLabel, personnaliserLabelHex, personnaliserStrip, personnaliserStripHex, stripTextEl].forEach((el) => el?.addEventListener("input", updatePersonnaliserPreview));
  [personnaliserOrg, personnaliserBg, personnaliserBgHex, personnaliserFg, personnaliserFgHex, personnaliserLabel, personnaliserLabelHex, personnaliserStrip, personnaliserStripHex, stripTextEl].forEach((el) => el?.addEventListener("change", updatePersonnaliserPreview));
  [stripDisplayLogo, stripDisplayText].forEach((el) => el?.addEventListener("change", () => { setStripDisplayVisibility(); updatePersonnaliserPreview(); }));
  [programTypePoints, programTypeStamps, stampEmojiEl].forEach((el) => el?.addEventListener("change", updatePersonnaliserPreview));
  [programTypePoints, programTypeStamps].forEach((el) => el?.addEventListener("input", updatePersonnaliserPreview));
  if (stampEmojiEl) stampEmojiEl.addEventListener("input", updatePersonnaliserPreview);
  if (pointsRewardTiersEl) pointsRewardTiersEl.addEventListener("input", updatePersonnaliserPreview);

  const personnaliserAddress = document.getElementById("app-personnaliser-address");
  const personnaliserCoordsDisplay = document.getElementById("app-personnaliser-coords-display");
  const personnaliserCoordsValue = document.getElementById("app-personnaliser-coords-value");
  const personnaliserLocationText = document.getElementById("app-personnaliser-location-text");
  const personnaliserRadius = document.getElementById("app-personnaliser-radius");

  function updateCoordsDisplay(lat, lng) {
    if (!personnaliserCoordsDisplay || !personnaliserCoordsValue) return;
    if (lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      personnaliserCoordsValue.textContent = `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
      personnaliserCoordsDisplay.classList.remove("hidden");
    } else {
      personnaliserCoordsDisplay.classList.add("hidden");
    }
  }

  api("/dashboard/settings")
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data) return;
      const org = data.organization_name ?? data.organizationName ?? "";
      if (personnaliserOrg) personnaliserOrg.value = org;
      const bg = data.background_color ?? data.backgroundColor ?? "#0a7c42";
      const fg = data.foreground_color ?? data.foregroundColor ?? "#ffffff";
      const label = data.label_color ?? data.labelColor ?? "#e8f5e9";
      if (personnaliserBg) personnaliserBg.value = bg;
      if (personnaliserBgHex) personnaliserBgHex.value = bg;
      if (personnaliserFg) personnaliserFg.value = fg;
      if (personnaliserFgHex) personnaliserFgHex.value = fg;
      if (personnaliserLabel) personnaliserLabel.value = label;
      if (personnaliserLabelHex) personnaliserLabelHex.value = label;
      if (personnaliserStrip) personnaliserStrip.value = bg.startsWith("#") ? bg : "#" + bg;
      if (personnaliserStripHex) personnaliserStripHex.value = bg.startsWith("#") ? bg : "#" + bg;
      const stripDisplayMode = (data.strip_display_mode ?? data.stripDisplayMode ?? "logo").toLowerCase();
      if (stripDisplayMode === "text" && stripDisplayText) stripDisplayText.checked = true;
      else if (stripDisplayLogo) stripDisplayLogo.checked = true;
      if (stripTextEl) stripTextEl.value = data.strip_text ?? data.stripText ?? "";
      if (typeof setStripDisplayVisibility === "function") setStripDisplayVisibility();
      let programType = (data.program_type ?? data.programType ?? "").toLowerCase();
      if (programType !== "points" && programType !== "stamps") {
        programType = (data.required_stamps ?? data.requiredStamps) > 0 ? "stamps" : "points";
      }
      if (programType === "stamps" && programTypeStamps) programTypeStamps.checked = true;
      else if (programTypePoints) programTypePoints.checked = true;
      setRulesPanelVisibility();
      if (pointsPerEuroEl != null) pointsPerEuroEl.value = data.points_per_euro ?? data.pointsPerEuro ?? 1;
      if (pointsPerVisitEl != null) pointsPerVisitEl.value = data.points_per_visit ?? data.pointsPerVisit ?? 0;
      if (pointsMinAmountEl != null) pointsMinAmountEl.value = data.points_min_amount_eur ?? data.pointsMinAmountEur ?? "";
      const tiers = data.points_reward_tiers ?? data.pointsRewardTiers;
      if (pointsRewardTiersEl && Array.isArray(tiers) && tiers.length) {
        pointsRewardTiersEl.value = tiers.map((t) => (typeof t === "object" && t != null && "points" in t ? `${t.points}:${t.label || ""}` : String(t))).join("\n");
      } else if (pointsRewardTiersEl && typeof tiers === "string" && tiers.trim()) {
        pointsRewardTiersEl.value = tiers;
      }
      const sectorVal = data.sector ?? "";
      if (sectorEl) sectorEl.value = sectorVal;
      if (sectorStampsEl) sectorStampsEl.value = sectorVal;
      // En mode tampons : toujours 10 (champ supprimé). En mode points on ne modifie pas requiredStamps.
      if (stampEmojiEl) stampEmojiEl.value = data.stamp_emoji ?? data.stampEmoji ?? "";
      if (stampRewardLabelEl) stampRewardLabelEl.value = data.stamp_reward_label ?? data.stampRewardLabel ?? "";
      if (expiryMonthsEl != null) expiryMonthsEl.value = data.expiry_months ?? data.expiryMonths ?? "";
      if (personnaliserAddress && (data.location_address ?? data.locationAddress) != null) personnaliserAddress.value = data.location_address ?? data.locationAddress ?? "";
      updateCoordsDisplay(data.location_lat ?? data.locationLat, data.location_lng ?? data.locationLng);
      if (personnaliserLocationText && (data.location_relevant_text ?? data.locationRelevantText) != null) personnaliserLocationText.value = data.location_relevant_text ?? data.locationRelevantText ?? "";
      if (personnaliserRadius != null && (data.location_radius_meters ?? data.locationRadiusMeters) != null) personnaliserRadius.value = data.location_radius_meters ?? data.locationRadiusMeters;
      hasCardBackgroundFromServer = !!(data.has_card_background ?? data.hasCardBackground);
      if (personnaliserCardBgRemove) {
        if (hasCardBackgroundFromServer || personnaliserCardBgDataUrl) personnaliserCardBgRemove.classList.remove("hidden");
        else personnaliserCardBgRemove.classList.add("hidden");
      }
      if (hasCardBackgroundFromServer) {
        api("/card-background?v=" + Date.now())
          .then((r) => (r.ok ? r.blob() : null))
          .then((blob) => {
            if (blob) {
              personnaliserCardBgDataUrl = URL.createObjectURL(blob);
              if (personnaliserCardBgPreview) {
                personnaliserCardBgPreview.src = personnaliserCardBgDataUrl;
                personnaliserCardBgPreview.classList.remove("hidden");
              }
              if (personnaliserCardBgPlaceholder) personnaliserCardBgPlaceholder.classList.add("hidden");
              if (personnaliserCardBgRemove) personnaliserCardBgRemove.classList.remove("hidden");
              updatePersonnaliserPreview();
            }
          })
          .catch(() => {});
      }
      updatePersonnaliserPreview();
      api("/logo?v=" + Date.now())
        .then((r) => (r.ok ? r.blob() : null))
        .then((blob) => {
          if (blob && personnaliserLogoPreview) {
            const url = URL.createObjectURL(blob);
            personnaliserLogoDataUrl = url;
            personnaliserLogoPreview.src = url;
            personnaliserLogoPreview.classList.remove("hidden");
            if (personnaliserLogoPlaceholder) personnaliserLogoPlaceholder.classList.add("hidden");
            const walletLogo = document.getElementById("app-wallet-preview-logo");
            if (walletLogo) {
              walletLogo.src = url;
              walletLogo.classList.remove("hidden");
            }
            personnaliserLogoPreview.onload = function onLogoLoad() {
              personnaliserLogoPreview.onload = null;
              if (typeof extractAndShowLogoColors === "function") extractAndShowLogoColors(url);
            };
            if (personnaliserLogoPreview.complete) personnaliserLogoPreview.onload();
            updatePersonnaliserPreview();
          } else {
            if (typeof extractAndShowLogoColors === "function") extractAndShowLogoColors(null);
          }
        })
        .catch(() => {});
    })
    .catch(() => {});

  /** Grille d’icônes (Emoji.family Fluent) pour choisir l’emoji des tampons sans taper. */
  const emojiPickerEl = document.getElementById("app-stamp-emoji-picker");
  if (emojiPickerEl && stampEmojiEl) {
    const ASSETS_ICONS = "/assets/icons";
    const CUSTOM_ICON_PATHS = {
      "2615": "cafe.png", "1f355": "pizza.png", "1f354": "burger.png", "1f32e": "kebab.png",
      "1f363": "sushi.png", "1f957": "salade.png", "1f950": "croissant.png", "1f356": "steak.png",
      "1f35e": "riz.png", "1f956": "baguette.png", "1f381": "giftgold.png", "2705": "checkvert.png",
    };
    const STAMP_ICONS = [
      { emoji: "☕", hexcode: "2615", annotation: "Café" }, { emoji: "🍕", hexcode: "1f355", annotation: "Pizza" },
      { emoji: "🍔", hexcode: "1f354", annotation: "Burger" }, { emoji: "🥐", hexcode: "1f950", annotation: "Croissant" },
      { emoji: "🥗", hexcode: "1f957", annotation: "Salade" }, { emoji: "🍣", hexcode: "1f363", annotation: "Sushi" },
      { emoji: "🌮", hexcode: "1f32e", annotation: "Taco" }, { emoji: "🍗", hexcode: "1f356", annotation: "Steak" },
      { emoji: "🍚", hexcode: "1f35e", annotation: "Riz" }, { emoji: "🥖", hexcode: "1f956", annotation: "Baguette" },
      { emoji: "🎁", hexcode: "1f381", annotation: "Cadeau" }, { emoji: "✅", hexcode: "2705", annotation: "Validé" },
    ];
    function renderPicker(list) {
      if (!Array.isArray(list) || !list.length) return;
      const size = 40;
      list.forEach((item) => {
        const emoji = item.emoji;
        const hexcode = (item.hexcode || "").replace(/_/g, "-");
        const norm = hexcode ? hexcode.split("-")[0] : "";
        if (!emoji) return;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "app-emoji-picker-btn";
        btn.title = item.annotation || emoji;
        btn.setAttribute("aria-label", item.annotation || emoji);
        const customFile = CUSTOM_ICON_PATHS[norm];
        const imgSrc = customFile ? `${ASSETS_ICONS}/${customFile}` : null;
        if (imgSrc) {
          const img = document.createElement("img");
          img.src = imgSrc;
          img.alt = "";
          img.width = size;
          img.height = size;
          img.loading = "lazy";
          img.onerror = () => { btn.textContent = emoji; };
          btn.appendChild(img);
        } else btn.textContent = emoji;
        btn.dataset.emoji = emoji;
        btn.addEventListener("click", () => {
          stampEmojiEl.value = emoji;
          emojiPickerEl.querySelectorAll(".app-emoji-picker-btn").forEach((b) => b.classList.remove("selected"));
          btn.classList.add("selected");
          if (typeof updatePersonnaliserPreview === "function") updatePersonnaliserPreview();
        });
        emojiPickerEl.appendChild(btn);
      });
      const current = (stampEmojiEl.value || "").trim();
      if (current) {
        const match = emojiPickerEl.querySelector(`.app-emoji-picker-btn[data-emoji="${current.replace(/"/g, "\\\"")}"]`);
        if (match) match.classList.add("selected");
      }
    }
    renderPicker(STAMP_ICONS);
  }

  function getDominantColorsFromImage(imageSource, maxColors = 4) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = 40;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve([]); return; }
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        const bucket = new Map();
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 140) continue;
          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          if (lum > 0.92 || lum < 0.06) continue;
          const kr = Math.round(r / 24) * 24, kg = Math.round(g / 24) * 24, kb = Math.round(b / 24) * 24;
          const key = `${kr},${kg},${kb}`;
          bucket.set(key, (bucket.get(key) || 0) + 1);
        }
        const sorted = [...bucket.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxColors);
        const hexes = sorted.map(([k]) => {
          const [rr, gg, bb] = k.split(",").map(Number);
          return "#" + [rr, gg, bb].map((x) => Math.min(255, x).toString(16).padStart(2, "0")).join("");
        });
        resolve(hexes);
      };
      img.onerror = () => resolve([]);
      img.src = imageSource;
    });
  }

  function renderLogoColorSwatches(colors) {
    const wrap = document.getElementById("app-logo-colors-wrap");
    const container = document.getElementById("app-logo-colors-swatches");
    if (!wrap || !container) return;
    container.innerHTML = "";
    if (!colors || colors.length === 0) {
      wrap.classList.add("hidden");
      return;
    }
    colors.forEach((hex) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "app-logo-color-swatch";
      btn.style.background = hex;
      btn.title = hex;
      btn.setAttribute("aria-label", "Appliquer la couleur " + hex);
      btn.addEventListener("click", () => {
        const h = hex.startsWith("#") ? hex : "#" + hex;
        if (personnaliserBg) personnaliserBg.value = h;
        if (personnaliserBgHex) personnaliserBgHex.value = h;
        syncStripToBg();
        updatePersonnaliserPreview();
      });
      container.appendChild(btn);
    });
    wrap.classList.remove("hidden");
  }

  function extractAndShowLogoColors(imageSource) {
    if (!imageSource) {
      document.getElementById("app-logo-colors-wrap")?.classList.add("hidden");
      return;
    }
    getDominantColorsFromImage(imageSource, 4).then((colors) => renderLogoColorSwatches(colors));
  }

  async function applyLogoFromFile(file) {
    if (!file || !file.type.startsWith("image/")) {
        showPersonnaliserMessage("Choisissez une image (JPG, PNG).", true);
        return;
      }
      try {
        personnaliserLogoDataUrl = await resizeLogoToDataUrl(file);
        if (personnaliserLogoPreview) {
          personnaliserLogoPreview.src = personnaliserLogoDataUrl;
          personnaliserLogoPreview.classList.remove("hidden");
        }
        if (personnaliserLogoPlaceholder) personnaliserLogoPlaceholder.classList.add("hidden");
        extractAndShowLogoColors(personnaliserLogoDataUrl);
        updatePersonnaliserPreview();
      } catch (err) {
        showPersonnaliserMessage("Impossible de charger l'image. Choisissez un fichier JPG ou PNG valide.", true);
    }
  }

  async function applyCardBgFromFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      showPersonnaliserMessage("Choisissez une image (JPG, PNG).", true);
      return;
    }
    try {
      personnaliserCardBgRemoveRequested = false;
      personnaliserCardBgDataUrl = await resizeLogoToDataUrl(file, 750, 0.85);
      if (personnaliserCardBgPreview) {
        personnaliserCardBgPreview.src = personnaliserCardBgDataUrl;
        personnaliserCardBgPreview.classList.remove("hidden");
      }
      if (personnaliserCardBgPlaceholder) personnaliserCardBgPlaceholder.classList.add("hidden");
      if (personnaliserCardBgRemove) personnaliserCardBgRemove.classList.remove("hidden");
    } catch (err) {
      showPersonnaliserMessage("Impossible de charger l'image de fond.", true);
    }
  }

  function setupImageDropZone(zoneEl, onFile) {
    if (!zoneEl) return;
    zoneEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      zoneEl.classList.add("app-drop-zone-active");
    });
    zoneEl.addEventListener("dragleave", (e) => {
      if (!zoneEl.contains(e.relatedTarget)) zoneEl.classList.remove("app-drop-zone-active");
    });
    zoneEl.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      zoneEl.classList.remove("app-drop-zone-active");
      const file = e.dataTransfer?.files?.[0];
      if (file) onFile(file);
    });
  }

  if (personnaliserLogo) {
    personnaliserLogo.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (file) await applyLogoFromFile(file);
    });
    const logoDropZone = document.getElementById("app-logo-drop-zone");
    setupImageDropZone(logoDropZone, (file) => applyLogoFromFile(file));
  }

  if (personnaliserCardBg) {
    personnaliserCardBg.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (file) await applyCardBgFromFile(file);
    });
    const cardBgDropZone = document.getElementById("app-card-bg-drop-zone");
    setupImageDropZone(cardBgDropZone, (file) => applyCardBgFromFile(file));
  }
  if (personnaliserCardBgRemove) {
    personnaliserCardBgRemove.addEventListener("click", () => {
      personnaliserCardBgRemoveRequested = true;
      personnaliserCardBgDataUrl = "";
      if (personnaliserCardBg) personnaliserCardBg.value = "";
      if (personnaliserCardBgPreview) {
        personnaliserCardBgPreview.src = "";
        personnaliserCardBgPreview.classList.add("hidden");
      }
      if (personnaliserCardBgPlaceholder) {
        personnaliserCardBgPlaceholder.textContent = "+ Choisir une image de fond (glisser une image ou cliquer)";
        personnaliserCardBgPlaceholder.classList.remove("hidden");
      }
      if (hasCardBackgroundFromServer) {
        personnaliserCardBgRemove.classList.remove("hidden");
      } else {
        personnaliserCardBgRemove.classList.add("hidden");
      }
    });
  }

  if (personnaliserSave) {
    personnaliserSave.addEventListener("click", async () => {
      const organizationName = personnaliserOrg?.value?.trim() || "";
      const backgroundColor = personnaliserBgHex?.value?.trim() || personnaliserBg?.value || "#0a7c42";
      const foregroundColor = personnaliserFgHex?.value?.trim() || personnaliserFg?.value || "#ffffff";
      const labelColor = personnaliserLabelHex?.value?.trim() || personnaliserLabel?.value || "#e8f5e9";
      const toHex = (v) => {
        const s = (v || "").trim();
        if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s;
        if (/^[0-9A-Fa-f]{6}$/.test(s)) return "#" + s;
        return undefined;
      };
      const body = {
        organizationName: organizationName || undefined,
        backgroundColor: toHex(backgroundColor),
        foregroundColor: toHex(foregroundColor),
        labelColor: toHex(labelColor),
        stripColor: toHex(backgroundColor),
      };
      const isStamps = programTypeStamps && programTypeStamps.checked;
      body.programType = isStamps ? "stamps" : "points";
      const stripDisplayMode = stripDisplayText && stripDisplayText.checked ? "text" : "logo";
      body.stripDisplayMode = stripDisplayMode;
      if (stripDisplayMode === "text" && stripTextEl) body.stripText = stripTextEl.value.trim() || undefined;
      if (pointsPerEuroEl) body.pointsPerEuro = parseInt(pointsPerEuroEl.value, 10) || 1;
      if (pointsPerVisitEl) body.pointsPerVisit = parseInt(pointsPerVisitEl.value, 10) || 0;
      if (pointsMinAmountEl && pointsMinAmountEl.value.trim() !== "") {
        const minVal = parseFloat(pointsMinAmountEl.value);
        if (!Number.isNaN(minVal) && minVal >= 0) body.pointsMinAmountEur = minVal;
      }
      if (pointsRewardTiersEl && pointsRewardTiersEl.value.trim()) {
        const lines = pointsRewardTiersEl.value.split("\n").map((s) => s.trim()).filter(Boolean);
        const tiers = [];
        for (const line of lines) {
          const colon = line.indexOf(":");
          if (colon >= 0) {
            const pts = parseInt(line.slice(0, colon).trim(), 10);
            const label = line.slice(colon + 1).trim();
            if (!Number.isNaN(pts) && pts >= 0) tiers.push({ points: pts, label });
          }
        }
        if (tiers.length) body.pointsRewardTiers = tiers;
      }
      if (isStamps) body.requiredStamps = 10;
      else if (requiredStampsEl) body.requiredStamps = parseInt(requiredStampsEl.value, 10) || 10;
      if (stampEmojiEl) body.stampEmoji = stampEmojiEl.value.trim() || undefined;
      if (stampRewardLabelEl) body.stampRewardLabel = stampRewardLabelEl.value.trim() || undefined;
      if (expiryMonthsEl && expiryMonthsEl.value.trim() !== "") {
        const m = parseInt(expiryMonthsEl.value, 10);
        if (!Number.isNaN(m) && m >= 0) body.expiryMonths = m;
      }
      const sectorVal = (isStamps ? sectorStampsEl : sectorEl)?.value?.trim();
      if (sectorVal) body.sector = sectorVal;
      // N'envoyer le logo que si c'est un data URL (nouvelle image choisie). Une blob URL (logo chargé depuis l'API) ne doit pas être envoyée sinon on écrase le logo en base.
      if (personnaliserLogoDataUrl && typeof personnaliserLogoDataUrl === "string" && personnaliserLogoDataUrl.startsWith("data:")) {
        body.logoBase64 = personnaliserLogoDataUrl;
      }
      if (personnaliserCardBgRemoveRequested) body.cardBackgroundBase64 = "";
      else if (personnaliserCardBgDataUrl && typeof personnaliserCardBgDataUrl === "string" && personnaliserCardBgDataUrl.startsWith("data:")) body.cardBackgroundBase64 = personnaliserCardBgDataUrl;
      const addressVal = document.getElementById("app-personnaliser-address")?.value?.trim() || "";
      const locTextVal = document.getElementById("app-personnaliser-location-text")?.value?.trim();
      const radiusVal = document.getElementById("app-personnaliser-radius")?.value;
      body.locationAddress = addressVal || null;
      if (addressVal) {
        showPersonnaliserMessage("Localisation de l'adresse en cours…", false);
        try {
          const coords = await geocodeAddress(addressVal);
          if (coords) {
            body.locationLat = coords.lat;
            body.locationLng = coords.lng;
          } else {
            showPersonnaliserMessage("Adresse non trouvée. Vérifiez l'adresse ou réessayez. Les autres modifications seront enregistrées.", true);
          }
        } catch (e) {
          showPersonnaliserMessage("Impossible de localiser l'adresse (réseau). Les autres modifications seront enregistrées.", true);
        }
      } else {
        body.locationLat = null;
        body.locationLng = null;
      }
      if (locTextVal !== undefined) body.locationRelevantText = locTextVal || undefined;
      if (radiusVal !== undefined) body.locationRadiusMeters = radiusVal === "" ? undefined : parseInt(radiusVal, 10);
      personnaliserSave.disabled = true;
      showPersonnaliserMessage("");
      const url = `${API_BASE}/api/businesses/${encodeURIComponent(slug)}${dashboardToken ? `?token=${encodeURIComponent(dashboardToken)}` : ""}`;
      const headers = { "Content-Type": "application/json", ...getAuthHeaders() };
      if (dashboardToken) headers["X-Dashboard-Token"] = dashboardToken;
      try {
        const res = await fetch(url, { method: "PATCH", headers, body: JSON.stringify(body) });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          showPersonnaliserMessage("Modifications enregistrées.");
          updateCoordsDisplay(data.locationLat, data.locationLng);
          if (personnaliserLogo) personnaliserLogo.value = "";
          if (body.cardBackgroundBase64 === "") {
            personnaliserCardBgRemoveRequested = false;
            hasCardBackgroundFromServer = false;
            personnaliserCardBgDataUrl = "";
            if (personnaliserCardBg) personnaliserCardBg.value = "";
            if (personnaliserCardBgPreview) {
              personnaliserCardBgPreview.src = "";
              personnaliserCardBgPreview.classList.add("hidden");
            }
            if (personnaliserCardBgPlaceholder) {
              personnaliserCardBgPlaceholder.textContent = "+ Choisir une image de fond";
              personnaliserCardBgPlaceholder.classList.remove("hidden");
            }
            if (personnaliserCardBgRemove) personnaliserCardBgRemove.classList.add("hidden");
          } else if (body.cardBackgroundBase64) {
            hasCardBackgroundFromServer = true;
            personnaliserCardBgDataUrl = "";
            if (personnaliserCardBg) personnaliserCardBg.value = "";
            if (personnaliserCardBgPlaceholder) {
              personnaliserCardBgPlaceholder.textContent = "Image de fond enregistrée";
              personnaliserCardBgPlaceholder.classList.remove("hidden");
            }
            if (personnaliserCardBgRemove) personnaliserCardBgRemove.classList.remove("hidden");
            api("/card-background?v=" + Date.now())
              .then((r) => (r.ok ? r.blob() : null))
              .then((blob) => {
                if (blob && personnaliserCardBgPreview) {
                  personnaliserCardBgDataUrl = URL.createObjectURL(blob);
                  personnaliserCardBgPreview.src = personnaliserCardBgDataUrl;
                  personnaliserCardBgPreview.classList.remove("hidden");
                  if (personnaliserCardBgPlaceholder) personnaliserCardBgPlaceholder.classList.add("hidden");
                  updatePersonnaliserPreview();
                }
              })
              .catch(() => {});
          }
          // Toujours recharger le logo depuis l'API après enregistrement : garde l'affichage cohérent et met à jour personnaliserLogoDataUrl (blob URL) pour les prochains saves.
          api("/logo?v=" + Date.now())
              .then((r) => (r.ok ? r.blob() : null))
              .then((blob) => {
                if (blob && personnaliserLogoPreview) {
                  const url = URL.createObjectURL(blob);
                personnaliserLogoDataUrl = url;
                  personnaliserLogoPreview.src = url;
                  personnaliserLogoPreview.classList.remove("hidden");
                  if (personnaliserLogoPlaceholder) personnaliserLogoPlaceholder.classList.add("hidden");
                  const walletLogo = document.getElementById("app-wallet-preview-logo");
                  if (walletLogo) {
                    walletLogo.src = url;
                    walletLogo.classList.remove("hidden");
                  }
                  updatePersonnaliserPreview();
          } else {
                personnaliserLogoDataUrl = "";
            if (personnaliserLogoPreview) {
              personnaliserLogoPreview.src = "";
              personnaliserLogoPreview.classList.add("hidden");
            }
            if (personnaliserLogoPlaceholder) personnaliserLogoPlaceholder.classList.remove("hidden");
            updatePersonnaliserPreview();
          }
            })
            .catch(() => { updatePersonnaliserPreview(); });
        } else {
          let errMsg = data.error || "Erreur lors de l'enregistrement.";
          if (res.status === 401) errMsg = "Accès refusé. Utilisez le lien reçu par e-mail pour ouvrir cette page (il contient le token), ou déconnectez-vous puis reconnectez-vous.";
          else if (res.status === 404) errMsg = "Commerce introuvable.";
          else if (res.status === 500) errMsg = data.error || "Erreur serveur. Réessayez.";
          showPersonnaliserMessage(errMsg, true);
        }
      } catch (_) {
        showPersonnaliserMessage("Erreur réseau. Vérifiez votre connexion.", true);
      }
      personnaliserSave.disabled = false;
    });
  }

  // ——— Scanner (caméra) ———
  const scannerStart = document.getElementById("app-scanner-start");
  const scannerVerifying = document.getElementById("app-scanner-verifying");
  const scannerFullscreen = document.getElementById("app-scanner-fullscreen");
  const scannerFullscreenViewport = document.getElementById("app-scanner-fullscreen-viewport");
  const scannerFullscreenVerifying = document.getElementById("app-scanner-fullscreen-verifying");
  const scannerSuccessFlash = document.getElementById("app-scanner-success-flash");
  const scannerFullscreenReject = document.getElementById("app-scanner-fullscreen-reject");
  const scannerFullscreenRejectMsg = document.getElementById("app-scanner-fullscreen-reject-msg");
  const scannerReject = document.getElementById("app-scanner-reject");
  const scannerRejectMessage = document.getElementById("app-scanner-reject-message");
  const scannerRetryBtn = document.getElementById("app-scanner-retry");
  const scannerResult = document.getElementById("app-scanner-result");
  const scannerResultName = document.getElementById("app-scanner-result-name");
  const scannerResultEmail = document.getElementById("app-scanner-result-email");
  const scannerResultPoints = document.getElementById("app-scanner-result-points");
  const scannerResultLastVisit = document.getElementById("app-scanner-result-last-visit");
  const scannerHistoryList = document.getElementById("app-scanner-history-list");
  const scannerOneVisit = document.getElementById("app-scanner-one-visit");
  const scannerAmount = document.getElementById("app-scanner-amount");
  const scannerAddPoints = document.getElementById("app-scanner-add-points");
  const scannerResume = document.getElementById("app-scanner-resume");
  const scannerResultMessage = document.getElementById("app-scanner-result-message");
  const scannerCard = document.getElementById("app-scanner-card");
  const scannerActionsStamps = document.getElementById("app-scanner-actions-stamps");
  const scannerActionsPoints = document.getElementById("app-scanner-actions-points");
  const scannerAddOneStamp = document.getElementById("app-scanner-add-one-stamp");

  let scannerInstance = null;
  let scannerCurrentMemberId = null;
  let scannerCurrentMember = null;
  let scannerVisitOnly = false;
  let scannerProgramType = "points";
  let scannerRequiredStamps = 10;
  let scannerPointsPerEuro = 1;

  function hideAllScannerStates() {
    if (scannerVerifying) scannerVerifying.classList.add("hidden");
    if (scannerReject) scannerReject.classList.add("hidden");
    if (scannerResult) scannerResult.classList.add("hidden");
    if (scannerStart) scannerStart.classList.remove("hidden");
    scannerCard?.classList.remove("app-scanner-has-overlay");
  }

  function closeFullscreenScanner() {
    if (scannerFullscreen) { scannerFullscreen.classList.add("hidden"); scannerFullscreen.setAttribute("aria-hidden", "true"); }
    if (scannerFullscreenVerifying) scannerFullscreenVerifying.classList.add("hidden");
    if (scannerSuccessFlash) scannerSuccessFlash.classList.add("hidden");
    if (scannerFullscreenReject) scannerFullscreenReject.classList.add("hidden");
  }

  function showScannerVerifying() {
    if (scannerStart) scannerStart.classList.add("hidden");
    if (scannerVerifying) scannerVerifying.classList.remove("hidden");
    if (scannerReject) scannerReject.classList.add("hidden");
    if (scannerResult) scannerResult.classList.add("hidden");
    scannerCard?.classList.add("app-scanner-has-overlay");
  }

  function scannerFeedbackSuccess() {
    try { if (navigator.vibrate) navigator.vibrate(100); } catch (_) {}
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      gain.gain.value = 0.15;
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } catch (_) {}
  }
  function scannerFeedbackReject() {
    try { if (navigator.vibrate) navigator.vibrate([50, 50, 50]); } catch (_) {}
  }

  function showFullscreenReject(message) {
    scannerFeedbackReject();
    if (scannerFullscreenVerifying) scannerFullscreenVerifying.classList.add("hidden");
    if (scannerSuccessFlash) scannerSuccessFlash.classList.add("hidden");
    if (scannerFullscreenReject && scannerFullscreenRejectMsg) {
      scannerFullscreenRejectMsg.textContent = message || "Ce QR code ne correspond pas à un client de votre commerce.";
      scannerFullscreenReject.classList.remove("hidden");
    }
  }

  function showScannerReject(message) {
    scannerFeedbackReject();
    closeFullscreenScanner();
    hideAllScannerStates();
    if (scannerReject) scannerReject.classList.remove("hidden");
    if (scannerRejectMessage) scannerRejectMessage.textContent = message || "Ce QR code ne correspond pas à un client de votre commerce.";
    scannerCard?.classList.add("app-scanner-has-overlay");
  }

  async function showScannerResult(member) {
    scannerFeedbackSuccess();
    scannerCurrentMemberId = member.id;
    scannerCurrentMember = member;
    if (scannerFullscreenVerifying) scannerFullscreenVerifying.classList.add("hidden");
    if (scannerSuccessFlash) scannerSuccessFlash.classList.remove("hidden");
    await new Promise((r) => setTimeout(r, 1200));
    closeFullscreenScanner();
    hideAllScannerStates();
    if (scannerResult) scannerResult.classList.remove("hidden");
    if (scannerStart) scannerStart.classList.add("hidden");
    scannerCard?.classList.add("app-scanner-has-overlay");

    try {
      const settingsRes = await api("/dashboard/settings");
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        let pt = (data.program_type ?? data.programType ?? "").toLowerCase();
        if (pt !== "points" && pt !== "stamps") {
          pt = (data.required_stamps ?? data.requiredStamps) > 0 ? "stamps" : "points";
        }
        scannerProgramType = pt;
        scannerRequiredStamps = Math.max(1, parseInt(data.required_stamps ?? data.requiredStamps, 10) || 10);
        scannerPointsPerEuro = data.points_per_euro ?? data.pointsPerEuro ?? 1;
      }
    } catch (_) {}

    const displayName = member.name?.trim() || member.email || "Client";
    if (scannerResultName) scannerResultName.textContent = displayName;
    if (scannerResultEmail) {
      scannerResultEmail.textContent = member.email || "";
      scannerResultEmail.classList.toggle("hidden", !member.email);
    }
    const pts = member.points ?? 0;
    if (scannerResultPoints) {
      scannerResultPoints.textContent = scannerProgramType === "stamps"
        ? `${Math.min(pts, scannerRequiredStamps)} / ${scannerRequiredStamps} tampons`
        : `${pts} point(s)`;
    }
    if (scannerActionsStamps) scannerActionsStamps.classList.toggle("hidden", scannerProgramType !== "stamps");
    if (scannerActionsPoints) scannerActionsPoints.classList.toggle("hidden", scannerProgramType === "stamps");

    if (scannerResultLastVisit) {
      if (member.last_visit_at) {
        scannerResultLastVisit.textContent = "Dernière visite : " + formatDate(member.last_visit_at);
        scannerResultLastVisit.classList.remove("hidden");
      } else {
        scannerResultLastVisit.textContent = "";
        scannerResultLastVisit.classList.add("hidden");
      }
    }
    if (scannerResultMessage) { scannerResultMessage.classList.add("hidden"); scannerResultMessage.textContent = ""; }
    if (scannerAmount) scannerAmount.value = "";
    const pointsPreviewEl = document.getElementById("app-scanner-points-preview");
    if (pointsPreviewEl) { pointsPreviewEl.classList.add("hidden"); pointsPreviewEl.textContent = ""; }
    scannerVisitOnly = false;

    if (scannerProgramType === "points" && scannerAmount) {
      setTimeout(() => {
        scannerAmount.focus();
      }, 450);
    }

    if (scannerHistoryList) {
      scannerHistoryList.innerHTML = "";
      try {
        const txRes = await api("/dashboard/transactions?limit=5&memberId=" + encodeURIComponent(member.id));
        if (txRes.ok) {
          const { transactions } = await txRes.json();
          if (transactions?.length) {
            transactions.forEach((t) => {
              const li = document.createElement("li");
              const label = scannerProgramType === "stamps"
                ? (t.points === 1 ? "1 tampon" : `+${t.points} tampons`)
                : `+${t.points} pt${t.points > 1 ? "s" : ""}`;
              li.textContent = `${label} — ${formatDate(t.created_at)}`;
              scannerHistoryList.appendChild(li);
            });
          } else {
            const li = document.createElement("li");
            li.className = "app-scanner-history-empty";
            li.textContent = "Aucune opération pour l’instant.";
            scannerHistoryList.appendChild(li);
          }
        }
      } catch (_) {}
    }
  }

  function hideScannerResult() {
    scannerCurrentMemberId = null;
    scannerCurrentMember = null;
    hideAllScannerStates();
    if (scannerStart) scannerStart.classList.remove("hidden");
    if (scannerResultMessage) { scannerResultMessage.classList.add("hidden"); scannerResultMessage.textContent = ""; }
  }

  /** Préfère la caméra arrière principale (pas grand angle / ultra-wide) pour le scan. */
  async function getPreferredBackCameraConfig() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === "videoinput");
      const backLabels = /back|arrière|environment/i;
      const ultrawideLabels = /ultra\s*wide|grand\s*angle|0\.5x|wide\s*angle/i;
      const backCameras = videoInputs.filter((d) => backLabels.test(d.label || ""));
      const mainBack = backCameras.find((d) => !ultrawideLabels.test(d.label || ""));
      const fallback = backCameras[0];
      const chosen = mainBack || fallback;
      if (chosen?.deviceId) {
        return {
          deviceId: { exact: chosen.deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        };
      }
    } catch (_) {}
    return {
      facingMode: "environment",
      width: { ideal: 1280 },
      height: { ideal: 720 },
    };
  }

  async function startFullscreenScanner() {
    if (scannerInstance) return;
    if (!scannerFullscreen || !scannerFullscreenViewport) return;
    scannerFullscreen.classList.remove("hidden");
    scannerFullscreen.setAttribute("aria-hidden", "false");
    if (scannerFullscreenVerifying) scannerFullscreenVerifying.classList.add("hidden");
    if (scannerSuccessFlash) scannerSuccessFlash.classList.add("hidden");
    if (scannerFullscreenReject) scannerFullscreenReject.classList.add("hidden");
    scannerFullscreenViewport.innerHTML = "";

    const config = { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] };
    scannerInstance = new Html5Qrcode("app-scanner-fullscreen-viewport", config);
    const cameraConfig = await getPreferredBackCameraConfig();
    const qrboxSize = Math.min(280, Math.min(window.innerWidth, window.innerHeight) * 0.72);
    const scanConfig = { fps: 15, qrbox: { width: qrboxSize, height: qrboxSize } };

    scannerInstance.start(cameraConfig, scanConfig, async (decodedText) => {
      if (scannerCurrentMemberId) return;
      const instance = scannerInstance;
      try {
        if (instance) await instance.stop();
      } catch (_) {}
      scannerInstance = null;
      if (scannerFullscreenVerifying) scannerFullscreenVerifying.classList.remove("hidden");
      if (scannerSuccessFlash) scannerSuccessFlash.classList.add("hidden");
      if (scannerFullscreenReject) scannerFullscreenReject.classList.add("hidden");
      const memberId = decodedText.trim();
      try {
        const res = await api("/members/" + encodeURIComponent(memberId));
        if (res.status === 404) {
          showFullscreenReject("Ce QR code ne correspond pas à un client de votre commerce.");
          return;
        }
        if (!res.ok) {
          showFullscreenReject("Erreur serveur. Réessayez dans un instant.");
          return;
        }
        const member = await res.json();
        await showScannerResult(member);
      } catch (_) {
        showFullscreenReject("Impossible de vérifier le code. Vérifiez votre connexion et réessayez.");
      }
    }, () => {}).catch((err) => {
      scannerInstance = null;
      closeFullscreenScanner();
      showScannerReject(err?.message || "Impossible d’accéder à la caméra. Vérifiez les permissions du navigateur.");
    });
  }

  function stopFullscreenScanner() {
    if (scannerInstance) {
      scannerInstance.stop().then(() => {
        scannerInstance = null;
        closeFullscreenScanner();
      }).catch(() => {
        scannerInstance = null;
        closeFullscreenScanner();
      });
    } else {
      closeFullscreenScanner();
    }
  }

  document.getElementById("app-scanner-launch-btn")?.addEventListener("click", () => startFullscreenScanner());
  document.getElementById("app-scanner-fullscreen-close")?.addEventListener("click", () => stopFullscreenScanner());
  document.getElementById("app-scanner-fullscreen-retry")?.addEventListener("click", () => {
    if (scannerFullscreenReject) scannerFullscreenReject.classList.add("hidden");
    if (scannerFullscreenViewport) scannerFullscreenViewport.innerHTML = "";
    startFullscreenScanner();
  });

  scannerRetryBtn?.addEventListener("click", () => {
    hideAllScannerStates();
    if (scannerStart) scannerStart.classList.remove("hidden");
    startFullscreenScanner();
  });

  scannerResume?.addEventListener("click", () => {
    hideScannerResult();
    startFullscreenScanner();
  });

  scannerOneVisit?.addEventListener("click", () => { scannerVisitOnly = true; if (scannerAmount) scannerAmount.value = ""; updateScannerPointsPreview(); });
  const scannerPointsPreview = document.getElementById("app-scanner-points-preview");
  function updateScannerPointsPreview() {
    if (!scannerPointsPreview || scannerProgramType !== "points") return;
    const raw = (scannerAmount?.value || "").replace(",", ".").trim();
    const amt = parseFloat(raw);
    if (!Number.isFinite(amt) || amt <= 0) {
      scannerPointsPreview.classList.add("hidden");
      scannerPointsPreview.textContent = "";
      return;
    }
    const pts = Math.floor(amt * scannerPointsPerEuro);
    scannerPointsPreview.textContent = `= ${pts} point${pts !== 1 ? "s" : ""}`;
    scannerPointsPreview.classList.remove("hidden");
  }
  scannerAmount?.addEventListener("input", () => { scannerVisitOnly = false; updateScannerPointsPreview(); });

  const scannerAmountTap = document.getElementById("app-scanner-amount-tap");
  if (scannerAmountTap && scannerAmount) {
    scannerAmountTap.addEventListener("click", () => { scannerAmount.focus(); });
  }

  scannerAddOneStamp?.addEventListener("click", async () => {
    if (!scannerCurrentMemberId) return;
    scannerAddOneStamp.disabled = true;
    try {
      const headers = { "Content-Type": "application/json", ...getAuthHeaders() };
      if (dashboardToken) headers["X-Dashboard-Token"] = dashboardToken;
      const res = await fetch(`${API_BASE}/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(scannerCurrentMemberId)}/points`, {
        method: "POST",
        headers,
        body: JSON.stringify({ visit: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (scannerResultMessage) {
          scannerResultMessage.textContent = data.error || "Erreur";
          scannerResultMessage.classList.remove("hidden");
        }
        return;
      }
      const total = data.points;
      if (scannerResultMessage) {
        scannerResultMessage.textContent = `+1 tampon enregistré. ${Math.min(total, scannerRequiredStamps)} / ${scannerRequiredStamps} tampons.`;
        scannerResultMessage.classList.remove("hidden");
      }
      if (scannerResultPoints) {
        scannerResultPoints.textContent = `${Math.min(total, scannerRequiredStamps)} / ${scannerRequiredStamps} tampons`;
      }
      scannerCurrentMember = scannerCurrentMember ? { ...scannerCurrentMember, points: total } : null;
      await refresh();
    } catch (_) {
      if (scannerResultMessage) {
        scannerResultMessage.textContent = "Erreur réseau.";
        scannerResultMessage.classList.remove("hidden");
      }
    }
    scannerAddOneStamp.disabled = false;
  });

  scannerAddPoints?.addEventListener("click", async () => {
    if (!scannerCurrentMemberId) return;
    const amountRaw = (scannerAmount?.value || "").replace(",", ".").trim();
    const body = scannerVisitOnly ? { visit: true } : { amount_eur: parseFloat(amountRaw) || 0 };
    if (!scannerVisitOnly && !body.amount_eur) {
      if (scannerResultMessage) {
        scannerResultMessage.textContent = "Indiquez un montant (€) ou cliquez sur « 1 passage ».";
        scannerResultMessage.classList.remove("hidden");
      }
      return;
    }
    try {
      const headers = { "Content-Type": "application/json", ...getAuthHeaders() };
      if (dashboardToken) headers["X-Dashboard-Token"] = dashboardToken;
      const res = await fetch(`${API_BASE}/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(scannerCurrentMemberId)}/points`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (scannerResultMessage) {
          scannerResultMessage.textContent = data.error || "Erreur";
          scannerResultMessage.classList.remove("hidden");
        }
        return;
      }
      const added = data.points_added ?? data.points;
      const total = data.points;
      if (scannerResultMessage) {
        scannerResultMessage.textContent = scannerProgramType === "stamps"
          ? `+1 tampon enregistré. ${Math.min(total, scannerRequiredStamps)} / ${scannerRequiredStamps} tampons.`
          : `${added} point(s) ajouté(s). Total : ${total} pts.`;
        scannerResultMessage.classList.remove("hidden");
      }
      if (scannerResultPoints) {
        scannerResultPoints.textContent = scannerProgramType === "stamps"
          ? `${Math.min(total, scannerRequiredStamps)} / ${scannerRequiredStamps} tampons`
          : `${total} point(s)`;
      }
      scannerCurrentMember = scannerCurrentMember ? { ...scannerCurrentMember, points: total } : null;
      await refresh();
    } catch (_) {
      if (scannerResultMessage) {
        scannerResultMessage.textContent = "Erreur réseau.";
        scannerResultMessage.classList.remove("hidden");
      }
    }
  });

  document.querySelectorAll("#app-app .app-sidebar-link[data-section]").forEach((link) => {
    link.addEventListener("click", () => {
      const id = link.getAttribute("data-section");
      if (id !== "scanner") stopFullscreenScanner();
    });
  });
  window.addEventListener("app-section-change", (e) => {
    if (e.detail?.sectionId !== "scanner") stopFullscreenScanner();
  });

  let allMembers = [];
  let selectedMemberId = null;
  let addPointsVisitOnly = false;
  const CAISSE_RECENT_KEY = `fidpass_caisse_recent_${slug}`;
  const CAISSE_RECENT_MAX = 10;

  function getCaisseRecent() {
    try {
      const raw = localStorage.getItem(CAISSE_RECENT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  }
  function addToCaisseRecent(member) {
    if (!member?.id) return;
    let list = getCaisseRecent().filter((x) => x.id !== member.id);
    list.unshift({ id: member.id, name: member.name || "Client" });
    list = list.slice(0, CAISSE_RECENT_MAX);
    try {
      localStorage.setItem(CAISSE_RECENT_KEY, JSON.stringify(list));
    } catch (_) {}
    renderCaisseRecent();
  }
  function renderCaisseRecent() {
    const container = document.getElementById("app-caisse-recent");
    if (!container) return;
    const list = getCaisseRecent();
    if (list.length === 0) { container.innerHTML = ""; return; }
    container.innerHTML = list.map((m) => `<button type="button" class="app-caisse-recent-btn" data-id="${escapeHtml(m.id)}">${escapeHtml(m.name)}</button>`).join("");
    container.querySelectorAll(".app-caisse-recent-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedMemberId = btn.dataset.id;
        const rec = list.find((x) => x.id === selectedMemberId);
        if (memberSearchInput) memberSearchInput.value = rec ? `${rec.name}` : "";
        memberListEl?.classList.add("hidden");
        if (addPointsBtn) addPointsBtn.disabled = false;
        updateRedeemButtons();
      });
    });
  }

  const redeemStampsBtn = document.getElementById("app-redeem-stamps");
  const redeemPointsInput = document.getElementById("app-redeem-points");
  const redeemPointsBtn = document.getElementById("app-redeem-points-btn");
  function updateRedeemButtons() {
    const enabled = !!selectedMemberId;
    if (redeemStampsBtn) redeemStampsBtn.disabled = !enabled;
    if (redeemPointsBtn) redeemPointsBtn.disabled = !enabled;
  }
  function doRedeem(body) {
    if (!selectedMemberId) return;
    const url = `${API_BASE}/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(selectedMemberId)}/redeem`;
    const headers = { "Content-Type": "application/json", ...getAuthHeaders() };
    if (dashboardToken) headers["X-Dashboard-Token"] = dashboardToken;
    return fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  }
  redeemStampsBtn?.addEventListener("click", async () => {
    if (!selectedMemberId) return;
    redeemStampsBtn.disabled = true;
    try {
      const res = await doRedeem({ type: "stamps" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showCaisseMessage(data.error || "Erreur", true);
        redeemStampsBtn.disabled = false;
        return;
      }
      showCaisseMessage("Récompense tampons utilisée.");
      selectedMemberId = null;
      if (addPointsBtn) addPointsBtn.disabled = true;
      updateRedeemButtons();
      await refresh();
    } catch (_) {
      showCaisseMessage("Erreur réseau.", true);
    }
    redeemStampsBtn.disabled = false;
  });
  redeemPointsBtn?.addEventListener("click", async () => {
    if (!selectedMemberId) return;
    const pts = parseInt(redeemPointsInput?.value || "0", 10);
    if (!pts || pts <= 0) {
      showCaisseMessage("Indiquez un nombre de points à déduire.", true);
      return;
    }
    redeemPointsBtn.disabled = true;
    try {
      const res = await doRedeem({ type: "points", points: pts });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showCaisseMessage(data.error || "Erreur", true);
        redeemPointsBtn.disabled = false;
        return;
      }
      showCaisseMessage(`${pts} point(s) déduit(s). Nouveau solde : ${data.new_points ?? "—"} pts.`);
      if (redeemPointsInput) redeemPointsInput.value = "";
      selectedMemberId = null;
      if (addPointsBtn) addPointsBtn.disabled = true;
      updateRedeemButtons();
      await refresh();
    } catch (_) {
      showCaisseMessage("Erreur réseau.", true);
    }
    redeemPointsBtn.disabled = false;
  });

  function showCaisseMessage(text, isError = false) {
    if (!caisseMessage) return;
    caisseMessage.textContent = text;
    caisseMessage.classList.remove("hidden", "success", "error");
    caisseMessage.classList.add(isError ? "error" : "success");
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }
  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  async function loadStats() {
    const res = await api("/dashboard/stats");
    if (res.status === 401) throw new Error("Unauthorized");
    if (!res.ok) return null;
    const raw = await res.json();
    const data = {
      membersCount: raw.members_count ?? raw.membersCount ?? 0,
      pointsThisMonth: raw.points_this_month ?? raw.pointsThisMonth ?? 0,
      transactionsThisMonth: raw.transactions_this_month ?? raw.transactionsThisMonth ?? 0,
      newMembersLast30Days: raw.new_members_last_30_days ?? raw.newMembersLast30Days ?? 0,
      newMembersLast7Days: raw.new_members_last_7_days ?? raw.newMembersLast7Days ?? 0,
      inactiveMembers30Days: raw.inactive_members_30_days ?? raw.inactiveMembers30Days ?? 0,
      pointsAveragePerMember: raw.points_average_per_member ?? raw.pointsAveragePerMember ?? 0,
    };
    if (statMembers) statMembers.textContent = data.membersCount;
    if (statPoints) statPoints.textContent = data.pointsThisMonth;
    if (statTransactions) statTransactions.textContent = data.transactionsThisMonth;
    if (statNew30) statNew30.textContent = data.newMembersLast30Days;
    if (statInactive30) statInactive30.textContent = data.inactiveMembers30Days;
    if (statAvgPoints) statAvgPoints.textContent = data.pointsAveragePerMember;
    const mobileStatMembers = document.getElementById("app-mobile-stat-members");
    const mobileStatScans = document.getElementById("app-mobile-stat-scans");
    if (mobileStatMembers) mobileStatMembers.textContent = data.membersCount;
    if (mobileStatScans) mobileStatScans.textContent = data.transactionsThisMonth;
    return data;
  }

  async function loadEvolution() {
    const res = await api("/dashboard/evolution?weeks=6");
    if (!res.ok) return;
    const data = await res.json();
    const chartEl = document.getElementById("app-evolution-chart");
    const evolution = data.evolution || [];
    if (!chartEl || !evolution.length) {
      if (chartEl) chartEl.innerHTML = "<p class=\"app-evolution-empty\">Aucune donnée pour le moment.</p>";
      return;
    }
    const maxOp = Math.max(1, ...evolution.map((w) => w.operationsCount ?? w.operations_count ?? 0));
    const weekLabels = [];
    for (let i = evolution.length - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - (i + 1) * 7);
      weekLabels.push(`S. ${d.getDate()}/${d.getMonth() + 1}`);
    }
    chartEl.innerHTML = evolution.map((w, i) => {
      const op = w.operationsCount ?? w.operations_count ?? 0;
      const pct = maxOp > 0 ? (op / maxOp) * 100 : 0;
      const label = weekLabels[i] || `Sem. ${i + 1}`;
      return `<div class="app-evolution-bar-wrap" title="${label}: ${op} opération(s)">
        <div class="app-evolution-bar-outer">
          <div class="app-evolution-bar" style="height: ${pct}%" aria-hidden="true"></div>
        </div>
        <span class="app-evolution-bar-label">${label}</span>
      </div>`;
    }).join("");
  }

  function renderOverviewAlerts(stats) {
    const alertsEl = document.getElementById("app-overview-alerts");
    if (!alertsEl) return;
    const parts = [];
    if ((stats.newMembersLast7Days ?? 0) > 0) parts.push(`${stats.newMembersLast7Days} nouveau(x) membre(s) cette semaine. <a href="#membres">Voir les membres</a>`);
    if ((stats.inactiveMembers30Days ?? 0) > 0) parts.push(`${stats.inactiveMembers30Days} membre(s) inactif(s) depuis 30 j. <a href="#membres" data-filter="inactive30">Voir les inactifs</a>`);
    if (parts.length === 0) { alertsEl.classList.add("hidden"); alertsEl.innerHTML = ""; return; }
    alertsEl.classList.remove("hidden");
    alertsEl.innerHTML = parts.join(" — ");
    alertsEl.querySelectorAll("a[href='#membres']").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        showAppSection("membres");
        if (a.dataset.filter === "inactive30") {
          const filterEl = document.getElementById("app-members-filter");
          if (filterEl) filterEl.value = "inactive30";
          window.dispatchEvent(new CustomEvent("app-members-refresh"));
        }
      });
    });
  }

  const membersFilterEl = document.getElementById("app-members-filter");
  const membersSortEl = document.getElementById("app-members-sort");
  const transactionsDaysEl = document.getElementById("app-transactions-days");
  const transactionsTypeEl = document.getElementById("app-transactions-type");

  async function loadMembers(search = "", filter = "", sort = "last_visit") {
    const params = new URLSearchParams({ limit: 100 });
    if (search) params.set("search", search);
    if (filter) params.set("filter", filter);
    if (sort) params.set("sort", sort);
    const res = await api(`/dashboard/members?${params}`);
    if (!res.ok) return { members: [], total: 0 };
    return res.json();
  }

  async function loadTransactions(days = "", type = "") {
    const params = new URLSearchParams({ limit: 50 });
    if (days) params.set("days", days);
    if (type) params.set("type", type);
    const res = await api(`/dashboard/transactions?${params}`);
    if (!res.ok) return { transactions: [], total: 0 };
    return res.json();
  }

  function renderMembers(members) {
    if (!membersTbody) return;
    membersTbody.innerHTML = (members || [])
      .map((m) =>
        `<tr data-member-id="${escapeHtml(m.id)}"><td>${escapeHtml(m.name)}</td><td>${escapeHtml(m.email)}</td><td>${m.points}</td><td>${m.last_visit_at ? formatDate(m.last_visit_at) : "—"}</td></tr>`
      )
      .join("") || "<tr><td colspan='4'>Aucun membre</td></tr>";
  }

  function renderTransactions(transactions) {
    if (!transactionsTbody) return;
    transactionsTbody.innerHTML = (transactions || [])
      .map((t) =>
        `<tr><td>${escapeHtml(t.member_name)}</td><td>${t.type === "points_add" ? "Points ajoutés" : t.type}</td><td>+${t.points}</td><td>${formatDate(t.created_at)}</td></tr>`
      )
      .join("") || "<tr><td colspan='4'>Aucune opération</td></tr>";
  }

  async function refresh() {
    try {
      const stats = await loadStats();
      if (stats) renderOverviewAlerts(stats);
      await loadEvolution();
    } catch (_) { return; }
    const membersData = await loadMembers(membersSearchInput?.value || "", membersFilterEl?.value || "", membersSortEl?.value || "last_visit");
    allMembers = membersData.members || [];
    renderMembers(allMembers);
    const txData = await loadTransactions(transactionsDaysEl?.value || "", transactionsTypeEl?.value || "");
    renderTransactions(txData.transactions || []);
  }

  memberSearchInput?.addEventListener("input", async () => {
    const q = memberSearchInput.value.trim();
    if (q.length < 2) {
      memberListEl?.classList.add("hidden");
      if (memberListEl) memberListEl.innerHTML = "";
      selectedMemberId = null;
      if (addPointsBtn) addPointsBtn.disabled = true;
      return;
    }
    const data = await loadMembers(q);
    const members = data.members || [];
    if (!memberListEl) return;
    memberListEl.innerHTML = members
      .map((m) => `<div class="app-member-item" data-id="${m.id}">${escapeHtml(m.name)} — ${escapeHtml(m.email)} (${m.points} pts)</div>`)
      .join("");
    memberListEl.classList.remove("hidden");
    memberListEl.querySelectorAll(".app-member-item").forEach((el) => {
      el.addEventListener("click", () => {
        selectedMemberId = el.dataset.id;
        const m = members.find((x) => x.id === selectedMemberId);
        memberSearchInput.value = m ? `${m.name} (${m.email})` : "";
        memberListEl.classList.add("hidden");
        if (addPointsBtn) addPointsBtn.disabled = false;
        if (m) addToCaisseRecent(m);
        updateRedeemButtons();
      });
    });
  });
  renderCaisseRecent();

  oneVisitBtn?.addEventListener("click", () => {
    addPointsVisitOnly = true;
    if (amountInput) amountInput.value = "";
  });
  amountInput?.addEventListener("input", () => { addPointsVisitOnly = false; });

  addPointsBtn?.addEventListener("click", async () => {
    if (!selectedMemberId) return;
    addPointsBtn.disabled = true;
    caisseMessage?.classList.add("hidden");
    try {
      const body = addPointsVisitOnly ? { visit: true } : { amount_eur: parseFloat(amountInput?.value) || 0 };
      if (!addPointsVisitOnly && !body.amount_eur) {
        showCaisseMessage("Indiquez un montant (€) ou cliquez sur « 1 passage ».", true);
        addPointsBtn.disabled = false;
        return;
      }
      const headers = { "Content-Type": "application/json", ...getAuthHeaders() };
      if (dashboardToken) headers["X-Dashboard-Token"] = dashboardToken;
      const res = await fetch(`${API_BASE}/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(selectedMemberId)}/points`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showCaisseMessage(data.error || "Erreur", true);
        addPointsBtn.disabled = false;
        return;
      }
      const added = data.points_added ?? data.points;
      const total = data.points;
      showCaisseMessage(`${added} point(s) ajouté(s). Total : ${total} pts.`);
      const addedMember = allMembers.find((m) => m.id === selectedMemberId) || { id: selectedMemberId, name: memberSearchInput?.value || "Client" };
      addToCaisseRecent(addedMember);
      if (amountInput) amountInput.value = "";
      selectedMemberId = null;
      if (memberSearchInput) memberSearchInput.value = "";
      addPointsVisitOnly = false;
      updateRedeemButtons();
      await refresh();
    } catch (_) {
      showCaisseMessage("Erreur réseau.", true);
    }
    addPointsBtn.disabled = false;
  });

  membersSearchInput?.addEventListener("input", () => {
    const q = membersSearchInput.value.trim();
    const filter = membersFilterEl?.value || "";
    const sort = membersSortEl?.value || "last_visit";
    loadMembers(q, filter, sort).then((data) => renderMembers(data.members || []));
  });
  membersFilterEl?.addEventListener("change", () => refresh());
  membersSortEl?.addEventListener("change", () => refresh());
  transactionsDaysEl?.addEventListener("change", () => refresh());
  transactionsTypeEl?.addEventListener("change", () => refresh());

  const membersExportBtn = document.getElementById("app-members-export");
  const transactionsExportBtn = document.getElementById("app-transactions-export");
  if (membersExportBtn) {
    membersExportBtn.addEventListener("click", async () => {
      const params = new URLSearchParams();
      if (membersSearchInput?.value) params.set("search", membersSearchInput.value);
      if (membersFilterEl?.value) params.set("filter", membersFilterEl.value);
      if (membersSortEl?.value) params.set("sort", membersSortEl.value);
      const res = await api(`/dashboard/members/export?${params}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `membres-${slug}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  const membersImportFile = document.getElementById("app-members-import-file");
  const membersImportFilename = document.getElementById("app-members-import-filename");
  const membersImportDuplicate = document.getElementById("app-members-import-duplicate");
  const membersImportBtn = document.getElementById("app-members-import-btn");
  const membersImportResult = document.getElementById("app-members-import-result");
  if (membersImportFile && membersImportBtn) {
    membersImportFile.addEventListener("change", () => {
      const file = membersImportFile.files?.[0];
      if (membersImportFilename) membersImportFilename.textContent = file ? file.name : "";
      membersImportBtn.disabled = !file;
    });
    membersImportBtn.addEventListener("click", async () => {
      const file = membersImportFile.files?.[0];
      if (!file) return;
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        if (membersImportResult) { membersImportResult.textContent = "Le fichier doit contenir une ligne d’en-tête et au moins une ligne de données."; membersImportResult.classList.remove("hidden"); membersImportResult.classList.add("error"); }
        return;
      }
      const sep = lines[0].includes(";") ? ";" : ",";
      const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/^[\s"\uFEFF]+|[\s"]+$/g, ""));
      const emailIdx = headers.findIndex((h) => /e-?mail/.test(h) || h === "email");
      const nameIdx = headers.findIndex((h) => /^(nom|name|prénom|prenom|client)$/.test(h) || h === "name" || h === "nom");
      if (emailIdx === -1 || nameIdx === -1) {
        if (membersImportResult) { membersImportResult.textContent = "Colonnes requises : email (ou E-mail) et name (ou nom, prénom)."; membersImportResult.classList.remove("hidden"); membersImportResult.classList.add("error"); }
        return;
      }
      const pointsIdx = headers.findIndex((h) => /^(points|tampons|solde)$/.test(h));
      const members = [];
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
        const email = (cells[emailIdx] || "").trim();
        const name = (cells[nameIdx] || "").trim();
        if (!email) continue;
        const points = pointsIdx >= 0 && cells[pointsIdx] !== undefined ? parseInt(cells[pointsIdx], 10) : 0;
        members.push({ email, name: name || email, points: Number.isNaN(points) ? 0 : Math.max(0, points) });
      }
      if (members.length === 0) {
        if (membersImportResult) { membersImportResult.textContent = "Aucune ligne valide (email requis)."; membersImportResult.classList.remove("hidden"); membersImportResult.classList.add("error"); }
        return;
      }
      membersImportBtn.disabled = true;
      if (membersImportResult) { membersImportResult.textContent = "Import en cours…"; membersImportResult.classList.remove("hidden", "error"); }
      try {
        const url = `${API_BASE}/api/businesses/${encodeURIComponent(slug)}/members/import`;
        const headers = { "Content-Type": "application/json", ...getAuthHeaders() };
        if (dashboardToken) headers["X-Dashboard-Token"] = dashboardToken;
        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ members, onDuplicate: membersImportDuplicate?.value || "skip" }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const msg = `${data.created ?? 0} créé(s), ${data.updated ?? 0} mis à jour, ${data.skipped ?? 0} ignoré(s), ${data.errors ?? 0} erreur(s).`;
          if (membersImportResult) { membersImportResult.textContent = msg; membersImportResult.classList.remove("error"); }
          membersImportFile.value = "";
          if (membersImportFilename) membersImportFilename.textContent = "";
          window.dispatchEvent(new Event("app-members-refresh"));
        } else {
          if (membersImportResult) { membersImportResult.textContent = data.error || "Erreur lors de l’import."; membersImportResult.classList.add("error"); }
        }
      } catch (e) {
        if (membersImportResult) { membersImportResult.textContent = "Erreur réseau."; membersImportResult.classList.add("error"); }
      }
      membersImportBtn.disabled = false;
    });
  }

  if (transactionsExportBtn) {
    transactionsExportBtn.addEventListener("click", async () => {
      const params = new URLSearchParams();
      if (transactionsDaysEl?.value) params.set("days", transactionsDaysEl.value);
      if (transactionsTypeEl?.value) params.set("type", transactionsTypeEl.value);
      const res = await api(`/dashboard/transactions/export?${params}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `transactions-${slug}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  const overviewCopyLinkBtn = document.getElementById("app-overview-copy-link");
  if (overviewCopyLinkBtn) {
    overviewCopyLinkBtn.addEventListener("click", () => {
      if (!shareLinkEl) return;
      shareLinkEl.select();
      navigator.clipboard.writeText(shareLinkEl.value).then(() => {
        overviewCopyLinkBtn.textContent = "Lien copié !";
        setTimeout(() => { overviewCopyLinkBtn.textContent = "🔗 Copier le lien partage"; }, 2000);
      });
    });
  }

  const memberDetailModal = document.getElementById("app-member-detail-modal");
  const memberDetailBody = document.getElementById("app-member-detail-body");
  const memberDetailClose = memberDetailModal?.querySelector(".app-modal-close");
  const memberDetailBackdrop = memberDetailModal?.querySelector(".app-modal-backdrop");
  function openMemberDetail(member) {
    if (!memberDetailModal || !memberDetailBody) return;
    memberDetailBody.innerHTML = "<p>Chargement…</p>";
    memberDetailModal.classList.remove("hidden");
    api(`/dashboard/transactions?memberId=${encodeURIComponent(member.id)}&limit=20`)
      .then((r) => (r.ok ? r.json() : { transactions: [] }))
      .then((data) => {
        const txList = (data.transactions || []).map((t) => `<li>${t.type === "points_add" ? "Points" : "Opération"} +${t.points} — ${formatDate(t.created_at)}</li>`).join("") || "<li>Aucune opération</li>";
        memberDetailBody.innerHTML = `
          <p><strong>${escapeHtml(member.name)}</strong></p>
          <p>${escapeHtml(member.email)}</p>
          <p>${member.points} point(s)</p>
          <p>Dernière visite : ${member.last_visit_at ? formatDate(member.last_visit_at) : "—"}</p>
          <h3 style="font-size:1rem;margin:0.75rem 0 0.25rem">Historique</h3>
          <ul class="app-scanner-history-list">${txList}</ul>
        `;
      })
      .catch(() => { memberDetailBody.innerHTML = "<p>Erreur chargement.</p>"; });
  }
  function closeMemberDetail() {
    memberDetailModal?.classList.add("hidden");
  }
  memberDetailClose?.addEventListener("click", closeMemberDetail);
  memberDetailBackdrop?.addEventListener("click", closeMemberDetail);
  membersTbody?.addEventListener("click", (e) => {
    const row = e.target.closest("tr[data-member-id]");
    if (!row) return;
    const id = row.getAttribute("data-member-id");
    const member = allMembers.find((m) => m.id === id);
    if (member) openMemberDetail(member);
  });

  window.addEventListener("app-members-refresh", () => refresh());

  async function loadAppNotificationStats() {
    try {
      const res = await api("/notifications/stats");
      if (!res.ok) return;
      const data = await res.json();
      const el = document.getElementById("app-notifications-stats");
      const diagEl = document.getElementById("app-notifications-diagnostic");
      if (el) {
        const total = data.subscriptionsCount != null ? data.subscriptionsCount : 0;
        const membersCount = data.membersCount != null ? data.membersCount : 0;
        const web = data.webPushCount != null ? data.webPushCount : 0;
        const wallet = data.passKitCount != null ? data.passKitCount : 0;
        if (membersCount > 0 && total === 0) {
          el.textContent = `Tu as ${membersCount} membre(s). La carte peut être dans le Wallet ; aucun appareil ne nous a encore envoyé son enregistrement, donc on ne peut pas envoyer de notifications push.`;
        } else if (total === 0) {
          el.textContent = "Aucun appareil enregistré pour l'instant.";
        } else if (membersCount > 0) {
          el.textContent = `Tu as ${membersCount} membre(s). ${total} appareil(s) peuvent recevoir les notifications.`;
        } else if (wallet > 0 && web > 0) {
          el.textContent = `${total} appareil(s) peuvent recevoir les notifications (dont ${wallet} Apple Wallet, ${web} navigateur).`;
        } else if (wallet > 0) {
          el.textContent = `${total} appareil(s) peuvent recevoir les notifications (Apple Wallet).`;
        } else {
          el.textContent = `${total} appareil(s) peuvent recevoir les notifications.`;
        }
        const hintEl = document.getElementById("app-notifications-members-vs-devices-hint");
        if (hintEl) {
          if (membersCount > total && total > 0) {
            hintEl.textContent = "« Envoyer » envoie à tous les appareils enregistrés (" + total + "), pas à tous les " + membersCount + " membres. Seuls les clients qui ont ajouté la carte au Portefeuille reçoivent la notif. Si tu ne reçois pas : Portefeuille → ta carte → ⋯ → Détails du pass → « Autoriser les notifications » ; puis Réglages → Notifications → Portefeuille.";
            hintEl.classList.remove("hidden");
          } else if (total > 0) {
            hintEl.textContent = "Si tu ne reçois pas sur ton iPhone : Portefeuille → ta carte → ⋯ → Détails du pass → « Autoriser les notifications » ; puis Réglages → Notifications → Portefeuille.";
            hintEl.classList.remove("hidden");
          } else {
            hintEl.classList.add("hidden");
            hintEl.textContent = "";
          }
        }
      }
      const membersSummaryEl = document.getElementById("app-members-notifications-summary");
      if (membersSummaryEl) {
        const total = data.subscriptionsCount != null ? data.subscriptionsCount : 0;
        const membersCount = data.membersCount != null ? data.membersCount : 0;
        if (membersCount > 0 || total > 0) {
          membersSummaryEl.innerHTML = total > 0
            ? `<strong>Notifications :</strong> ${total} appareil(s) peuvent recevoir les push. <a href="#notifications" class="app-link-inline">Envoyer une notification →</a>`
            : `<strong>Notifications :</strong> tu as ${membersCount} membre(s). La carte peut être bien dans le Wallet, mais <strong>aucun iPhone ne nous a encore envoyé son enregistrement</strong> — donc on ne peut pas envoyer de notifications push. Ce n’est pas que tu n’as pas la carte ; c’est que notre serveur n’a reçu le signal d’aucun appareil. <a href="#notifications" class="app-link-inline">Voir le diagnostic →</a>`;
          membersSummaryEl.classList.remove("hidden");
        } else {
          membersSummaryEl.classList.add("hidden");
          membersSummaryEl.innerHTML = "";
        }
      }
      if (diagEl) {
        const total = data.subscriptionsCount != null ? data.subscriptionsCount : 0;
        const passKitOk = data.passKitUrlConfigured === true;
        if (total === 0 && data.helpWhenNoDevice) {
          let html = "";
          if (data.paradoxExplanation) {
            html += `<p class="app-notifications-diagnostic-title">J'ai scanné la carte du client mais « 0 appareil » — pourquoi ?</p><p class="app-notifications-diagnostic-text">${data.paradoxExplanation}</p>`;
          } else if (data.membersVsDevicesExplanation) {
            html += `<p class="app-notifications-diagnostic-title">Pourquoi des membres mais « 0 appareil » ?</p><p class="app-notifications-diagnostic-text">${data.membersVsDevicesExplanation}</p>`;
          }
          if (data.dataDirHint) {
            html += `<p class="app-notifications-diagnostic-title">Les logs montrent des POST mais 0 ici ?</p><p class="app-notifications-diagnostic-text">${data.dataDirHint}</p>`;
          }
          html += `<p class="app-notifications-diagnostic-title">Pour enregistrer ton iPhone</p><p class="app-notifications-diagnostic-text">${data.helpWhenNoDevice}</p>`;
          if (data.testPasskitCurl) {
            const curlEscaped = data.testPasskitCurl.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            html += `<p class="app-notifications-diagnostic-text" style="margin-top: 0.75rem;"><strong>Test diagnostic :</strong> exécute cette commande dans un terminal (sur ton ordi). Si tu obtiens <code>HTTP 201</code>, l'API fonctionne et le blocage vient de l'iPhone ou du réseau.</p><pre class="app-notifications-curl">${curlEscaped}</pre>`;
          }
          diagEl.innerHTML = html;
          diagEl.classList.remove("hidden");
        } else if (total === 0 && !passKitOk && data.diagnostic) {
          diagEl.innerHTML = `<p class="app-notifications-diagnostic-title">Pourquoi aucun appareil ?</p><p class="app-notifications-diagnostic-text">${data.diagnostic}</p>`;
          diagEl.classList.remove("hidden");
        } else if (total === 0 && (data.paradoxExplanation || data.membersVsDevicesExplanation || data.dataDirHint)) {
          let html = "";
          if (data.paradoxExplanation || data.membersVsDevicesExplanation) {
            const text = data.paradoxExplanation || data.membersVsDevicesExplanation;
            const title = data.paradoxExplanation ? "J'ai scanné la carte du client mais « 0 appareil » — pourquoi ?" : "Pourquoi des membres mais « 0 appareil » ?";
            html += `<p class="app-notifications-diagnostic-title">${title}</p><p class="app-notifications-diagnostic-text">${text}</p>`;
          }
          if (data.dataDirHint) {
            html += `<p class="app-notifications-diagnostic-title">Les logs montrent des POST mais 0 ici ?</p><p class="app-notifications-diagnostic-text">${data.dataDirHint}</p>`;
          }
          diagEl.innerHTML = html || `<p class="app-notifications-diagnostic-title">Les logs montrent des POST mais 0 ici ?</p><p class="app-notifications-diagnostic-text">${data.dataDirHint}</p>`;
          diagEl.classList.remove("hidden");
        } else {
          diagEl.classList.add("hidden");
          diagEl.innerHTML = "";
        }
      }
      const removeTestWrap = document.getElementById("app-notifications-remove-test-wrap");
      if (removeTestWrap) {
        const total = data.subscriptionsCount != null ? data.subscriptionsCount : 0;
        removeTestWrap.classList.toggle("hidden", total === 0);
      }
      await loadAppNotificationCategories();
    } catch (_) {}
  }

  async function loadAppNotificationCategories() {
    try {
      const res = await api("/dashboard/categories");
      if (!res.ok) return;
      const data = await res.json();
      const categories = data.categories || [];
      const wrap = document.getElementById("app-notif-categories-wrap");
      const listEl = document.getElementById("app-notif-categories-list");
      const targetAll = document.getElementById("app-notif-target-all");
      if (!wrap || !listEl) return;
      if (categories.length === 0) {
        wrap.classList.add("hidden");
        return;
      }
      wrap.classList.remove("hidden");
      listEl.innerHTML = categories
        .map((c) => `<label class="app-checkbox-label"><input type="checkbox" class="app-notif-category-cb" data-id="${escapeHtml(c.id)}" /> ${escapeHtml(c.name)}</label>`)
        .join("");
      listEl.querySelectorAll(".app-notif-category-cb").forEach((cb) => {
        cb.addEventListener("change", () => {
          if (cb.checked && targetAll) targetAll.checked = false;
        });
      });
      if (targetAll && !targetAll.dataset.notifCatListen) {
        targetAll.dataset.notifCatListen = "1";
        targetAll.addEventListener("change", () => {
          if (targetAll.checked) listEl.querySelectorAll(".app-notif-category-cb").forEach((c) => { c.checked = false; });
        });
      }
    } catch (_) {}
  }

  document.getElementById("app-notifications-remove-test-btn")?.addEventListener("click", async () => {
    const btn = document.getElementById("app-notifications-remove-test-btn");
    const wrap = document.getElementById("app-notifications-remove-test-wrap");
    if (btn) btn.disabled = true;
    try {
      const res = await api("/notifications/remove-test-device", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await loadAppNotificationStats();
        if (wrap) { wrap.textContent = data.message || "Appareil de test supprimé."; wrap.classList.remove("hidden"); }
      } else {
        if (wrap) { wrap.textContent = data.error || "Erreur"; wrap.classList.remove("hidden"); }
      }
    } catch (_) {
      if (wrap) { wrap.textContent = "Erreur réseau."; wrap.classList.remove("hidden"); }
    }
    if (btn) btn.disabled = false;
  });

  document.getElementById("app-notif-send")?.addEventListener("click", async () => {
    const titleEl = document.getElementById("app-notif-title");
    const messageEl = document.getElementById("app-notif-message");
    const feedbackEl = document.getElementById("app-notif-feedback");
    const btn = document.getElementById("app-notif-send");
    const targetAll = document.getElementById("app-notif-target-all");
    const message = messageEl?.value?.trim();
    if (!message) {
      if (feedbackEl) { feedbackEl.textContent = "Saisissez un message."; feedbackEl.classList.remove("hidden", "success"); feedbackEl.classList.add("error"); }
      return;
    }
    let categoryIds = undefined;
    if (!targetAll?.checked) {
      const checked = document.querySelectorAll(".app-notif-category-cb:checked");
      if (checked.length > 0) categoryIds = Array.from(checked).map((c) => c.dataset.id).filter(Boolean);
    }
    if (btn) btn.disabled = true;
    if (feedbackEl) feedbackEl.classList.add("hidden");
    try {
      const res = await fetch(`${API_BASE}/api/businesses/${encodeURIComponent(slug)}/notifications/send${dashboardToken ? `?token=${encodeURIComponent(dashboardToken)}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders(), ...(dashboardToken ? { "X-Dashboard-Token": dashboardToken } : {}) },
        body: JSON.stringify({ title: titleEl?.value?.trim() || undefined, message, ...(categoryIds && categoryIds.length > 0 ? { category_ids: categoryIds } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (feedbackEl) {
        feedbackEl.classList.remove("hidden");
        if (res.ok) {
          const sent = data.sent != null ? data.sent : 0;
          const wp = data.sentWebPush != null ? data.sentWebPush : 0;
          const pk = data.sentPassKit != null ? data.sentPassKit : 0;
          if (sent === 0) feedbackEl.textContent = data.message || "Aucun appareil n'a reçu la notification.";
          else {
            let msg = pk > 0 && wp > 0 ? `Notification envoyée à ${sent} appareil(s) (dont ${pk} Apple Wallet, ${wp} navigateur).` : pk > 0 ? `Notification envoyée à ${sent} appareil(s) (Apple Wallet).` : `Notification envoyée à ${sent} appareil(s).`;
            if (data.failed > 0 && data.errors?.length) msg += ` ${data.failed} échec(s).`;
            feedbackEl.textContent = msg;
            const prevTip = feedbackEl.nextElementSibling?.classList?.contains("app-notif-feedback-tip") ? feedbackEl.nextElementSibling : null;
            if (prevTip) prevTip.remove();
            if (pk > 0) {
              const tip = document.createElement("p");
              tip.className = "app-notif-feedback-tip";
              tip.textContent = "Si tu ne reçois pas sur ton iPhone : Portefeuille → ta carte → ⋯ → Autoriser les notifications ; Réglages → Notifications → Portefeuille.";
              feedbackEl.after(tip);
            }
          }
          feedbackEl.classList.remove("error"); feedbackEl.classList.add("success");
        } else {
          feedbackEl.textContent = data.error || "Erreur";
          feedbackEl.classList.add("error");
        }
      }
      if (res.ok) loadAppNotificationStats();
    } catch (e) {
      if (feedbackEl) { feedbackEl.textContent = "Erreur réseau."; feedbackEl.classList.remove("hidden", "success"); feedbackEl.classList.add("error"); }
    }
    if (btn) btn.disabled = false;
  });

  window.addEventListener("app-section-change", (e) => {
    if (e.detail?.sectionId === "notifications") loadAppNotificationStats();
  }, { once: false });

  refresh();
  loadAppNotificationStats();
}

/** Modèles de carte par secteur (Points + Tampons) + styles libres. */
const CARD_TEMPLATES = [
  { id: "fastfood-points", name: "Points (Fast food)", format: "points", design: "fastfood", bg: "#8B2942", fg: "#ffffff", label: "#ffd54f" },
  { id: "fastfood-tampons", name: "Tampons (Fast food)", format: "tampons", design: "fastfood", bg: "#8B2942", fg: "#ffffff", label: "#ffd54f" },
  { id: "beauty-points", name: "Points (Beauté)", format: "points", design: "beauty", bg: "#b76e79", fg: "#ffffff", label: "#fce4ec" },
  { id: "beauty-tampons", name: "Tampons (Beauté)", format: "tampons", design: "beauty", bg: "#b76e79", fg: "#ffffff", label: "#fce4ec" },
  { id: "coiffure-points", name: "Points (Coiffure)", format: "points", design: "coiffure", bg: "#2563eb", fg: "#ffffff", label: "#bfdbfe" },
  { id: "coiffure-tampons", name: "Tampons (Coiffure)", format: "tampons", design: "coiffure", bg: "#2563eb", fg: "#ffffff", label: "#bfdbfe" },
  { id: "boulangerie-points", name: "Points (Boulangerie)", format: "points", design: "boulangerie", bg: "#b8860b", fg: "#ffffff", label: "#fff8e1" },
  { id: "boulangerie-tampons", name: "Tampons (Boulangerie)", format: "tampons", design: "boulangerie", bg: "#b8860b", fg: "#ffffff", label: "#fff8e1" },
  { id: "boucherie-points", name: "Points (Boucherie)", format: "points", design: "boucherie", bg: "#6d2c3e", fg: "#ffffff", label: "#ffcdd2" },
  { id: "boucherie-tampons", name: "Tampons (Boucherie)", format: "tampons", design: "boucherie", bg: "#6d2c3e", fg: "#ffffff", label: "#ffcdd2" },
  { id: "cafe-points", name: "Points (Café)", format: "points", design: "cafe", bg: "#5d4e37", fg: "#ffffff", label: "#d7ccc8" },
  { id: "cafe-tampons", name: "Tampons (Café)", format: "tampons", design: "cafe", bg: "#5d4e37", fg: "#ffffff", label: "#d7ccc8" },
  { id: "classic", name: "Classique", format: "points", bg: "#0a7c42", fg: "#ffffff", label: "#e8f5e9" },
  { id: "bold", name: "Moderne", format: "points", bg: "#2563eb", fg: "#ffffff", label: "#bfdbfe" },
  { id: "elegant", name: "Élégant", format: "points", bg: "#8b7355", fg: "#ffffff", label: "#f5f0e6" },
];

const BUILDER_DRAFT_KEY = "fidpass_builder_draft_v2";

function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 50) || "ma-carte";
}

const BUILD_CATEGORY_LABELS = {
  fastfood: "Fast food",
  cafe: "Café",
  boulangerie: "Boulangerie",
  boucherie: "Boucherie",
  coiffure: "Coiffure",
  beauty: "Beauté",
  classic: "Autre",
};

function templateIdToCategoryFormat(templateId) {
  if (!templateId) return { category: "fastfood", format: "tampons" };
  if (["classic", "bold", "elegant"].includes(templateId)) return { category: "classic", format: "points" };
  const match = templateId.match(/^(.+)-(points|tampons)$/);
  if (match) return { category: match[1], format: match[2] };
  return { category: "fastfood", format: "tampons" };
}

function getTemplateIdFromCategoryFormat(category, format) {
  if (category === "classic") return "classic";
  return `${category}-${format}`;
}

function initBuilderPage() {

  const btnSubmit = document.getElementById("builder-submit");
  const cartBadge = document.getElementById("builder-header-cart-badge");
  if (cartBadge) cartBadge.textContent = "1";

  const state = { selectedTemplateId: "fastfood-tampons", organizationName: "", logoDataUrl: "", brandColors: null };
  const headerSteps = document.querySelectorAll(".builder-header-step");

  setBuilderHeaderStep(2);

  const urlParams = new URLSearchParams(window.location.search);
  const etablissementFromUrl = urlParams.get("etablissement");

  headerSteps.forEach((btn) => {
    btn.addEventListener("click", () => {
      const n = parseInt(btn.getAttribute("data-step"), 10);
      if (n === 1) {
        history.pushState({}, "", "/");
        initRouting();
      } else if (n === 3) {
        history.pushState({}, "", "/checkout");
        initRouting();
      }
    });
  });

  function loadDraft() {
    try {
      const raw = localStorage.getItem(BUILDER_DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.selectedTemplateId && CARD_TEMPLATES.some((t) => t.id === d.selectedTemplateId)) state.selectedTemplateId = d.selectedTemplateId;
        if (typeof d.organizationName === "string") state.organizationName = d.organizationName.trim();
        if (typeof d.logoDataUrl === "string" && d.logoDataUrl.startsWith("data:image/")) state.logoDataUrl = d.logoDataUrl;
        if (d.brandColors && typeof d.brandColors.header === "string" && d.brandColors.body && d.brandColors.label) state.brandColors = d.brandColors;
      }
    } catch (_) {}
  }

  function saveDraft(extra = {}) {
    try {
      let existing = {};
      const raw = localStorage.getItem(BUILDER_DRAFT_KEY);
      if (raw) try { existing = JSON.parse(raw); } catch (_) {}
      const payload = {
        selectedTemplateId: state.selectedTemplateId,
        organizationName: state.organizationName || ""
      };
      if (extra.logoDataUrl != null) payload.logoDataUrl = extra.logoDataUrl;
      else if (existing.logoDataUrl) payload.logoDataUrl = existing.logoDataUrl;
      if (extra.placeId != null) payload.placeId = extra.placeId;
      else if (existing.placeId) payload.placeId = existing.placeId;
      if (extra.brandColors != null) payload.brandColors = extra.brandColors;
      else if (existing.brandColors) payload.brandColors = existing.brandColors;
      localStorage.setItem(BUILDER_DRAFT_KEY, JSON.stringify(payload));
    } catch (_) {}
  }

  function updateBuilderPreviewOrgName(name) {
    const display = name && name.trim() ? name.trim() : "Votre commerce";
    document.querySelectorAll("#builder-wallet-slider .builder-wallet-card-header span").forEach((el) => { el.textContent = display; });
  }

  function ensureBuilderCardLogoWraps() {
    const headers = document.querySelectorAll("#builder-wallet-slider .builder-wallet-card-header");
    headers.forEach((header) => {
      if (header.querySelector(".builder-wallet-card-logo-wrap")) return;
      const wrap = document.createElement("div");
      wrap.className = "builder-wallet-card-logo-wrap";
      wrap.setAttribute("aria-hidden", "true");
      const img = document.createElement("img");
      img.className = "builder-wallet-card-logo";
      img.alt = "";
      wrap.appendChild(img);
      header.insertBefore(wrap, header.firstChild);
    });
  }

  function updateBuilderPreviewLogo(dataUrl) {
    ensureBuilderCardLogoWraps();
    const wraps = document.querySelectorAll("#builder-wallet-slider .builder-wallet-card-logo-wrap");
    const hasLogo = typeof dataUrl === "string" && dataUrl.startsWith("data:image/");
    wraps.forEach((wrap) => {
      const img = wrap.querySelector(".builder-wallet-card-logo");
      if (!img) return;
      if (hasLogo) {
        img.src = dataUrl;
        img.classList.remove("hidden");
        wrap.classList.remove("hidden");
      } else {
        img.removeAttribute("src");
        img.classList.add("hidden");
        wrap.classList.add("hidden");
      }
    });
    if (hasLogo) applyBrandColorsFromLogo(dataUrl);
    else clearBuilderBrandColors();
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        default: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return [h * 360, s, l];
  }
  function hslToRgb(h, s, l) {
    h /= 360;
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  /** Rend une couleur fade/gris en couleur vive (même teinte). */
  function vividifyHex(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return hex;
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    const [h, s, l] = rgbToHsl(r, g, b);
    let newS = s, newL = l;
    if (s < 0.35) newS = Math.max(0.45, s * 1.8);
    if (l > 0.78) newL = 0.42;
    else if (l > 0.65) newL = 0.5;
    else if (l < 0.15) newL = 0.28;
    const [rr, gg, bb] = hslToRgb(h, Math.min(1, newS), newL);
    return "#" + [rr, gg, bb].map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("");
  }

  /** Extrait une couleur principale du logo (couleur la plus présente), pas un mélange. Évite gris et fades. */
  function extractDominantColors(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const size = 64;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          if (!ctx) { resolve(null); return; }
          ctx.drawImage(img, 0, 0, size, size);
          const data = ctx.getImageData(0, 0, size, size).data;
          const shift = 4;
          const bins = 1 << shift;
          const hist = {};
          for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3];
            if (a < 140) continue;
            const r = data[i] >> shift;
            const g = data[i + 1] >> shift;
            const b = data[i + 2] >> shift;
            const key = `${r},${g},${b}`;
            hist[key] = (hist[key] || 0) + 1;
          }
          const toHex = (rr, gg, bb) => "#" + [rr, gg, bb].map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("");
          const lum = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          const sat = (r, g, b) => {
            const R = r / 255, G = g / 255, B = b / 255;
            const max = Math.max(R, G, B), min = Math.min(R, G, B);
            return max === 0 ? 0 : (max - min) / max;
          };
          const entries = Object.entries(hist)
            .map(([key, count]) => {
              const [rq, gq, bq] = key.split(",").map(Number);
              const r = (rq + 0.5) * (256 / bins);
              const g = (gq + 0.5) * (256 / bins);
              const b = (bq + 0.5) * (256 / bins);
              return { key, count, r, g, b, L: lum(r, g, b), S: sat(r, g, b) };
            })
            .filter((e) => e.L <= 0.92 && e.L >= 0.06);
          entries.sort((a, b) => {
            const wantA = a.S >= 0.14 ? 1 : 0;
            const wantB = b.S >= 0.14 ? 1 : 0;
            if (wantB !== wantA) return wantB - wantA;
            if (a.S >= 0.14 && b.S >= 0.14) return b.count - a.count;
            return b.S - a.S || b.count - a.count;
          });
          const best = entries[0];
          if (!best) { resolve(null); return; }
          let header = toHex(Math.round(best.r), Math.round(best.g), Math.round(best.b));
          header = vividifyHex(header);
          const darken = (v, f) => Math.round(v * (1 - f));
          const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(header);
          const r = m ? parseInt(m[1], 16) : 0;
          const g = m ? parseInt(m[2], 16) : 0;
          const b = m ? parseInt(m[3], 16) : 0;
          const body = toHex(darken(r, 0.12), darken(g, 0.12), darken(b, 0.12));
          resolve({ header, body, label: header });
        } catch (_) {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  function luminanceFromHex(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return 0.5;
    const r = parseInt(m[1], 16) / 255;
    const g = parseInt(m[2], 16) / 255;
    const b = parseInt(m[3], 16) / 255;
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  function applyBuilderBrandColors(colors) {
    const el = document.getElementById("builder-wallet-slider");
    if (!colors || !el) return;
    el.classList.add("builder-wallet-slider-branded");
    const primary = colors.header;
    const cardBg = colors.body || primary;
    el.style.setProperty("--brand-header", cardBg);
    el.style.setProperty("--brand-body", cardBg);
    const isLight = luminanceFromHex(cardBg) > 0.5;
    el.style.setProperty("--brand-fg", isLight ? "#1a1a1a" : "#fff");
    el.style.setProperty("--brand-label", isLight ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.95)");
  }

  function clearBuilderBrandColors() {
    const el = document.getElementById("builder-wallet-slider");
    if (el) {
      el.classList.remove("builder-wallet-slider-branded");
      el.style.removeProperty("--brand-header");
      el.style.removeProperty("--brand-body");
      el.style.removeProperty("--brand-label");
      el.style.removeProperty("--brand-fg");
    }
  }

  function applyBrandColorsFromLogo(dataUrl) {
    extractDominantColors(dataUrl).then((colors) => {
      if (colors) {
        state.brandColors = colors;
        applyBuilderBrandColors(colors);
        saveDraft({ brandColors: colors });
      }
    });
  }

  const sliderEl = document.getElementById("builder-wallet-slider");
  const dotsContainer = document.getElementById("builder-phone-dots");
  const templateIds = CARD_TEMPLATES.map((t) => t.id);
  const categorySelect = document.getElementById("builder-category-select");
  const categoryDisplay = document.getElementById("builder-category-display");
  const formatPoints = document.getElementById("builder-format-points");
  const formatTampons = document.getElementById("builder-format-tampons");
  const formatHint = document.getElementById("builder-format-hint");

  function getTemplateIndex(templateId) {
    const i = templateIds.indexOf(templateId);
    return i >= 0 ? i : 0;
  }

  function setSliderPosition(index) {
    const idx = Math.max(0, Math.min(index, templateIds.length - 1));
    if (sliderEl) sliderEl.style.transform = `translateX(-${idx * 100}%)`;
    if (dotsContainer) {
      dotsContainer.querySelectorAll(".builder-phone-dot").forEach((dot, i) => {
        dot.classList.toggle("active", i === idx);
        dot.setAttribute("aria-current", i === idx ? "true" : null);
      });
    }
  }

  function applySelection() {
    const { category, format } = templateIdToCategoryFormat(state.selectedTemplateId);
    if (categorySelect) {
      categorySelect.value = category;
    }
    if (categoryDisplay) {
      categoryDisplay.textContent = BUILD_CATEGORY_LABELS[category] || category;
    }
    if (formatPoints) {
      formatPoints.setAttribute("aria-pressed", format === "points" ? "true" : "false");
      formatPoints.classList.toggle("builder-format-btn-active", format === "points");
    }
    if (formatTampons) {
      formatTampons.setAttribute("aria-pressed", format === "tampons" ? "true" : "false");
      formatTampons.classList.toggle("builder-format-btn-active", format === "tampons");
      formatTampons.disabled = category === "classic";
    }
    if (formatHint) {
      formatHint.classList.toggle("hidden", category !== "classic");
    }
    setSliderPosition(getTemplateIndex(state.selectedTemplateId));
    updateDemoQR(state.selectedTemplateId);
    saveDraft();
  }

  function setTemplateSelection(templateId) {
    state.selectedTemplateId = templateId;
    applySelection();
  }

  function initWalletCardQRCodes() {
    const base = API_BASE.replace(/\/$/, "");
    document.querySelectorAll("#builder-wallet-slider .builder-wallet-card").forEach((card) => {
      const templateId = card.getAttribute("data-template");
      const img = card.querySelector(".builder-wallet-card-qr-img");
      if (templateId && img) {
        const url = `${base}/api/passes/demo?template=${encodeURIComponent(templateId)}`;
        img.src = `https://api.qrserver.com/v1/create-qr-code/?size=128&data=${encodeURIComponent(url)}`;
      }
    });
  }
  initWalletCardQRCodes();

  function updateDemoQR(templateId) {
    const qrEl = document.getElementById("builder-demo-qr");
    const nameEl = document.getElementById("builder-demo-template-name");
    const tpl = CARD_TEMPLATES.find((t) => t.id === templateId);

    if (tpl && nameEl) nameEl.textContent = tpl.name;

    const base = API_BASE.replace(/\/$/, "");
    const url = `${base}/api/passes/demo?template=${encodeURIComponent(templateId)}`;
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`;
    if (qrEl) {
      qrEl.src = qrSrc;
      qrEl.alt = `QR code pour ajouter la carte ${tpl?.name ?? templateId} à Apple Wallet`;
    }
  }

  document.querySelector(".builder-back")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (typeof showLandingMainInPlace === "function") showLandingMainInPlace();
    else window.location.href = "/";
  });

  loadDraft();
  const placeIdFromUrl = urlParams.get("place_id")?.trim();
  const hasLandingParams = (etablissementFromUrl && typeof etablissementFromUrl === "string") || placeIdFromUrl;

  function applyInitialState() {
    if (etablissementFromUrl && typeof etablissementFromUrl === "string") {
      state.organizationName = etablissementFromUrl.trim();
    }
    saveDraft();
    updateBuilderPreviewOrgName(state.organizationName || "Votre commerce");
  setTemplateSelection(state.selectedTemplateId);
    if (hasLandingParams) {
      updateBuilderPreviewLogo("");
      clearBuilderBrandColors();
    } else {
      updateBuilderPreviewLogo(state.logoDataUrl);
      if (state.brandColors) applyBuilderBrandColors(state.brandColors);
      else if (!state.logoDataUrl) clearBuilderBrandColors();
    }
  }

  applyInitialState();
  if (hasLandingParams) {
    (async () => {
      let placeId = placeIdFromUrl;
      const name = (state.organizationName || etablissementFromUrl || "").trim();

      if (!placeId && name) {
        try {
          const findRes = await fetch(`${API_BASE.replace(/\/$/, "")}/api/find-place?name=${encodeURIComponent(name)}`, { cache: "no-store" });
          if (findRes.ok) {
            const findData = await findRes.json().catch(() => ({}));
            if (findData.place_id) {
              placeId = findData.place_id;
              if (findData.name) state.organizationName = findData.name;
              const newUrl = new URL(window.location.href);
              newUrl.searchParams.set("place_id", placeId);
              if (!newUrl.searchParams.has("etablissement") && name) newUrl.searchParams.set("etablissement", name);
              history.replaceState(null, "", newUrl.pathname + newUrl.search);
              saveDraft({ placeId });
              updateBuilderPreviewOrgName(state.organizationName || name);
            }
          }
        } catch (_) {}
      }

      try {
        const qs = new URLSearchParams();
        if (placeId) qs.set("place_id", placeId);
        qs.set("name", name);
        const res = await fetch(`${API_BASE.replace(/\/$/, "")}/api/place-category?${qs}`);
        const data = await res.json().catch(() => ({}));
        if (data.suggestedTemplateId && CARD_TEMPLATES.some((t) => t.id === data.suggestedTemplateId)) {
          state.selectedTemplateId = data.suggestedTemplateId;
          applyInitialState();
        }
      } catch (_) {}

      if (placeId) {
        try {
          const photoRes = await fetch(`${API_BASE.replace(/\/$/, "")}/api/place-photo?place_id=${encodeURIComponent(placeId)}`, { cache: "no-store" });
          if (photoRes.ok && photoRes.headers.get("content-type")?.startsWith("image/")) {
            const blob = await photoRes.blob();
            const dataUrl = await blobToResizedLogoDataUrl(blob, 512);
            if (dataUrl) {
              state.logoDataUrl = dataUrl;
              saveDraft({ logoDataUrl: dataUrl, placeId });
              updateBuilderPreviewLogo(dataUrl);
            }
          }
        } catch (_) {}
      }
    })();
  }

  function blobToResizedLogoDataUrl(blob, maxWidth) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) { resolve(null); return; }
        const scale = maxWidth && w > maxWidth ? maxWidth / w : 1;
        const cw = Math.round(w * scale);
        const ch = Math.round(h * scale);
        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, cw, ch);
        try {
          resolve(canvas.toDataURL("image/jpeg", 0.88));
        } catch (_) {
          resolve(null);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  if (categorySelect) {
    categorySelect.addEventListener("change", () => {
      const category = categorySelect.value;
      const format = category === "classic" ? "points" : templateIdToCategoryFormat(state.selectedTemplateId).format;
      state.selectedTemplateId = getTemplateIdFromCategoryFormat(category, format);
      setTemplateSelection(state.selectedTemplateId);
    });
  }

  [formatPoints, formatTampons].filter(Boolean).forEach((btn) => {
    btn.addEventListener("click", () => {
      const format = btn.dataset.format;
      const category = categorySelect?.value || templateIdToCategoryFormat(state.selectedTemplateId).category;
      if (category === "classic") return;
      state.selectedTemplateId = getTemplateIdFromCategoryFormat(category, format);
      setTemplateSelection(state.selectedTemplateId);
    });
  });

  /* Swipe / glissement sur le mockup iPhone (touch + souris) */
  const phoneMockup = document.getElementById("builder-phone-mockup");
  if (phoneMockup && sliderEl) {
    let startX = 0;
    let dragStarted = false;
    function handleStart(clientX) {
      startX = clientX;
      dragStarted = true;
    }
    function handleEnd(clientX) {
      if (!dragStarted) return;
      const diff = startX - clientX;
      const threshold = 40;
      const idx = getTemplateIndex(state.selectedTemplateId);
      if (diff > threshold && idx < CARD_TEMPLATES.length - 1) setTemplateSelection(CARD_TEMPLATES[idx + 1].id);
      else if (diff < -threshold && idx > 0) setTemplateSelection(CARD_TEMPLATES[idx - 1].id);
      dragStarted = false;
      startX = 0;
    }
    phoneMockup.addEventListener("touchstart", (e) => { handleStart(e.changedTouches?.[0]?.clientX ?? 0); }, { passive: true });
    phoneMockup.addEventListener("touchend", (e) => { handleEnd(e.changedTouches?.[0]?.clientX ?? 0); }, { passive: true });
    phoneMockup.addEventListener("mousedown", (e) => { handleStart(e.clientX); });
    window.addEventListener("mouseup", (e) => { handleEnd(e.clientX); });
  }

  const cartOverlay = document.getElementById("cart-overlay");
  const cartClose = document.getElementById("cart-close");
  const cartBackdrop = document.getElementById("cart-backdrop");
  const cartEditOffer = document.getElementById("cart-edit-offer");
  const cartContinue = document.getElementById("cart-continue");

  function closeCart() {
    if (cartOverlay) {
      cartOverlay.classList.remove("is-open");
      cartOverlay.classList.add("hidden");
      document.body.style.overflow = "";
    }
  }

  function goToCheckout() {
    history.pushState({}, "", "/checkout");
    initRouting();
  }

  btnSubmit?.addEventListener("click", goToCheckout);

  const stickyCta = document.getElementById("builder-sticky-cta");
  const stickyChange = document.getElementById("builder-sticky-change");
  const optionsWrap = document.getElementById("builder-options-wrap");

  stickyCta?.addEventListener("click", goToCheckout);
  stickyChange?.addEventListener("click", () => {
    optionsWrap?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  cartClose?.addEventListener("click", closeCart);
  cartBackdrop?.addEventListener("click", closeCart);
  cartEditOffer?.addEventListener("click", (e) => {
    e.preventDefault();
    closeCart();
  });
  cartContinue?.addEventListener("click", () => {
    closeCart();
    window.location.replace("/checkout");
  });
}

const DESIGN_CATEGORY_LABELS = {
  fastfood: "Fast food",
  beauty: "Beauté",
  coiffure: "Coiffure",
  boulangerie: "Boulangerie",
  boucherie: "Boucherie",
  cafe: "Café"
};

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

function parseAppleHash() {
  const hash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const idToken = params.get("id_token");
  if (!idToken) return null;
  let user = null;
  try {
    const userStr = params.get("user");
    if (userStr) user = JSON.parse(decodeURIComponent(userStr));
  } catch (_) {}
  return { id_token: idToken, state: params.get("state"), user };
}

function initCheckoutPage() {
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
    if (oauthErrorEl) {
      oauthErrorEl.textContent = msg || "";
      oauthErrorEl.classList.toggle("hidden", !msg);
    }
    if (errorEl) {
      errorEl.textContent = msg || "";
      errorEl.classList.toggle("hidden", !msg);
    }
  }

  function setEmailValidationState() {
    const email = emailInput?.value?.trim() || "";
    const valid = isValidEmail(email);
    if (next1) next1.disabled = !valid;
    if (emailErrorEl) {
      if (valid || !email) {
        emailErrorEl.textContent = "";
        emailErrorEl.classList.add("hidden");
      } else {
        emailErrorEl.textContent = "Adresse e-mail invalide (ex. vous@exemple.fr)";
        emailErrorEl.classList.remove("hidden");
      }
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
    showStep(3);
    if (isMobile()) setMobileStep(3);
    step3?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (paymentBtn) paymentBtn.focus();
  }

  function handleOAuthError(msg) {
    showOAuthError(msg || "Connexion impossible. Réessayez.");
  }

  // Retour du flux Apple (form_post) : backend redirige avec ?apple_code=xxx
  const urlParams = new URLSearchParams(window.location.search);
  const appleCode = urlParams.get("apple_code");
  const appleError = urlParams.get("apple_error");
  if (appleError && appleClientId) {
    history.replaceState({}, "", window.location.pathname);
    const msg = appleError === "no_email" ? "Email non fourni par Apple. Réautorisez pour partager votre email." : "Connexion Apple impossible. Réessayez.";
    handleOAuthError(msg);
  } else if (appleCode && appleClientId) {
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
                .then((r) => {
                  return r.json().then((data) => ({ ok: r.ok, status: r.status, data }));
                })
                .then(({ ok, data }) => {
                  if (ok && data?.token) {
                    handleOAuthSuccess(data);
                  } else {
                    handleOAuthError(data?.error || "Erreur lors de la connexion Google. Réessayez.");
                  }
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
  if (appleClientId && appleBtn && !window.__fidpassAppleInited) {
    window.__fidpassAppleInited = true;
    const redirectUri = API_BASE + "/api/auth/apple-redirect";
    const buildAppleRedirectUrl = () => {
      const state = "checkout";
      const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
      return "https://appleid.apple.com/auth/authorize?" + new URLSearchParams({
        client_id: appleClientId,
        redirect_uri: redirectUri,
        response_type: "id_token code",
        scope: "name email",
        response_mode: "form_post",
        state,
        nonce,
      }).toString();
    };
    appleBtn.addEventListener("click", () => {
      showOAuthError("");
      // Sur mobile ou si le script Apple n’a pas chargé (bloqueur, etc.) : flux par redirection
      if (isAppleRedirectDevice() || typeof AppleID === "undefined" || !AppleID?.auth) {
        window.location.href = buildAppleRedirectUrl();
        return;
      }
      AppleID.auth.signIn()
        .then((res) => {
          const idToken = res?.authorization?.id_token;
          const user = res?.user;
          if (!idToken) {
            handleOAuthError("Token Apple manquant");
            return;
          }
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
          handleOAuthError("Le script Apple n’a pas pu se charger. Désactivez le bloqueur de publicités ou réessayez.");
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

  // Toujours afficher la section « Ou continuer avec » ; les boutons sont actifs seulement si les client IDs sont configurés (Vercel).
  const socialDivider = document.querySelector(".checkout-social-divider");
  const socialButtons = document.querySelector(".checkout-social-buttons");
  if (!googleClientId && appleBtn) {
    const wrap = document.getElementById("checkout-google-btn");
    if (wrap && !wrap.querySelector("iframe")) {
      wrap.innerHTML = "<span class=\"checkout-social-placeholder\">Google (configurez VITE_GOOGLE_CLIENT_ID)</span>";
      wrap.classList.add("checkout-social-placeholder-wrap");
    }
  }
  if (!appleClientId && appleBtn) {
    appleBtn.disabled = true;
    appleBtn.title = "Configurez VITE_APPLE_CLIENT_ID sur Vercel pour activer";
    appleBtn.classList.add("checkout-btn-social-disabled");
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
    // Toujours démarrer par le récap (écran 0) sur mobile, jamais directement sur formulaire ou paiement
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
    // Sur mobile : CONTINUER n’avance que depuis l’écran récap (0) vers la création de compte (1)
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
    if (errorEl) {
      errorEl.textContent = msg || "";
      errorEl.classList.toggle("hidden", !msg);
    }
  }

  next1?.addEventListener("click", () => {
    const email = emailInput?.value?.trim();
    if (!email) {
      emailInput?.focus();
      showError("Saisissez votre adresse e-mail.");
      return;
    }
    if (!isValidEmail(email)) {
      emailInput?.focus();
      showError("Adresse e-mail invalide. Utilisez une adresse valide (ex. vous@exemple.fr).");
      if (emailErrorEl) {
        emailErrorEl.textContent = "Adresse e-mail invalide (ex. vous@exemple.fr)";
        emailErrorEl.classList.remove("hidden");
      }
      return;
    }
    showError("");
    if (emailErrorEl) {
      emailErrorEl.textContent = "";
      emailErrorEl.classList.add("hidden");
    }
    showStep(2);
    if (isMobile()) setMobileStep(2);
    passwordInput?.focus();
  });

  next2?.addEventListener("click", async () => {
    const email = emailInput?.value?.trim();
    const password = passwordInput?.value;
    const name = nameInput?.value?.trim();
    if (!email) {
      showError("Saisissez votre adresse e-mail à l'étape 1.");
      return;
    }
    if (!password || String(password).length < 8) {
      passwordInput?.focus();
      showError("Le mot de passe doit faire au moins 8 caractères.");
      return;
    }
    showError("");
    if (next2) {
      next2.disabled = true;
      next2.textContent = "Création du compte…";
    }
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
      if (!res.ok) {
        showError(data.error || "Erreur lors de la création du compte.");
        return;
      }
      setAuthToken(data.token);
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
      if (next2) {
        next2.disabled = false;
        next2.textContent = "SUIVANT";
      }
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
    if (paymentBtn) {
      paymentBtn.disabled = true;
      paymentBtn.textContent = "Redirection…";
    }
    fetch(`${API_BASE}/api/payment/create-checkout-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ planId: "starter" }),
    })
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        if (data.url) {
          window.location.href = data.url;
          return;
        }
        showError(data.error || "Impossible de créer la session de paiement.");
        if (paymentBtn) {
          paymentBtn.disabled = false;
          paymentBtn.textContent = "PAYER — 49 €/mois (7 jours gratuits)";
        }
      })
      .catch(() => {
        showError("Erreur réseau. Réessayez.");
        if (paymentBtn) {
          paymentBtn.disabled = false;
          paymentBtn.textContent = "PAYER — 49 €/mois (7 jours gratuits)";
        }
      });
  }
}

function initOffersPage() {
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

function initDashboardPage() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("slug");
  const token = params.get("token");
  const errorEl = document.getElementById("dashboard-error");
  const contentEl = document.getElementById("dashboard-content");

  if (!slug || !token) {
    if (errorEl) errorEl.classList.remove("hidden");
    if (contentEl) contentEl.classList.add("hidden");
    return;
  }
  if (errorEl) errorEl.classList.add("hidden");
  if (contentEl) contentEl.classList.remove("hidden");

  const api = (path, opts = {}) => {
    const url = `${API_BASE}/api/businesses/${encodeURIComponent(slug)}${path}?token=${encodeURIComponent(token)}`;
    return fetch(url, { ...opts });
  };

  let allMembers = [];
  let selectedMemberId = null;
  let addPointsVisitOnly = false;

  const statMembers = document.getElementById("stat-members");
  const statPoints = document.getElementById("stat-points");
  const statTransactions = document.getElementById("stat-transactions");
  const businessNameEl = document.getElementById("dashboard-business-name");
  const memberSearchInput = document.getElementById("dashboard-member-search");
  const memberListEl = document.getElementById("dashboard-member-list");
  const amountInput = document.getElementById("dashboard-amount");
  const oneVisitBtn = document.getElementById("dashboard-one-visit");
  const addPointsBtn = document.getElementById("dashboard-add-points");
  const caisseMessage = document.getElementById("dashboard-caisse-message");
  const membersSearchInput = document.getElementById("dashboard-members-search");
  const membersTbody = document.getElementById("dashboard-members-tbody");
  const transactionsTbody = document.getElementById("dashboard-transactions-tbody");

  function showCaisseMessage(text, isError = false) {
    caisseMessage.textContent = text;
    caisseMessage.classList.remove("hidden", "success", "error");
    caisseMessage.classList.add(isError ? "error" : "success");
  }

  async function loadStats() {
    const res = await api("/dashboard/stats");
    if (res.status === 401) throw new Error("Unauthorized");
    if (!res.ok) return;
    const data = await res.json();
    if (statMembers) statMembers.textContent = data.membersCount ?? 0;
    if (statPoints) statPoints.textContent = data.pointsThisMonth ?? 0;
    if (statTransactions) statTransactions.textContent = data.transactionsThisMonth ?? 0;
    if (businessNameEl) businessNameEl.textContent = data.businessName || slug;
    const mobileStatMembers = document.getElementById("app-mobile-stat-members");
    const mobileStatScans = document.getElementById("app-mobile-stat-scans");
    if (mobileStatMembers) mobileStatMembers.textContent = data.membersCount ?? 0;
    if (mobileStatScans) mobileStatScans.textContent = data.transactionsThisMonth ?? 0;
  }

  async function loadMembers(search = "") {
    const q = search ? `&search=${encodeURIComponent(search)}` : "";
    const res = await api(`/dashboard/members?limit=100${q}`);
    if (!res.ok) return { members: [], total: 0 };
    return res.json();
  }

  async function loadTransactions() {
    const res = await api("/dashboard/transactions?limit=20");
    if (!res.ok) return { transactions: [], total: 0 };
    return res.json();
  }

  function renderMembers(members) {
    if (!membersTbody) return;
    membersTbody.innerHTML = members
      .map(
        (m) =>
          `<tr>
            <td>${escapeHtml(m.name)}</td>
            <td>${escapeHtml(m.email)}</td>
            <td>${m.points}</td>
            <td>${m.last_visit_at ? formatDate(m.last_visit_at) : "—"}</td>
          </tr>`
      )
      .join("") || "<tr><td colspan='4'>Aucun membre</td></tr>";
  }

  function renderTransactions(transactions) {
    if (!transactionsTbody) return;
    transactionsTbody.innerHTML = transactions
      .map(
        (t) =>
          `<tr>
            <td>${escapeHtml(t.member_name)}</td>
            <td>${t.type === "points_add" ? "Points ajoutés" : t.type}</td>
            <td>+${t.points}</td>
            <td>${formatDate(t.created_at)}</td>
          </tr>`
      )
      .join("") || "<tr><td colspan='4'>Aucune opération</td></tr>";
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  async function refresh() {
    try {
      await loadStats();
    } catch (e) {
      if (e.message === "Unauthorized") {
        if (errorEl) errorEl.classList.remove("hidden");
        if (contentEl) contentEl.classList.add("hidden");
      }
      return;
    }
    const membersData = await loadMembers(membersSearchInput?.value || "");
    allMembers = membersData.members || [];
    renderMembers(allMembers);
    const txData = await loadTransactions();
    renderTransactions(txData.transactions || []);
  }

  memberSearchInput?.addEventListener("input", async () => {
    const q = memberSearchInput.value.trim();
    if (q.length < 2) {
      memberListEl.classList.add("hidden");
      memberListEl.innerHTML = "";
      selectedMemberId = null;
      addPointsBtn.disabled = true;
      return;
    }
    const data = await loadMembers(q);
    const members = data.members || [];
    memberListEl.innerHTML = members
      .map(
        (m) =>
          `<div class="dashboard-member-item" data-id="${m.id}">${escapeHtml(m.name)} — ${escapeHtml(m.email)} (${m.points} pts)</div>`
      )
      .join("");
    memberListEl.classList.remove("hidden");
    memberListEl.querySelectorAll(".dashboard-member-item").forEach((el) => {
      el.addEventListener("click", () => {
        selectedMemberId = el.dataset.id;
        const m = members.find((x) => x.id === selectedMemberId);
        memberSearchInput.value = m ? `${m.name} (${m.email})` : "";
        memberListEl.classList.add("hidden");
        addPointsBtn.disabled = false;
      });
    });
  });

  oneVisitBtn?.addEventListener("click", () => {
    addPointsVisitOnly = true;
    amountInput.value = "";
  });

  amountInput?.addEventListener("input", () => {
    addPointsVisitOnly = false;
  });

  addPointsBtn?.addEventListener("click", async () => {
    if (!selectedMemberId) return;
    addPointsBtn.disabled = true;
    caisseMessage.classList.add("hidden");
    try {
      const body = addPointsVisitOnly ? { visit: true } : { amount_eur: parseFloat(amountInput.value) || 0 };
      if (!addPointsVisitOnly && !body.amount_eur) {
        showCaisseMessage("Indiquez un montant (€) ou cliquez sur « 1 passage ».", true);
        addPointsBtn.disabled = false;
        return;
      }
      const headers = { "Content-Type": "application/json" };
      if (token) headers["X-Dashboard-Token"] = token;
      const res = await fetch(`${API_BASE}/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(selectedMemberId)}/points`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showCaisseMessage(data.error || "Erreur", true);
        addPointsBtn.disabled = false;
        return;
      }
      const added = data.points_added ?? data.points;
      const total = data.points;
      showCaisseMessage(`${added} point(s) ajouté(s). Total : ${total} pts.`);
      amountInput.value = "";
      selectedMemberId = null;
      memberSearchInput.value = "";
      addPointsVisitOnly = false;
      await refresh();
    } catch (e) {
      showCaisseMessage("Erreur réseau.", true);
    }
    addPointsBtn.disabled = false;
  });

  membersSearchInput?.addEventListener("input", () => {
    const q = membersSearchInput.value.trim();
    loadMembers(q).then((data) => renderMembers(data.members || []));
  });

  async function loadNotificationStats() {
    try {
      const res = await api("/notifications/stats");
      if (!res.ok) return;
      const data = await res.json();
      const el = document.getElementById("dashboard-notifications-stats");
      const diagEl = document.getElementById("dashboard-notifications-diagnostic");
      if (el) {
        const total = data.subscriptionsCount != null ? data.subscriptionsCount : 0;
        const membersCount = data.membersCount != null ? data.membersCount : 0;
        const web = data.webPushCount != null ? data.webPushCount : 0;
        const wallet = data.passKitCount != null ? data.passKitCount : 0;
        if (membersCount > 0 && total === 0) {
          el.textContent = `Tu as ${membersCount} membre(s). Aucun appareil ne nous a encore envoyé son enregistrement — on ne peut pas envoyer de notifications push pour l'instant.`;
        } else if (total === 0) {
          el.textContent = "Aucun appareil enregistré pour l'instant.";
        } else if (membersCount > 0) {
          el.textContent = `Tu as ${membersCount} membre(s). ${total} appareil(s) peuvent recevoir les notifications.`;
        } else if (wallet > 0 && web > 0) {
          el.textContent = `${total} appareil(s) peuvent recevoir les notifications (dont ${wallet} Apple Wallet, ${web} navigateur).`;
        } else if (wallet > 0) {
          el.textContent = `${total} appareil(s) peuvent recevoir les notifications (Apple Wallet).`;
        } else {
          el.textContent = `${total} appareil(s) peuvent recevoir les notifications.`;
        }
        const hintEl = document.getElementById("dashboard-notifications-members-vs-devices-hint");
        if (hintEl) {
          if (membersCount > total && total > 0) {
            hintEl.textContent = "« Envoyer » envoie à tous les appareils enregistrés (" + total + "), pas à tous les " + membersCount + " membres. Seuls les clients qui ont ajouté la carte au Portefeuille reçoivent la notif. Si tu ne reçois pas : Portefeuille → ta carte → ⋯ → Détails du pass → « Autoriser les notifications » ; puis Réglages → Notifications → Portefeuille.";
            hintEl.classList.remove("hidden");
          } else if (total > 0) {
            hintEl.textContent = "Si tu ne reçois pas sur ton iPhone : Portefeuille → ta carte → ⋯ → Détails du pass → « Autoriser les notifications » ; puis Réglages → Notifications → Portefeuille.";
            hintEl.classList.remove("hidden");
          } else {
            hintEl.classList.add("hidden");
            hintEl.textContent = "";
          }
        }
      }
      if (diagEl) {
        const total = data.subscriptionsCount != null ? data.subscriptionsCount : 0;
        const passKitOk = data.passKitUrlConfigured === true;
        if (total === 0 && data.helpWhenNoDevice) {
          let html = data.paradoxExplanation
            ? `<p class="dashboard-notifications-diagnostic-title">J'ai scanné la carte du client mais « 0 appareil » — pourquoi ?</p><p class="dashboard-notifications-diagnostic-text">${data.paradoxExplanation}</p>`
            : (data.membersVsDevicesExplanation ? `<p class="dashboard-notifications-diagnostic-title">Pourquoi des membres mais « 0 appareil » ?</p><p class="dashboard-notifications-diagnostic-text">${data.membersVsDevicesExplanation}</p>` : "");
          html += `<p class="dashboard-notifications-diagnostic-title">Pour enregistrer ton iPhone</p><p class="dashboard-notifications-diagnostic-text">${data.helpWhenNoDevice}</p>`;
          if (data.testPasskitCurl) {
            const curlEscaped = data.testPasskitCurl.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            html += `<p class="dashboard-notifications-diagnostic-text" style="margin-top: 0.75rem;"><strong>Test diagnostic :</strong> exécute cette commande dans un terminal (sur ton ordi). Si tu obtiens <code>HTTP 201</code>, l'API fonctionne et le blocage vient de l'iPhone ou du réseau.</p><pre class="dashboard-notifications-curl">${curlEscaped}</pre>`;
          }
          diagEl.innerHTML = html;
          diagEl.classList.remove("hidden");
        } else if (total === 0 && !passKitOk && data.diagnostic) {
          diagEl.innerHTML = `<p class="dashboard-notifications-diagnostic-title">Pourquoi aucun appareil ?</p><p class="dashboard-notifications-diagnostic-text">${data.diagnostic}</p>`;
          diagEl.classList.remove("hidden");
        } else {
          diagEl.classList.add("hidden");
          diagEl.innerHTML = "";
        }
      }
      await loadDashboardNotificationCategories();
    } catch (_) {}
  }

  async function loadDashboardNotificationCategories() {
    try {
      const res = await api("/dashboard/categories");
      if (!res.ok) return;
      const data = await res.json();
      const categories = data.categories || [];
      const wrap = document.getElementById("dashboard-notif-categories-wrap");
      const listEl = document.getElementById("dashboard-notif-categories-list");
      const targetAll = document.getElementById("dashboard-notif-target-all");
      if (!wrap || !listEl) return;
      if (categories.length === 0) {
        wrap.classList.add("hidden");
        return;
      }
      wrap.classList.remove("hidden");
      listEl.innerHTML = categories
        .map((c) => `<label class="dashboard-checkbox-label"><input type="checkbox" class="dashboard-notif-category-cb" data-id="${escapeHtml(c.id)}" /> ${escapeHtml(c.name)}</label>`)
        .join("");
      listEl.querySelectorAll(".dashboard-notif-category-cb").forEach((cb) => {
        cb.addEventListener("change", () => {
          if (cb.checked && targetAll) targetAll.checked = false;
        });
      });
      if (targetAll && !targetAll.dataset.notifCatListen) {
        targetAll.dataset.notifCatListen = "1";
        targetAll.addEventListener("change", () => {
          if (targetAll.checked) listEl.querySelectorAll(".dashboard-notif-category-cb").forEach((c) => { c.checked = false; });
        });
      }
    } catch (_) {}
  }

  document.getElementById("dashboard-notif-send")?.addEventListener("click", async () => {
    const titleEl = document.getElementById("dashboard-notif-title");
    const messageEl = document.getElementById("dashboard-notif-message");
    const feedbackEl = document.getElementById("dashboard-notif-feedback");
    const btn = document.getElementById("dashboard-notif-send");
    const targetAll = document.getElementById("dashboard-notif-target-all");
    const message = messageEl?.value?.trim();
    if (!message) {
      if (feedbackEl) { feedbackEl.textContent = "Saisissez un message."; feedbackEl.classList.remove("hidden", "success"); feedbackEl.classList.add("error"); }
      return;
    }
    let categoryIds = undefined;
    if (!targetAll?.checked) {
      const checked = document.querySelectorAll(".dashboard-notif-category-cb:checked");
      if (checked.length > 0) categoryIds = Array.from(checked).map((c) => c.dataset.id).filter(Boolean);
    }
    if (btn) btn.disabled = true;
    if (feedbackEl) feedbackEl.classList.add("hidden");
    try {
      const res = await fetch(`${API_BASE}/api/businesses/${encodeURIComponent(slug)}/notifications/send?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titleEl?.value?.trim() || undefined, message, ...(categoryIds && categoryIds.length > 0 ? { category_ids: categoryIds } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (feedbackEl) {
        feedbackEl.classList.remove("hidden");
        if (res.ok) {
          const sent = data.sent != null ? data.sent : 0;
          const wp = data.sentWebPush != null ? data.sentWebPush : 0;
          const pk = data.sentPassKit != null ? data.sentPassKit : 0;
          if (sent === 0) feedbackEl.textContent = data.message || "Aucun appareil n'a reçu la notification.";
          else {
            let msg = pk > 0 && wp > 0 ? `Notification envoyée à ${sent} appareil(s) (dont ${pk} Apple Wallet, ${wp} navigateur).` : pk > 0 ? `Notification envoyée à ${sent} appareil(s) (Apple Wallet).` : `Notification envoyée à ${sent} appareil(s).`;
            if (data.failed > 0 && data.errors?.length) msg += ` ${data.failed} échec(s).`;
            feedbackEl.textContent = msg;
            const prevTip = feedbackEl.nextElementSibling?.classList?.contains("dashboard-notif-feedback-tip") ? feedbackEl.nextElementSibling : null;
            if (prevTip) prevTip.remove();
            if (pk > 0) {
              const tip = document.createElement("p");
              tip.className = "dashboard-notif-feedback-tip";
              tip.textContent = "Si tu ne reçois pas sur ton iPhone : Portefeuille → ta carte → ⋯ → Autoriser les notifications ; Réglages → Notifications → Portefeuille.";
              feedbackEl.after(tip);
            }
          }
          feedbackEl.classList.remove("error"); feedbackEl.classList.add("success");
        } else {
          feedbackEl.textContent = data.error || "Erreur";
          feedbackEl.classList.add("error");
        }
      }
      if (res.ok) loadNotificationStats();
    } catch (e) {
      if (feedbackEl) { feedbackEl.textContent = "Erreur réseau."; feedbackEl.classList.remove("hidden", "success"); feedbackEl.classList.add("error"); }
    }
    if (btn) btn.disabled = false;
  });

  refresh();
  loadNotificationStats();
}

function getMentionsLegalesHtml() {
  const e = LEGAL_EDITOR;
  return `
    <h1>Mentions légales</h1>
    <p><strong>Éditeur du site</strong><br>${e.name}<br>${e.address}</p>
    <p><strong>Contact</strong><br><a href="mailto:${e.contact}">${e.contact}</a></p>
    <p><strong>Hébergement</strong><br>${e.host}</p>
    <p>Conformément à la loi « Informatique et Libertés » et au RGPD, vous disposez d’un droit d’accès, de rectification et de suppression de vos données. Voir notre <a href="/politique-confidentialite">Politique de confidentialité</a>.</p>
    <p>Les présentes mentions légales sont régies par le droit français.</p>
    <nav class="landing-legal-nav">
      <a href="/politique-confidentialite">Politique de confidentialité</a>
      <a href="/cgu">Conditions générales d'utilisation</a>
      <a href="/cgv">Conditions générales de vente</a>
      <a href="/cookies">Cookies</a>
      <a href="/">Retour à l'accueil</a>
    </nav>
  `;
}

function getPolitiqueConfidentialiteHtml() {
  const e = LEGAL_EDITOR;
  return `
    <h1>Politique de confidentialité</h1>
    <p>Dernière mise à jour : mars 2026.</p>
    <p>${e.name} s'engage à protéger vos données personnelles conformément au RGPD.</p>
    <h2>Responsable du traitement</h2>
    <p>${e.name}, ${e.address}. Contact : <a href="mailto:${e.contact}">${e.contact}</a>.</p>
    <h2>Données collectées</h2>
    <p>Nous collectons les données nécessaires au service : identifiants de connexion (email, mot de passe hashé), nom ou raison sociale, données de votre établissement (nom, adresse, logo, paramètres de carte fidélité). Pour les clients finaux qui ajoutent une carte au Wallet : identifiant de membre, points ou tampons, historique de passage (pour le commerçant).</p>
    <h2>Finalités et bases légales</h2>
    <p>Les données servent à la fourniture du service (carte fidélité Apple Wallet / Google Wallet, tableau de bord, notifications), à la facturation et au support. Base : exécution du contrat et intérêt légitime.</p>
    <h2>Durée de conservation</h2>
    <p>Données compte : tant que le compte est actif, puis possibilité d'archivage limité. Données membres (côté commerçant) : selon la durée choisie par le commerçant. Vous pouvez demander l'effacement à tout moment.</p>
    <h2>Vos droits (RGPD)</h2>
    <p>Accès, rectification, effacement, limitation du traitement, portabilité, opposition. Pour exercer vos droits : <a href="mailto:${e.contact}">${e.contact}</a>. Vous pouvez introduire une réclamation auprès de la CNIL.</p>
    <h2>Transferts et sous-traitants</h2>
    <p>Les données peuvent être hébergées ou traitées par des sous-traitants (hébergeur, paiement, envoi d'emails). Nous choisissons des acteurs conformes au RGPD.</p>
    <nav class="landing-legal-nav">
      <a href="/mentions-legales">Mentions légales</a>
      <a href="/cgu">CGU</a>
      <a href="/cgv">CGV</a>
      <a href="/cookies">Cookies</a>
      <a href="/">Retour à l'accueil</a>
    </nav>
  `;
}

function getLegalPageHtml(page) {
  switch (page) {
    case "mentions": return getMentionsLegalesHtml();
    case "politique": return getPolitiqueConfidentialiteHtml();
    case "cgu": return getCguHtml();
    case "cgv": return getCgvHtml();
    case "cookies": return getCookiesHtml();
    default: return "";
  }
}

const LEGAL_EDITOR = {
  name: "Myfidpass",
  address: "[Adresse du siège à compléter]",
  contact: "contact@myfidpass.fr",
  host: "[Hébergeur à compléter, ex. Vercel / Railway / OVH]",
  site: "https://myfidpass.fr",
};

function getCguHtml() {
  const e = LEGAL_EDITOR;
  return `
    <h1>Conditions générales d'utilisation (CGU)</h1>
    <p>Dernière mise à jour : mars 2026.</p>
    <p>L'accès et l'utilisation du site ${e.site} et des services Myfidpass sont soumis aux présentes conditions générales d'utilisation.</p>
    <h2>1. Objet et acceptation</h2>
    <p>En utilisant le site et les services (création de compte, carte fidélité, tableau de bord, application mobile), vous acceptez les présentes CGU sans réserve. Si vous n'acceptez pas ces conditions, ne pas utiliser le service.</p>
    <h2>2. Description du service</h2>
    <p>Myfidpass permet aux commerçants de créer et gérer des cartes de fidélité compatibles Apple Wallet et Google Wallet, d'enregistrer les passages (scans), d'envoyer des notifications et de gérer des catégories de membres. Les clients finaux peuvent ajouter la carte à leur téléphone et la présenter en caisse.</p>
    <h2>3. Inscription et compte</h2>
    <p>Vous devez fournir des informations exactes. Vous êtes responsable de la confidentialité de vos identifiants. En cas d'usage non autorisé, nous prévenir sans délai.</p>
    <h2>4. Usage acceptable</h2>
    <p>Vous vous engagez à utiliser le service de manière licite, à ne pas porter atteinte aux droits de tiers, à ne pas tenter de contourner les mesures de sécurité ni d'utiliser le service pour du spam ou des usages frauduleux.</p>
    <h2>5. Propriété intellectuelle</h2>
    <p>Le site, les marques, textes et logiciels restent la propriété de ${e.name}. Aucune cession de droits n'est accordée au-delà de l'usage du service.</p>
    <h2>6. Limitation de responsabilité</h2>
    <p>Le service est fourni « en l'état ». Nous nous efforçons d'assurer sa disponibilité mais ne garantissons pas une continuité sans interruption. La responsabilité est limitée aux dommages directs et prévisibles.</p>
    <h2>7. Modification et résiliation</h2>
    <p>Nous pouvons modifier les CGU ; les changements seront portés à votre connaissance (site ou email). L'utilisation continue vaut acceptation. Nous pouvons suspendre ou résilier un compte en cas de manquement aux CGU.</p>
    <h2>8. Droit applicable et litiges</h2>
    <p>Droit français. Litiges : compétence des tribunaux français. Contact : <a href="mailto:${e.contact}">${e.contact}</a>.</p>
    <nav class="landing-legal-nav">
      <a href="/mentions-legales">Mentions légales</a>
      <a href="/politique-confidentialite">Politique de confidentialité</a>
      <a href="/cgv">CGV</a>
      <a href="/cookies">Cookies</a>
      <a href="/">Retour à l'accueil</a>
    </nav>
  `;
}

function getCgvHtml() {
  const e = LEGAL_EDITOR;
  return `
    <h1>Conditions générales de vente (CGV)</h1>
    <p>Dernière mise à jour : mars 2026.</p>
    <p>Les présentes CGV s'appliquent aux abonnements et prestations proposés par ${e.name} sur le site ${e.site}.</p>
    <h2>1. Produits et offres</h2>
    <p>Les offres (abonnement mensuel, essai gratuit) sont décrites sur le site au moment de la souscription. Les prix sont en euros TTC sauf mention contraire. Nous nous réservons le droit d'ajuster les tarifs en communiquant préalablement aux abonnés.</p>
    <h2>2. Souscription et paiement</h2>
    <p>La souscription se fait en ligne. Le paiement est sécurisé (partenaire type Stripe). En cas d'essai gratuit, le prélèvement débute à l'issue de la période d'essai sauf annulation. Vous vous engagez à maintenir un moyen de paiement valide.</p>
    <h2>3. Droit de rétractation</h2>
    <p>Conformément à la loi, vous disposez de 14 jours à compter de la souscription pour exercer votre droit de rétractation, sans avoir à justifier de motif. Pour ce faire : <a href="mailto:${e.contact}">${e.contact}</a>. En cas de rétractation, les sommes déjà versées seront remboursées.</p>
    <h2>4. Résiliation et remboursement</h2>
    <p>Vous pouvez résilier votre abonnement à tout moment (depuis l'espace client ou par email). La résiliation prend effet en fin de période en cours ; aucun remboursement partiel pour la période déjà facturée. En cas de manquement grave de notre part, un remboursement pourra être envisagé.</p>
    <h2>5. Prestations et disponibilité</h2>
    <p>Nous nous engageons à fournir le service décrit (carte fidélité, tableau de bord, API, application) avec un niveau de disponibilité raisonnable. Les maintenances éventuelles seront annoncées lorsque possible.</p>
    <h2>6. Données et facturation</h2>
    <p>Les données de facturation sont traitées conformément à notre <a href="/politique-confidentialite">Politique de confidentialité</a>. Les factures sont disponibles dans l'espace client ou sur demande.</p>
    <h2>7. Droit applicable et contact</h2>
    <p>Droit français. Pour toute question : <a href="mailto:${e.contact}">${e.contact}</a>.</p>
    <nav class="landing-legal-nav">
      <a href="/mentions-legales">Mentions légales</a>
      <a href="/politique-confidentialite">Politique de confidentialité</a>
      <a href="/cgu">CGU</a>
      <a href="/cookies">Cookies</a>
      <a href="/">Retour à l'accueil</a>
    </nav>
  `;
}

function getCookiesHtml() {
  const e = LEGAL_EDITOR;
  return `
    <h1>Politique de cookies</h1>
    <p>Dernière mise à jour : mars 2026.</p>
    <p>Ce site utilise des cookies et technologies similaires pour le bon fonctionnement du service et, le cas échéant, l'analyse d'audience.</p>
    <h2>Qu'est-ce qu'un cookie ?</h2>
    <p>Un cookie est un petit fichier déposé par le navigateur sur votre appareil, permettant de mémoriser des informations (session, préférences, statistiques).</p>
    <h2>Cookies utilisés</h2>
    <ul>
      <li><strong>Cookies essentiels</strong> : session de connexion, sécurité, préférences indispensables. Ils sont nécessaires au fonctionnement du site ; leur refus peut dégrader l'expérience.</li>
      <li><strong>Cookies d'analyse</strong> (si applicable) : mesure d'audience (ex. outil type Google Analytics ou équivalent). Vous pouvez les refuser via notre bandeau ou les paramètres de votre navigateur.</li>
    </ul>
    <h2>Durée et refus</h2>
    <p>La durée de conservation des cookies est limitée (session ou durée définie selon le type). Vous pouvez configurer votre navigateur pour refuser certains ou tous les cookies ; certaines fonctionnalités peuvent alors ne plus être disponibles.</p>
    <h2>Vos droits</h2>
    <p>Conformément au RGPD et à la recommandation CNIL, vous pouvez à tout moment retirer votre consentement ou modifier vos préférences. Pour toute question : <a href="mailto:${e.contact}">${e.contact}</a>.</p>
    <nav class="landing-legal-nav">
      <a href="/mentions-legales">Mentions légales</a>
      <a href="/politique-confidentialite">Politique de confidentialité</a>
      <a href="/cgu">CGU</a>
      <a href="/cgv">CGV</a>
      <a href="/">Retour à l'accueil</a>
    </nav>
  `;
}

// ——— App Carte (uniquement sur /fidelity/:slug) ———

const form = document.getElementById("card-form");
const inputName = document.getElementById("input-name");
const inputEmail = document.getElementById("input-email");
const btnSubmit = document.getElementById("btn-submit");
const fidelityErrorEl = document.getElementById("fidelity-error");
const fidelitySuccessEl = document.getElementById("fidelity-success");
const btnAppleWallet = document.getElementById("btn-apple-wallet");
const btnGoogleWallet = document.getElementById("btn-google-wallet");
const fidelityGoogleErrorEl = document.getElementById("fidelity-google-error");
const btnAnotherCard = document.getElementById("btn-another-card");
const fidelityTitleEl = document.getElementById("fidelity-title");
const fidelitySubtitleEl = document.getElementById("fidelity-subtitle");
const pageLogo = document.querySelector("#fidelity-app .header .logo");

function getSlugFromPath() {
  const route = getRoute();
  return route.type === "fidelity" ? route.slug : null;
}

/** Template choisi (depuis l’URL) pour le pass. */
function getTemplateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const t = params.get("template");
  if (t && CARD_TEMPLATES.some((x) => x.id === t)) return t;
  return "classic";
}

function ensureFidelityPath(slug) {
  const path = window.location.pathname.replace(/\/$/, "");
  if (path === "" || path === "/" || path === "/fidelity") {
    history.replaceState(null, "", `/fidelity/${slug}`);
  }
}

async function fetchBusiness(slug) {
  const res = await fetch(`${API_BASE}/api/businesses/${encodeURIComponent(slug)}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error("Entreprise introuvable");
    throw new Error("Erreur serveur");
  }
  return res.json();
}

async function createMember(slug, name, email) {
  const res = await fetch(`${API_BASE}/api/businesses/${encodeURIComponent(slug)}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Erreur lors de la création");
  }
  return res.json();
}

function getPassUrl(slug, memberId) {
  const template = getTemplateFromUrl();
  const t = Date.now();
  return `${API_BASE}/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}/pass?template=${encodeURIComponent(template)}&_=${t}`;
}

function redirectToPass(slug, memberId) {
  window.location.href = getPassUrl(slug, memberId);
}

function showError(message) {
  if (!fidelityErrorEl) return;
  fidelityErrorEl.textContent = message || "";
  fidelityErrorEl.classList.toggle("hidden", !message);
}

function setLoading(loading) {
  if (btnSubmit) {
    btnSubmit.disabled = loading;
    if (loading) {
      btnSubmit.innerHTML = "Création…";
    } else {
      btnSubmit.innerHTML = '<span class="fidelity-btn-icon" aria-hidden="true">&#63743;</span> Créer ma carte';
    }
  }
}

function setPageBusiness(business) {
  const params = new URLSearchParams(window.location.search);
  const etablissement = params.get("etablissement");
  const displayName = etablissement || business?.name;
  if (displayName && pageLogo) pageLogo.textContent = displayName;
  const orgName = etablissement || business?.organizationName;
  if (fidelityTitleEl) {
    fidelityTitleEl.textContent = orgName ? `Carte de fidélité ${orgName}` : "Carte de fidélité";
  }
  if (fidelitySubtitleEl) {
    fidelitySubtitleEl.textContent = orgName
      ? `Renseigne ton nom et ton email, puis ajoute la carte ${orgName} à ton téléphone.`
      : "Renseigne ton nom et ton email, puis ajoute la carte à ton téléphone.";
  }
}

function showFidelitySuccess(slug, memberId) {
  if (form) form.classList.add("hidden");
  if (fidelitySuccessEl) {
    fidelitySuccessEl.classList.remove("hidden");
    if (fidelityGoogleErrorEl) {
      fidelityGoogleErrorEl.classList.add("hidden");
      fidelityGoogleErrorEl.textContent = "";
    }
  }
  const passUrl = getPassUrl(slug, memberId);
  if (btnAppleWallet) {
    btnAppleWallet.href = passUrl;
    btnAppleWallet.onclick = (e) => {
      e.preventDefault();
      window.location.href = passUrl;
    };
  }
  if (btnGoogleWallet) {
    btnGoogleWallet.href = "#";
    btnGoogleWallet.onclick = async (e) => {
      e.preventDefault();
      if (fidelityGoogleErrorEl) {
        fidelityGoogleErrorEl.classList.add("hidden");
        fidelityGoogleErrorEl.textContent = "";
      }
      try {
        const res = await fetch(
          `${API_BASE}/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}/google-wallet-url`
        );
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.url) {
          window.open(data.url, "_blank", "noopener,noreferrer");
        } else {
          if (fidelityGoogleErrorEl) {
            fidelityGoogleErrorEl.textContent =
              data.code === "google_wallet_unavailable"
                ? "Google Wallet n’est pas configuré pour ce site. Utilisez Apple Wallet ou réessayez plus tard."
                : data.error || "Impossible d’ouvrir Google Wallet.";
            fidelityGoogleErrorEl.classList.remove("hidden");
          }
        }
      } catch (_) {
        if (fidelityGoogleErrorEl) {
          fidelityGoogleErrorEl.textContent = "Erreur réseau. Réessaie.";
          fidelityGoogleErrorEl.classList.remove("hidden");
        }
      }
    };
  }
  if (btnAnotherCard) {
    btnAnotherCard.onclick = () => {
      if (fidelitySuccessEl) fidelitySuccessEl.classList.add("hidden");
      if (form) form.classList.remove("hidden");
      if (fidelityGoogleErrorEl) {
        fidelityGoogleErrorEl.classList.add("hidden");
        fidelityGoogleErrorEl.textContent = "";
      }
    };
  }

  const btnEnableNotifications = document.getElementById("btn-enable-notifications");
  const notificationsStatusEl = document.getElementById("fidelity-notifications-status");
  const notificationsBlock = document.getElementById("fidelity-notifications-block");

  async function trySubscribeToPush() {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      if (notificationsStatusEl) {
        notificationsStatusEl.textContent = "Les notifications ne sont pas supportées sur ce navigateur.";
        notificationsStatusEl.classList.remove("hidden");
      }
      return false;
    }
    if (Notification.permission === "denied") {
      if (notificationsStatusEl) {
        notificationsStatusEl.textContent = "Les notifications ont été bloquées. Autorisez-les dans les paramètres du navigateur pour recevoir les offres.";
        notificationsStatusEl.classList.remove("hidden", "success");
        notificationsStatusEl.classList.add("error");
      }
      return false;
    }
    if (btnEnableNotifications) btnEnableNotifications.disabled = true;
    if (notificationsStatusEl) {
      notificationsStatusEl.textContent = "Activation…";
      notificationsStatusEl.classList.remove("hidden", "error");
      notificationsStatusEl.classList.add("success");
    }
    try {
      let permission = Notification.permission;
      if (permission === "default") permission = await Notification.requestPermission();
      if (permission !== "granted") {
        if (notificationsStatusEl) {
          notificationsStatusEl.textContent = "Autorisez les notifications pour recevoir les offres et actualités.";
          notificationsStatusEl.classList.remove("success");
          notificationsStatusEl.classList.add("error");
        }
        if (btnEnableNotifications) btnEnableNotifications.disabled = false;
        return false;
      }
      const vapidRes = await fetch(`${API_BASE}/api/web-push/vapid-public`);
      if (!vapidRes.ok) throw new Error("Service notifications indisponible");
      const { publicKey } = await vapidRes.json();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const subJson = sub.toJSON ? sub.toJSON() : {
        endpoint: sub.endpoint,
        keys: {
          p256dh: arrayBufferToBase64(sub.getKey("p256dh")),
          auth: arrayBufferToBase64(sub.getKey("auth")),
        },
      };
      const res = await fetch(`${API_BASE}/api/web-push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          memberId,
          subscription: { endpoint: subJson.endpoint, keys: { p256dh: subJson.keys.p256dh, auth: subJson.keys.auth } },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erreur lors de l'abonnement");
      }
      if (notificationsStatusEl) {
        notificationsStatusEl.textContent = "Vous recevrez les offres et actualités par notification.";
        notificationsStatusEl.classList.remove("error");
        notificationsStatusEl.classList.add("success");
      }
      if (btnEnableNotifications) {
        btnEnableNotifications.textContent = "Notifications activées";
        btnEnableNotifications.disabled = true;
      }
      return true;
    } catch (err) {
      if (notificationsStatusEl) {
        notificationsStatusEl.textContent = err.message || "Erreur. Cliquez sur le bouton pour réessayer.";
        notificationsStatusEl.classList.remove("success");
        notificationsStatusEl.classList.add("error");
      }
      if (btnEnableNotifications) btnEnableNotifications.disabled = false;
      return false;
    }
  }

  if (btnEnableNotifications) btnEnableNotifications.onclick = () => trySubscribeToPush();

  if (notificationsBlock) {
    setTimeout(() => {
      trySubscribeToPush();
    }, 800);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
  return output;
}

function arrayBufferToBase64(buffer) {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function showSlugError(message) {
  if (!fidelityAppEl) return;
  fidelityAppEl.innerHTML = `
    <header class="header"><div class="header-inner"><a href="/" class="logo">Myfidpass</a></div></header>
    <main class="main" style="text-align: center; padding: 3rem 1.5rem;">
      <p class="error-message" style="font-size: 1.1rem;">${message}</p>
      <p style="color: var(--text-muted); margin-top: 1rem;">Ex. : <a href="/fidelity/demo" style="color: var(--accent);">/fidelity/demo</a></p>
    </main>
  `;
}

function initFidelityApp(slug) {
  // Toujours afficher la page carte : le commerçant peut tester le parcours client ou partager le lien.
  runFidelityApp(slug);
}

function runFidelityApp(slug) {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
  fetchBusiness(slug)
    .then((business) => {
      ensureFidelityPath(slug);
      setPageBusiness(business);
    })
    .catch(() => {
      showSlugError(`Entreprise « ${slug} » introuvable.`);
    });

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const s = getSlugFromPath();
      if (!s) return;

      const name = inputName?.value?.trim();
      const email = inputEmail?.value?.trim();
      if (!name || !email) {
        showError("Renseigne ton nom et ton email.");
        return;
      }

      setLoading(true);
      showError("");
      try {
        const data = await createMember(s, name, email);
        const memberId = data.memberId || data.member?.id;
        if (!memberId) throw new Error("Réponse serveur invalide");
        showFidelitySuccess(s, memberId);
      } catch (err) {
        const isNetworkError = err.message === "Failed to fetch" || err.name === "TypeError";
        showError(
          isNetworkError
            ? "Le serveur ne répond pas. Lance le backend : npm run backend"
            : (err.message || "Une erreur est survenue. Réessaie.")
        );
      } finally {
        setLoading(false);
      }
    });
  }

}

// Parcours unifié : transition accueil → créateur sans rechargement (même page, même UX)
const landingHeroForm = document.getElementById("landing-hero-form");
const landingMain = document.getElementById("landing-main");
const landingTemplates = document.getElementById("landing-templates");

function showBuilderInPlace(queryString) {
  if (!landingTemplates || !landingMain) return;
  if (landingEl) landingEl.classList.add("builder-visible");
  const bannerMedia = document.getElementById("site-banner-media");
  const siteBanner = document.querySelector(".site-banner");
  const landingHeader = document.getElementById("landing-header");
  const builderHeader = document.getElementById("builder-header");
  if (bannerMedia) bannerMedia.classList.add("hidden");
  if (siteBanner) siteBanner.classList.add("hidden");
  if (landingHeader) landingHeader.classList.add("hidden");
  if (builderHeader) {
    builderHeader.classList.remove("hidden");
    builderHeader.setAttribute("aria-hidden", "false");
  }
  landingMain.classList.add("hidden");
  if (document.getElementById("landing-legal")) document.getElementById("landing-legal").classList.add("hidden");
  landingTemplates.classList.remove("hidden");
  const url = "/creer-ma-carte" + (queryString || "");
  history.pushState({ step: "builder" }, "", url);
  initBuilderPage();
}

function showLandingMainInPlace() {
  if (landingEl) landingEl.classList.remove("builder-visible");
  const bannerMedia = document.getElementById("site-banner-media");
  const siteBanner = document.querySelector(".site-banner");
  const landingHeader = document.getElementById("landing-header");
  const builderHeader = document.getElementById("builder-header");
  if (bannerMedia) bannerMedia.classList.remove("hidden");
  if (siteBanner) siteBanner.classList.remove("hidden");
  if (landingHeader) landingHeader.classList.remove("hidden");
  if (builderHeader) {
    builderHeader.classList.add("hidden");
    builderHeader.setAttribute("aria-hidden", "true");
  }
  if (landingMain) landingMain.classList.remove("hidden");
  if (document.getElementById("landing-legal")) document.getElementById("landing-legal").classList.add("hidden");
  if (landingTemplates) landingTemplates.classList.add("hidden");
  history.replaceState(null, "", "/");
}

function updateLandingCtaState() {
  const input = document.getElementById("landing-etablissement");
  const btn = document.getElementById("landing-hero-submit");
  if (input && btn) btn.disabled = !input.value?.trim();
}

if (landingHeroForm) {
  const landingEtablissementInput = document.getElementById("landing-etablissement");
  const landingPlaceIdInput = document.getElementById("landing-place-id");
  const landingHelperEl = document.getElementById("landing-hero-helper");
  function hideLandingHelper() {
    if (landingHelperEl) landingHelperEl.classList.remove("is-visible");
  }
  function showLandingHelper() {
    if (landingHelperEl) landingHelperEl.classList.add("is-visible");
  }
  if (landingEtablissementInput) {
    let helperDebounce = null;
    landingEtablissementInput.addEventListener("input", () => {
      updateLandingCtaState();
      const text = (landingEtablissementInput.value?.trim() || "");
      if (text.length === 0) {
        hideLandingHelper();
        if (helperDebounce) clearTimeout(helperDebounce);
        return;
      }
      if (helperDebounce) clearTimeout(helperDebounce);
      helperDebounce = setTimeout(() => {
        helperDebounce = null;
        const noPlaceSelected = !landingPlaceIdInput?.value?.trim();
        if (text.length >= 2 && noPlaceSelected) showLandingHelper();
      }, 700);
    });
    landingEtablissementInput.addEventListener("change", updateLandingCtaState);
    landingEtablissementInput.addEventListener("focus", hideLandingHelper);
    landingEtablissementInput.addEventListener("blur", () => {
      const hasText = (landingEtablissementInput.value?.trim() || "").length >= 2;
      const noPlaceSelected = !landingPlaceIdInput?.value?.trim();
      if (hasText && noPlaceSelected) showLandingHelper();
    });
  }
  updateLandingCtaState();

  landingHeroForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("landing-etablissement");
    const placeIdInput = document.getElementById("landing-place-id");
    const name = input?.value?.trim();
    const placeId = placeIdInput?.value?.trim();
    if (!name) return;
    let qs = "";
    if (name) qs += `?etablissement=${encodeURIComponent(name)}`;
    if (placeId) qs += (qs ? "&" : "?") + `place_id=${encodeURIComponent(placeId)}`;
    showBuilderInPlace(qs);
  });
}

window.addEventListener("popstate", () => {
  initRouting();
});

// Autocomplete Google Places (recherche d'entreprise) — optionnel si VITE_GOOGLE_PLACES_API_KEY est défini
function initPlacesAutocomplete() {
  if (typeof google === "undefined" || !google.maps?.places) return;
  const initInput = (id) => {
    const input = document.getElementById(id);
    if (!input || input.dataset.placesInit) return;
    try {
      const frBounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(41.0, -5.5),
        new google.maps.LatLng(51.2, 9.6)
      );
      const autocomplete = new google.maps.places.Autocomplete(input, {
        types: ["establishment"],
        fields: ["name", "formatted_address", "place_id"],
        bounds: frBounds,
        strictBounds: false,
      });
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (place.name) input.value = place.name;
        if (id === "landing-etablissement") {
          const hidden = document.getElementById("landing-place-id");
          if (hidden) hidden.value = place.place_id || "";
          const helper = document.getElementById("landing-hero-helper");
          if (helper) helper.classList.remove("is-visible");
        }
      });
      input.dataset.placesInit = "1";
    } catch (e) {
      // Clé invalide ou API non activée : on laisse le champ en saisie libre (pas d'autocomplete)
    }
  };
  initInput("landing-etablissement");
  // Pas d’autocomplete sur la page « Créer ma carte » : on utilise uniquement la recherche de la page d’accueil
}

const googlePlacesApiKey = typeof import.meta.env !== "undefined" ? import.meta.env.VITE_GOOGLE_PLACES_API_KEY : "";
if (googlePlacesApiKey) {
  window.__fidpassPlacesReady = () => {
    initPlacesAutocomplete();
  };
  window.__fidpassPlacesError = (err) => {
    console.warn("[Myfidpass] Google Places: chargement refusé. Vérifiez la clé, les APIs activées (Maps JavaScript API + Places API) et les restrictions (référents + APIs autorisées).", err);
  };
  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${googlePlacesApiKey}&libraries=places&callback=__fidpassPlacesReady`;
  script.async = true;
  script.defer = true;
  script.onerror = () => {
    console.warn("[Myfidpass] Google Places: script non chargé. Vérifiez VITE_GOOGLE_PLACES_API_KEY et les restrictions de la clé (référents HTTP).");
  };
  document.head.appendChild(script);
}

// Menu mobile landing (drawer style WHOOP)
const landingMenuToggle = document.getElementById("landing-menu-toggle");
const landingMenuOverlay = document.getElementById("landing-menu-overlay");
const landingMenuClose = document.getElementById("landing-menu-close");

function closeLandingMenu() {
  if (landingMenuOverlay) {
    landingMenuOverlay.classList.remove("is-open");
    landingMenuOverlay.setAttribute("aria-hidden", "true");
  }
  if (landingMenuToggle) landingMenuToggle.setAttribute("aria-expanded", "false");
  document.body.style.overflow = "";
}

function openLandingMenu() {
  if (landingMenuOverlay) {
    landingMenuOverlay.classList.add("is-open");
    landingMenuOverlay.setAttribute("aria-hidden", "false");
  }
  if (landingMenuToggle) landingMenuToggle.setAttribute("aria-expanded", "true");
  document.body.style.overflow = "hidden";
}

if (landingMenuToggle && landingMenuOverlay) {
  landingMenuToggle.addEventListener("click", () => {
    const open = landingMenuOverlay.classList.contains("is-open");
    if (open) closeLandingMenu();
    else openLandingMenu();
  });
  landingMenuClose?.addEventListener("click", closeLandingMenu);
  landingMenuOverlay.addEventListener("click", (e) => {
    if (e.target === landingMenuOverlay) closeLandingMenu();
  });
  landingMenuOverlay.querySelectorAll(".landing-menu-drawer-nav a").forEach((a) => {
    a.addEventListener("click", closeLandingMenu);
  });
}

// Révélation au scroll + animations (GSAP si dispo, sinon Intersection Observer)
function initLandingReveal() {
  const els = document.querySelectorAll("[data-reveal]");
  if (!els.length) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) {
    els.forEach((el) => el.classList.add("is-inview"));
    return;
  }

  if (typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined") {
    gsap.registerPlugin(ScrollTrigger);
    gsap.utils.toArray("[data-reveal]").forEach((section) => {
      gsap.set(section, { opacity: 1 });
      const children = section.querySelectorAll(".landing-section-title, .landing-section-subtitle, .landing-tag, .landing-product-card, .landing-steps-list > li, .landing-faq-list .landing-faq-item, .landing-cta-block .landing-btn, .landing-cta-block p");
      const targets = children.length ? children : [section];
      gsap.set(targets, { opacity: 0, y: 32 });
      gsap.to(targets, {
        opacity: 1,
        y: 0,
        duration: 0.6,
        stagger: children.length ? 0.08 : 0,
        ease: "power3.out",
        scrollTrigger: { trigger: section, start: "top 85%", end: "top 50%", toggleActions: "play none none none" },
      });
    });
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("is-inview");
        });
      },
      { rootMargin: "0px 0px -60px 0px", threshold: 0.05 }
    );
    els.forEach((el) => io.observe(el));
  }
}

// Hero : entrée en cascade (GSAP ou classe CSS)
function initLandingHeroAnim() {
  const hero = document.querySelector(".landing-hero");
  if (!hero) return;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const items = [
    hero.querySelector(".landing-hero-title"),
    hero.querySelector(".landing-hero-subtitle"),
    hero.querySelector(".landing-hero-form"),
    hero.querySelector(".landing-hero-benefits"),
    hero.querySelector(".landing-hero-stats"),
  ].filter(Boolean);

  if (prefersReducedMotion) {
    items.forEach((el) => el.classList.add("landing-hero-visible"));
    return;
  }

  if (typeof gsap !== "undefined") {
    gsap.fromTo(
      items,
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, delay: 0.15, ease: "power3.out" }
    );
  } else {
    hero.classList.add("landing-hero-visible");
  }
}

function initLandingAnimations() {
  initLandingReveal();
  if (document.getElementById("landing-main")?.classList.contains("hidden") === false) {
    initLandingHeroAnim();
  }
}

// Bootstrap
const slug = initRouting();
if (slug) initFidelityApp(slug);

// Lancer les animations landing quand la landing est affichée
if (landingEl && !landingEl.classList.contains("hidden")) {
  initLandingAnimations();
}
