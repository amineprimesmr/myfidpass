/**
 * Shell visuel onboarding SaaS (héros + bandeau abonnement + feuille) — coordination affichage.
 */
import { initRouting } from "../router/index.js";
import {
  buildPaymentPathWithAuthHandoff,
  warmStripeJs,
  isSaasPaymentEmbeddedInNativeApp,
  resolveSaasSubscriptionPaymentUrl,
} from "../config.js";

const PROMO_TITLE = "Profitez de l’offre Pro";
const PROMO_SUBTITLE = "Premier mois à 1 €, puis 49,99 €/mois sans engagement.";
const STRIP_STATUS = "1 € le 1er mois";

/** @returns {HTMLElement | null} */
function appShell() {
  return document.getElementById("app-app");
}

/**
 * Sync l'état « parcours premier accès façon Shopify » (héros + classe globale).
 * À appeler après affichage app-empty bienvenue, onboarding gate, ou navigation.
 */
export function syncSaaSWelcomeChrome() {
  const root = appShell();
  const cluster = document.getElementById("app-saas-frc-cluster");
  const empty = document.getElementById("app-empty");
  const welcome = document.getElementById("app-empty-welcome");
  const fatal = document.getElementById("app-empty-fatal");
  const gate = document.getElementById("app-dashboard-onboarding-gate");
  const readySplash = document.getElementById("app-dashboard-ready-splash");

  const emptyVisible =
    empty &&
    !empty.classList.contains("hidden") &&
    welcome &&
    !welcome.classList.contains("hidden") &&
    fatal &&
    fatal.classList.contains("hidden");

  const gateVisible = gate && !gate.classList.contains("hidden");
  const readyVisible = readySplash && !readySplash.classList.contains("hidden");
  const subscribeChromeVisible = !!root?.classList.contains("app-saas-trial-chrome-active");
  const show = !!(emptyVisible || gateVisible || readyVisible || subscribeChromeVisible);

  if (cluster) {
    cluster.classList.toggle("hidden", !show);
    cluster.setAttribute("aria-hidden", show ? "false" : "true");
  }
  root?.classList.toggle("app-saas-welcome-active", show);
}

/**
 * @param {{
 *   paid?: boolean;
 *   showSubscribeStrip?: boolean;
 *   hideSubscribeChrome?: boolean;
 *   promoTitle?: string;
 *   promoSubtitle?: string;
 * }} opts
 */
function subscribePromoSupportHtml() {
  const href = resolveSaasSubscriptionPaymentUrl();
  return `<span class="app-saas-frc-support-cta-wrap"><a href="${href}" id="app-saas-frc-support-cta" class="app-saas-frc-support-cta">Profiter de l’offre</a><span class="app-saas-frc-support-badge">-98%</span></span>`;
}

const SUBSCRIBE_HERO_COLLAPSED_KEY = "fidpass_saas_trial_hero_collapsed_v1";

function isSubscribeHeroPermanentlyCollapsed() {
  try {
    return localStorage.getItem(SUBSCRIBE_HERO_COLLAPSED_KEY) === "1";
  } catch (_) {
    return false;
  }
}

