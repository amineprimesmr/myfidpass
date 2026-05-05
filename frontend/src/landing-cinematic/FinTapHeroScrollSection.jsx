import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  computeFintapHeroPhoneStyle,
  fintapHeroScrollRatio,
  FINTAP_SCROLL_TO_COMMERCE_EVENT,
  getFintapCommerceScrollDelta,
  getPageScrollY,
  lerp,
} from "./fintap-hero-scroll-lerp.js";
import {
  API_BASE,
  getAuthToken,
  getPendingEstablishments,
  setPendingEstablishment,
  setPendingEstablishments,
} from "../config.js";
import "./fintap-hero-scroll.css";
import "./fintap-hero-blue-surface.css";
import { FinTapHeroDeskCtas } from "./FinTapHeroDeskCtas.jsx";

const HERO_IPHONE_IMG = "/assets/iphone-custom-clean.png";
const HERO_IPHONE_IMG_MOBILE = "/assets/iphone-custom-clean-mobile.png";
const TRIGGER_PX = 400;
const IOS_MOBILE_TRIGGER_PX = 560;
const DESKTOP_SCROLL_BRAKE_START_RATIO = 0.62;
const DESKTOP_SCROLL_BRAKE_FACTOR = 0.45;
const IOS_MOBILE_UA_RE = /iP(hone|ad|od)|Macintosh.*Mobile/i;

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
  const [selectedEstablishments, setSelectedEstablishments] = useState(() =>
    getPendingEstablishments()
  );
  const [placePredictions, setPlacePredictions] = useState([]);
  const [predictionsOpen, setPredictionsOpen] = useState(false);
  const [placesSearching, setPlacesSearching] = useState(false);
  const [noSuggestionsVisible, setNoSuggestionsVisible] = useState(false);
  const searchInputRef = useRef(null);
  const searchWrapRef = useRef(null);
  const emptyHintTimerRef = useRef(0);
  const isIosMobileRef = useRef(
    typeof navigator !== "undefined" && IOS_MOBILE_UA_RE.test(navigator.userAgent)
  );

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
  const smoothstep = (t) => t * t * (3 - 2 * t);
  const getHeroSectionStartY = () => {
    const el = sectionRef.current;
    if (!el) return getPageScrollY();
    const rect = el.getBoundingClientRect();
    return getPageScrollY() + rect.top;
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
        // Ancrer l'animation à la position réelle de la section hero, pas à la position
        // de scroll courante. Sinon, après retour SPA avec restauration du scroll,
        // le ratio repart de 0 au mauvais endroit et le mockup paraît "figé".
        scroll0Ref.current = getHeroSectionStartY();
      }
      const sy = getPageScrollY();
      if (window.innerWidth >= 1024) {
        // Desktop: progression basée sur la position réelle de la section dans le viewport.
        // Évite les états "figés" après retour SPA/back-forward quand une base scroll est périmée.
        const rectTop = section.getBoundingClientRect().top;
        const progressed = Math.max(0, -rectTop);
        targetRatioRef.current = computeDesktopBrakedRatio(progressed);
      } else {
        const delta = sy - scroll0Ref.current;
        const triggerPx = isIosMobileRef.current ? IOS_MOBILE_TRIGGER_PX : TRIGGER_PX;
        const raw = fintapHeroScrollRatio(sy, scroll0Ref.current, triggerPx);
        const eased = isIosMobileRef.current ? smoothstep(raw) : raw;
        targetRatioRef.current = eased;
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
        if (isIosMobileRef.current) {
          // Courbe iPhone réelle: moins de tilt/zoom, animation plus “continue” au doigt.
          style.rotateX = lerp(24, 0, ratio);
          style.scale = lerp(1.26, 1, ratio);
        }
      }
      setPhone3d(phone, style);
    };

    /**
     * Même logique que la boucle rAF — utilisée aussi après retour onglet / pageshow (bfcache)
     * pour éviter que le bloc CTA reste en `is-visible` alors que le ratio téléphone ne correspond plus.
     */
    const computeNextCtaVisible = (next, target, now) => {
      if (window.innerWidth >= 1024) {
        const showThreshold = 0.68;
        const hideThreshold = 0.24;
        /** Uniquement `next` (ratio lerp = ce qui est peint) — évite CTA visible pendant que `target` a déjà sauté au scroll programmé. */
        const progress = next;
        let nextCtaVisible;
        if (ctaVisibleRef.current) {
          nextCtaVisible = progress > hideThreshold;
        } else {
          nextCtaVisible = progress >= showThreshold;
        }
        if (nextCtaVisible && !ctaVisibleRef.current) {
          ctaHoldUntilRef.current = now + 2200;
        } else if (!nextCtaVisible && ctaVisibleRef.current && now < ctaHoldUntilRef.current) {
          nextCtaVisible = true;
        }
        return nextCtaVisible;
      }
      const ctaThreshold = 0.9995;
      /** Pas de `|| target` : au scroll smooth / `openOnboarding`, `target` peut être à 1 alors que le mockup est encore animé. */
      return next >= ctaThreshold;
    };

    const flushCtaVisible = (nextCtaVisible) => {
      if (nextCtaVisible !== ctaVisibleRef.current) {
        ctaVisibleRef.current = nextCtaVisible;
        setCtaVisible(nextCtaVisible);
      }
    };

    const resyncHeroFromScroll = () => {
      run();
      const target = targetRatioRef.current;
      currentRatioRef.current = target;
      lastAppliedRatioRef.current = -1;
      paint(target);
      const now = performance.now();
      flushCtaVisible(computeNextCtaVisible(target, target, now));
    };

    const scheduleHeroResync = () => {
      if (document.visibilityState !== "visible") return;
      requestAnimationFrame(() => {
        resyncHeroFromScroll();
        requestAnimationFrame(() => {
          resyncHeroFromScroll();
        });
      });
    };

    const animate = () => {
      // Pause lerp while the landing is hidden by the SPA router (display:none ancestor).
      // Without this guard the loop accumulates ratio=0 while another route is active,
      // causing the phone to re-animate from the tilted position when the user comes back.
      if (sectionRef.current?.closest(".hidden")) {
        loopRef.current = requestAnimationFrame(animate);
        return;
      }
      run();
      const target = targetRatioRef.current;
      const current = currentRatioRef.current;
      const smoothing = window.innerWidth >= 1024 ? 0.18 : 0.26;
      const next = current + (target - current) * smoothing;
      const now = performance.now();
      flushCtaVisible(computeNextCtaVisible(next, target, now));
      if (Math.abs(target - next) < 0.0012) {
        currentRatioRef.current = target;
        paint(target);
        loopRef.current = requestAnimationFrame(animate);
        return;
      }
      currentRatioRef.current = next;
      paint(next);
      loopRef.current = requestAnimationFrame(animate);
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
      run();
    };

    if (reduced.addEventListener) {
      reduced.addEventListener("change", run);
    } else {
      reduced.addListener(run);
    }

    lastInnerWidthRef.current = window.innerWidth;
    window.addEventListener("resize", onResizeWidthOnly, { passive: true });

    /**
     * Retour onglet, bouton Précédent, bfcache : le rAF est bridé hors page, React peut garder
     * `ctaVisible` alors que le téléphone n’est plus peint au bon ratio — on resynchronise.
     */
    const onPageShow = (e) => {
      scheduleHeroResync();
      if (e.persisted) {
        window.setTimeout(() => {
          if (document.visibilityState === "visible") resyncHeroFromScroll();
        }, 0);
      }
    };
    document.addEventListener("visibilitychange", scheduleHeroResync);
    window.addEventListener("pageshow", onPageShow);
    // SPA routing: landing container was hidden then shown again — resync phone position.
    const onLandingVisible = () => {
      // Retour SPA vers la landing: recalculer le "scroll 0" avec la position actuelle.
      // Sinon on peut réutiliser une base ancienne et garder le mockup dans un état figé/intermédiaire.
      scroll0Ref.current = null;
      scheduleHeroResync();
    };
    window.addEventListener("fidpass:landing-visible", onLandingVisible);

    const scrollToCommerceOnboarding = () => {
      if (reduced.matches) {
        document.getElementById("fintap-commerce-onboarding")?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        window.setTimeout(() => {
          searchInputRef.current?.focus({ preventScroll: true });
        }, 400);
        return;
      }
      if (scroll0Ref.current == null) {
        scroll0Ref.current = getHeroSectionStartY();
      }
      const base = scroll0Ref.current;
      const isIosMobile =
        typeof navigator !== "undefined" && IOS_MOBILE_UA_RE.test(navigator.userAgent);
      const delta = getFintapCommerceScrollDelta(window.innerWidth, isIosMobile);
      const doc = document.scrollingElement || document.documentElement;
      const maxTop = Math.max(0, (doc?.scrollHeight ?? 0) - window.innerHeight);
      const top = Math.min(base + delta, maxTop);
      window.scrollTo({ top, behavior: "smooth" });
      let focusDone = false;
      const tryFocus = () => {
        if (focusDone) return;
        focusDone = true;
        searchInputRef.current?.focus({ preventScroll: true });
      };
      window.addEventListener("scrollend", tryFocus, { once: true });
      window.setTimeout(tryFocus, 1000);
    };

    window.addEventListener(FINTAP_SCROLL_TO_COMMERCE_EVENT, scrollToCommerceOnboarding);

    run();
    loopRef.current = requestAnimationFrame(animate);

    return () => {
      if (reduced.removeEventListener) {
        reduced.removeEventListener("change", run);
      } else {
        reduced.removeListener(run);
      }
      window.removeEventListener("resize", onResizeWidthOnly, {
        passive: true,
      });
      document.removeEventListener("visibilitychange", scheduleHeroResync);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("fidpass:landing-visible", onLandingVisible);
      window.removeEventListener(FINTAP_SCROLL_TO_COMMERCE_EVENT, scrollToCommerceOnboarding);
      if (loopRef.current) cancelAnimationFrame(loopRef.current);
    };
  }, []);

  useEffect(() => {
    if (!ctaVisible) {
      setPlacesSearching(false);
      return;
    }
    const query = shopQuery.trim();
    if (query.length < 2) {
      setPlacePredictions([]);
      setPredictionsOpen(false);
      setPlacesSearching(false);
      setNoSuggestionsVisible(false);
      if (emptyHintTimerRef.current) {
        window.clearTimeout(emptyHintTimerRef.current);
        emptyHintTimerRef.current = 0;
      }
      return;
    }
    let cancelled = false;
    if (emptyHintTimerRef.current) {
      window.clearTimeout(emptyHintTimerRef.current);
      emptyHintTimerRef.current = 0;
    }
    setNoSuggestionsVisible(false);
    setPlacesSearching(true);
    const debounce = window.setTimeout(async () => {
      if (cancelled) return;
      try {
        const url = `${API_BASE}/api/places/autocomplete?input=${encodeURIComponent(query)}`;
        const headers = {};
        const t = getAuthToken();
        if (t) headers.Authorization = `Bearer ${t}`;
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error("autocomplete_failed");
        const data = await res.json();
        if (cancelled) return;
        const list = Array.isArray(data?.predictions) ? data.predictions.slice(0, 8) : [];
        setPlacePredictions(list);
        setPredictionsOpen(list.length > 0);
        if (list.length > 0) {
          if (emptyHintTimerRef.current) {
            window.clearTimeout(emptyHintTimerRef.current);
            emptyHintTimerRef.current = 0;
          }
          setNoSuggestionsVisible(false);
        } else {
          emptyHintTimerRef.current = window.setTimeout(() => {
            if (cancelled) return;
            const still = String(searchInputRef.current?.value || "").trim() === query;
            if (still) setNoSuggestionsVisible(true);
            emptyHintTimerRef.current = 0;
          }, 2000);
        }
      } catch (_) {
        if (cancelled) return;
        setPlacePredictions([]);
        setPredictionsOpen(false);
        emptyHintTimerRef.current = window.setTimeout(() => {
          if (cancelled) return;
          const still = String(searchInputRef.current?.value || "").trim() === query;
          if (still) setNoSuggestionsVisible(true);
          emptyHintTimerRef.current = 0;
        }, 2000);
      } finally {
        if (!cancelled) {
          const still = String(searchInputRef.current?.value || "").trim() === query;
          if (still) setPlacesSearching(false);
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(debounce);
      if (emptyHintTimerRef.current) {
        window.clearTimeout(emptyHintTimerRef.current);
        emptyHintTimerRef.current = 0;
      }
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

  const applyPrediction = (pred) => {
    const name = String(pred?.main_text || pred?.description || "").trim();
    const pid = String(pred?.place_id || "").trim();
    if (!name || !pid) return;
    setShopQuery(name);
    setShopPlaceId(pid);
    setPredictionsOpen(false);
  };

  const startHref = "/app?fromLandingOnboarding=1";

  const onStartCtaClick = (event) => {
    if (!shopPlaceId) {
      event.preventDefault();
      return;
    }
    const name = shopQuery.trim();
    if (!name) {
      event.preventDefault();
      return;
    }
    const primary = { establishment_name: name, google_place_id: shopPlaceId };
    setPendingEstablishment(primary);
    const exists = selectedEstablishments.some(
      (entry) => entry.google_place_id === primary.google_place_id
    );
    const next = exists ? selectedEstablishments : [...selectedEstablishments, primary];
    setSelectedEstablishments(next);
    setPendingEstablishments(next);
  };

  const addSelectedEstablishment = () => {
    const name = shopQuery.trim();
    const pid = String(shopPlaceId || "").trim();
    if (!name || !pid) return;
    const exists = selectedEstablishments.some((entry) => entry.google_place_id === pid);
    if (exists) return;
    const next = [
      ...selectedEstablishments,
      { establishment_name: name, google_place_id: pid },
    ];
    setSelectedEstablishments(next);
    setPendingEstablishments(next);
  };

  const removeSelectedEstablishment = (pid) => {
    const placeId = String(pid || "").trim();
    if (!placeId) return;
    const next = selectedEstablishments.filter(
      (entry) => entry.google_place_id !== placeId
    );
    setSelectedEstablishments(next);
    setPendingEstablishments(next);
  };

  const canAddSelected =
    !!shopPlaceId &&
    !!shopQuery.trim() &&
    !selectedEstablishments.some((entry) => entry.google_place_id === shopPlaceId);

  return (
    <section
      className="hero fintap-hero-iphone fintap-hero-iphone--scroll"
      ref={sectionRef}
    >
      <FinTapHeroDeskCtas />
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
              srcSet={`${HERO_IPHONE_IMG_MOBILE} 434w, ${HERO_IPHONE_IMG} 838w`}
              sizes="(max-width: 767px) 280px, 320px"
              width={838}
              height={1736}
              alt=""
              loading="eager"
              decoding="async"
              draggable={false}
            />
          </div>
        </div>
        <div
          id="fintap-commerce-onboarding"
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
                setNoSuggestionsVisible(false);
              }}
            />
            {placesSearching ? (
              <span
                className="fintap-hero-iphone__search-cta fintap-hero-iphone__search-cta--busy"
                aria-live="polite"
                aria-label="Recherche en cours"
                role="status"
              >
                <span className="fintap-hero-iphone__search-cta__spinner" aria-hidden="true" />
              </span>
            ) : (
              <a
                href={startHref}
                className="fintap-hero-iphone__search-cta"
                aria-label="Commencer"
                title="Commencer"
                onClick={onStartCtaClick}
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
            )}
            {predictionsOpen && placePredictions.length > 0 ? (
              <div className="fintap-hero-iphone__search-dropdown" role="listbox" aria-label="Suggestions commerces">
                {placePredictions.map((pred, idx) => (
                  <button
                    key={`${pred.place_id || pred.description || "pred"}-${idx}`}
                    type="button"
                    className="fintap-hero-iphone__search-option"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      applyPrediction(pred);
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
          {canAddSelected ? (
            <button
              type="button"
              className="fintap-hero-iphone__add-business-btn"
              onClick={addSelectedEstablishment}
            >
              Ajouter un commerce
            </button>
          ) : null}
          {selectedEstablishments.length > 0 ? (
            <div className="fintap-hero-iphone__selected-businesses" aria-label="Commerces ajoutés">
              {selectedEstablishments.map((entry) => (
                <span key={entry.google_place_id} className="fintap-hero-iphone__selected-business-chip">
                  <span>{entry.establishment_name}</span>
                  <button
                    type="button"
                    className="fintap-hero-iphone__selected-business-remove"
                    aria-label={`Retirer ${entry.establishment_name}`}
                    onClick={() => removeSelectedEstablishment(entry.google_place_id)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          {noSuggestionsVisible && shopQuery.trim().length >= 2 && !placesSearching ? (
            <p className="fintap-hero-iphone__search-empty-hint" role="status">
              Aucun commerce trouvé pour l’instant. Précisez le nom ou ajoutez la ville, puis choisissez une suggestion
              dans la liste.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
