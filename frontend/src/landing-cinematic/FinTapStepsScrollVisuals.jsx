/** Visuels des 3 étapes : images etape1 / etape2 / etape3. */

const ETAPE_ASSETS = [
  "/assets/etape1.png?v=20260206",
  "/assets/etape2.png?v=20260206",
  "/assets/etape3.jpg?v=20260531",
];

const ETAPE_ALTS = [
  "Étape 1 : téléchargez l'app",
  "Étape 2 : créez votre carte",
  "Étape 3 : affichez votre flyer de jeu",
];

/**
 * @param {number} index — 0, 1 ou 2
 */
export function StepVisualByIndex({ index }) {
  const i = Math.min(2, Math.max(0, index));
  return (
    <figure className="fintap-steps-mock fintap-steps-mock--etape">
      <div className="fintap-steps-mock-etape__frame">
        <img
          className="fintap-steps-mock-etape__img"
          src={ETAPE_ASSETS[i]}
          alt={ETAPE_ALTS[i]}
          width={1024}
          height={1024}
          loading="lazy"
          decoding="async"
        />
      </div>
    </figure>
  );
}
