import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FINTAP_STEPS } from "./fintap-steps-data.js";
import { stepsIndexFromScrollProgress } from "./fintap-steps-scroll-progress.js";
import { StepVisualByIndex } from "./FinTapStepsScrollVisuals.jsx";

/** Hauteur de piste ≈ n × viewport : le sticky reste affiché pendant que la page défile (PC uniquement). */
const TRACK_VIEWPORT_MULT = 6;

/**
 * @param {{ measureRef: { current: HTMLElement | null } }} props
 */
export function FinTapStepsScrollDesktop({ measureRef }) {
  const trackRef = useRef(null);
  const [active, setActive] = useState(0);

  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 901px)");
    const applyTrackMinHeight = () => {
      const sec = measureRef?.current;
      const tr = trackRef.current;
      if (!mq.matches || !sec) {
        if (sec) sec.style.minHeight = "";
        if (tr) tr.style.minHeight = "";
        return;
      }
      const ih = window.visualViewport?.height ?? window.innerHeight ?? 900;
      const h = Math.round(ih * TRACK_VIEWPORT_MULT);
      sec.style.minHeight = `${h}px`;
      if (tr) tr.style.minHeight = `${h}px`;
    };
    applyTrackMinHeight();
    window.addEventListener("resize", applyTrackMinHeight, { passive: true });
    window.visualViewport?.addEventListener("resize", applyTrackMinHeight, { passive: true });
    return () => {
      window.removeEventListener("resize", applyTrackMinHeight);
      window.visualViewport?.removeEventListener("resize", applyTrackMinHeight);
      const sec = measureRef?.current;
      const tr = trackRef.current;
      if (sec) sec.style.minHeight = "";
      if (tr) tr.style.minHeight = "";
    };
  }, [measureRef]);

  useEffect(() => {
    const tick = () => {
      const el = measureRef?.current;
      if (!el) return;
      const ih = (window.visualViewport?.height ?? window.innerHeight) || 1;
      const rect = el.getBoundingClientRect();
      const trackH = el.offsetHeight > 1 ? el.offsetHeight : rect.height;
      const stickyEl = el.querySelector(".fintap-steps-scroll__sticky");
      const topStr = stickyEl ? getComputedStyle(stickyEl).top : "0px";
      const stickyTopPx = Number.parseFloat(topStr) || 0;
      const idx = stepsIndexFromScrollProgress(
        rect.top,
        trackH,
        ih,
        FINTAP_STEPS.length,
        stickyTopPx,
      );
      setActive((prev) => (prev === idx ? prev : idx));
    };
    tick();
    window.addEventListener("scroll", tick, { passive: true });
    window.addEventListener("resize", tick, { passive: true });
    window.visualViewport?.addEventListener("resize", tick, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(tick) : null;
    queueMicrotask(() => {
      const t = measureRef?.current;
      if (ro && t) ro.observe(t);
    });
    return () => {
      window.removeEventListener("scroll", tick);
      window.removeEventListener("resize", tick);
      window.visualViewport?.removeEventListener("resize", tick);
      ro?.disconnect();
    };
  }, [measureRef]);

  return (
    <div ref={trackRef} className="fintap-steps-scroll__track">
      <div className="fintap-steps-scroll__sticky">
        <div className="fintap-steps-scroll__grid">
          <div className="fintap-steps-scroll__left">
            <h2 id="fintap-steps-heading" className="fintap-steps-scroll__h2">
              Lancez-vous en 3 étapes simples.
            </h2>
            <p className="fintap-steps-scroll__intro">
              Du commerce à la carte Wallet : tout est pensé pour vous faire gagner du temps et garder vos clients
              engagés.
            </p>
          </div>

          <div className="fintap-steps-scroll__rail" aria-hidden="true">
            <span className="fintap-steps-scroll__rail-line" />
            <span className="fintap-steps-scroll__badge">{active + 1}</span>
          </div>

          <div className="fintap-steps-scroll__right">
            <div className="fintap-steps-scroll__cards" role="tabpanel" aria-live="polite">
              {FINTAP_STEPS.map((step, i) => (
                <article
                  key={step.cardTitle}
                  className={`fintap-steps-card fintap-steps-card--etape-media${active === i ? " is-active" : ""}`}
                  aria-hidden={active !== i}
                >
                  <div className="fintap-steps-card__grey-panel">
                    <span className="fintap-steps-card__footer-num" aria-hidden="true">
                      {i + 1}
                    </span>
                    <div className="fintap-steps-card__grey-panel-media">
                      <StepVisualByIndex index={i} />
                    </div>
                    <h3 className="fintap-steps-card__title">{step.cardTitle}</h3>
                    <p className="fintap-steps-card__desc">{step.cardDesc}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
