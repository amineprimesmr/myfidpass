import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FINTAP } from "./fintap-data.js";
import "./fintap-testimonials-marquee.css";

const KICKER_ICON = "/assets/fintap-testimonials-kicker.png";

const AVATAR_BACKGROUNDS = [
  "linear-gradient(135deg, #c7d2fe 0%, #a5b4fc 50%, #818cf8 100%)",
  "linear-gradient(135deg, #fbcfe8 0%, #f9a8d4 45%, #f472b6 100%)",
  "linear-gradient(135deg, #bbf7d0 0%, #86efac 45%, #4ade80 100%)",
  "linear-gradient(135deg, #fde68a 0%, #fcd34d 45%, #fbbf24 100%)",
  "linear-gradient(135deg, #e9d5ff 0%, #d8b4fe 45%, #c084fc 100%)",
  "linear-gradient(135deg, #bae6fd 0%, #7dd3fc 45%, #38bdf8 100%)",
];

/**
 * @param {HTMLElement | null} el
 * @returns {number} 0–1 progression du scroll à travers la section
 */
function scrollProgressThroughSection(el) {
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || 1;
  const start = vh * 0.95;
  const range = vh * 0.55 + rect.height * 0.75;
  const x = start - rect.top;
  if (range <= 0) return 0;
  return Math.max(0, Math.min(1, x / range));
}

/** @param {{ t: { name: string; role: string; quote: string }; i: number }} props */
function TestimonialCard({ t, i }) {
  const bg = AVATAR_BACKGROUNDS[i % AVATAR_BACKGROUNDS.length];
  return (
    <blockquote className="fintap-t-marquee-card">
      <div className="fintap-t-marquee-card-head">
        <div className="fintap-t-marquee-avatar" style={{ background: bg }} aria-hidden="true" />
        <div>
          <p className="fintap-t-marquee-name">{t.name}</p>
          <p className="fintap-t-marquee-role">{t.role}</p>
        </div>
      </div>
      <p className="fintap-t-marquee-quote">“{t.quote}”</p>
    </blockquote>
  );
}

export function FinTapTestimonialsSection() {
  const sectionRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [maxShift, setMaxShift] = useState(280);
  const [reducedMotion, setReducedMotion] = useState(false);

  const { rowTop, rowBottom } = useMemo(() => {
    const list = FINTAP.testimonials;
    const half = Math.ceil(list.length / 2);
    return { rowTop: list.slice(0, half), rowBottom: list.slice(half) };
  }, []);

  const triple = useCallback((arr) => [...arr, ...arr, ...arr], []);

  const updateShiftCap = useCallback(() => {
    setMaxShift(Math.min(420, Math.round((typeof window !== "undefined" ? window.innerWidth : 1200) * 0.28)));
  }, []);

  const tick = useCallback(() => {
    const el = sectionRef.current;
    const p = reducedMotion ? 0 : scrollProgressThroughSection(el);
    setProgress(p);
  }, [reducedMotion]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onMq = () => {
      setReducedMotion(mq.matches);
    };
    mq.addEventListener("change", onMq);
    return () => mq.removeEventListener("change", onMq);
  }, []);

  useEffect(() => {
    updateShiftCap();
    window.addEventListener("resize", updateShiftCap, { passive: true });
    return () => window.removeEventListener("resize", updateShiftCap);
  }, [updateShiftCap]);

  useEffect(() => {
    tick();
    window.addEventListener("scroll", tick, { passive: true });
    return () => window.removeEventListener("scroll", tick);
  }, [tick]);

  const p = reducedMotion ? 0 : progress;
  const shiftTop = p * maxShift;
  const shiftBottom = -p * maxShift;

  return (
    <section
      ref={sectionRef}
      className="fintap-section fintap-section--testimonials"
      id="testimonials"
      aria-labelledby="fintap-testimonials-heading"
    >
      <header className="fintap-t-marquee-head">
        <img
          src={KICKER_ICON}
          width={52}
          height={52}
          className="fintap-t-marquee-icon"
          alt=""
          decoding="async"
        />
        <h2 id="fintap-testimonials-heading" className="fintap-t-marquee-title">
          <span className="fintap-t-marquee-title-line">Ce que disent</span>
          <br />
          <span className="fintap-t-marquee-title-line fintap-t-marquee-title-line--accent">nos clients</span>
        </h2>
      </header>

      <div className="fintap-t-marquee-rows" aria-hidden={false}>
        <div className="fintap-t-marquee-mask">
          <div
            className="fintap-t-marquee-track fintap-t-marquee-track--top"
            style={{ transform: `translate3d(${shiftTop}px, 0, 0)` }}
          >
            {triple(rowTop).map((t, i) => (
              <TestimonialCard key={`top-${t.name}-${t.role}-${i}`} t={t} i={i} />
            ))}
          </div>
        </div>
        <div className="fintap-t-marquee-mask fintap-t-marquee-mask--stagger">
          <div
            className="fintap-t-marquee-track fintap-t-marquee-track--bottom"
            style={{ transform: `translate3d(${shiftBottom}px, 0, 0)` }}
          >
            {triple(rowBottom).map((t, i) => (
              <TestimonialCard key={`bot-${t.name}-${t.role}-${i}`} t={t} i={i} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
