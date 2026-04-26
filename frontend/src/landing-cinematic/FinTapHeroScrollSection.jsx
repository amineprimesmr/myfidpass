import { useLayoutEffect, useRef } from "react";
import {
  computeFintapHeroPhoneStyle,
  fintapHeroScrollRatioFromViewport,
} from "./fintap-hero-scroll-lerp.js";
import "./fintap-hero-scroll.css";

const HERO_IPHONE_IMG = "/assets/iphone2.png";
const TRIGGER_PX = 400;

/**
 * Ancêtres qui reçoivent vraiment le scroll (page ou panneau scrollable).
 * @param {Element | null} from
 * @returns {(Window | Element)[]}
 */
function getScrollListenerRoots(from) {
  const out = [window];
  if (!from) return out;
  let p = from.parentElement;
  while (p) {
    const s = getComputedStyle(p);
    if (
      p.scrollHeight > p.clientHeight + 1 &&
      (s.overflowY === "auto" ||
        s.overflowY === "scroll" ||
        s.overflowY === "overlay")
    ) {
      out.push(p);
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
 */
export function FinTapHeroScrollSection() {
  const sectionRef = useRef(null);
  const phoneRef = useRef(null);
  const rafRef = useRef(0);
  const initTopRef = useRef(/** @type {number | null} */ (null));

  useLayoutEffect(() => {
    const section = sectionRef.current;
    const phone = phoneRef.current;
    if (!section || !phone) return;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );

    const run = () => {
      if (reduced.matches) {
        setPhoneStaticFront(phone);
        return;
      }
      if (initTopRef.current == null) {
        initTopRef.current = section.getBoundingClientRect().top;
      }
      const y = section.getBoundingClientRect().top;
      const ratio = fintapHeroScrollRatioFromViewport(
        initTopRef.current,
        y,
        TRIGGER_PX
      );
      setPhone3d(phone, computeFintapHeroPhoneStyle(ratio));
    };

    const raf = () => {
      rafRef.current = 0;
      run();
    };

    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(raf);
    };

    const onResize = () => {
      initTopRef.current = null;
      onScroll();
    };

    if (reduced.addEventListener) {
      reduced.addEventListener("change", onScroll);
    } else {
      reduced.addListener(onScroll);
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0] || !entries[0].isIntersecting) return;
        initTopRef.current = null;
        onScroll();
      },
      { root: null, rootMargin: "0px", threshold: 0.01 }
    );
    io.observe(section);

    const roots = getScrollListenerRoots(section);
    const scrollOpts = { passive: true, capture: true };
    for (const r of roots) {
      if (r === window) {
        window.addEventListener("scroll", onScroll, scrollOpts);
      } else {
        r.addEventListener("scroll", onScroll, scrollOpts);
      }
    }
    window.addEventListener("resize", onResize, { passive: true });

    run();

    return () => {
      if (reduced.removeEventListener) {
        reduced.removeEventListener("change", onScroll);
      } else {
        reduced.removeListener(onScroll);
      }
      io.disconnect();
      for (const r of roots) {
        if (r === window) {
          window.removeEventListener("scroll", onScroll, scrollOpts);
        } else {
          r.removeEventListener("scroll", onScroll, scrollOpts);
        }
      }
      window.removeEventListener("resize", onResize, { passive: true });
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
          LE FUTUR DE
          <br />
          LA FIDELISATION
        </h1>
        <p className="fintap-hero-iphone__lead">
          Transformez chaque visite en client fidelise, simplement.
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
          <div className="fintap-iphone-mockup__inner">
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
      </div>
    </section>
  );
}
