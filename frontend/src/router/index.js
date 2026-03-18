/**
 * Routeur léger : getRoute, show/hide des vues, chargement dynamique des pages.
 * Référence : REFONTE-REGLES.md — un module par écran, import() dynamique.
 */
import { getAuthToken } from "../config.js";

export function getRoute() {
  const path = window.location.pathname.replace(/\/$/, "");
  const gameMatch = path.match(/^\/fidelity\/([^/]+)\/jeu$/);
  if (gameMatch) return { type: "fidelity", slug: gameMatch[1], gamePage: true };
  const match = path.match(/^\/fidelity\/([^/]+)$/);
  if (match) return { type: "fidelity", slug: match[1] };
  if (path === "/dashboard") return { type: "dashboard" };
  if (path === "/app") return { type: "app" };
  if (path === "/login") return { type: "auth", tab: "login" };
  if (path === "/register") return { type: "auth", tab: "login" };
  if (path === "/creer-ma-carte") return { type: "templates" };
  if (path === "/choisir-offre") return { type: "offers" };
  if (path === "/checkout") return { type: "checkout" };
  if (path === "/mentions-legales") return { type: "legal", page: "mentions" };
  if (path === "/politique-confidentialite") return { type: "legal", page: "politique" };
  if (path === "/cgu") return { type: "legal", page: "cgu" };
  if (path === "/cgv") return { type: "legal", page: "cgv" };
  if (path === "/cookies") return { type: "legal", page: "cookies" };
  if (path === "/integration") return { type: "integration" };
  if (path === "") return { type: "landing" };
  return { type: "404" };
}

function getContainers() {
  return {
    landing: document.getElementById("landing"),
    builderApp: document.getElementById("builder-app"),
    fidelityApp: document.getElementById("fidelity-app"),
    dashboardApp: document.getElementById("dashboard-app"),
    authApp: document.getElementById("auth-app"),
    appApp: document.getElementById("app-app"),
    offersApp: document.getElementById("offers-app"),
    checkoutApp: document.getElementById("checkout-app"),
    builderHeader: document.getElementById("builder-header"),
    page404: document.getElementById("page-404"),
    landingMain: document.getElementById("landing-main"),
    landingLegal: document.getElementById("landing-legal"),
    landingTemplates: document.getElementById("landing-templates"),
    legalContent: document.getElementById("landing-legal-content"),
    landingIntegration: document.getElementById("landing-integration"),
  };
}

export function setBuilderHeaderStep(activeStep) {
  const headerSteps = document.querySelectorAll(".builder-header-step");
  headerSteps.forEach((el) => {
    const n = parseInt(el.getAttribute("data-step"), 10);
    el.classList.toggle("builder-header-step-active", n === activeStep);
    el.classList.remove("builder-header-step-locked");
    el.setAttribute("aria-current", n === activeStep ? "step" : null);
    el.disabled = false;
  });
  const builderHeader = document.getElementById("builder-header");
  if (builderHeader) {
    builderHeader.classList.toggle("builder-header-hide-login", activeStep >= 2);
  }
}

