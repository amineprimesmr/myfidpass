import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  FINTAP_CONTENT_CAROUSEL_IMAGES,
  splitContentCarouselRows,
} from "./fintap-content-carousel-data.js";
import { scrollProgressThroughSection } from "./fintap-testimonials-scroll.js";
import "./fintap-content-carousel.css";

/** Fenêtre de scroll élargie — section courte sous le hero */
const CONTENT_CAROUSEL_SCROLL_OPTS = {
  startViewportRatio: 0.88,
  viewportRangeRatio: 1.35,
  heightFactor: 3.5,
  gain: 1.25,
};

/**
 * Distance horizontale pour faire défiler toutes les images uniques d'une rangée.
 * @param {number} segmentPx
 * @param {number} viewportWidth
 */
function contentCarouselTravelPx(segmentPx, viewportWidth) {
  const travel = segmentPx - viewportWidth * 0.22;
  return Math.max(480, Math.round(travel));
}

/** @param {{ src: string; index: number }} props */
function ContentCarouselCard({ src, index }) {
  return (
    <figure className="fintap-content-carousel-card">
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        width={280}
        height={373}
      />
      <figcaption className="visually-hidden">Contenu Myfidpass {index + 1}</figcaption>
    </figure>
  );
}

/** Deux rangées mobile, une seule ligne desktop — défilement lié au scroll. */
export function FinTapContentCarouselSection() {
  const sectionRef = useRef(null);
  const topTrackRef = useRef(null);
  const bottomTrackRef = useRef(null);
  const [singleRow, setSingleRow] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches
  );
  const [marqueeSegmentPx, setMarqueeSegmentPx] = useState(0);
  const [topSegmentPx, setTopSegmentPx] = useState(0);
  const [bottomSegmentPx, setBottomSegmentPx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [maxShift, setMaxShift] = useState(480);
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

  useLayoutEffect(() => {
    const measure = () => {
      const viewportWidth = window.innerWidth || 390;
      let widestSegment = 0;

      if (singleRow) {
        const el = topTrackRef.current;
        if (el?.scrollWidth) {
          const segment = Math.round(el.scrollWidth / 3);
          setTopSegmentPx(-segment);
          setMarqueeSegmentPx(segment);
          setBottomSegmentPx(0);
          widestSegment = segment;
        }
      } else {
        setMarqueeSegmentPx(0);
        const topEl = topTrackRef.current;
        const botEl = bottomTrackRef.current;

        if (topEl?.scrollWidth) {
          const segment = Math.round(topEl.scrollWidth / 3);
          setTopSegmentPx(-segment);
          widestSegment = Math.max(widestSegment, segment);
        }
        if (botEl?.scrollWidth) {
          const segment = Math.round(botEl.scrollWidth / 3);
          setBottomSegmentPx(-segment);
          widestSegment = Math.max(widestSegment, segment);
        }
      }

      if (widestSegment > 0) {
        setMaxShift(contentCarouselTravelPx(widestSegment, viewportWidth));
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

  const tick = useCallback(() => {
    const p = reducedMotion
      ? 0
      : scrollProgressThroughSection(sectionRef.current, CONTENT_CAROUSEL_SCROLL_OPTS);
    setProgress(p);
  }, [reducedMotion]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onMq = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onMq);
    return () => mq.removeEventListener("change", onMq);
  }, []);

  useEffect(() => {
    if (singleRow) return undefined;
    tick();
    window.addEventListener("scroll", tick, { passive: true });
    return () => window.removeEventListener("scroll", tick);
  }, [tick, singleRow]);

  const p = reducedMotion ? 0 : progress;
  const shiftTop = topSegmentPx + p * maxShift;
  const shiftBottom = bottomSegmentPx - p * maxShift;
  const desktopImages = FINTAP_CONTENT_CAROUSEL_IMAGES;
  const desktopMarquee = singleRow && !reducedMotion && marqueeSegmentPx > 0;

  const topTrackStyle = desktopMarquee
    ? { ["--carousel-segment-px"]: `${marqueeSegmentPx}px` }
    : { transform: `translate3d(${shiftTop}px, 0, 0)` };

  const topTrackClass =
    "fintap-content-carousel__track fintap-content-carousel__track--top" +
    (desktopMarquee ? " fintap-content-carousel__track--marquee" : "");

  return (
    <section
      ref={sectionRef}
      className={
        "fintap-content-carousel" + (singleRow ? " fintap-content-carousel--single-row" : "")
      }
      id="fintap-content-carousel"
      aria-label="Galerie Myfidpass en situation"
    >
      <div className="fintap-content-carousel__rows" aria-hidden={false}>
        <div className="fintap-content-carousel__mask">
          <div ref={topTrackRef} className={topTrackClass} style={topTrackStyle}>
            {singleRow
              ? triple(desktopImages).map((src, i) => (
                  <ContentCarouselCard
                    key={`all-${src}-${i}`}
                    src={src}
                    index={i % desktopImages.length}
                  />
                ))
              : triple(rowTop).map((src, i) => (
                  <ContentCarouselCard key={`top-${src}-${i}`} src={src} index={i % rowTop.length} />
                ))}
          </div>
        </div>
        {!singleRow ? (
          <div className="fintap-content-carousel__mask fintap-content-carousel__mask--stagger">
            <div
              ref={bottomTrackRef}
              className="fintap-content-carousel__track fintap-content-carousel__track--bottom"
              style={{ transform: `translate3d(${shiftBottom}px, 0, 0)` }}
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
