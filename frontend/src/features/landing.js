/**
 * Animations et effets de la page d'accueil (révélation au scroll, hero, carousel, simulateur).
 * Référence : REFONTE-REGLES.md — un module par écran, max 400 lignes.
 */

function initLandingReveal() {
  const els = document.querySelectorAll("[data-reveal]");
  if (!els.length) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) {
    els.forEach((el) => el.classList.add("is-inview"));
    return;
  }

  if (typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined") {
    gsap.registerPlugin(ScrollTrigger);
    gsap.utils.toArray("[data-reveal]").forEach((section) => {
      gsap.set(section, { opacity: 1 });
      const children = section.querySelectorAll(".landing-section-title, .landing-section-subtitle, .landing-tag, .landing-product-card, .landing-steps-list > li, .landing-faq-list .landing-faq-item, .landing-cta-block .landing-btn, .landing-cta-block p, .landing-story-card, .landing-feature-card, .landing-compare-card, .landing-metrics-card, .landing-pricing-card, .landing-pricing-sidecard, .landing-testimonial-card, .landing-mobile-copy, .landing-mobile-preview, .landing-cta-final-v2 > *, .landing-how-step");
      const targets = children.length ? children : [section];
      gsap.set(targets, { opacity: 0, y: 32 });
      gsap.to(targets, {
        opacity: 1,
        y: 0,
        duration: 0.6,
        stagger: children.length ? 0.08 : 0,
        ease: "power3.out",
        scrollTrigger: { trigger: section, start: "top 85%", end: "top 50%", toggleActions: "play none none none" },
      });
    });
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("is-inview");
        });
      },
      { rootMargin: "0px 0px -60px 0px", threshold: 0.05 }
    );
    els.forEach((el) => io.observe(el));
  }
}

function initLandingFaq() {
  const items = document.querySelectorAll(".landing-faq-item");
  if (!items.length) return;

  items.forEach((item, index) => {
    const btn = item.querySelector(".landing-faq-question");
    const answer = item.querySelector(".landing-faq-answer");
    if (!btn || !answer) return;

    if (index === 0) {
      item.classList.add("is-open");
      btn.setAttribute("aria-expanded", "true");
      answer.classList.remove("hidden");
      return;
    }

    btn.addEventListener("click", () => {
      const open = btn.getAttribute("aria-expanded") === "true";
      items.forEach((entry) => {
        entry.classList.remove("is-open");
        const entryBtn = entry.querySelector(".landing-faq-question");
        const entryAnswer = entry.querySelector(".landing-faq-answer");
        entryBtn?.setAttribute("aria-expanded", "false");
        entryAnswer?.classList.add("hidden");
      });

      if (!open) {
        item.classList.add("is-open");
        btn.setAttribute("aria-expanded", "true");
        answer.classList.remove("hidden");
      }
    });
  });
}

function initLandingHeroAnim() {
  const hero = document.querySelector(".landing-hero");
  if (!hero) return;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const items = [
    hero.querySelector(".landing-hero-title"),
    hero.querySelector(".landing-hero-subtitle"),
    hero.querySelector(".landing-hero-form"),
    hero.querySelector(".landing-hero-cta-bar"),
    hero.querySelector(".landing-hero-benefits"),
    hero.querySelector(".landing-hero-stats"),
  ].filter(Boolean);

  if (prefersReducedMotion) {
    hero.classList.add("landing-hero-visible");
    return;
  }

  if (typeof gsap !== "undefined") {
    gsap.fromTo(
      items,
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, delay: 0.15, ease: "power3.out" }
    );
  } else {
    hero.classList.add("landing-hero-visible");
  }
}

function initLandingSimulator() {
  const btn = document.getElementById("landing-simulator-btn");
  const modal = document.getElementById("landing-simulator-modal");
  const backdrop = document.getElementById("landing-simulator-modal-backdrop");
  const closeBtn = document.getElementById("landing-simulator-modal-close");
  const inputClients = document.getElementById("landing-simulator-clients");
  const inputPanier = document.getElementById("landing-simulator-panier");
  const elAvis = document.getElementById("landing-simulator-avis");
  const elFidelises = document.getElementById("landing-simulator-fidelises");
  const elNouveaux = document.getElementById("landing-simulator-nouveaux");
  const elCa = document.getElementById("landing-simulator-ca");

  if (!btn || !modal) return;

  function openModal() {
    const clients = Math.max(1, parseInt(inputClients?.value || "20", 10) || 20);
    const panier = Math.max(5, parseFloat(inputPanier?.value || "15") || 15);
    const clientsMois = clients * 30;
    const avis = Math.round(clientsMois * 0.08);
    const fidelises = Math.round(clientsMois * 0.12);
    const nouveaux = Math.round(avis * 0.6);
    const ca = Math.round((fidelises + nouveaux) * panier * 0.4);

    if (elAvis) elAvis.textContent = `${avis} avis Google`;
    if (elFidelises) elFidelises.textContent = `${fidelises} clients / mois`;
    if (elNouveaux) elNouveaux.textContent = `${nouveaux} nouveaux clients`;
    if (elCa) elCa.textContent = `${ca} € / mois`;

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    if (typeof window.confetti === "function") {
      window.confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
    }
  }

  function closeModal() {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  btn.addEventListener("click", openModal);
  if (backdrop) backdrop.addEventListener("click", closeModal);
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
}

export function initLandingAnimations() {
  initLandingReveal();
  if (document.getElementById("landing-main")?.classList.contains("hidden") === false) {
    initLandingHeroAnim();
    initLandingFaq();
    import("./landing-gradient-carousel.js").then((m) => m.mountLandingGradientCarousel());
    initLandingSimulator();
    import("../helmet/index.jsx").then((m) => m.mountHelmet());
  }
}
