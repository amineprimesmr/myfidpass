/**
 * Routeur léger : getRoute, show/hide des vues, chargement dynamique des pages.
 * Référence : REFONTE-REGLES.md — un module par écran, import() dynamique.
 */
import { getAuthToken, buildStripeSaasPaymentUrl } from "../config.js";
import { ensureLandingLiquidNav } from "../features/landing-liquid-nav-bootstrap.js";
import { runLiquidGlassMenuCleanupLanding } from "../features/kube-liquid-glass/liquid-glass-menu-dispose.js";
import { applyRouteSeoHead } from "../features/seo-head.js";
import { matchSeoContentRoute } from "../features/seo-route-match.js";
import { syncSmartAppBanner } from "../smart-app-banner.js";
import { FINTAP_SCROLL_TO_COMMERCE_EVENT } from "../landing-cinematic/fintap-hero-scroll-lerp.js";

export function getRoute() {
  let path = window.location.pathname.replace(/\/$/, "");
  const params = new URLSearchParams(window.location.search);
  const legacyJeux = path.match(/^\/fidelity\/([^/]+)\/jeu$/);
  if (legacyJeux) {
    const slug = legacyJeux[1];
    path = `/fidelity/${slug}`;
    if (typeof history !== "undefined" && history.replaceState) {
      history.replaceState(null, "", path + window.location.search + window.location.hash);
    }
  }
  const match = path.match(/^\/fidelity\/([^/]+)$/);
  if (match) return { type: "fidelity", slug: match[1] };
  if (path === "/dashboard") return { type: "dashboard" };
  if (path === "/app") return { type: "app" };
  if (path === "/login") return { type: "legacy-auth-redirect", tab: "login" };
  if (path === "/register") return { type: "legacy-auth-redirect", tab: "register" };
  if (path === "/creer-ma-carte") return { type: "creation-carte" };
  if (path === "/abonnement" || path === "/choisir-offre") return { type: "legacy-subscription-redirect" };
  if (
    path === "/paiement" ||
    path === "/offre-pro" ||
    path === "/abonnement-pro" ||
    path === "/plan-pro" ||
    path === "/paiement/checkout" ||
    path === "/offre-pro/checkout" ||
    path === "/abonnement-pro/checkout" ||
    path === "/plan-pro/checkout"
  ) {
    return { type: "saas-pro-payment" };
  }
  if (path === "/checkout" || path === "/creation-carte") return { type: "redirect-stripe" };
  if (path === "/mentions-legales") return { type: "legal", page: "mentions" };
  if (path === "/politique-confidentialite") return { type: "legal", page: "politique" };
  if (path === "/cgu") return { type: "legal", page: "cgu" };
  if (path === "/cgv") return { type: "legal", page: "cgv" };
  if (path === "/cookies") return { type: "legal", page: "cookies" };
  if (path === "/supprimer-compte") return { type: "legal", page: "delete-account" };
  const seoRoute = matchSeoContentRoute(path);
  if (seoRoute) return seoRoute;
  if (path === "") {
    const openOnboarding = ["1", "true", "yes"].includes(
      String(params.get("openOnboarding") || "").toLowerCase()
    );
    return { type: "landing", openOnboarding };
  }
  return { type: "404" };
}

