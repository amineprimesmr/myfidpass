import { FINTAP_STEPS } from "./fintap-steps-data.js";

/** Visuels des 3 étapes : images etape1 / etape2 / etape3. */

const FINTAP_STEP1_QR_SCAN_IMG = "/assets/image-caroussel/content9.png?v=5";

const ETAPE_ASSETS = [
  FINTAP_STEP1_QR_SCAN_IMG,
  "/assets/etape2.png?v=20260206",
  "/assets/etape3.jpg?v=20260531",
];

/**
 * @param {number} index — 0, 1 ou 2
 */
export function StepVisualByIndex({ index }) {
  const i = Math.min(2, Math.max(0, index));
  const alt = FINTAP_STEPS[i]?.imageAlt ?? `Étape ${i + 1}`;
  return (
    <figure className="fintap-steps-mock fintap-steps-mock--etape">
      <div className="fintap-steps-mock-etape__frame">
        <img
          className="fintap-steps-mock-etape__img"
          src={ETAPE_ASSETS[i]}
          alt={alt}
          width={1024}
          height={1024}
          loading="lazy"
          decoding="async"
        />
      </div>
    </figure>
  );
}
