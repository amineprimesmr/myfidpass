import { useEffect, useRef } from "react";
import { FinTapHeroIphoneContent } from "./FinTapHeroIphoneContent.jsx";
import {
  computeFintapHeroPhoneStyle,
  fintapHeroScrollRatio,
} from "./fintap-hero-scroll-lerp.js";
import "./fintap-hero-scroll.css";

const TRIGGER_PX = 400;

/**
 * @param {HTMLElement | null} phone
 * @param {object} s
 */
function setPhone3d(phone, s) {
  if (!phone) return;
  const tf = `translate3d(0, ${s.translateY}px, 0) rotateX(${s.rotateX}deg) rotateY(${s.rotateY}deg) rotateZ(${s.rotateZ}deg) scale(${s.scale})`;
  phone.style.transform = tf;
  phone.style.boxShadow = `0 ${s.shadowY}px ${s.shadowBlur}px rgba(0,0,0,${s.shadowAlpha})`;
}

/**
 * @param {HTMLElement | null} phone
 */
function setPhoneFlat(phone) {
  if (!phone) return;
  phone.style.removeProperty("transform");
  phone.style.removeProperty("box-shadow");
}

/**
 * Parcours hero FinTap : contre-plongée → droit (scroll) sur desktop.
 */
export function FinTapHeroScrollSection() {
  const sectionRef = useRef(null);
  const phoneRef = useRef(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const section = sectionRef.current;
    const phone = phoneRef.current;
    if (!section || !phone) return;

    const mql = window.matchMedia("(min-width: 768px)");

    const run = () => {
      if (!mql.matches) {
        setPhoneFlat(phone);
        return;
      }
      const top = section.getBoundingClientRect().top + window.scrollY;
      const ratio = fintapHeroScrollRatio(
        window.scrollY,
        top,
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

    const onResize = onScroll;

    const onMq = () => {
      if (mql.matches) onScroll();
      else setPhoneFlat(phone);
    };

    mql.addEventListener("change", onMq);

    const io = new IntersectionObserver(
      () => {
        onScroll();
      },
      { root: null, rootMargin: "80px 0px", threshold: [0, 0.01, 0.1] }
    );
    io.observe(section);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });

    onScroll();

    return () => {
      mql.removeEventListener("change", onMq);
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
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
          PAYMENTS AND TRANSFERS.
          <br />
          FAST AND SAFE.
        </h1>
        <p className="fintap-hero-iphone__lead">
          Local and international transfers, 1000+ types of payments, secure
          spending history — all in one app.
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
            <FinTapHeroIphoneContent />
          </div>
        </div>
      </div>
    </section>
  );
}
