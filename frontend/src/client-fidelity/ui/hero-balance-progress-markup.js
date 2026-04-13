import { parsePointTiers, buildStampTiers, tierProgressState } from "../lib/tier-progress.js";

const TICK_COUNT = 5;

/**
 * @param {{
 *   memberPoints: number;
 *   programType: string;
 *   business: Record<string, unknown> | null | undefined;
 * }} p
 */
export function buildHeroBalanceProgressState(p) {
  const pts = Math.max(0, Math.floor(Number(p.memberPoints) || 0));
  const isStamps = String(p.programType || "").toLowerCase() === "stamps";
  const tiers = isStamps ? buildStampTiers(p.business) : parsePointTiers(p.business);

  let pct;
  let maxScale;
  /** @type {number[]} */
  let ticks;
  let progressMin = 0;
  let progressMax = 1;
  /** @type {{ threshold: number; label: string } | null} */
  let nextGoal = null;
  let tiersComplete = false;

  if (tiers.length > 0) {
    const { next, prevThreshold, pct: segPct } = tierProgressState(tiers, pts);
    pct = segPct;
    if (next) {
      nextGoal = { threshold: next.threshold, label: next.label };
      progressMin = prevThreshold;
      progressMax = next.threshold;
      maxScale = next.threshold;
      const span = next.threshold - prevThreshold;
      if (span > 0) {
        ticks = Array.from({ length: TICK_COUNT }, (_, i) =>
          Math.round(prevThreshold + (span * (i + 1)) / TICK_COUNT),
        );
      } else {
        ticks = Array.from({ length: TICK_COUNT }, () => next.threshold);
      }
    } else {
      tiersComplete = true;
      pct = 100;
      maxScale = tiers[tiers.length - 1].threshold;
      progressMin = 0;
      progressMax = maxScale;
      ticks = Array.from({ length: TICK_COUNT }, (_, i) =>
        Math.round((maxScale * (i + 1)) / TICK_COUNT),
      );
    }
  } else {
    maxScale = Math.max(125, Math.ceil(Math.max(pts, 1) / 25) * 25);
    if (!Number.isFinite(maxScale) || maxScale < 1) maxScale = 1;
    pct = Math.min(100, Math.max(0, (pts / maxScale) * 100));
    progressMin = 0;
    progressMax = maxScale;
    ticks = Array.from({ length: TICK_COUNT }, (_, i) =>
      Math.round((maxScale * (i + 1)) / TICK_COUNT),
    );
  }

  let unitWord;
  if (isStamps) {
    unitWord = pts === 1 ? "tampon" : "tampons";
  } else {
    unitWord = pts === 1 ? "point" : "points";
  }

  return {
    points: pts,
    unitWord,
    pct,
    ticks,
    tickCount: TICK_COUNT,
    maxScale,
    progressMin,
    progressMax,
    nextGoal,
    tiersComplete,
    isStamps,
  };
}

/**
 * @param {(s: string) => string} esc
 * @param {ReturnType<typeof buildHeroBalanceProgressState>} st
 */
export function renderHeroBalanceProgressMarkup(esc, st) {
  const {
    points,
    unitWord,
    pct,
    ticks,
    tickCount,
    maxScale,
    progressMin,
    progressMax,
    nextGoal,
    tiersComplete,
  } = st;
  const ariaText = nextGoal
    ? `Solde ${points} ${unitWord}, prochain palier à ${nextGoal.threshold} (${nextGoal.label})`
    : tiersComplete
      ? `Solde ${points} ${unitWord}, tous les paliers atteints`
      : `Solde ${points} ${unitWord}, échelle jusqu'à ${maxScale}`;
  const tickSpans = ticks
    .map(
      (v, i) =>
        `<span class="fidelity-hero-progress-tick" style="left:${((i + 1) / tickCount) * 100}%">${esc(String(v))}</span>`,
    )
    .join("");

  const barNow = Math.min(Math.max(points, progressMin), progressMax);

  return `
          <div class="fidelity-hero-progress" role="region" aria-label="${esc(ariaText)}">
            <p class="fidelity-hero-progress-label">
              <span class="fidelity-hero-progress-gradient-text">
                <span class="fidelity-hero-progress-amount">${esc(String(points))}</span>
                <span class="fidelity-hero-progress-unit"> ${esc(unitWord)}</span>
              </span>
            </p>
            <div
              class="fidelity-hero-progress-track-outer"
              role="progressbar"
              aria-valuemin="${progressMin}"
              aria-valuemax="${progressMax}"
              aria-valuenow="${barNow}"
              aria-label="${esc(ariaText)}"
            >
              <div class="fidelity-hero-progress-track">
                <div class="fidelity-hero-progress-fill" style="width:${pct}%"></div>
                <span class="fidelity-hero-progress-thumb" style="left:${pct}%"></span>
              </div>
              <div class="fidelity-hero-progress-ticks">${tickSpans}</div>
            </div>
          </div>`;
}
