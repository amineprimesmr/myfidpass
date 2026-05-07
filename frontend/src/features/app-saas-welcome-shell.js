/**
 * Shell visuel onboarding SaaS (héros + bandeau essai + feuille) — coordination affichage.
 */
import { initRouting } from "../router/index.js";
import { buildPaymentPathWithAuthHandoff } from "../config.js";

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
const SUPPORT_TRIAL_HERO_HTML =
  '<span class="app-saas-frc-support-cta-wrap"><a href="/paiement" id="app-saas-frc-support-cta" class="app-saas-frc-support-cta">Profiter de l’offre</a><span class="app-saas-frc-support-badge">-98%</span></span>';
const TRIAL_HERO_COLLAPSED_KEY = "fidpass_saas_trial_hero_collapsed_v1";
let heroCountdownTimer = 0;

function clearHeroCountdownTimer() {
  if (heroCountdownTimer) {
    window.clearInterval(heroCountdownTimer);
    heroCountdownTimer = 0;
  }
}

function parseTrialEndMs(raw) {
  const parsed = raw ? Date.parse(raw) : NaN;
  if (Number.isFinite(parsed)) return parsed;
  // Fallback visuel demandé : compte à rebours 3 jours.
  return Date.now() + 3 * 24 * 60 * 60 * 1000;
}

function renderCountdownHTML(totalMs) {
  const totalSec = Math.max(0, Math.floor(totalMs / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const p2 = (n) => String(n).padStart(2, "0");
  return `
    <span class="app-saas-frc-countdown" aria-label="Compte à rebours de l'offre en cours">
      <span class="app-saas-frc-countdown__item"><strong>${days}</strong><em>jours</em></span>
      <span class="app-saas-frc-countdown__sep">:</span>
      <span class="app-saas-frc-countdown__item"><strong>${p2(hours)}</strong><em>heures</em></span>
      <span class="app-saas-frc-countdown__sep">:</span>
      <span class="app-saas-frc-countdown__item"><strong>${p2(minutes)}</strong><em>min</em></span>
      <span class="app-saas-frc-countdown__sep">:</span>
      <span class="app-saas-frc-countdown__item"><strong>${p2(seconds)}</strong><em>sec</em></span>
    </span>
  `;
}

function renderCompactCountdownText(totalMs) {
  const totalSec = Math.max(0, Math.floor(totalMs / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const p2 = (n) => String(n).padStart(2, "0");
  return `${days}j ${p2(hours)}h ${p2(minutes)}m`;
}

function renderTopbarCountdownHTML(totalMs) {
  const totalSec = Math.max(0, Math.floor(totalMs / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const p2 = (n) => String(n).padStart(2, "0");
  return `
    <span class="app-topbar-trial-countdown-grid" aria-hidden="true">
      <span class="app-topbar-trial-countdown-cell"><strong>${days}</strong><em>jours</em></span>
      <span class="app-topbar-trial-countdown-cell"><strong>${p2(hours)}</strong><em>heures</em></span>
      <span class="app-topbar-trial-countdown-cell"><strong>${p2(minutes)}</strong><em>min</em></span>
      <span class="app-topbar-trial-countdown-cell"><strong>${p2(seconds)}</strong><em>sec</em></span>
    </span>
  `;
}

function setupHeroCountdown(subtitleEl, trialEndRaw) {
  if (!subtitleEl) return;
  clearHeroCountdownTimer();
  const stripStatusEl = document.getElementById("app-saas-frc-strip-status");
  const topbarCountdownEl = document.getElementById("app-topbar-trial-countdown");
  const endMs = parseTrialEndMs(trialEndRaw);
  const tick = () => {
    const left = Math.max(0, endMs - Date.now());
    subtitleEl.innerHTML = renderCountdownHTML(left);
    const compact = renderCompactCountdownText(left);
    if (stripStatusEl) stripStatusEl.textContent = compact;
    if (topbarCountdownEl) {
      topbarCountdownEl.innerHTML = renderTopbarCountdownHTML(left);
      topbarCountdownEl.setAttribute("aria-label", compact);
    }
    if (left <= 0) clearHeroCountdownTimer();
  };
  tick();
  heroCountdownTimer = window.setInterval(tick, 1000);
}

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
  const topbarCountdownEl = document.getElementById("app-topbar-trial-countdown");
  const topbarCtaWrap = document.getElementById("app-topbar-trial-cta-wrap");

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
    setupHeroCountdown(subtitleEl, opts.trialEndRaw ?? null);
  }

  supportEl?.classList.add("app-saas-frc-support--trial-hero");
  if (supportEl) {
    supportEl.innerHTML = SUPPORT_TRIAL_HERO_HTML;
  }

  if (cta) {
    cta.classList.toggle("hidden", paid);
    cta.setAttribute("aria-hidden", paid ? "true" : "false");
  }

  const showTopbarTrialUi = !paid;
  topbarCountdownEl?.classList.toggle("hidden", !showTopbarTrialUi);
  topbarCtaWrap?.classList.toggle("hidden", !showTopbarTrialUi);

  if (strip && stripStatus) {
    strip.classList.toggle("hidden", !showSubscribeStrip);
    strip.classList.toggle("app-saas-frc-strip--visible", showSubscribeStrip);
    strip.setAttribute("aria-hidden", showSubscribeStrip ? "false" : "true");
  }
}

/** Page de paiement / offre Pro (SPA, route `/paiement`). */
export function navigateToSaaSPaymentPage() {
  const path = buildPaymentPathWithAuthHandoff("/paiement");
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
  const ids = ["app-sidebar-trial-subscribe-btn", "app-saas-frc-cta", "app-saas-frc-support-cta", "app-saas-frc-strip-cta", "app-topbar-trial-cta"];
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