function getContainers() {
  return {
    landing: document.getElementById("landing"),
    builderApp: document.getElementById("builder-app"),
    fidelityApp: document.getElementById("fidelity-app"),
    dashboardApp: document.getElementById("dashboard-app"),
    appApp: document.getElementById("app-app"),
    saasProPayment: document.getElementById("saas-pro-payment-app"),
    builderHeader: document.getElementById("builder-header"),
    page404: document.getElementById("page-404"),
    landingMain: document.getElementById("landing-main"),
    landingLegal: document.getElementById("landing-legal"),
    legalContent: document.getElementById("landing-legal-content"),
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
  const landingHref = isLoggedIn ? "/app" : "/creer-ma-carte?mode=login&redirect=/app";
  document.querySelectorAll(".landing-nav-login-link, .landing-menu-drawer-login").forEach((a) => {
    a.textContent = label;
    a.href = landingHref;
  });
  const builderLogin = document.getElementById("builder-header-login");
  if (builderLogin) {
    builderLogin.textContent = label;
    builderLogin.href = isLoggedIn ? "/app" : "/creer-ma-carte?mode=login&redirect=/creer-ma-carte";
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

/** FAB WhatsApp : visible seulement sur l’accueil `/` avec #landing-main affiché. */
function syncWhatsappFabVisibility() {
  const pathname = window.location.pathname.replace(/\/$/, "") || "";
  const routeNow = getRoute();
  const landing = document.getElementById("landing");
  const landingMain = document.getElementById("landing-main");
  const show =
    routeNow.type === "landing" &&
    pathname === "" &&
    landing &&
    !landing.classList.contains("hidden") &&
    landingMain &&
    !landingMain.classList.contains("hidden");
  document.body.classList.toggle("page-home", show);
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
  document.body.classList.toggle(
    "page-landing-subpage",
    route.type === "legal" || route.type === "seo-content"
  );
  applyRouteSeoHead(route);
  syncSmartAppBanner();
  if (route.type !== "landing") {
    runLiquidGlassMenuCleanupLanding();
  }
  const c = getContainers();

  document.body.classList.toggle("page-app", route.type === "app");
  document.body.classList.remove("page-builder");
  document.documentElement.classList.toggle("fidpass-fidelity-route", route.type === "fidelity");
  document.body.classList.toggle("fidpass-fidelity-route", route.type === "fidelity");
  document.body.classList.toggle("page-saas-pro-payment", route.type === "saas-pro-payment");

  if (c.page404) c.page404.classList.add("hidden");

  const hideAll = () => {
    [c.landing, c.builderApp, c.fidelityApp, c.dashboardApp, c.appApp, c.saasProPayment].forEach((el) => {
      if (el) el.classList.add("hidden");
    });
    if (c.saasProPayment) c.saasProPayment.setAttribute("aria-hidden", "true");
    if (c.builderHeader) c.builderHeader.classList.add("hidden");
  };

  if (route.type === "saas-pro-payment") {
    hideAll();
    if (c.saasProPayment) c.saasProPayment.classList.remove("hidden");
    const page = await loadPage("saas-pro-payment");
    await page.init(route);
    syncWhatsappFabVisibility();
    return null;
  }

  if (route.type === "fidelity") {
    hideAll();
    if (c.fidelityApp) c.fidelityApp.classList.remove("hidden");
    const page = await loadPage("fidelity");
    await page.init(route);
    syncWhatsappFabVisibility();
    return null;
  }

  if (route.type === "app") {
    if (!getAuthToken()) {
      const current = new URL(window.location.href);
      const fromLandingOnboarding =
        String(current.searchParams.get("fromLandingOnboarding") || "").trim() === "1";
      if (fromLandingOnboarding) {
        hideAll();
        if (c.appApp) c.appApp.classList.remove("hidden");
        const page = await loadPage("app");
        await page.init(route);
        syncWhatsappFabVisibility();
        return null;
      }
      const redirectTarget = fromLandingOnboarding ? "/app?fromLandingOnboarding=1" : "/app";
      window.location.replace(
        `/creer-ma-carte?mode=login&redirect=${encodeURIComponent(redirectTarget)}`
      );
      return null;
    }
    hideAll();
    if (c.appApp) c.appApp.classList.remove("hidden");
    const page = await loadPage("app");
    await page.init(route);
    syncWhatsappFabVisibility();
    return null;
  }

  if (route.type === "legacy-auth-redirect") {
    const from = new URLSearchParams(window.location.search);
    const to = new URLSearchParams();
    to.set("mode", route.tab === "register" ? "register" : "login");
    const redirect = String(from.get("redirect") || "").trim();
    if (redirect) to.set("redirect", redirect);
    const email = String(from.get("email") || "").trim();
    if (email) to.set("email", email);
    const name = String(from.get("name") || "").trim();
    if (name) to.set("name", name);
    const placeId = String(from.get("place_id") || "").trim();
    if (placeId) to.set("place_id", placeId);
    const session = String(from.get("session") || "").trim();
    if (session) to.set("session", session);
    const target = `/creer-ma-carte?${to.toString()}`;
    window.location.replace(target);
    return null;
  }

  if (route.type === "legacy-subscription-redirect") {
    window.location.replace("/app");
    return null;
  }

  if (route.type === "redirect-stripe") {
    window.location.href = buildStripeSaasPaymentUrl();
    return null;
  }

  if (route.type === "dashboard") {
    hideAll();
    if (c.dashboardApp) c.dashboardApp.classList.remove("hidden");
    const page = await loadPage("dashboard");
    await page.init(route);
    syncWhatsappFabVisibility();
    return null;
  }

  if (route.type === "creation-carte") {
    hideAll();
    document.body.classList.add("page-builder");
    if (c.builderApp) c.builderApp.classList.remove("hidden");
    const page = await loadPage("creation-carte");
    await page.init(route);
    syncWhatsappFabVisibility();
    return null;
  }


  if (route.type === "legal" && c.landingMain && c.landingLegal && c.legalContent) {
    if (c.landing) c.landing.classList.remove("hidden");
    if (c.landingMain) c.landingMain.classList.add("hidden");
    c.landingLegal.classList.remove("hidden");
    const page = await loadPage("legal");
    await page.init(route);
    ensureLandingLiquidNav();
    updateAuthNavLinks();
    syncWhatsappFabVisibility();
    return null;
  }

  if (route.type === "seo-content" && c.landingMain && c.landingLegal && c.legalContent) {
    if (c.landing) c.landing.classList.remove("hidden");
    if (c.landingMain) c.landingMain.classList.add("hidden");
    c.landingLegal.classList.remove("hidden");
    const page = await loadPage("seo-content");
    await page.init(route);
    ensureLandingLiquidNav();
    updateAuthNavLinks();
    syncWhatsappFabVisibility();
    return null;
  }

  if (route.type === "404") {
    hideAll();
    if (c.landingMain) c.landingMain?.classList.add("hidden");
    if (c.landingLegal) c.landingLegal?.classList.add("hidden");
    if (c.page404) {
      c.page404.classList.remove("hidden");
      c.page404.setAttribute("aria-hidden", "false");
    }
    const page = await loadPage("not-found");
    await page.init(route);
    syncWhatsappFabVisibility();
    return null;
  }

  /* Anciens passes : verso pointait vers /?ref=pass&b=slug — renvoyer vers la vraie page client. */
  {
    const sp = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    if (sp.get("ref") === "pass") {
      const b = (sp.get("b") || "").trim();
      if (b && !/[/?#]/.test(b) && typeof window !== "undefined" && window.location?.origin) {
        window.location.replace(`${window.location.origin}/fidelity/${encodeURIComponent(b)}`);
        return null;
      }
    }
  }

  document.body.classList.remove("page-builder");
  if (c.builderApp) c.builderApp.classList.add("hidden");
  if (c.landing) {
    c.landing.classList.remove("hidden");
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
  updateAuthNavLinks();

  const page = await loadPage("landing");
  await page.init(route);
  if (route.openOnboarding) {
    let openOnboardingDone = false;
    const runOpenOnboarding = () => {
      if (openOnboardingDone) return;
      const fin = document.getElementById("fintap-commerce-onboarding");
      if (fin) {
        openOnboardingDone = true;
        window.dispatchEvent(new CustomEvent(FINTAP_SCROLL_TO_COMMERCE_EVENT));
        return;
      }
      const input = document.getElementById("landing-etablissement");
      if (!(input instanceof HTMLElement)) return;
      openOnboardingDone = true;
      const wrap = input.closest(".landing-hero-input-wrap");
      input.scrollIntoView({ behavior: "smooth", block: "center" });
      input.focus();
      if (wrap instanceof HTMLElement) {
        wrap.classList.remove("is-guided-focus");
        void wrap.offsetWidth;
        wrap.classList.add("is-guided-focus");
        window.setTimeout(() => {
          wrap.classList.remove("is-guided-focus");
        }, 1400);
      }
    };
    window.setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(runOpenOnboarding);
      });
    }, 0);
    window.setTimeout(() => {
      if (!openOnboardingDone) runOpenOnboarding();
    }, 280);
  }
  syncWhatsappFabVisibility();
  return null;
}
