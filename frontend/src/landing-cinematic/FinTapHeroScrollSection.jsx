import { useLayoutEffect, useRef } from "react";
import {
  computeFintapHeroPhoneStyle,
  fintapHeroScrollRatio,
  getPageScrollY,
} from "./fintap-hero-scroll-lerp.js";
import "./fintap-hero-scroll.css";

const HERO_IPHONE_IMG = "/assets/iphone2.png";
const TRIGGER_PX = 400;

/**
 * Ancêtres qui reçoivent vraiment le scroll (page ou conteneur scrollable).
 * @param {Element | null} from
 * @returns {(Window | EventTarget)[]}
 */
function getScrollListenerRoots(from) {
  const out = [/** @type {Window} */ (window)];
  if (typeof document !== "undefined")
    out.push(/** @type {EventTarget} */ (document));
  if (!from) return out;
  const seen = new Set(out);
  let p = from.parentElement;
  while (p) {
    const s = getComputedStyle(p);
    if (
      p.scrollHeight > p.clientHeight + 1 &&
      (s.overflowY === "auto" ||
        s.overflowY === "scroll" ||
        s.overflowY === "overlay")
    ) {
      if (!seen.has(p)) {
        out.push(p);
        seen.add(p);
      }
    }
    p = p.parentElement;
  }
  return out;
}

/**
 * @param {HTMLElement | null} phone
 * @param {object} s
 */
function setPhone3d(phone, s) {
  if (!phone) return;
  const tf = `translate3d(0, ${s.translateY}px, 0) rotateX(${s.rotateX}deg) rotateY(${s.rotateY}deg) rotateZ(${s.rotateZ}deg) scale(${s.scale})`;
  phone.style.transform = tf;
  phone.style.boxShadow = `0 ${s.shadowY}px ${s.shadowBlur}px rgba(0,0,0,${s.shadowAlpha})`;
  const scene = phone.parentElement;
  if (scene) scene.style.marginTop = `${s.topGap}px`;
}

/**
 * @param {HTMLElement | null} phone
 */
function setPhoneStaticFront(phone) {
  if (!phone) return;
  setPhone3d(phone, computeFintapHeroPhoneStyle(1));
}

/**
 * Parcours hero FinTap : contre-plongée → droit (scroll).
 * Ratio = f(scrollY) : stable sur iOS (pas d’invalider sur resize hauteur / barre d’adresse).
 */
export function FinTapHeroScrollSection() {
  const sectionRef = useRef(null);
  const phoneRef = useRef(null);
  const rafRef = useRef(0);
  /** Scroll document au moment où l’effet = ratio 0 (fixé, sauf changement de largeur). */
  const scroll0Ref = useRef(/** @type {number | null} */ (null));
  const lastInnerWidthRef = useRef(/** @type {number | null} */ (null));

  useLayoutEffect(() => {
    const section = sectionRef.current;
    const phone = phoneRef.current;
    if (!section || !phone) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    const run = () => {
      if (reduced.matches) {
        setPhoneStaticFront(phone);
        return;
      }
      if (scroll0Ref.current == null) {
        scroll0Ref.current = getPageScrollY();
      }
      const sy = getPageScrollY();
      const ratio = fintapHeroScrollRatio(
        sy,
        scroll0Ref.current,
        TRIGGER_PX
      );
      setPhone3d(phone, computeFintapHeroPhoneStyle(ratio));
    };

    const tick = () => {
      rafRef.current = 0;
      run();
    };

    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(tick);
    };

    /**
     * Ne pas réagir à la hauteur du viewport (iOS, barre d’adresse) : cela
     * provoquait des rebasculages aléatoires. Uniquement largeur = rotation
     * / breakpoint réel.
     */
    const onResizeWidthOnly = () => {
      const w = window.innerWidth;
      if (lastInnerWidthRef.current == null) {
        lastInnerWidthRef.current = w;
        return;
      }
      if (w === lastInnerWidthRef.current) return;
      lastInnerWidthRef.current = w;
      scroll0Ref.current = null;
      onScroll();
    };

    if (reduced.addEventListener) {
      reduced.addEventListener("change", onScroll);
    } else {
      reduced.addListener(onScroll);
    }

    lastInnerWidthRef.current = window.innerWidth;
    const roots = getScrollListenerRoots(section);
    const scrollOpts = { passive: true };
    for (const r of roots) {
      if (r === window) {
        window.addEventListener("scroll", onScroll, scrollOpts);
      } else {
        (/** @type {EventTarget} */ (r)).addEventListener("scroll", onScroll, scrollOpts);
      }
    }
    window.addEventListener("resize", onResizeWidthOnly, { passive: true });
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("scroll", onScroll, { passive: true });
    }

    onScroll();

    return () => {
      if (reduced.removeEventListener) {
        reduced.removeEventListener("change", onScroll);
      } else {
        reduced.removeListener(onScroll);
      }
      if (vv) {
        vv.removeEventListener("scroll", onScroll);
      }
      for (const r of roots) {
        if (r === window) {
          window.removeEventListener("scroll", onScroll, scrollOpts);
        } else {
          (/** @type {EventTarget} */ (r)).removeEventListener(
            "scroll",
            onScroll,
            scrollOpts
          );
        }
      }
      window.removeEventListener("resize", onResizeWidthOnly, {
        passive: true,
      });
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <section
      className="hero fintap-hero-iphone fintap-hero-iphone--scroll"
      ref={sectionRef}
    >
      <div className="hero__text fintap-hero-iphone__text">
        <h1 className="fintap-hero-iphone__h1">
          LA NOUVELLE EXPÉRIENCE
          <br />
          DE FIDÉLITÉ
        </h1>
        <p className="fintap-hero-iphone__lead">
          Une carte de fidélité simple à déployer, simple à utiliser, pensée
          pour les commerçants.
        </p>
      </div>
      <div
        className="hero__phone-wrapper fintap-hero-iphone__scene"
        id="phoneWrapper"
      >
        <div
          className="iphone-mockup fintap-iphone-mockup"
          id="iphoneMockup"
          ref={phoneRef}
        >
          <img
            className="fintap-iphone-mockup__img"
            src={HERO_IPHONE_IMG}
            width={3881}
            height={8399}
            alt=""
            loading="eager"
            decoding="async"
            draggable={false}
          />
        </div>
      </div>
    </section>
  );
}
