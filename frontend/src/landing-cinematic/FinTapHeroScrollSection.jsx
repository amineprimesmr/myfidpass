import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  computeFintapHeroPhoneStyle,
  fintapHeroScrollRatio,
  getPageScrollY,
  lerp,
} from "./fintap-hero-scroll-lerp.js";
import { API_BASE } from "../config.js";
import "./fintap-hero-scroll.css";

const HERO_IPHONE_IMG = "/assets/iphone-custom-clean.png";
const TRIGGER_PX = 400;
const DESKTOP_SCROLL_BRAKE_START_RATIO = 0.62;
const DESKTOP_SCROLL_BRAKE_FACTOR = 0.45;

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
  const tx = Number.isFinite(s.translateX) ? s.translateX : 0;
  const tf = `translate3d(${tx}px, ${s.translateY}px, 0) rotateX(${s.rotateX}deg) rotateY(${s.rotateY}deg) rotateZ(${s.rotateZ}deg) scale(${s.scale})`;
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
  const ctaHoldUntilRef = useRef(0);
  const [ctaVisible, setCtaVisible] = useState(false);
  const [shopQuery, setShopQuery] = useState("");
  const [shopPlaceId, setShopPlaceId] = useState("");
  const [placePredictions, setPlacePredictions] = useState([]);
  const [predictionsOpen, setPredictionsOpen] = useState(false);
  const searchInputRef = useRef(null);
  const searchWrapRef = useRef(null);

  /**
   * En desktop, on freine la progression après un certain point pour
   * demander plus de scroll et laisser le temps de lire la section CTA.
   * @param {number} scrollDelta
   * @returns {number}
   */
  const computeDesktopBrakedRatio = (scrollDelta) => {
    const slowStartPx = TRIGGER_PX * DESKTOP_SCROLL_BRAKE_START_RATIO;
    if (scrollDelta <= slowStartPx) {
      return fintapHeroScrollRatio(scrollDelta, 0, TRIGGER_PX);
    }
    const slowedDeltaPx =
      slowStartPx + (scrollDelta - slowStartPx) * DESKTOP_SCROLL_BRAKE_FACTOR;
    return fintapHeroScrollRatio(slowedDeltaPx, 0, TRIGGER_PX);
  };

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
      const delta = sy - scroll0Ref.current;
      if (window.innerWidth >= 1024) {
        targetRatioRef.current = computeDesktopBrakedRatio(delta);
      } else {
        targetRatioRef.current = fintapHeroScrollRatio(sy, scroll0Ref.current, TRIGGER_PX);
      }
    };

    const paint = (ratio) => {
      if (Math.abs(ratio - lastAppliedRatioRef.current) < 0.0009) return;
      lastAppliedRatioRef.current = ratio;
      const style = computeFintapHeroPhoneStyle(ratio);
      if (window.innerWidth >= 1024) {
        style.translateX = lerp(0, -260, ratio);
        style.scale = lerp(4.45, 1, ratio);
        style.translateY += lerp(1020, 0, ratio);
      } else {
        style.translateX = 0;
      }
      setPhone3d(phone, style);
    };

    const animate = () => {
      loopRef.current = 0;
      const target = targetRatioRef.current;
      const current = currentRatioRef.current;
      const next = current + (target - current) * 0.18;
      let nextCtaVisible;
      if (window.innerWidth >= 1024) {
        const showThreshold = 0.68;
        const hideThreshold = 0.24;
        const progress = Math.max(next, target);
        if (ctaVisibleRef.current) {
          nextCtaVisible = progress > hideThreshold;
        } else {
          nextCtaVisible = progress >= showThreshold;
        }
        const now = performance.now();
        if (nextCtaVisible && !ctaVisibleRef.current) {
          // Laisser le temps de lire le bloc CTA en desktop, même en scroll rapide.
          ctaHoldUntilRef.current = now + 2200;
        } else if (!nextCtaVisible && ctaVisibleRef.current && now < ctaHoldUntilRef.current) {
          nextCtaVisible = true;
        }
      } else {
        const ctaThreshold = 0.9995;
        nextCtaVisible = next >= ctaThreshold || target >= ctaThreshold;
      }
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
    const query = shopQuery.trim();
    if (query.length < 2) {
      setPlacePredictions([]);
      setPredictionsOpen(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const url = `${API_BASE}/api/places/autocomplete?input=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("autocomplete_failed");
        const data = await res.json();
        if (cancelled) return;
        const list = Array.isArray(data?.predictions) ? data.predictions.slice(0, 8) : [];
        setPlacePredictions(list);
        setPredictionsOpen(list.length > 0);
      } catch (_) {
        if (cancelled) return;
        setPlacePredictions([]);
        setPredictionsOpen(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [shopQuery, ctaVisible]);

  useEffect(() => {
    const onClickOutside = (event) => {
      const root = searchWrapRef.current;
      if (!root) return;
      if (root.contains(event.target)) return;
      setPredictionsOpen(false);
    };
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, []);

  const selectPrediction = (pred) => {
    setShopQuery(String(pred?.main_text || pred?.description || ""));
    setShopPlaceId(String(pred?.place_id || ""));
    setPredictionsOpen(false);
  };

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
      <div className="fintap-hero-iphone__experience">
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
          <label className="fintap-hero-iphone__search" aria-label="Nom de votre commerce" ref={searchWrapRef}>
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
              onFocus={() => {
                if (placePredictions.length > 0) setPredictionsOpen(true);
              }}
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
            {predictionsOpen && placePredictions.length > 0 ? (
              <div className="fintap-hero-iphone__search-dropdown" role="listbox" aria-label="Suggestions commerces">
                {placePredictions.map((pred, idx) => (
                  <button
                    key={`${pred.place_id || pred.description || "pred"}-${idx}`}
                    type="button"
                    className="fintap-hero-iphone__search-option"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectPrediction(pred);
                    }}
                  >
                    <span className="fintap-hero-iphone__search-option-main">
                      {pred.main_text || pred.description}
                    </span>
                    {pred.secondary_text ? (
                      <span className="fintap-hero-iphone__search-option-sub">{pred.secondary_text}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </label>
        </div>
      </div>
    </section>
  );
}
