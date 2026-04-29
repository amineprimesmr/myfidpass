/**
 * Shell visuel onboarding SaaS (héros + bandeau essai + feuille) — coordination affichage.
 */
import { buildStripeSaasPaymentUrl } from "../config.js";

/** @returns {HTMLElement | null} */
function appShell() {
  return document.getElementById("app-app");
}

/**
 * Sync l’état « parcours premier accès façon Shopify » (héros + classe globale).
 * À appeler après affichage app-empty bienvenue, onboarding gate, ou navigation.
 */
export function syncSaaSWelcomeChrome() {
  const root = appShell();
  const cluster = document.getElementById("app-saas-frc-cluster");
  const empty = document.getElementById("app-empty");
  const welcome = document.getElementById("app-empty-welcome");
  const fatal = document.getElementById("app-empty-fatal");
  const gate = document.getElementById("app-dashboard-onboarding-gate");

  const emptyVisible =
    empty &&
    !empty.classList.contains("hidden") &&
    welcome &&
    !welcome.classList.contains("hidden") &&
    fatal &&
    fatal.classList.contains("hidden");

  const gateVisible = gate && !gate.classList.contains("hidden");
  const show = !!(emptyVisible || gateVisible);

  if (cluster) {
    cluster.classList.toggle("hidden", !show);
    cluster.setAttribute("aria-hidden", show ? "false" : "true");
  }
  root?.classList.toggle("app-saas-welcome-active", show);
}

/** @typedef {{ trialStripeVisible: boolean, trialEndRaw?: string|null, formatEndingHeadline: (iso: string)=>string }} SaaSFrcMsgOpts */

/**
 * Copie marketing héros + bandeau (réutilise les mêmes règles que la carte essai sidebar).
 * @param {SaaSFrcMsgOpts & { fallbackTitle?: string, fallbackSubtitle?: string }} opts
 */
export function applySaaSFrcMessaging(opts) {
  const cluster = document.getElementById("app-saas-frc-cluster");
  const hero = document.querySelector(".app-saas-frc-hero");
  const titleEl = document.getElementById("app-saas-frc-title");
  const subtitleEl = document.getElementById("app-saas-frc-subtitle");
  const cta = document.getElementById("app-saas-frc-cta");
  const strip = document.getElementById("app-saas-frc-strip");
  const stripStatus = document.getElementById("app-saas-frc-strip-status");

  const trialStripeVisible = !!opts.trialStripeVisible;
  const raw = opts.trialEndRaw || "";

  cluster?.classList.toggle("app-saas-frc-cluster--trial", trialStripeVisible);
  hero?.classList.toggle("app-saas-frc-hero--trial", trialStripeVisible);

  if (titleEl && subtitleEl) {
    if (trialStripeVisible) {
      titleEl.textContent = "Votre essai a commencé";
      subtitleEl.textContent = "3 jours gratuits, puis 1 €/mois pour continuer.";
    } else {
      titleEl.textContent =
        opts.fallbackTitle != null ? opts.fallbackTitle : "Configurez votre espace Myfidpass";
      subtitleEl.textContent =
        opts.fallbackSubtitle != null && opts.fallbackSubtitle !== ""
          ? opts.fallbackSubtitle
          : "Indiquez votre commerce, puis créez votre carte et votre flyer QR.";
    }
  }

  if (cta) {
    cta.classList.toggle("hidden", !trialStripeVisible);
    cta.setAttribute("aria-hidden", trialStripeVisible ? "false" : "true");
  }

  if (strip && stripStatus) {
    strip.classList.toggle("hidden", !trialStripeVisible);
    strip.classList.toggle("app-saas-frc-strip--visible", trialStripeVisible);
    strip.setAttribute("aria-hidden", trialStripeVisible ? "false" : "true");
    if (trialStripeVisible && typeof opts.formatEndingHeadline === "function" && raw) {
      stripStatus.textContent = opts.formatEndingHeadline(raw);
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