export function applySaaSFrcMessaging(opts) {
  const root = appShell();
  const cluster = document.getElementById("app-saas-frc-cluster");
  const hero = document.querySelector(".app-saas-frc-hero");
  const titleEl = document.getElementById("app-saas-frc-title");
  const subtitleEl = document.getElementById("app-saas-frc-subtitle");
  const cta = document.getElementById("app-saas-frc-cta");
  const strip = document.getElementById("app-saas-frc-strip");
  const stripStatus = document.getElementById("app-saas-frc-strip-status");
  const supportEl = document.getElementById("app-saas-frc-support");
  const topbarCountdownEl = document.getElementById("app-topbar-trial-countdown");
  const topbarCtaWrap = document.getElementById("app-topbar-trial-cta-wrap");

  const paid = !!opts.paid;
  const hideSubscribeChrome = !!opts.hideSubscribeChrome;
  const persistedCompact = isSubscribeHeroPermanentlyCollapsed();
  const showSubscribeStrip = persistedCompact || !!opts.showSubscribeStrip;

  root?.classList.toggle(
    "app-saas-trial-chrome-active",
    !paid && !hideSubscribeChrome
  );

  cluster?.classList.toggle("app-saas-frc-cluster--paid", paid);
  cluster?.classList.toggle("app-saas-frc-cluster--unpaid", !paid);
  cluster?.classList.remove("app-saas-frc-cluster--trial");
  hero?.classList.remove("app-saas-frc-hero--trial");

  if (titleEl) titleEl.textContent = opts.promoTitle || PROMO_TITLE;
  if (subtitleEl) subtitleEl.textContent = opts.promoSubtitle || PROMO_SUBTITLE;

  supportEl?.classList.add("app-saas-frc-support--trial-hero");
  if (supportEl) {
    supportEl.innerHTML = subscribePromoSupportHtml();
  }

  if (cta) {
    cta.classList.toggle("hidden", paid);
    cta.setAttribute("aria-hidden", paid ? "true" : "false");
  }

  topbarCountdownEl?.classList.add("hidden");
  topbarCtaWrap?.classList.toggle("hidden", hideSubscribeChrome || paid);

  if (stripStatus) stripStatus.textContent = STRIP_STATUS;

  if (strip) {
    strip.classList.toggle("hidden", !showSubscribeStrip);
    strip.classList.toggle("app-saas-frc-strip--visible", showSubscribeStrip);
    strip.setAttribute("aria-hidden", showSubscribeStrip ? "false" : "true");
  }
}

/** Page de paiement intégrée `/paiement` (1 € 1er mois via coupon API). */
export function navigateToSaaSPaymentPage() {
  warmStripeJs();
  let path = buildPaymentPathWithAuthHandoff("/paiement");
  if (isSaasPaymentEmbeddedInNativeApp()) {
    const hashIdx = path.indexOf("#");
    const pathWithoutHash = hashIdx >= 0 ? path.slice(0, hashIdx) : path;
    const hash = hashIdx >= 0 ? path.slice(hashIdx) : "";
    try {
      const u = new URL(pathWithoutHash || "/paiement", window.location.origin);
      u.searchParams.set("app_embed", "1");
      path = `${u.pathname}${u.search}${hash}`;
    } catch (_) {
      const sep = pathWithoutHash.includes("?") ? "&" : "?";
      path = `${pathWithoutHash}${sep}app_embed=1${hash}`;
    }
  }
  try {
    history.pushState({}, "", path);
  } catch (_) {
    window.location.href = path;
    return;
  }
  void initRouting().catch((err) => console.error("Routing error:", err));
}

/** Écouteurs boutons / bandeaux subscribe — idempotent. */
export function wireSaaSWelcomeStripeHandlers() {
  const ids = [
    "app-sidebar-trial-subscribe-btn",
    "app-saas-frc-cta",
    "app-saas-frc-support-cta",
    "app-saas-frc-strip-cta",
    "app-topbar-trial-cta",
    "app-settings-subscribe-promo-cta",
  ];
  ids.forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn || btn.dataset.fidpassStripeSubscribeWired === "1") return;
    btn.dataset.fidpassStripeSubscribeWired = "1";
    btn.addEventListener("click", (e) => {
      if (btn.tagName === "A") e.preventDefault();
      navigateToSaaSPaymentPage();
    });
  });

  const stripMini = document.getElementById("app-saas-frc-strip");
  if (stripMini && stripMini.dataset.fidpassStripeStripWired !== "1") {
    stripMini.dataset.fidpassStripeStripWired = "1";
    stripMini.addEventListener("click", (e) => {
      if (
        typeof HTMLElement !== "undefined" &&
        e.target instanceof HTMLElement &&
        e.target.closest("a[href^='tel:']")
      ) {
        return;
      }
      navigateToSaaSPaymentPage();
    });
  }
}
