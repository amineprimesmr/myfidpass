import "./fintap-hero-desk-ctas.css";
import { FinTapHeroMediaBadge } from "./FinTapHeroMediaBadge.jsx";

/** Badge média TF1 — coin haut droit du hero desktop. */
export function FinTapHeroDeskCtas() {
  return (
    <div className="fintap-hero-desk-ctas">
      <FinTapHeroMediaBadge placement="top" />
    </div>
  );
}
