/** Intro dashboard : premier écran « Tout est prêt ! », puis révélation onboarding + scroll façon Shopify. */

const INTRO_STORAGE_KEY = "fidpass_dash_onboarding_reveal_v2";
const TRIAL_HERO_COLLAPSED_KEY = "fidpass_saas_trial_hero_collapsed_v1";

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
  const cluster = document.getElementById("app-saas-frc-cluster");
  const main = document.querySelector("#app-app .app-main");
  let permanentlyCollapsed = isTrialHeroPermanentlyCollapsed();

  const opts = { passive: true };
  let raf = 0;
  let forcedVisible = false;

  const currentScrollY = () => {
    const mainY = main instanceof HTMLElement ? main.scrollTop : 0;
    if (mainY > 0) return mainY;
    return window.scrollY || document.documentElement?.scrollTop || 0;
  };

  const tick = () => {
    raf = 0;
    const y = currentScrollY();
    let dense = y > 36;
    if (permanentlyCollapsed) dense = true;
    root.classList.toggle("app-saas-frc-scroll-dense", dense);

    // Première descente : on verrouille le mode compact pour les prochains accès.
    if (dense && !permanentlyCollapsed) {
      markTrialHeroPermanentlyCollapsed();
      permanentlyCollapsed = true;
    }

    // Scroll compact: toujours afficher le bandeau quand on descend.
    if (strip) {
      if (dense && strip.classList.contains("hidden")) {
        strip.classList.remove("hidden");
        strip.classList.add("app-saas-frc-strip--visible");
        strip.setAttribute("aria-hidden", "false");
        forcedVisible = true;
      } else if (!dense && forcedVisible && !permanentlyCollapsed) {
        strip.classList.add("hidden");
        strip.classList.remove("app-saas-frc-strip--visible");
        strip.setAttribute("aria-hidden", "true");
        forcedVisible = false;
      }
    }

    cluster?.classList.toggle("app-saas-frc-cluster--dense", dense);

    // Source unique de vérité : hauteur réelle du top affiché (évite tout contenu caché dessous).
    if (topbar instanceof HTMLElement) {
      const h = Math.max(0, Math.round(topbar.getBoundingClientRect().height));
      root.style.setProperty("--saas-frc-header-total-h", `${h}px`);
    }
  };

  const onAnyScroll = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = window.requestAnimationFrame(tick);
  };

  window.addEventListener("scroll", onAnyScroll, opts);
  main?.addEventListener("scroll", onAnyScroll, opts);
  window.addEventListener("resize", onAnyScroll, opts);

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
