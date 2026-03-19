/**
 * Animations et effets de la page d'accueil (révélation au scroll, hero, carousel).
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
      const children = section.querySelectorAll(".landing-section-title, .landing-section-subtitle, .landing-tag, .landing-product-card, .landing-steps-list > li, .landing-faq-list .landing-faq-item, .landing-faq-v2-list .landing-faq-v2-item, .landing-cta-block .landing-btn, .landing-cta-block p, .landing-story-card, .landing-feature-card, .landing-compare-card, .landing-metrics-card, .landing-pricing-card, .landing-pricing-sidecard, .landing-testimonial-card, .landing-testimonial-v2-card, .landing-mobile-copy, .landing-mobile-preview, .landing-cta-final-v2 > *, .landing-how-step, .landing-produit-headline, .landing-produit-mockup-wrap, .landing-testimonials-v2-title, .landing-testimonials-v2-header .landing-faq-v2-cta-wrap, .landing-faq-v2-title, .landing-faq-v2-cta-wrap");
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

  items.forEach((item) => {
    item.classList.remove("is-open");
    const entryAnswer = item.querySelector(".landing-faq-answer");
    const entryBtn = item.querySelector(".landing-faq-question");
    if (entryBtn) entryBtn.setAttribute("aria-expanded", "false");
    if (entryAnswer) entryAnswer.setAttribute("aria-hidden", "true");
  });

  items.forEach((item) => {
    const btn = item.querySelector(".landing-faq-question");
    const answer = item.querySelector(".landing-faq-answer");
    if (!btn || !answer) return;

    btn.addEventListener("click", () => {
      const isOpen = item.classList.contains("is-open");
      items.forEach((entry) => {
        entry.classList.remove("is-open");
        const entryBtn = entry.querySelector(".landing-faq-question");
        const entryAnswer = entry.querySelector(".landing-faq-answer");
        entryBtn?.setAttribute("aria-expanded", "false");
        if (entryAnswer) entryAnswer.setAttribute("aria-hidden", "true");
      });

      if (!isOpen) {
        item.classList.add("is-open");
        btn.setAttribute("aria-expanded", "true");
        answer.removeAttribute("aria-hidden");
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
    hero.querySelector(".landing-hero-form"),
    hero.querySelector(".landing-hero-cta-bar"),
    hero.querySelector(".landing-hero-benefits"),
    hero.querySelector(".landing-hero-trustpilot-badge"),
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

export function initLandingAnimations() {
  initLandingReveal();
  if (document.getElementById("landing-main")?.classList.contains("hidden") === false) {
    initLandingHeroAnim();
    initLandingFaq();
    import("./landing-mockup-notif.js").then((m) => m.initLandingMockupNotif());
    import("./landing-gradient-carousel.js").then((m) => m.mountLandingGradientCarousel());
    import("../helmet/index.jsx").then((m) => m.mountHelmet());
  }
}
