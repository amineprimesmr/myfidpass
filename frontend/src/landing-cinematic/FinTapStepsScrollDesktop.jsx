import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FINTAP_STEPS } from "./fintap-steps-data.js";
import { StepVisualByIndex } from "./FinTapStepsScrollVisuals.jsx";

/**
 * Desktop ≥901px : texte gauche ancré (fixed simulé) pendant le défilement des cartes,
 * puis calé en bas de colonne en fin de section — évite les échecs de `position: sticky`
 * (flex, overflow-x sur body, etc.).
 *
 * @param {{ measureRef: { current: HTMLElement | null } }} props
 */
export function FinTapStepsScrollDesktop({ measureRef }) {
  const leftColRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const rightRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const panelRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const pinTopRef = useRef(104);
  const [rightH, setRightH] = useState(0);
  const [active, setActive] = useState(0);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const prev = panel.style.cssText;
    panel.style.position = "sticky";
    panel.style.top = "var(--fintap-steps-nav-clear)";
    const v = parseFloat(getComputedStyle(panel).top);
    if (!Number.isNaN(v) && v > 0) pinTopRef.current = v;
    panel.style.cssText = prev;
  }, []);

  useEffect(() => {
    const right = rightRef.current;
    if (!right || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setRightH(Math.round(right.offsetHeight));
    });
    ro.observe(right);
    setRightH(Math.round(right.offsetHeight));
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const section = measureRef?.current;
    if (!section) return;

    const cardEls = () =>
      Array.from(
        section.querySelectorAll(".fintap-steps-scroll__desktop-row .fintap-steps-scroll__right article"),
      );

    let ticking = false;
    const applyPin = () => {
      ticking = false;
      const panel = panelRef.current;
      const leftCol = leftColRef.current;
      if (!panel || !leftCol) return;

      const pt = pinTopRef.current;
      const ph = panel.offsetHeight;
      const lc = leftCol.getBoundingClientRect();
      let mode = "flow";
      if (lc.top <= pt && lc.bottom >= pt + ph + 8) mode = "pinned";
      else if (lc.top <= pt) mode = "docked";

      if (mode === "flow") {
        panel.classList.remove("is-left-pinned", "is-left-docked");
        panel.style.position = "";
        panel.style.top = "";
        panel.style.left = "";
        panel.style.width = "";
        panel.style.right = "";
        panel.style.bottom = "";
      } else if (mode === "pinned") {
        panel.classList.add("is-left-pinned");
        panel.classList.remove("is-left-docked");
        panel.style.position = "fixed";
        panel.style.top = `${pt}px`;
        panel.style.left = `${lc.left}px`;
        panel.style.width = `${lc.width}px`;
        panel.style.right = "";
        panel.style.bottom = "";
      } else {
        panel.classList.remove("is-left-pinned");
        panel.classList.add("is-left-docked");
        panel.style.position = "absolute";
        panel.style.top = "auto";
        panel.style.bottom = "0";
        panel.style.left = "0";
        panel.style.right = "0";
        panel.style.width = "";
      }
    };

    const tickActive = () => {
      const list = cardEls();
      if (list.length === 0) return;
      const ih = window.visualViewport?.height ?? window.innerHeight ?? 800;
      const pt = pinTopRef.current;
      const focalY = pt + (ih - pt) * 0.42;
      let bestIdx = 0;
      let bestDist = Infinity;
      list.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const mid = (r.top + r.bottom) / 2;
        const d = Math.abs(mid - focalY);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      });
      setActive((prev) => (prev === bestIdx ? prev : bestIdx));
    };

    const schedule = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          applyPin();
          tickActive();
        });
      }
    };

    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.visualViewport?.addEventListener("resize", schedule, { passive: true });

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    ro?.observe(section);
    const lc = leftColRef.current;
    if (lc) ro.observe(lc);

    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      ro?.disconnect();
      const panel = panelRef.current;
      if (panel) {
        panel.classList.remove("is-left-pinned", "is-left-docked");
        panel.style.cssText = "";
      }
    };
  }, [measureRef, rightH]);

  return (
    <div className="fintap-steps-scroll__track">
      <div className="fintap-steps-scroll__desktop-row">
        <div
          ref={leftColRef}
          className="fintap-steps-scroll__left-col"
          style={rightH > 0 ? { minHeight: rightH } : undefined}
        >
          <div ref={panelRef} className="fintap-steps-scroll__left-sticky">
            <div className="fintap-steps-scroll__left">
              <h2 id="fintap-steps-heading" className="fintap-steps-scroll__h2">
                Lancez-vous en 3 étapes simples.
              </h2>
              <p className="fintap-steps-scroll__intro">
                Du commerce à la carte Wallet : tout est pensé pour vous faire gagner du temps et garder vos clients
                engagés.
              </p>
            </div>
          </div>
        </div>

        <div className="fintap-steps-scroll__rail" aria-hidden="true">
          <span className="fintap-steps-scroll__rail-line" />
          <span className="fintap-steps-scroll__badge">{active + 1}</span>
        </div>

        <div ref={rightRef} className="fintap-steps-scroll__right">
          <div className="fintap-steps-scroll__cards" role="list" aria-live="polite">
            {FINTAP_STEPS.map((step, i) => (
              <article
                key={step.cardTitle}
                className={`fintap-steps-card fintap-steps-card--etape-media${active === i ? " is-active" : ""}`}
                role="listitem"
                aria-current={active === i ? "step" : undefined}
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
  );
}
