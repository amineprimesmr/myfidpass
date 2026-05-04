import { useEffect, useRef, useState } from "react";
import { IconBrandGoogle } from "@tabler/icons-react";

const LOGO_INSTAGRAM = "/assets/logos/instagram.png?v=20260504";
const LOGO_TIKTOK = "/assets/logos/tiktok.png?v=20260504";
import { useInView, useReducedMotion } from "framer-motion";
import "./fintap-engagement-metrics-visual.css";

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

/**
 * @param {boolean} active
 * @param {number} start
 * @param {number} end
 * @param {number} durationMs
 * @param {number} delayMs
 * @param {0 | 1} decimals
 */
function useAnimatedMetric(active, start, end, durationMs, delayMs, decimals = 0) {
  const [value, setValue] = useState(start);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!active) return;

    const snap = () => {
      if (decimals === 0) return Math.round(end);
      if (decimals === 1) return Math.round(end * 10) / 10;
      return end;
    };

    if (reduced) {
      setValue(snap());
      return;
    }

    let cancelled = false;
    let startTs = /** @type {number | null} */ (null);

    const tick = (now) => {
      if (cancelled) return;
      if (startTs == null) startTs = now;
      const elapsed = now - startTs - delayMs;
      if (elapsed < 0) {
        requestAnimationFrame(tick);
        return;
      }
      const p = Math.min(1, elapsed / durationMs);
      const eased = easeOutCubic(p);
      const raw = start + (end - start) * eased;
      if (decimals === 0) setValue(Math.round(raw));
      else if (decimals === 1) setValue(Math.round(raw * 10) / 10);
      else setValue(raw);
      if (p < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
    return () => {
      cancelled = true;
    };
  }, [active, reduced, start, end, durationMs, delayMs, decimals]);

  return value;
}

function formatIntFr(n) {
  return Math.round(n).toLocaleString("fr-FR");
}

function formatCompactFr(n) {
  const v = Math.round(n);
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace(".", ",")} k`;
  return formatIntFr(v);
}

function formatRating(n) {
  return n.toFixed(1).replace(".", ",");
}

const G = { start: 118, end: 247 };
const IG = { start: 1240, end: 2840 };
const TK = { start: 890, end: 6120 };

const ICON = 30;

/**
 * Illustration animée : avis Google + abonnés réseaux (démonstration marketing).
 */
export function FinTapEngagementMetricsVisual() {
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const active = useInView(rootRef, { once: true, amount: 0.35 });

  const rating = useAnimatedMetric(active, 4.1, 4.8, 2100, 0, 1);
  const reviews = useAnimatedMetric(active, G.start, G.end, 2200, 110, 0);
  const insta = useAnimatedMetric(active, IG.start, IG.end, 2400, 200, 0);
  const tiktok = useAnimatedMetric(active, TK.start, TK.end, 2600, 320, 0);

  const dG = Math.max(0, reviews - G.start);
  const dI = Math.max(0, insta - IG.start);
  const dT = Math.max(0, tiktok - TK.start);

  const barG = active ? Math.min(1, (reviews - G.start) / (G.end - G.start)) : 0;
  const barI = active ? Math.min(1, (insta - IG.start) / (IG.end - IG.start)) : 0;
  const barT = active ? Math.min(1, (tiktok - TK.start) / (TK.end - TK.start)) : 0;

  return (
    <div
      ref={rootRef}
      className="fintap-engagement-visual"
      role="img"
      aria-label="Exemple d’évolution : note Google, nombre d’avis, abonnés Instagram et TikTok"
    >
      <div className="fintap-engagement-visual__row">
        <div className="fintap-engagement-visual__brand fintap-engagement-visual__brand--google" aria-hidden>
          <IconBrandGoogle size={ICON} stroke={1.35} />
        </div>
        <div className="fintap-engagement-visual__body">
          <p className="fintap-engagement-visual__label">Avis Google</p>
          <div className="fintap-engagement-visual__metrics">
            <span className="fintap-engagement-visual__rating">
              <span className="fintap-engagement-visual__stars" aria-hidden>
                ★★★★★
              </span>
              <span className="fintap-engagement-visual__rating-num">{formatRating(rating)}</span>
            </span>
            <span className="fintap-engagement-visual__count">{formatIntFr(reviews)} avis</span>
          </div>
          <div className="fintap-engagement-visual__bar" aria-hidden>
            <div
              className="fintap-engagement-visual__bar-fill fintap-engagement-visual__bar-fill--google"
              style={{ transform: `scaleX(${barG})` }}
            />
          </div>
        </div>
        <div
          className={`fintap-engagement-visual__delta${dG > 8 ? " is-hot" : ""}${dG > 2 ? " is-visible" : ""}`}
        >
          +{formatIntFr(dG)}
        </div>
      </div>

      <div className="fintap-engagement-visual__row">
        <div className="fintap-engagement-visual__brand fintap-engagement-visual__brand--insta" aria-hidden>
          <img className="fintap-engagement-visual__brand-logo" src={LOGO_INSTAGRAM} alt="" width={64} height={64} decoding="async" />
        </div>
        <div className="fintap-engagement-visual__body">
          <p className="fintap-engagement-visual__label">Instagram</p>
          <p className="fintap-engagement-visual__big">{formatCompactFr(insta)} abonnés</p>
          <div className="fintap-engagement-visual__bar" aria-hidden>
            <div
              className="fintap-engagement-visual__bar-fill fintap-engagement-visual__bar-fill--insta"
              style={{ transform: `scaleX(${barI})` }}
            />
          </div>
        </div>
        <div
          className={`fintap-engagement-visual__delta${dI > 400 ? " is-hot" : ""}${dI > 30 ? " is-visible" : ""}`}
        >
          +{formatCompactFr(dI)}
        </div>
      </div>

      <div className="fintap-engagement-visual__row">
        <div className="fintap-engagement-visual__brand fintap-engagement-visual__brand--tiktok" aria-hidden>
          <img className="fintap-engagement-visual__brand-logo" src={LOGO_TIKTOK} alt="" width={64} height={64} decoding="async" />
        </div>
        <div className="fintap-engagement-visual__body">
          <p className="fintap-engagement-visual__label">TikTok</p>
          <p className="fintap-engagement-visual__big">{formatCompactFr(tiktok)} abonnés</p>
          <div className="fintap-engagement-visual__bar" aria-hidden>
            <div
              className="fintap-engagement-visual__bar-fill fintap-engagement-visual__bar-fill--tiktok"
              style={{ transform: `scaleX(${barT})` }}
            />
          </div>
        </div>
        <div
          className={`fintap-engagement-visual__delta${dT > 2000 ? " is-hot" : ""}${dT > 80 ? " is-visible" : ""}`}
        >
          +{formatCompactFr(dT)}
        </div>
      </div>
    </div>
  );
}
