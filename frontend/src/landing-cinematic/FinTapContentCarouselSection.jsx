import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  FINTAP_CONTENT_CAROUSEL_IMAGES,
  splitContentCarouselRows,
} from "./fintap-content-carousel-data.js";
import "./fintap-content-carousel.css";

/** @param {{ src: string; index: number; priority?: boolean }} props */
function ContentCarouselCard({ src, index, priority = false }) {
  return (
    <figure className="fintap-content-carousel-card">
      <img
        src={src}
        alt=""
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        draggable={false}
        width={280}
        height={373}
      />
      <figcaption className="visually-hidden">Contenu Myfidpass {index + 1}</figcaption>
    </figure>
  );
}

/**
 * Deux rangées mobile, une ligne desktop — défilement CSS GPU (marquee).
 * Pas de liaison scroll → React : évite les lags iOS.
 */
export function FinTapContentCarouselSection() {
  const topTrackRef = useRef(null);
  const bottomTrackRef = useRef(null);
  const [singleRow, setSingleRow] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches
  );
  const [topSegmentPx, setTopSegmentPx] = useState(0);
  const [bottomSegmentPx, setBottomSegmentPx] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  const { rowTop, rowBottom } = useMemo(
    () => splitContentCarouselRows(FINTAP_CONTENT_CAROUSEL_IMAGES),
    []
  );

  const triple = useCallback((arr) => [...arr, ...arr, ...arr], []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => setSingleRow(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onMq = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onMq);
    return () => mq.removeEventListener("change", onMq);
  }, []);

  useLayoutEffect(() => {
    const measure = () => {
      const topEl = topTrackRef.current;
      if (topEl?.scrollWidth) {
        setTopSegmentPx(Math.round(topEl.scrollWidth / 3));
      }
      if (!singleRow) {
        const botEl = bottomTrackRef.current;
        if (botEl?.scrollWidth) {
          setBottomSegmentPx(Math.round(botEl.scrollWidth / 3));
        }
      } else {
        setBottomSegmentPx(0);
      }
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (ro) {
      if (topTrackRef.current) ro.observe(topTrackRef.current);
      if (!singleRow && bottomTrackRef.current) ro.observe(bottomTrackRef.current);
    }
    window.addEventListener("resize", measure, { passive: true });
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [rowTop, rowBottom, singleRow]);

  const marquee = !reducedMotion && topSegmentPx > 0;

  const segmentStyle = (segmentPx) =>
    segmentPx > 0 ? { ["--carousel-segment-px"]: `${segmentPx}px` } : undefined;

  const staticStyle = (segmentPx) =>
    segmentPx > 0 ? { transform: `translate3d(${-segmentPx}px, 0, 0)` } : undefined;

  const topTrackClass =
    "fintap-content-carousel__track fintap-content-carousel__track--top" +
    (marquee ? " fintap-content-carousel__track--marquee" : "");

  const bottomTrackClass =
    "fintap-content-carousel__track fintap-content-carousel__track--bottom" +
    (marquee && bottomSegmentPx > 0 ? " fintap-content-carousel__track--marquee-reverse" : "");

  const desktopImages = FINTAP_CONTENT_CAROUSEL_IMAGES;

  return (
    <section
      className={
        "fintap-content-carousel" + (singleRow ? " fintap-content-carousel--single-row" : "")
      }
      id="fintap-content-carousel"
      aria-label="Galerie Myfidpass en situation"
    >
      <div className="fintap-content-carousel__rows" aria-hidden={false}>
        <div className="fintap-content-carousel__mask">
          <div
            ref={topTrackRef}
            className={topTrackClass}
            style={marquee ? segmentStyle(topSegmentPx) : staticStyle(topSegmentPx)}
          >
            {singleRow
              ? triple(desktopImages).map((src, i) => (
                  <ContentCarouselCard
                    key={`all-${src}-${i}`}
                    src={src}
                    index={i % desktopImages.length}
                    priority={i < 4}
                  />
                ))
              : triple(rowTop).map((src, i) => (
                  <ContentCarouselCard
                    key={`top-${src}-${i}`}
                    src={src}
                    index={i % rowTop.length}
                    priority={i < 3}
                  />
                ))}
          </div>
        </div>
        {!singleRow ? (
          <div className="fintap-content-carousel__mask fintap-content-carousel__mask--stagger">
            <div
              ref={bottomTrackRef}
              className={bottomTrackClass}
              style={
                marquee && bottomSegmentPx > 0
                  ? segmentStyle(bottomSegmentPx)
                  : staticStyle(bottomSegmentPx)
              }
            >
              {triple(rowBottom).map((src, i) => (
                <ContentCarouselCard key={`bot-${src}-${i}`} src={src} index={i % rowBottom.length} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
