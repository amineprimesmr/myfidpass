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

function getAuthHeaders() {
  const token = getAuthToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
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
  return { type: "landing" };
}

function initRouting() {
  const route = getRoute();
  document.body.classList.toggle("page-checkout", route.type === "checkout");

  if (route.type === "fidelity") {
    landingEl.classList.add("hidden");
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
    if (checkoutAppEl) checkoutAppEl.classList.remove("hidden");
    initCheckoutPage();
    return null;
  }

  if (route.type === "dashboard") {
    fidelityAppEl.classList.add("hidden");
    landingEl.classList.add("hidden");
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
  if (checkoutAppEl) checkoutAppEl.classList.add("hidden");
  const landingMain = document.getElementById("landing-main");
  const landingLegal = document.getElementById("landing-legal");
  const landingTemplates = document.getElementById("landing-templates");
  const legalContent = document.getElementById("landing-legal-content");

  if (route.type === "templates") {
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
    landingLegal.classList.remove("hidden");
    legalContent.innerHTML = route.page === "mentions" ? getMentionsLegalesHtml() : getPolitiqueConfidentialiteHtml();
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
      if (!data.hasActiveSubscription) {
        window.location.replace("/choisir-offre");
        return;
      }
      const user = data.user;
      const businesses = data.businesses || [];
      if (userEmailEl) userEmailEl.textContent = user?.email || "";
      const headerEmail = document.getElementById("app-header-email");
      if (headerEmail) headerEmail.textContent = user?.email || "";

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

function initAppSidebar() {
  const links = document.querySelectorAll("#app-app .app-sidebar-link[data-section]");
  const main = document.querySelector("#app-app .app-main");
  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const id = link.getAttribute("data-section");
      const section = document.getElementById(id);
      if (section && main) {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
        links.forEach((l) => l.classList.remove("app-sidebar-link-active"));
        link.classList.add("app-sidebar-link-active");
      }
    });
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
  if (shareQrEl) shareQrEl.src = "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" + encodeURIComponent(fullShareLink);
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

  function showScannerReject(message) {
    hideAllScannerStates();
    if (scannerViewport) scannerViewport.classList.add("hidden");
    if (scannerReject) scannerReject.classList.remove("hidden");
    if (scannerRejectMessage) scannerRejectMessage.textContent = message || "Ce code-barres ne correspond pas à un client de votre commerce.";
    scannerCard?.classList.add("app-scanner-has-overlay");
  }

  async function showScannerResult(member) {
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

  let allMembers = [];
  let selectedMemberId = null;
  let addPointsVisitOnly = false;

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
    if (!res.ok) return;
    const data = await res.json();
    if (statMembers) statMembers.textContent = data.membersCount ?? 0;
    if (statPoints) statPoints.textContent = data.pointsThisMonth ?? 0;
    if (statTransactions) statTransactions.textContent = data.transactionsThisMonth ?? 0;
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
    membersTbody.innerHTML = (members || [])
      .map((m) =>
        `<tr><td>${escapeHtml(m.name)}</td><td>${escapeHtml(m.email)}</td><td>${m.points}</td><td>${m.last_visit_at ? formatDate(m.last_visit_at) : "—"}</td></tr>`
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
      await loadStats();
    } catch (_) { return; }
    const membersData = await loadMembers(membersSearchInput?.value || "");
    allMembers = membersData.members || [];
    renderMembers(allMembers);
    const txData = await loadTransactions();
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
      });
    });
  });

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
    loadMembers(q).then((data) => renderMembers(data.members || []));
  });

  refresh();
}

/** Modèles de carte (couleurs par défaut ; personnalisation dans l'app après paiement) */
const CARD_TEMPLATES = [
  { id: "classic", name: "Classique", bg: "#0a7c42", fg: "#ffffff", label: "#e8f5e9" },
  { id: "bold", name: "Moderne", bg: "#c41e3a", fg: "#ffffff", label: "#ffd700" },
  { id: "elegant", name: "Élégant", bg: "#8b7355", fg: "#ffffff", label: "#f5f0e6" },
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

  const state = { selectedTemplateId: "classic" };

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

  function openCart() {
    if (cartOverlay) {
      cartOverlay.classList.remove("hidden");
      cartOverlay.classList.add("is-open");
      document.body.style.overflow = "hidden";
    }
  }

  function closeCart() {
    if (cartOverlay) {
      cartOverlay.classList.remove("is-open");
      cartOverlay.classList.add("hidden");
      document.body.style.overflow = "";
    }
  }

  btnSubmit?.addEventListener("click", () => {
    window.location.replace("/checkout");
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
    if (current <= 0) return;
    const prev = current - 1;
    setMobileStep(prev);
    if (prev === 0) return;
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
        if (data.hasActiveSubscription) {
          window.location.replace("/app");
          return;
        }
      }
    } catch (_) {}
  })();

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
  const path = window.location.pathname.replace(/\/$/, "");
  if (path === "/creer-ma-carte" && landingEl && !landingEl.classList.contains("hidden")) {
    showBuilderInPlace(window.location.search);
    return;
  }
  if (path === "/" && landingEl && !landingEl.classList.contains("hidden")) {
    showLandingMainInPlace();
  }
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
