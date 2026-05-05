/** Intro dashboard : premier écran « Tout est prêt ! », puis révélation onboarding + scroll façon Shopify. */

const INTRO_STORAGE_KEY = "fidpass_dash_onboarding_reveal_v2";
const TRIAL_HERO_COLLAPSED_KEY = "fidpass_saas_trial_hero_collapsed_v1";

/** Mode test: force le parcours "première visite" à chaque refresh. */
export function resetSaasIntroForRefreshTesting() {
  try {
    localStorage.removeItem(INTRO_STORAGE_KEY);
    localStorage.removeItem(TRIAL_HERO_COLLAPSED_KEY);
  } catch (_) {}
}

export function isDashIntroRevealDone() {
  try {
    return localStorage.getItem(INTRO_STORAGE_KEY) === "1";
  } catch (_) {
    return true;
  }
}

export function markDashIntroRevealDone() {
  try {
    localStorage.setItem(INTRO_STORAGE_KEY, "1");
  } catch (_) {}
}

function isTrialHeroPermanentlyCollapsed() {
  try {
    return localStorage.getItem(TRIAL_HERO_COLLAPSED_KEY) === "1";
  } catch (_) {
    return false;
  }
}

function markTrialHeroPermanentlyCollapsed() {
  try {
    localStorage.setItem(TRIAL_HERO_COLLAPSED_KEY, "1");
  } catch (_) {}
}

/**
 * Après délai ou premier scroll descendant : une seule exécution.
 * Garde contre les appels doubles : utiliser depuis app avec un indicateur avant appel si besoin.
 * @param {() => void} onReveal
 */
export function scheduleDashboardOnboardingReveal(onReveal) {
  const notify = typeof onReveal === "function" ? onReveal : () => {};

  let done = false;
  const scrollOpts = { passive: true };

  const finish = () => {
    if (done) return;
    done = true;
    window.clearTimeout(timer);
    window.removeEventListener("scroll", onScroll, scrollOpts);
    markDashIntroRevealDone();
    try {
      notify();
    } catch (_) {}
  };

  const onScroll = () => {
    const y = window.scrollY || document.documentElement?.scrollTop || 0;
    if (y > 24) finish();
  };

  const timer = window.setTimeout(finish, 1650);

  window.addEventListener("scroll", onScroll, scrollOpts);
}

/** Idempotent — scroll SaaS compressant le bloc héros (réf. admin mobile). */
let scrollCollapseWired = false;

