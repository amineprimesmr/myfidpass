/**
 * Animation de notification iOS sur le mockup produit.
 * Slide down → pause → slide up, déclenchée à l'entrée en vue.
 */

const SHOW_DELAY_MS = 800;
const VISIBLE_DURATION_MS = 4000;
const LOOP_INTERVAL_MS = 8000;

export function initLandingMockupNotif() {
  const notif = document.getElementById("landing-produit-notif");
  const section = document.getElementById("produit");
  if (!notif || !section) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) return;

  let loopTimer = null;
  let hasPlayed = false;

  function showNotif() {
    notif.classList.remove("is-exiting");
    notif.classList.add("is-visible");
    notif.setAttribute("aria-hidden", "false");
  }

  function hideNotif() {
    notif.classList.add("is-exiting");
    notif.classList.remove("is-visible");
    setTimeout(() => {
      notif.classList.remove("is-exiting");
      notif.setAttribute("aria-hidden", "true");
    }, 350);
  }

  function playCycle() {
    showNotif();
    setTimeout(() => {
      hideNotif();
    }, VISIBLE_DURATION_MS);
  }

  function scheduleLoop() {
    if (loopTimer) clearTimeout(loopTimer);
    loopTimer = setTimeout(() => {
      playCycle();
      scheduleLoop();
    }, LOOP_INTERVAL_MS);
  }

  const io = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (!entry?.isIntersecting) {
        if (loopTimer) {
          clearTimeout(loopTimer);
          loopTimer = null;
        }
        notif.classList.remove("is-visible", "is-exiting");
        notif.setAttribute("aria-hidden", "true");
        return;
      }

      if (!hasPlayed) {
        hasPlayed = true;
        setTimeout(playCycle, SHOW_DELAY_MS);
        scheduleLoop();
      }
    },
    { rootMargin: "0px 0px -80px 0px", threshold: 0.3 }
  );

  io.observe(section);
}
