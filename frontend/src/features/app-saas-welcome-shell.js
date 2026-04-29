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
  const show = !!(emptyVisible || gateVisible || readyVisible);

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
const SUPPORT_PAID_HTML =
  'Une question ? <a href="tel:+33805980685">0&nbsp;805&nbsp;98&nbsp;06&nbsp;85</a> · <a href="mailto:contact@myfidpass.fr">contact@myfidpass.fr</a>';
const SUPPORT_TRIAL_HERO_HTML =
  'Nous sommes là si vous avez besoin de nous <a href="tel:+33805980685">0&nbsp;805&nbsp;98&nbsp;06&nbsp;85</a>';
const SUPPORT_CONFIGURE_HTML = SUPPORT_PAID_HTML;

export function applySaaSFrcMessaging(opts) {
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
  const showSubscribeStrip = !!opts.showSubscribeStrip;

  cluster?.classList.toggle("app-saas-frc-cluster--paid", paid);
  cluster?.classList.toggle("app-saas-frc-cluster--unpaid", !paid);
  cluster?.classList.toggle("app-saas-frc-cluster--trial", trialHero);
  hero?.classList.toggle("app-saas-frc-hero--trial", trialHero);

  if (paid) {
    if (cta) {
      cta.classList.add("hidden");
      cta.setAttribute("aria-hidden", "true");
    }
    if (strip) {
      strip.classList.add("hidden");
      strip.classList.remove("app-saas-frc-strip--visible");
      strip.setAttribute("aria-hidden", "true");
    }
    if (titleEl && subtitleEl) {
      titleEl.textContent =
        opts.fallbackTitle != null ? opts.fallbackTitle : "Configurez votre espace Myfidpass";
      subtitleEl.textContent =
        opts.fallbackSubtitle != null && opts.fallbackSubtitle !== ""
          ? opts.fallbackSubtitle
          : "Indiquez votre commerce, puis créez votre carte et votre flyer QR.";
    }
    supportEl?.classList.remove("app-saas-frc-support--trial-hero");
    if (supportEl) supportEl.innerHTML = SUPPORT_PAID_HTML;
    return;
  }

  if (titleEl && subtitleEl) {
    if (trialHero) {
      titleEl.textContent = "Votre essai a commencé";
      subtitleEl.textContent = "3 jours gratuits, puis 1 €/mois pour continuer à créer.";
    } else {
      titleEl.textContent =
        opts.fallbackTitle != null ? opts.fallbackTitle : "Configurez votre espace Myfidpass";
      subtitleEl.textContent =
        opts.fallbackSubtitle != null && opts.fallbackSubtitle !== ""
          ? opts.fallbackSubtitle
          : "Indiquez votre commerce, puis créez votre carte et votre flyer QR.";
    }
  }

  supportEl?.classList.toggle("app-saas-frc-support--trial-hero", trialHero);
  if (supportEl) {
    supportEl.innerHTML = trialHero ? SUPPORT_TRIAL_HERO_HTML : SUPPORT_CONFIGURE_HTML;
  }

  if (cta) {
    cta.classList.toggle("hidden", !trialHero);
    cta.setAttribute("aria-hidden", trialHero ? "false" : "true");
  }

  if (strip && stripStatus) {
    strip.classList.toggle("hidden", !showSubscribeStrip);
    strip.classList.toggle("app-saas-frc-strip--visible", showSubscribeStrip);
    strip.setAttribute("aria-hidden", showSubscribeStrip ? "false" : "true");

    if (showSubscribeStrip) {
      const raw = opts.trialEndRaw ?? null;
      const fmt = opts.formatEndingHeadline;
      if (trialHero && raw && typeof fmt === "function") {
        stripStatus.textContent = fmt(raw);
      } else if (trialHero && raw) {
        stripStatus.textContent = "L’essai se termine bientôt";
      } else {
        stripStatus.textContent = "1er mois à 1 € — activez votre abonnement sans engagement.";
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