export function initSaasFrcScrollCollapse() {
  const root = document.getElementById("app-app");
  if (!root || scrollCollapseWired) return;
  scrollCollapseWired = true;
  const topbar = document.getElementById("app-desktop-topbar");
  const strip = document.getElementById("app-saas-frc-strip");
  const topbarTrialCountdown = document.getElementById("app-topbar-trial-countdown");
  const topbarTrialCtaWrap = document.getElementById("app-topbar-trial-cta-wrap");
  const cluster = document.getElementById("app-saas-frc-cluster");
  const hero = document.querySelector(".app-saas-frc-hero");
  const main = document.querySelector("#app-app .app-main");
  let permanentlyCollapsed = isTrialHeroPermanentlyCollapsed();

  const opts = { passive: true };
  let raf = 0;
  let forcedVisible = false;
  let baseY = -1;
  let wasDense = false;
  let userInteracted = permanentlyCollapsed;

  const markUserInteraction = () => {
    userInteracted = true;
  };

  const currentScrollY = () => {
    const mainY = main instanceof HTMLElement ? main.scrollTop : 0;
    if (mainY > 0) return mainY;
    return window.scrollY || document.documentElement?.scrollTop || 0;
  };

  const tick = () => {
    raf = 0;
    const y = currentScrollY();
    if (baseY < 0) baseY = y;
    const scrollDelta = Math.max(0, y - baseY);
    if (scrollDelta > 1) userInteracted = true;
    const userStartedScroll = userInteracted && scrollDelta > 1;
    const isMobile = typeof window !== "undefined" && window.matchMedia?.("(max-width: 900px)").matches;
    const collapseStart = isMobile ? 6 : 18;
    const collapseEnd = isMobile ? 122 : 44;
    const progressRaw = (scrollDelta - collapseStart) / Math.max(1, collapseEnd - collapseStart);
    const progress =
      userInteracted || permanentlyCollapsed ? Math.max(0, Math.min(1, progressRaw)) : 0;
    root.style.setProperty("--saas-frc-collapse-progress", progress.toFixed(3));

    let dense = (userInteracted && progress >= 1) || permanentlyCollapsed;
    if (permanentlyCollapsed) dense = true;
    root.classList.toggle("app-saas-frc-scroll-dense", dense);
    const trialChromeVisible = root.classList.contains("app-saas-trial-chrome-active");
    const showTopbarTrial = !isMobile && (permanentlyCollapsed || (trialChromeVisible && dense));
    topbarTrialCountdown?.classList.toggle("hidden", !showTopbarTrial);
    topbarTrialCtaWrap?.classList.toggle("hidden", !showTopbarTrial);

    // Desktop: ne jamais auto-déclencher un scroll programmatique.
    if (!isMobile && !wasDense && dense && main instanceof HTMLElement) {
      main.scrollTop = 0;
    }

    // Première vraie interaction de scroll vers le bas : on verrouille le mode compact
    // pour tous les prochains accès (même après rechargement).
    if (!permanentlyCollapsed && scrollDelta >= collapseStart) {
      markTrialHeroPermanentlyCollapsed();
      permanentlyCollapsed = true;
      dense = true;
      root.classList.add("app-saas-frc-scroll-dense");
    }

    if (hero) {
      if (dense) {
        hero.style.opacity = "0";
        hero.style.maxHeight = "0px";
        hero.style.transform = "translateY(-8px)";
        hero.style.pointerEvents = "none";
      } else {
        const heroOpacity = 1 - progress;
        hero.style.opacity = String(Math.max(0, heroOpacity));
        hero.style.maxHeight = `${Math.round(520 * (1 - progress))}px`;
        hero.style.transform = `translateY(${Math.round(-8 * progress)}px)`;
        hero.style.pointerEvents = heroOpacity < 0.12 ? "none" : "";
      }
    }

    // Bandeau trial: affichage uniquement une fois la transition terminée (pas de chevauchement).
    if (strip) {
      const stripShouldShow = dense;
      const shouldExposeAria = dense;
      if (stripShouldShow && strip.classList.contains("hidden")) {
        strip.classList.remove("hidden");
        strip.classList.add("app-saas-frc-strip--visible");
        strip.setAttribute("aria-hidden", shouldExposeAria ? "false" : "true");
      } else if (!stripShouldShow && forcedVisible && !permanentlyCollapsed) {
        strip.classList.add("hidden");
        strip.classList.remove("app-saas-frc-strip--visible");
        strip.setAttribute("aria-hidden", "true");
      }
      forcedVisible = stripShouldShow;
      strip.setAttribute("aria-hidden", shouldExposeAria ? "false" : "true");
      strip.style.pointerEvents = dense ? "" : "none";
      strip.style.removeProperty("opacity");
      strip.style.removeProperty("transform");
    }

    cluster?.classList.toggle("app-saas-frc-cluster--dense", dense);

    // Source unique de vérité : hauteur réelle du top affiché (évite tout contenu caché dessous).
    if (topbar instanceof HTMLElement) {
      const styles = window.getComputedStyle(root);
      const baseTopbarRaw = Number.parseInt(styles.getPropertyValue("--app-topbar-height"), 10);
      const baseTopbar = Number.isFinite(baseTopbarRaw) && baseTopbarRaw > 0 ? baseTopbarRaw : isMobile ? 56 : 52;
      if (dense) {
        // Hauteur fixe en mode compact pour éviter tout saut de page à l’apparition du strip.
        const denseExtra = isMobile ? 68 : 44;
        root.style.setProperty("--saas-frc-header-total-h", `${baseTopbar + denseExtra}px`);
      } else {
        const h = Math.max(0, Math.round(topbar.getBoundingClientRect().height));
        root.style.setProperty("--saas-frc-header-total-h", `${h}px`);
      }
    }

    wasDense = dense;
  };

  const onAnyScroll = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = window.requestAnimationFrame(tick);
  };

  window.addEventListener("scroll", onAnyScroll, opts);
  main?.addEventListener("scroll", onAnyScroll, opts);
  window.addEventListener("resize", onAnyScroll, opts);
  window.addEventListener("wheel", markUserInteraction, opts);
  main?.addEventListener("wheel", markUserInteraction, opts);
  window.addEventListener("touchmove", markUserInteraction, opts);
  main?.addEventListener("touchmove", markUserInteraction, opts);
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " " || e.key === "End") {
      markUserInteraction();
    }
  });

  // Recalcule immédiatement quand le shell SaaS change d'état (hidden/visible, dense, etc.).
  const watchedNodes = [root, topbar, cluster, strip].filter(Boolean);
  if (typeof MutationObserver !== "undefined" && watchedNodes.length > 0) {
    const observer = new MutationObserver(() => onAnyScroll());
    watchedNodes.forEach((node) => {
      observer.observe(node, {
        attributes: true,
        attributeFilter: ["class", "style", "aria-hidden"],
      });
    });
  }

  tick();
}
