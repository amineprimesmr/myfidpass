import { useCallback, useEffect, useRef, useState } from "react";
import { FINTAP_VAR_CARDS } from "./fintap-var-cards-data.js";
import "./fintap-var-cards.css";

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="fintap-var-cards__chevron-svg">
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="fintap-var-cards__chevron-svg">
      <path
        d="M15 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * @param {HTMLDivElement | null} track
 * @returns {number}
 */
function readActiveSlideIndex(track) {
  if (!track) return 0;

  const slides = track.querySelectorAll(".fintap-var-cards__slide");
  if (!slides.length) return 0;

  const scrollLeft = track.scrollLeft;
  let currentIndex = 0;
  let nearest = Infinity;

  slides.forEach((slide, index) => {
    const dist = Math.abs(slide.offsetLeft - scrollLeft);
    if (dist < nearest) {
      nearest = dist;
      currentIndex = index;
    }
  });

  return currentIndex;
}

/** Carousel mobile feature cards — style Tuyo (snap horizontal, peek carte suivante). */
export function FinTapVarCardsSection({ embedded = false }) {
  const trackRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const syncActiveIndex = useCallback(() => {
    setActiveIndex(readActiveSlideIndex(trackRef.current));
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;

    syncActiveIndex();
    track.addEventListener("scroll", syncActiveIndex, { passive: true });
    window.addEventListener("resize", syncActiveIndex, { passive: true });

    return () => {
      track.removeEventListener("scroll", syncActiveIndex);
      window.removeEventListener("resize", syncActiveIndex);
    };
  }, [syncActiveIndex]);

  const scrollToIndex = useCallback((index) => {
    const track = trackRef.current;
    if (!track) return;

    const slides = track.querySelectorAll(".fintap-var-cards__slide");
    const target = slides[index];
    if (!target) return;

    track.scrollTo({
      left: target.offsetLeft,
      behavior: "smooth",
    });
  }, []);

  const scrollNext = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;

    const slides = track.querySelectorAll(".fintap-var-cards__slide");
    const currentIndex = readActiveSlideIndex(track);
    const nextIndex = currentIndex >= slides.length - 1 ? 0 : currentIndex + 1;
    scrollToIndex(nextIndex);
  }, [scrollToIndex]);

  const scrollPrev = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;

    const currentIndex = readActiveSlideIndex(track);
    if (currentIndex <= 0) return;
    scrollToIndex(currentIndex - 1);
  }, [scrollToIndex]);

  const canScrollPrev = activeIndex > 0;

  return (
    <section
      className={
        "fintap-var-cards" + (embedded ? " fintap-var-cards--embedded" : "")
      }
      id="fintap-var-cards"
      aria-label="Fonctionnalités Myfidpass"
    >
      <div className="fintap-var-cards__glow" aria-hidden />
      <div className="fintap-var-cards__inner">
        <div className="fintap-var-cards__track-wrap">
          <div ref={trackRef} className="fintap-var-cards__track" role="list">
            {FINTAP_VAR_CARDS.map((card) => (
              <article key={card.id} className="fintap-var-cards__slide" role="listitem">
                <div className="fintap-var-cards__card">
                  <img
                    src={card.src}
                    alt={card.alt}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    width={352}
                    height={640}
                  />
                </div>
              </article>
            ))}
          </div>
          {canScrollPrev ? (
            <button
              type="button"
              className="fintap-var-cards__chevron fintap-var-cards__chevron--prev"
              aria-label="Carte précédente"
              onClick={scrollPrev}
            >
              <ChevronLeft />
            </button>
          ) : null}
          <button
            type="button"
            className="fintap-var-cards__chevron fintap-var-cards__chevron--next"
            aria-label="Carte suivante"
            onClick={scrollNext}
          >
            <ChevronRight />
          </button>
        </div>
      </div>
    </section>
  );
}
