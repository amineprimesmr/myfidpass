/**
 * Animation de notification iOS sur le mockup produit.
 * Slide down → pause → slide up. Déclenchée à chaque entrée en vue.
 * 3 messages variés pour illustrer les cas d'usage (boulangerie, fast food, institut).
 */

const SHOW_DELAY_MS = 500;
const VISIBLE_DURATION_MS = 4000;
const LOOP_INTERVAL_MS = 7500;

const NOTIF_MESSAGES = [
  { app: "Le Pain Doré", msg: "Les baguettes sortent du four !", logo: "/assets/icons/baguette.png" },
  { app: "Burger Plus", msg: "Offre du jour : -20% sur ton menu !", logo: "/assets/icons/burger.png" },
  { app: "Institut Beauté", msg: "Offre spéciale : -15% sur ta prochaine visite !", logo: "/assets/icons/giftgold.png" },
];

export function initLandingMockupNotif() {
  const notif = document.getElementById("landing-produit-notif");
  const section = document.getElementById("produit");
  const msgEl = notif?.querySelector(".landing-produit-notif-msg");
  const appEl = notif?.querySelector(".landing-produit-notif-app");
  const logoImg = notif?.querySelector(".landing-produit-notif-icon img");
  if (!notif || !section || !msgEl || !appEl || !logoImg) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) return;

  let loopTimer = null;
  let showDelayTimer = null;
  let hideTimer = null;
  let msgIndex = 0;

  function setContent() {
    const { app, msg, logo } = NOTIF_MESSAGES[msgIndex];
    appEl.textContent = app;
    msgEl.textContent = msg;
    logoImg.src = logo;
    logoImg.alt = app;
    msgIndex = (msgIndex + 1) % NOTIF_MESSAGES.length;
  }

  function showNotif() {
    setContent();
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
