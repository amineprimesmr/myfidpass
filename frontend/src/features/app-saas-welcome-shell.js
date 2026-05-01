/**
 * Shell visuel onboarding SaaS (héros + bandeau essai + feuille) — coordination affichage.
 */
import { buildStripeSaasPaymentUrl } from "../config.js";

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
  const trialChromeVisible = !!root?.classList.contains("app-saas-trial-chrome-active");
  const show = !!(emptyVisible || gateVisible || readyVisible || trialChromeVisible);

  if (cluster) {
    cluster.classList.toggle("hidden", !show);
    cluster.setAttribute("aria-hidden", show ? "false" : "true");
  }
  root?.classList.toggle("app-saas-welcome-active", show);
}

/**
 * @typedef {(iso: string) => string} FormatEndingHeadline
 */

/**
 * @param {{
 *   paid?: boolean;
 *   trialHero?: boolean;
 *   showSubscribeStrip?: boolean;
 *   trialEndRaw?: string | null;
 *   formatEndingHeadline?: FormatEndingHeadline;
 *   fallbackTitle?: string;
 *   fallbackSubtitle?: string;
 * }} opts
 */
const HERO_TITLE = "Votre essai a commencé";
const HERO_SUBTITLE = "3 jours gratuits, puis 1 €/mois pour continuer à créer";
const SUPPORT_TRIAL_HERO_HTML =
  'Nous sommes là si vous avez besoin de nous <a href="tel:+33805980685">0&nbsp;805&nbsp;98&nbsp;06&nbsp;85</a>';
const TRIAL_HERO_COLLAPSED_KEY = "fidpass_saas_trial_hero_collapsed_v1";

function isTrialHeroPermanentlyCollapsed() {
  try {
    return localStorage.getItem(TRIAL_HERO_COLLAPSED_KEY) === "1";
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

  const paid = !!opts.paid;
  const trialHero = !!opts.trialHero;
  const persistedCompact = isTrialHeroPermanentlyCollapsed();
  const showSubscribeStrip = persistedCompact || !!opts.showSubscribeStrip;
  root?.classList.toggle("app-saas-trial-chrome-active", !paid && (trialHero || showSubscribeStrip));

  cluster?.classList.toggle("app-saas-frc-cluster--paid", paid);
  cluster?.classList.toggle("app-saas-frc-cluster--unpaid", !paid);
  cluster?.classList.toggle("app-saas-frc-cluster--trial", trialHero);
  hero?.classList.toggle("app-saas-frc-hero--trial", trialHero);

  if (titleEl && subtitleEl) {
    titleEl.textContent = HERO_TITLE;
    subtitleEl.textContent = HERO_SUBTITLE;
  }

  supportEl?.classList.add("app-saas-frc-support--trial-hero");
  if (supportEl) {
    supportEl.innerHTML = SUPPORT_TRIAL_HERO_HTML;
  }

  if (cta) {
    cta.classList.toggle("hidden", paid);
    cta.setAttribute("aria-hidden", paid ? "true" : "false");
  }

  if (strip && stripStatus) {
    strip.classList.toggle("hidden", !showSubscribeStrip);
    strip.classList.toggle("app-saas-frc-strip--visible", showSubscribeStrip);
    strip.setAttribute("aria-hidden", showSubscribeStrip ? "false" : "true");

    if (showSubscribeStrip) {
      const raw = opts.trialEndRaw ?? null;
      const fmt = opts.formatEndingHeadline;
      if (raw && typeof fmt === "function") {
        stripStatus.textContent = fmt(raw);
      } else if (raw) {
        stripStatus.textContent = "L’essai se termine bientôt";
      } else {
        stripStatus.textContent = "L’essai se termine bientôt";
      }
    }
  }
}

/** Branche checkout Stripe SaaS — Payment Link (+ email prérempli si dispo). */
export function navigateToSaaSStripeCheckout(prefilledEmail) {
  window.location.href = buildStripeSaasPaymentUrl(prefilledEmail);
}

/** Écouteurs boutons / bandeaux subscribe — idempotent. */
export function wireSaaSWelcomeStripeHandlers(getUserEmail) {
  const emailFn = typeof getUserEmail === "function" ? getUserEmail : () => "";

  const ids = ["app-sidebar-trial-subscribe-btn", "app-saas-frc-cta"];
  ids.forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn || btn.dataset.fidpassStripeSubscribeWired === "1") return;
    btn.dataset.fidpassStripeSubscribeWired = "1";
    btn.addEventListener("click", () => {
      navigateToSaaSStripeCheckout(emailFn());
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
      navigateToSaaSStripeCheckout(emailFn());
    });
  }
}
