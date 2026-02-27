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
    legalContent.innerHTML = route.page === "mentions" ? getMentionsLegalesHtml() : getPolitiqueConfidentialiteHtml();
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
  }
  return null;
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
      window.location.replace("/app");
    } catch (err) {
      if (registerError) {
        registerError.textContent = "Impossible de joindre l'API. En local : démarrez le backend (port 3001). Sinon testez sur myfidpass.fr.";
        registerError.classList.remove("hidden");
      }
    }
  });
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
    const tpl = CARD_TEMPLATES.find((t) => t.id === "classic") || CARD_TEMPLATES[0];
    try {
      const res = await fetch(`${API_BASE}/api/businesses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          name,
          slug,
          organizationName: name,
          backgroundColor: tpl.bg,
          foregroundColor: tpl.fg,
          labelColor: tpl.label,
        }),
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

const APP_SECTION_IDS = ["vue-ensemble", "partager", "scanner", "caisse", "membres", "historique", "personnaliser", "integration"];

function showAppSection(sectionId) {
  const id = APP_SECTION_IDS.includes(sectionId) ? sectionId : "vue-ensemble";
  const links = document.querySelectorAll("#app-app .app-sidebar-link[data-section]");
  const content = document.getElementById("app-dashboard-content");
  if (!content) return;
  content.querySelectorAll(".app-section").forEach((section) => {
    section.classList.toggle("app-section-visible", section.id === id);
  });
  links.forEach((l) => {
    l.classList.toggle("app-sidebar-link-active", l.getAttribute("data-section") === id);
  });
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
  showAppSection(APP_SECTION_IDS.includes(hashSection) ? hashSection : "vue-ensemble");
  window.addEventListener("hashchange", () => {
    const section = (window.location.hash || "#vue-ensemble").slice(1);
    showAppSection(APP_SECTION_IDS.includes(section) ? section : "vue-ensemble");
  });
}

function initAppDashboard(slug) {
  const api = (path, opts = {}) => {
    const url = `${API_BASE}/api/businesses/${encodeURIComponent(slug)}${path}`;
    return fetch(url, { ...opts, headers: { ...opts.headers, ...getAuthHeaders() } });
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

  // ——— Personnaliser la carte ———
  const personnaliserOrg = document.getElementById("app-personnaliser-org");
  const personnaliserBg = document.getElementById("app-personnaliser-bg");
  const personnaliserBgHex = document.getElementById("app-personnaliser-bg-hex");
  const personnaliserFg = document.getElementById("app-personnaliser-fg");
  const personnaliserFgHex = document.getElementById("app-personnaliser-fg-hex");
  const personnaliserLabel = document.getElementById("app-personnaliser-label");
  const personnaliserLabelHex = document.getElementById("app-personnaliser-label-hex");
  const personnaliserLogo = document.getElementById("app-personnaliser-logo");
  const personnaliserLogoPlaceholder = document.getElementById("app-personnaliser-logo-placeholder");
  const personnaliserLogoPreview = document.getElementById("app-personnaliser-logo-preview");
  const personnaliserBackTerms = document.getElementById("app-personnaliser-back-terms");
  const personnaliserBackContact = document.getElementById("app-personnaliser-back-contact");
  const personnaliserMessage = document.getElementById("app-personnaliser-message");
  const personnaliserSave = document.getElementById("app-personnaliser-save");
  let personnaliserLogoDataUrl = "";

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
  function updatePersonnaliserPreview() {
    const card = document.getElementById("app-personnaliser-preview-card");
    const stripEl = document.getElementById("app-wallet-preview-strip");
    const orgEl = document.getElementById("app-personnaliser-preview-org");
    const valueEl = document.getElementById("app-wallet-preview-value");
    const labelEl = document.getElementById("app-wallet-preview-label");
    if (!card || !orgEl) return;
    const bg = personnaliserBgHex?.value?.trim() || personnaliserBg?.value || "#0a7c42";
    const fg = personnaliserFgHex?.value?.trim() || personnaliserFg?.value || "#ffffff";
    const labelColor = personnaliserLabelHex?.value?.trim() || personnaliserLabel?.value || "#e8f5e9";
    card.style.setProperty("--wallet-bg", bg);
    card.style.setProperty("--wallet-fg", fg);
    card.style.setProperty("--wallet-label", labelColor);
    if (stripEl) {
      stripEl.style.background = `linear-gradient(165deg, ${lightenHex(bg, 1.2)} 0%, ${bg} 50%, ${darkenHex(bg, 1.15)} 100%)`;
    }
    const bodyEl = card?.querySelector(".app-wallet-preview-body");
    if (bodyEl) {
      bodyEl.style.background = `linear-gradient(180deg, ${lightenHex(bg, 1.08)} 0%, ${bg} 100%)`;
      bodyEl.style.color = fg;
    }
    orgEl.textContent = personnaliserOrg?.value?.trim() || "Votre commerce";
    if (valueEl) valueEl.textContent = "42 pts";
    if (labelEl) labelEl.textContent = "Points";
    const walletLogo = document.getElementById("app-wallet-preview-logo");
    if (walletLogo && personnaliserLogoDataUrl) {
      walletLogo.src = personnaliserLogoDataUrl;
      walletLogo.classList.remove("hidden");
    } else if (walletLogo) {
      walletLogo.removeAttribute("src");
      walletLogo.classList.add("hidden");
    }
  }
  [personnaliserOrg, personnaliserBg, personnaliserBgHex, personnaliserFg, personnaliserFgHex, personnaliserLabel, personnaliserLabelHex].forEach((el) => el?.addEventListener("input", updatePersonnaliserPreview));
  [personnaliserOrg, personnaliserBg, personnaliserBgHex, personnaliserFg, personnaliserFgHex, personnaliserLabel, personnaliserLabelHex].forEach((el) => el?.addEventListener("change", updatePersonnaliserPreview));

  api("/dashboard/settings")
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data) return;
      if (personnaliserOrg) personnaliserOrg.value = data.organizationName || "";
      const bg = data.backgroundColor || "#0a7c42";
      const fg = data.foregroundColor || "#ffffff";
      const label = data.labelColor || "#e8f5e9";
      if (personnaliserBg) personnaliserBg.value = bg;
      if (personnaliserBgHex) personnaliserBgHex.value = bg;
      if (personnaliserFg) personnaliserFg.value = fg;
      if (personnaliserFgHex) personnaliserFgHex.value = fg;
      if (personnaliserLabel) personnaliserLabel.value = label;
      if (personnaliserLabelHex) personnaliserLabelHex.value = label;
      if (personnaliserBackTerms) personnaliserBackTerms.value = data.backTerms || "";
      if (personnaliserBackContact) personnaliserBackContact.value = data.backContact || "";
      updatePersonnaliserPreview();
    })
    .catch(() => {});

  if (personnaliserLogo) {
    personnaliserLogo.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const r = new FileReader();
      r.onload = () => {
        personnaliserLogoDataUrl = r.result;
        if (personnaliserLogoPreview) {
          personnaliserLogoPreview.src = personnaliserLogoDataUrl;
          personnaliserLogoPreview.classList.remove("hidden");
        }
        if (personnaliserLogoPlaceholder) personnaliserLogoPlaceholder.classList.add("hidden");
        updatePersonnaliserPreview();
      };
      r.readAsDataURL(file);
    });
  }

  if (personnaliserSave) {
    personnaliserSave.addEventListener("click", async () => {
      const organizationName = personnaliserOrg?.value?.trim() || "";
      const backgroundColor = personnaliserBgHex?.value?.trim() || personnaliserBg?.value || "#0a7c42";
      const foregroundColor = personnaliserFgHex?.value?.trim() || personnaliserFg?.value || "#ffffff";
      const labelColor = personnaliserLabelHex?.value?.trim() || personnaliserLabel?.value || "#e8f5e9";
      const backTerms = personnaliserBackTerms?.value?.trim() || "";
      const backContact = personnaliserBackContact?.value?.trim() || "";
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
        backTerms: backTerms || undefined,
        backContact: backContact || undefined,
      };
      if (personnaliserLogoDataUrl) body.logoBase64 = personnaliserLogoDataUrl;
      personnaliserSave.disabled = true;
      showPersonnaliserMessage("");
      try {
        const res = await fetch(`${API_BASE}/api/businesses/${encodeURIComponent(slug)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          showPersonnaliserMessage("Modifications enregistrées.");
          personnaliserLogoDataUrl = "";
          if (personnaliserLogo) personnaliserLogo.value = "";
          if (personnaliserLogoPreview) {
            personnaliserLogoPreview.src = "";
            personnaliserLogoPreview.classList.add("hidden");
          }
          if (personnaliserLogoPlaceholder) personnaliserLogoPlaceholder.classList.remove("hidden");
        } else {
          showPersonnaliserMessage(data.error || "Erreur lors de l’enregistrement.", true);
        }
      } catch (_) {
        showPersonnaliserMessage("Erreur réseau.", true);
      }
      personnaliserSave.disabled = false;
    });
  }

  // ——— Scanner (caméra) ———
  const scannerViewport = document.getElementById("app-scanner-viewport");
  const scannerPlaceholder = document.getElementById("app-scanner-placeholder");
  const scannerVerifying = document.getElementById("app-scanner-verifying");
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

  let scannerInstance = null;
  let scannerCurrentMemberId = null;
  let scannerCurrentMember = null;
  let scannerVisitOnly = false;

  function hideAllScannerStates() {
    if (scannerVerifying) scannerVerifying.classList.add("hidden");
    if (scannerReject) scannerReject.classList.add("hidden");
    if (scannerResult) scannerResult.classList.add("hidden");
    scannerCard?.classList.remove("app-scanner-has-overlay");
  }

  function showScannerVerifying() {
    hideAllScannerStates();
    if (scannerViewport) scannerViewport.classList.add("hidden");
    if (scannerVerifying) scannerVerifying.classList.remove("hidden");
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

  function showScannerReject(message) {
    scannerFeedbackReject();
    hideAllScannerStates();
    if (scannerViewport) scannerViewport.classList.add("hidden");
    if (scannerReject) scannerReject.classList.remove("hidden");
    if (scannerRejectMessage) scannerRejectMessage.textContent = message || "Ce code-barres ne correspond pas à un client de votre commerce.";
    scannerCard?.classList.add("app-scanner-has-overlay");
  }

  async function showScannerResult(member) {
    scannerFeedbackSuccess();
    scannerCurrentMemberId = member.id;
    scannerCurrentMember = member;
    hideAllScannerStates();
    if (scannerViewport) scannerViewport.classList.add("hidden");
    if (scannerResult) scannerResult.classList.remove("hidden");
    scannerCard?.classList.add("app-scanner-has-overlay");

    const displayName = member.name?.trim() || member.email || "Client";
    if (scannerResultName) scannerResultName.textContent = displayName;
    if (scannerResultEmail) {
      scannerResultEmail.textContent = member.email || "";
      scannerResultEmail.classList.toggle("hidden", !member.email);
    }
    if (scannerResultPoints) scannerResultPoints.textContent = `${member.points ?? 0} point(s)`;
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
    scannerVisitOnly = false;

    if (scannerHistoryList) {
      scannerHistoryList.innerHTML = "";
      try {
        const txRes = await api("/dashboard/transactions?limit=5&memberId=" + encodeURIComponent(member.id));
        if (txRes.ok) {
          const { transactions } = await txRes.json();
          if (transactions?.length) {
            transactions.forEach((t) => {
              const li = document.createElement("li");
              li.textContent = `+${t.points} pt${t.points > 1 ? "s" : ""} — ${formatDate(t.created_at)}`;
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
    if (scannerViewport) scannerViewport.classList.remove("hidden");
    if (scannerResultMessage) { scannerResultMessage.classList.add("hidden"); scannerResultMessage.textContent = ""; }
  }

  async function startScanner() {
    if (scannerInstance) return;
    if (!scannerViewport) return;
    hideAllScannerStates();
    scannerViewport.classList.remove("hidden");
    if (scannerPlaceholder) scannerPlaceholder.classList.remove("hidden");
    scannerViewport.classList.add("app-scanner-scanning");

    const config = { formatsToSupport: [Html5QrcodeSupportedFormats.PDF_417] };
    scannerInstance = new Html5Qrcode("app-scanner-viewport", config);
    const cameraConfig = { facingMode: "environment" };
    const scanConfig = { fps: 8, qrbox: { width: 260, height: 100 } };

    scannerInstance.start(cameraConfig, scanConfig, async (decodedText) => {
      if (scannerCurrentMemberId) return;
      const instance = scannerInstance;
      try {
        if (instance) await instance.stop();
      } catch (_) {}
      scannerInstance = null;
      scannerViewport?.classList.remove("app-scanner-scanning");
      if (scannerPlaceholder) scannerPlaceholder.classList.add("hidden");

      showScannerVerifying();
      const memberId = decodedText.trim();
      try {
        const res = await api("/members/" + encodeURIComponent(memberId));
        if (res.status === 404) {
          showScannerReject("Ce code-barres ne correspond pas à un client de votre commerce. (Carte d’un autre établissement ou code invalide.)");
          return;
        }
        if (!res.ok) {
          showScannerReject("Erreur serveur. Réessayez dans un instant.");
          return;
        }
        const member = await res.json();
        await showScannerResult(member);
      } catch (_) {
        showScannerReject("Impossible de vérifier le code. Vérifiez votre connexion et réessayez.");
      }
    }, () => {}).catch((err) => {
      scannerInstance = null;
      scannerViewport.classList.remove("app-scanner-scanning");
      if (scannerPlaceholder) scannerPlaceholder.classList.remove("hidden");
      showScannerReject(err?.message || "Impossible d’accéder à la caméra. Vérifiez les permissions du navigateur.");
    });
  }

  function stopScanner() {
    hideScannerResult();
    if (scannerViewport) scannerViewport.classList.remove("hidden");
    if (!scannerInstance) return;
    scannerInstance.stop().then(() => {
      scannerInstance = null;
      scannerViewport?.classList.remove("app-scanner-scanning");
      if (scannerPlaceholder) scannerPlaceholder.classList.remove("hidden");
    }).catch(() => {
      scannerInstance = null;
      scannerViewport?.classList.remove("app-scanner-scanning");
      if (scannerPlaceholder) scannerPlaceholder.classList.remove("hidden");
    });
  }

  scannerRetryBtn?.addEventListener("click", () => {
    hideAllScannerStates();
    if (scannerViewport) scannerViewport.classList.remove("hidden");
    scannerCard?.classList.remove("app-scanner-has-overlay");
    startScanner();
  });

  scannerResume?.addEventListener("click", () => {
    hideScannerResult();
    if (scannerViewport) scannerViewport.classList.remove("hidden");
    startScanner();
  });

  scannerOneVisit?.addEventListener("click", () => { scannerVisitOnly = true; if (scannerAmount) scannerAmount.value = ""; });
  scannerAmount?.addEventListener("input", () => { scannerVisitOnly = false; });

  scannerAddPoints?.addEventListener("click", async () => {
    if (!scannerCurrentMemberId) return;
    const body = scannerVisitOnly ? { visit: true } : { amount_eur: parseFloat(scannerAmount?.value) || 0 };
    if (!scannerVisitOnly && !body.amount_eur) {
      if (scannerResultMessage) {
        scannerResultMessage.textContent = "Indiquez un montant (€) ou cliquez sur « 1 passage ».";
        scannerResultMessage.classList.remove("hidden");
      }
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(scannerCurrentMemberId)}/points`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
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
      if (scannerResultMessage) {
        scannerResultMessage.textContent = `${data.points} point(s) ajouté(s). Total : ${data.points} pts.`;
        scannerResultMessage.classList.remove("hidden");
      }
      if (scannerResultPoints) scannerResultPoints.textContent = `${data.points} point(s)`;
      scannerCurrentMember = scannerCurrentMember ? { ...scannerCurrentMember, points: data.points } : null;
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
      if (id === "scanner") startScanner();
      else stopScanner();
    });
  });
  if ((window.location.hash || "#vue-ensemble").startsWith("#scanner")) startScanner();
  window.addEventListener("app-section-change", (e) => {
    if (e.detail?.sectionId === "scanner") startScanner();
    else stopScanner();
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
      });
    });
  }

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
    const data = await res.json();
    if (statMembers) statMembers.textContent = data.membersCount ?? 0;
    if (statPoints) statPoints.textContent = data.pointsThisMonth ?? 0;
    if (statTransactions) statTransactions.textContent = data.transactionsThisMonth ?? 0;
    if (statNew30) statNew30.textContent = data.newMembersLast30Days ?? 0;
    if (statInactive30) statInactive30.textContent = data.inactiveMembers30Days ?? 0;
    if (statAvgPoints) statAvgPoints.textContent = data.pointsAveragePerMember ?? 0;
    return data;
  }

  async function loadEvolution() {
    const res = await api("/dashboard/evolution?weeks=6");
    if (!res.ok) return;
    const data = await res.json();
    const chartEl = document.getElementById("app-evolution-chart");
    if (!chartEl || !data.evolution?.length) return;
    const maxOp = Math.max(1, ...data.evolution.map((w) => w.operationsCount));
    chartEl.innerHTML = data.evolution.map((w, i) => {
      const pct = maxOp > 0 ? (w.operationsCount / maxOp) * 100 : 0;
      return `<div class="app-evolution-bar" style="height: ${pct}%" title="Sem. ${i + 1}: ${w.operationsCount} op." aria-label="Semaine ${i + 1} ${w.operationsCount} opérations"></div>`;
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
      const res = await fetch(`${API_BASE}/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(selectedMemberId)}/points`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showCaisseMessage(data.error || "Erreur", true);
        addPointsBtn.disabled = false;
        return;
      }
      showCaisseMessage(`${data.points} point(s) ajouté(s). Total : ${data.points} pts.`);
      const addedMember = allMembers.find((m) => m.id === selectedMemberId) || { id: selectedMemberId, name: memberSearchInput?.value || "Client" };
      addToCaisseRecent(addedMember);
      if (amountInput) amountInput.value = "";
      selectedMemberId = null;
      if (memberSearchInput) memberSearchInput.value = "";
      addPointsVisitOnly = false;
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

  refresh();
}

/** Modèles de carte par secteur (Points + Tampons) + styles libres. */
const CARD_TEMPLATES = [
  { id: "fastfood-points", name: "Points (Fast food)", format: "points", design: "fastfood", bg: "#c41e3a", fg: "#ffffff", label: "#ffd54f" },
  { id: "fastfood-tampons", name: "Tampons (Fast food)", format: "tampons", design: "fastfood", bg: "#c41e3a", fg: "#ffffff", label: "#ffd54f" },
  { id: "beauty-points", name: "Points (Beauté)", format: "points", design: "beauty", bg: "#b76e79", fg: "#ffffff", label: "#fce4ec" },
  { id: "beauty-tampons", name: "Tampons (Beauté)", format: "tampons", design: "beauty", bg: "#b76e79", fg: "#ffffff", label: "#fce4ec" },
  { id: "coiffure-points", name: "Points (Coiffure)", format: "points", design: "coiffure", bg: "#5c4a6a", fg: "#ffffff", label: "#d1c4e0" },
  { id: "coiffure-tampons", name: "Tampons (Coiffure)", format: "tampons", design: "coiffure", bg: "#5c4a6a", fg: "#ffffff", label: "#d1c4e0" },
  { id: "boulangerie-points", name: "Points (Boulangerie)", format: "points", design: "boulangerie", bg: "#b8860b", fg: "#ffffff", label: "#fff8e1" },
  { id: "boulangerie-tampons", name: "Tampons (Boulangerie)", format: "tampons", design: "boulangerie", bg: "#b8860b", fg: "#ffffff", label: "#fff8e1" },
  { id: "boucherie-points", name: "Points (Boucherie)", format: "points", design: "boucherie", bg: "#6d2c3e", fg: "#ffffff", label: "#ffcdd2" },
  { id: "boucherie-tampons", name: "Tampons (Boucherie)", format: "tampons", design: "boucherie", bg: "#6d2c3e", fg: "#ffffff", label: "#ffcdd2" },
  { id: "cafe-points", name: "Points (Café)", format: "points", design: "cafe", bg: "#5d4e37", fg: "#ffffff", label: "#d7ccc8" },
  { id: "cafe-tampons", name: "Tampons (Café)", format: "tampons", design: "cafe", bg: "#5d4e37", fg: "#ffffff", label: "#d7ccc8" },
  { id: "classic", name: "Classique", format: "points", bg: "#0a7c42", fg: "#ffffff", label: "#e8f5e9" },
  { id: "bold", name: "Moderne", format: "points", bg: "#1a237e", fg: "#ffffff", label: "#c5cae9" },
  { id: "elegant", name: "Élégant", format: "points", bg: "#8b7355", fg: "#ffffff", label: "#f5f0e6" },
];

const BUILDER_DRAFT_KEY = "fidpass_builder_draft";

function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 50) || "ma-carte";
}

function initBuilderPage() {

  const btnSubmit = document.getElementById("builder-submit");
  const cartBadge = document.getElementById("builder-header-cart-badge");
  if (cartBadge) cartBadge.textContent = "1";

  const state = { selectedTemplateId: "fastfood-points" };
  const headerSteps = document.querySelectorAll(".builder-header-step");

  setBuilderHeaderStep(2);

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
      }
    } catch (_) {}
  }

  function saveDraft() {
    try {
      localStorage.setItem(BUILDER_DRAFT_KEY, JSON.stringify({ selectedTemplateId: state.selectedTemplateId }));
    } catch (_) {}
  }

  const sliderEl = document.getElementById("builder-wallet-slider");
  const dotsContainer = document.getElementById("builder-phone-dots");
  const templateIds = CARD_TEMPLATES.map((t) => t.id);

  if (dotsContainer) {
    dotsContainer.innerHTML = "";
    CARD_TEMPLATES.forEach((t, i) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "builder-phone-dot";
      dot.setAttribute("data-index", String(i));
      dot.setAttribute("aria-label", t.name);
      dotsContainer.appendChild(dot);
    });
  }

  function getTemplateIndex(templateId) {
    const i = templateIds.indexOf(templateId);
    return i >= 0 ? i : 0;
  }

  function setSliderPosition(index) {
    if (sliderEl) sliderEl.style.transform = `translateX(-${index * 100}%)`;
    dotsContainer?.querySelectorAll(".builder-phone-dot").forEach((dot, i) => {
      dot.classList.toggle("active", i === index);
      dot.setAttribute("aria-current", i === index ? "true" : null);
    });
  }

  function setTemplateSelection(templateId) {
    state.selectedTemplateId = templateId;
    document.querySelectorAll(".builder-template-card").forEach((btn) => {
      const isSelected = btn.getAttribute("data-template") === templateId;
      btn.classList.toggle("builder-template-selected", isSelected);
      btn.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
    setSliderPosition(getTemplateIndex(templateId));
    saveDraft();
    updateDemoQR(templateId);
    const selectedCard = document.querySelector(`.builder-template-card[data-template="${templateId}"]`);
    selectedCard?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }

  function updateDemoQR(templateId) {
    const qrEl = document.getElementById("builder-demo-qr");
    const qrCafeEl = document.getElementById("builder-demo-qr-cafe");
    const nameEl = document.getElementById("builder-demo-template-name");
    const nameCafeEl = document.getElementById("builder-demo-template-name-cafe");
    const defaultBlock = document.getElementById("builder-demo-default");
    const cafeBlock = document.getElementById("builder-demo-cafe-layout");
    const demoSection = document.getElementById("builder-demo-wallet");
    const tpl = CARD_TEMPLATES.find((t) => t.id === templateId);
    const isCafe = templateId === "cafe-points" || templateId === "cafe-tampons";

    if (tpl && nameEl) nameEl.textContent = tpl.name;
    if (nameCafeEl) nameCafeEl.textContent = isCafe ? (tpl?.name ?? "") : "Tampons (Café)";
    if (demoSection) demoSection.classList.toggle("builder-demo-wallet--cafe", isCafe);

    const base = API_BASE.replace(/\/$/, "");
    const url = `${base}/api/passes/demo?template=${encodeURIComponent(templateId)}`;
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`;
    if (qrEl) {
      qrEl.src = qrSrc;
      qrEl.alt = `QR code pour ajouter la carte ${tpl?.name ?? templateId} à Apple Wallet`;
    }
    const cafeTemplateId = isCafe ? templateId : "cafe-tampons";
    const cafeUrl = `${base}/api/passes/demo?template=${encodeURIComponent(cafeTemplateId)}`;
    const qrCafeSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(cafeUrl)}`;
    if (qrCafeEl) {
      qrCafeEl.src = qrCafeSrc;
      qrCafeEl.alt = "QR code carte café — Tester sur iPhone";
    }
  }

  document.querySelector(".builder-back")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (typeof showLandingMainInPlace === "function") showLandingMainInPlace();
    else window.location.href = "/";
  });

  loadDraft();
  setTemplateSelection(state.selectedTemplateId);

  document.querySelectorAll(".builder-template-card").forEach((btn) => {
    btn.addEventListener("click", () => setTemplateSelection(btn.getAttribute("data-template")));
  });

  dotsContainer?.querySelectorAll(".builder-phone-dot").forEach((dot) => {
    dot.addEventListener("click", () => {
      const index = parseInt(dot.getAttribute("data-index"), 10);
      if (!Number.isNaN(index) && CARD_TEMPLATES[index]) setTemplateSelection(CARD_TEMPLATES[index].id);
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
  const templatesEl = document.getElementById("builder-templates");

  stickyCta?.addEventListener("click", goToCheckout);
  stickyChange?.addEventListener("click", () => {
    templatesEl?.scrollIntoView({ behavior: "smooth", block: "center" });
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

function initCheckoutPage() {
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
  const mobileContinueBtn = document.getElementById("checkout-mobile-continue");
  const mobileBackLink = document.getElementById("checkout-mobile-back");

  const isMobile = () => window.matchMedia("(max-width: 899px)").matches;

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
    document.getElementById("checkout-payment")?.focus();
  } else if (isMobile()) {
    setMobileStep(0);
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
    showError("");
    showStep(2);
    if (isMobile()) setMobileStep(2);
    passwordInput?.focus();
  });

  next2?.addEventListener("click", async () => {
    const email = emailInput?.value?.trim();
    const password = passwordInput?.value;
    const name = nameInput?.value?.trim();
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
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: name || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(data.error || "Erreur lors de la création du compte.");
        if (next2) { next2.disabled = false; next2.textContent = "SUIVANT"; }
        return;
      }
      setAuthToken(data.token);
      showStep(3);
      if (isMobile()) setMobileStep(3);
      if (paymentBtn) paymentBtn.focus();
    } catch (e) {
      showError("Impossible de créer le compte. Vérifiez votre connexion.");
    } finally {
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
      const res = await fetch(`${API_BASE}/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(selectedMemberId)}/points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showCaisseMessage(data.error || "Erreur", true);
        addPointsBtn.disabled = false;
        return;
      }
      showCaisseMessage(`${data.points} point(s) ajouté(s). Total : ${data.points} pts.`);
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

  refresh();
}

function getMentionsLegalesHtml() {
  return `
    <h1>Mentions légales</h1>
    <p><strong>Éditeur</strong><br>Fidpass – [Adresse à compléter]</p>
    <p><strong>Hébergement</strong><br>[Hébergeur à compléter]</p>
    <p><strong>Contact</strong><br>contact@fidpass.fr</p>
    <p>Conformément à la loi « Informatique et Libertés » et au RGPD, vous disposez d’un droit d’accès, de rectification et de suppression de vos données. Voir notre <a href="/politique-confidentialite">Politique de confidentialité</a>.</p>
  `;
}

function getPolitiqueConfidentialiteHtml() {
  return `
    <h1>Politique de confidentialité</h1>
    <p>Fidpass s’engage à protéger vos données personnelles.</p>
    <h2>Données collectées</h2>
    <p>Lors de la création d’une carte fidélité (nom, adresse email), ces informations sont utilisées uniquement pour générer et associer la carte à votre appareil. Nous ne les revendons pas à des tiers.</p>
    <h2>Utilisation</h2>
    <p>Les données servent à la gestion de votre carte (Apple Wallet ou Google Wallet) et à l’identification en caisse. Le commerce partenaire peut consulter les informations liées à votre carte pour son programme de fidélité.</p>
    <h2>Vos droits</h2>
    <p>Vous pouvez demander l’accès, la rectification ou la suppression de vos données en nous contactant à contact@fidpass.fr.</p>
    <p><a href="/">Retour à l’accueil</a></p>
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
  return `${API_BASE}/api/businesses/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}/pass?template=${encodeURIComponent(template)}`;
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
}

function showSlugError(message) {
  if (!fidelityAppEl) return;
  fidelityAppEl.innerHTML = `
    <header class="header"><div class="header-inner"><a href="/" class="logo">Fidpass</a></div></header>
    <main class="main" style="text-align: center; padding: 3rem 1.5rem;">
      <p class="error-message" style="font-size: 1.1rem;">${message}</p>
      <p style="color: var(--text-muted); margin-top: 1rem;">Ex. : <a href="/fidelity/demo" style="color: var(--accent);">/fidelity/demo</a></p>
    </main>
  `;
}

function initFidelityApp(slug) {
  // Si le visiteur est le propriétaire du commerce, le renvoyer vers son espace (pas la page client).
  const token = getAuthToken();
  if (token) {
    fetch(`${API_BASE}/api/auth/me`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => {
        const businesses = data.businesses || [];
        if (businesses.some((b) => b.slug === slug)) {
          window.location.replace("/app");
          return;
        }
        runFidelityApp(slug);
      })
      .catch(() => runFidelityApp(slug));
    return;
  }
  runFidelityApp(slug);
}

function runFidelityApp(slug) {
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

if (landingHeroForm) {
  landingHeroForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("landing-etablissement");
    const placeIdInput = document.getElementById("landing-place-id");
    const name = input?.value?.trim();
    const placeId = placeIdInput?.value?.trim();
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
    console.warn("[Fidpass] Google Places: chargement refusé. Vérifiez la clé, les APIs activées (Maps JavaScript API + Places API) et les restrictions (référents + APIs autorisées).", err);
  };
  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${googlePlacesApiKey}&libraries=places&callback=__fidpassPlacesReady`;
  script.async = true;
  script.defer = true;
  script.onerror = () => {
    console.warn("[Fidpass] Google Places: script non chargé. Vérifiez VITE_GOOGLE_PLACES_API_KEY et les restrictions de la clé (référents HTTP).");
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

// Bootstrap
const slug = initRouting();
if (slug) initFidelityApp(slug);
