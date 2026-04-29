/** Intro dashboard : premier écran « Tout est prêt ! », puis révélation onboarding + scroll façon Shopify. */

const INTRO_STORAGE_KEY = "fidpass_dash_onboarding_reveal_v2";

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

  const opts = { passive: true };
  let raf = 0;

  const tick = () => {
    raf = 0;
    const y = window.scrollY || document.documentElement?.scrollTop || 0;
    root.classList.toggle("app-saas-frc-scroll-dense", y > 36);
  };

  window.addEventListener(
    "scroll",
    () => {
      if (raf) cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(tick);
    },
    opts
  );
  tick();
}
