/**
 * Animation de notification iOS sur le mockup produit.
 * Slide down → pause → slide up. Déclenchée à chaque entrée en vue.
 * 3 messages variés pour illustrer les cas d'usage (boulangerie, fast food, institut).
 */

const SHOW_DELAY_MS = 500;
const VISIBLE_DURATION_MS = 4000;
const LOOP_INTERVAL_MS = 7500;

const NOTIF_MESSAGES = [
  { msg: "Les baguettes sortent du four !", time: "maintenant" },
  { msg: "Offre du jour : -20% sur ton menu !", time: "maintenant" },
  { msg: "Offre spéciale : -15% sur ta prochaine visite !", time: "maintenant" },
];

export function initLandingMockupNotif() {
  const notif = document.getElementById("landing-produit-notif");
  const section = document.getElementById("produit");
  const msgEl = notif?.querySelector(".landing-produit-notif-msg");
  if (!notif || !section || !msgEl) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) return;

  let loopTimer = null;
  let showDelayTimer = null;
  let hideTimer = null;
  let msgIndex = 0;

  function setMessage() {
    const { msg } = NOTIF_MESSAGES[msgIndex];
    msgEl.textContent = msg;
    msgIndex = (msgIndex + 1) % NOTIF_MESSAGES.length;
  }

  function showNotif() {
    setMessage();
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
    hideTimer = setTimeout(() => {
      hideTimer = null;
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

  function startAnimation() {
    if (loopTimer) return;
    showDelayTimer = setTimeout(() => {
      showDelayTimer = null;
      playCycle();
      scheduleLoop();
    }, SHOW_DELAY_MS);
  }

  function stopAnimation() {
    if (showDelayTimer) {
      clearTimeout(showDelayTimer);
      showDelayTimer = null;
    }
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (loopTimer) {
      clearTimeout(loopTimer);
      loopTimer = null;
    }
    notif.classList.remove("is-visible", "is-exiting");
    notif.setAttribute("aria-hidden", "true");
  }

  const io = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (!entry?.isIntersecting) {
        stopAnimation();
        return;
      }
      startAnimation();
    },
    { rootMargin: "0px 0px -80px 0px", threshold: 0.3 }
  );

  io.observe(section);
}
