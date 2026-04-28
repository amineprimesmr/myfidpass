import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  computeFintapHeroPhoneStyle,
  fintapHeroScrollRatio,
  getPageScrollY,
} from "./fintap-hero-scroll-lerp.js";
import "./fintap-hero-scroll.css";

const HERO_IPHONE_IMG = "/assets/iphone-custom.png";
const TRIGGER_PX = 400;

/**
 * Ancêtres qui reçoivent vraiment le scroll (page ou conteneur scrollable).
 * @param {Element | null} from
 * @returns {(Window | EventTarget)[]}
 */
function getScrollListenerRoots(from) {
  const out = [/** @type {Window} */ (window)];
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
  const loopRef = useRef(0);
  /** Scroll document au moment où l’effet = ratio 0 (fixé, sauf changement de largeur). */
  const scroll0Ref = useRef(/** @type {number | null} */ (null));
  const lastInnerWidthRef = useRef(/** @type {number | null} */ (null));
  const targetRatioRef = useRef(0);
  const currentRatioRef = useRef(0);
  const lastAppliedRatioRef = useRef(-1);
  const ctaVisibleRef = useRef(false);
  const [ctaVisible, setCtaVisible] = useState(false);
  const [shopQuery, setShopQuery] = useState("");
  const [shopPlaceId, setShopPlaceId] = useState("");
  const searchInputRef = useRef(null);
  const autocompleteInitRef = useRef(false);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    const phone = phoneRef.current;
    if (!section || !phone) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    const run = () => {
      if (reduced.matches) {
        setPhoneStaticFront(phone);
        if (!ctaVisibleRef.current) {
          ctaVisibleRef.current = true;
          setCtaVisible(true);
        }
        return;
      }
      if (scroll0Ref.current == null) {
        scroll0Ref.current = getPageScrollY();
      }
      const sy = getPageScrollY();
      targetRatioRef.current = fintapHeroScrollRatio(
        sy,
        scroll0Ref.current,
        TRIGGER_PX
      );
    };

    const paint = (ratio) => {
      if (Math.abs(ratio - lastAppliedRatioRef.current) < 0.0009) return;
      lastAppliedRatioRef.current = ratio;
      setPhone3d(phone, computeFintapHeroPhoneStyle(ratio));
    };

    const animate = () => {
      loopRef.current = 0;
      const target = targetRatioRef.current;
      const current = currentRatioRef.current;
      const next = current + (target - current) * 0.18;
      const nextCtaVisible = next >= 0.9995 || target >= 0.9995;
      if (nextCtaVisible !== ctaVisibleRef.current) {
        ctaVisibleRef.current = nextCtaVisible;
        setCtaVisible(nextCtaVisible);
      }
      if (Math.abs(target - next) < 0.0012) {
        currentRatioRef.current = target;
        paint(target);
        return;
      }
      currentRatioRef.current = next;
      paint(next);
      loopRef.current = requestAnimationFrame(animate);
    };

    const startLoopIfNeeded = () => {
      if (loopRef.current) return;
      loopRef.current = requestAnimationFrame(animate);
    };

    const tick = () => {
      rafRef.current = 0;
      run();
      startLoopIfNeeded();
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

    onScroll();

    return () => {
      if (reduced.removeEventListener) {
        reduced.removeEventListener("change", onScroll);
      } else {
        reduced.removeListener(onScroll);
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
      if (loopRef.current) cancelAnimationFrame(loopRef.current);
    };
  }, []);

  useEffect(() => {
    if (!ctaVisible) return;
    if (autocompleteInitRef.current) return;
    const inputEl = searchInputRef.current;
    if (!(inputEl instanceof HTMLInputElement)) return;

    let retryTimer = 0;
    const tryInit = (retriesLeft = 12) => {
      if (typeof window.google === "undefined" || !window.google.maps?.places) {
        if (retriesLeft > 0) {
          retryTimer = window.setTimeout(() => tryInit(retriesLeft - 1), 500);
        }
        return;
      }
      try {
        const frBounds = new window.google.maps.LatLngBounds(
          new window.google.maps.LatLng(41.0, -5.5),
          new window.google.maps.LatLng(51.2, 9.6)
        );
        const autocomplete = new window.google.maps.places.Autocomplete(inputEl, {
          types: ["establishment"],
          fields: ["name", "formatted_address", "geometry", "place_id"],
          bounds: frBounds,
          strictBounds: false,
        });
        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          const name = String(place?.name || "");
          setShopQuery(name);
          setShopPlaceId(String(place?.place_id || ""));
        });
        autocompleteInitRef.current = true;
      } catch (_) {}
    };

    tryInit();
    return () => {
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [ctaVisible]);

  const startHref = shopPlaceId
    ? `/creer-ma-carte?place_id=${encodeURIComponent(shopPlaceId)}&name=${encodeURIComponent(shopQuery)}`
    : "/creer-ma-carte";

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
      <div
        className={`fintap-hero-iphone__actions${ctaVisible ? " is-visible" : ""}`}
        aria-hidden={ctaVisible ? "false" : "true"}
      >
        <p className="fintap-hero-iphone__actions-title">
          Quel est le nom de
          <br />
          votre commerce ?
        </p>
        <label className="fintap-hero-iphone__search" aria-label="Nom de votre commerce">
          <span className="fintap-hero-iphone__search-icon" aria-hidden="true">
            <img src="/assets/logos/google.png" alt="" width="18" height="18" loading="lazy" />
          </span>
          <input
            ref={searchInputRef}
            type="text"
            className="fintap-hero-iphone__search-input"
            placeholder="Nom de votre commerce"
            autoComplete="organization"
            value={shopQuery}
            onChange={(e) => {
              setShopQuery(e.target.value);
              setShopPlaceId("");
            }}
          />
          <a
            href={startHref}
            className="fintap-hero-iphone__search-cta"
            aria-label="Commencer"
            title="Commencer"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path
                d="M4.5 10h9m0 0-3.5-3.5M13.5 10l-3.5 3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </label>
        <a href={startHref} className="fintap-hero-iphone__btn fintap-hero-iphone__btn--primary">
          Commencer
        </a>
      </div>
    </section>
  );
}