export function attachBuilderHeaderNavForCheckout() {
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

export function triggerRouteViewEnter(el) {
  if (!el) return;
  el.classList.remove("route-view-enter");
  el.offsetHeight;
  el.classList.add("route-view-enter");
  setTimeout(() => el.classList.remove("route-view-enter"), 480);
}

export function updateAuthNavLinks() {
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

export function navigateToBuilder(queryString) {
  history.pushState({ step: "builder" }, "", "/creer-ma-carte" + (queryString || ""));
  return initRouting();
}

export function navigateToLanding() {
  history.replaceState(null, "", "/");
  return initRouting();
}

async function loadPage(routeType) {
  const type = routeType || "landing";
  const mod = await import(`../pages/${type}.js`);
  return mod.default;
}

/**
 * Affiche la vue correspondant à la route et charge le module de la page (init).
 */
export async function initRouting() {
  const route = getRoute();
  const c = getContainers();

  document.body.classList.toggle("page-checkout", route.type === "checkout");
  document.body.classList.toggle("page-app", route.type === "app");
  document.body.classList.remove("page-builder");

  if (c.page404) c.page404.classList.add("hidden");

  const hideAll = () => {
    [c.landing, c.builderApp, c.fidelityApp, c.dashboardApp, c.authApp, c.appApp, c.offersApp, c.checkoutApp].forEach((el) => {
      if (el) el.classList.add("hidden");
    });
    if (c.builderHeader) c.builderHeader.classList.add("hidden");
  };

  if (route.type === "fidelity") {
    hideAll();
    if (c.fidelityApp) c.fidelityApp.classList.remove("hidden");
    const page = await loadPage("fidelity");
    await page.init(route);
    return null;
  }

  if (route.type === "app") {
    if (!getAuthToken()) {
      window.location.replace("/login?redirect=/app");
      return null;
    }
    hideAll();
    if (c.appApp) c.appApp.classList.remove("hidden");
    const page = await loadPage("app");
    await page.init(route);
    return null;
  }

  if (route.type === "auth") {
    hideAll();
    if (c.authApp) c.authApp.classList.remove("hidden");
    const page = await loadPage("auth");
    await page.init(route);
    return null;
  }

  if (route.type === "checkout") {
    hideAll();
    if (c.checkoutApp) {
      c.checkoutApp.classList.remove("hidden");
      c.checkoutApp.classList.add("checkout-with-builder-header");
      triggerRouteViewEnter(c.checkoutApp);
    }
    if (c.builderApp) c.builderApp.classList.remove("hidden");
    if (c.builderHeader) {
      c.builderHeader.classList.remove("hidden");
      c.builderHeader.setAttribute("aria-hidden", "false");
      setBuilderHeaderStep(3);
      attachBuilderHeaderNavForCheckout();
    }
    const page = await loadPage("checkout");
    await page.init(route);
    return null;
  }

  if (route.type === "dashboard") {
    hideAll();
    if (c.dashboardApp) c.dashboardApp.classList.remove("hidden");
    const page = await loadPage("dashboard");
    await page.init(route);
    return null;
  }

  if (route.type === "templates") {
    document.body.classList.add("page-builder");
    hideAll();
    if (c.landingTemplates && c.builderApp) {
      c.builderApp.appendChild(c.landingTemplates);
    }
    if (c.builderApp) {
      c.builderApp.classList.remove("hidden");
    }
    if (c.builderHeader) {
      c.builderHeader.classList.remove("hidden");
      c.builderHeader.setAttribute("aria-hidden", "false");
    }
    if (c.landingTemplates) {
      c.landingTemplates.classList.remove("hidden");
      triggerRouteViewEnter(c.landingTemplates);
    }
    updateAuthNavLinks();
    const page = await loadPage("templates");
    await page.init(route);
    return null;
  }

  if (route.type === "offers") {
    if (!getAuthToken()) {
      window.location.replace("/login?redirect=/choisir-offre");
      return null;
    }
    hideAll();
    if (c.offersApp) c.offersApp.classList.remove("hidden");
    const page = await loadPage("offers");
    await page.init(route);
    return null;
  }

  if (route.type === "legal" && c.landingMain && c.landingLegal && c.legalContent) {
    if (c.landing) c.landing.classList.remove("hidden");
    if (c.landingMain) c.landingMain.classList.add("hidden");
    if (c.landingTemplates) c.landingTemplates.classList.add("hidden");
    if (c.landingIntegration) c.landingIntegration.classList.add("hidden");
    c.landingLegal.classList.remove("hidden");
    const page = await loadPage("legal");
    await page.init(route);
    return null;
  }

  if (route.type === "integration") {
    if (c.landing) c.landing.classList.remove("hidden");
    c.landingMain?.classList.add("hidden");
    if (c.landingTemplates) c.landingTemplates.classList.add("hidden");
    if (c.landingLegal) c.landingLegal.classList.add("hidden");
    if (c.landingIntegration) {
      c.landingIntegration.classList.remove("hidden");
      const slugHint = document.getElementById("integration-page-slug-hint");
      const slug = new URLSearchParams(window.location.search).get("slug");
      if (slugHint && slug) {
        slugHint.textContent = "Commerce concerné : " + slug;
        slugHint.classList.remove("hidden");
      }
    }
    const page = await loadPage("integration");
    await page.init(route);
    return null;
  }

  if (route.type === "404") {
    hideAll();
    if (c.landingMain) c.landingMain?.classList.add("hidden");
    if (c.landingLegal) c.landingLegal?.classList.add("hidden");
    if (c.landingIntegration) c.landingIntegration?.classList.add("hidden");
    if (c.landingTemplates) c.landingTemplates?.classList.add("hidden");
    if (c.page404) {
      c.page404.classList.remove("hidden");
      c.page404.setAttribute("aria-hidden", "false");
    }
    const page = await loadPage("not-found");
    await page.init(route);
    return null;
  }

  document.body.classList.remove("page-builder");
  if (c.landing) {
    c.landing.classList.remove("hidden");
    c.landing.classList.remove("builder-visible");
  }
  const bannerMedia = document.getElementById("site-banner-media");
  const siteBanner = document.querySelector(".site-banner");
  const landingHeader = document.getElementById("landing-header");
  if (bannerMedia) bannerMedia?.classList.remove("hidden");
  if (siteBanner) siteBanner?.classList.remove("hidden");
  if (landingHeader) landingHeader?.classList.remove("hidden");
  if (c.builderHeader) {
    c.builderHeader.classList.add("hidden");
    c.builderHeader.setAttribute("aria-hidden", "true");
  }
  if (c.landingMain) {
    c.landingMain.classList.remove("hidden");
    triggerRouteViewEnter(c.landingMain);
  }
  if (c.landingLegal) c.landingLegal?.classList.add("hidden");
  if (c.landingIntegration) c.landingIntegration?.classList.add("hidden");
  if (c.landingTemplates) c.landingTemplates?.classList.add("hidden");
  updateAuthNavLinks();

  const page = await loadPage("landing");
  await page.init(route);
  return null;
}
