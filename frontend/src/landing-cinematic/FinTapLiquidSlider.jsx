import "./fintap-liquid-slider.css";

/**
 * Slider liquid glass — même UX que Trackapp affiliation.
 * @param {{
 *   min: number;
 *   max: number;
 *   value: number;
 *   onChange: (value: number) => void;
 *   ariaLabel: string;
 *   labelsMin?: string | number;
 *   labelsMax?: string | number;
 * }} props
 */
export function FinTapLiquidSlider({
  min,
  max,
  value,
  onChange,
  ariaLabel,
  labelsMin,
  labelsMax,
}) {
  const span = max - min || 1;
  const pct = (value - min) / span;

  return (
    <div className="fintap-liquid-slider-ui">
      <div className="fintap-liquid-slider-labels">
        <span>{labelsMin ?? min}</span>
        <span>{labelsMax ?? `${max}+`}</span>
      </div>
      <div className="fintap-liquid-slider">
        <div className="fintap-liquid-slider-stage">
          <div className="fintap-liquid-slider-grid" aria-hidden />
          <div className="fintap-liquid-slider-rail">
            <div className="fintap-liquid-slider-track-bg" />
            <div className="fintap-liquid-slider-fill" style={{ width: `${pct * 100}%` }} />
            <input
              type="range"
              min={min}
              max={max}
              value={value}
              onChange={(e) => onChange(Number(e.target.value))}
              className="fintap-liquid-slider-input"
              aria-valuemin={min}
              aria-valuemax={max}
              aria-valuenow={value}
              aria-label={ariaLabel}
            />
            <div className="fintap-liquid-slider-thumb-wrap" style={{ left: `${pct * 100}%` }}>
              <span className="fintap-liquid-slider-thumb-badge">{value}</span>
              <div className="fintap-liquid-slider-thumb-glass">
                <span className="fintap-liquid-slider-thumb-specular" aria-hidden />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
