import { parsePointTiers, buildStampTiers, tierProgressState, buildHeroFullScaleTickMarks } from "../lib/tier-progress.js";

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
  /** @type {{ value: number; leftPct: number }[]} */
  let tickMarks = [];
  let progressMin = 0;
  let progressMax = 1;
  /** @type {{ threshold: number; label: string } | null} */
  let nextGoal = null;
  let tiersComplete = false;
  /** Faux si aucun palier publié : pas d’échelle générique type 25→125. */
  let hasProgressScale = false;

  if (tiers.length > 0) {
    hasProgressScale = true;
    maxScale = tiers[tiers.length - 1].threshold;
    progressMin = 0;
    progressMax = Math.max(1, maxScale);
    pct = Math.min(100, Math.max(0, (pts / progressMax) * 100));

    const { next } = tierProgressState(tiers, pts);
    if (next) {
      nextGoal = { threshold: next.threshold, label: next.label };
    } else {
      tiersComplete = true;
      pct = 100;
    }

    tickMarks = buildHeroFullScaleTickMarks(tiers);
  } else {
    maxScale = 0;
    pct = 0;
    tickMarks = [];
    progressMin = 0;
    progressMax = 0;
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
    tickMarks,
    maxScale,
    progressMin,
    progressMax,
    nextGoal,
    tiersComplete,
    isStamps,
    hasProgressScale,
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
    tickMarks,
    maxScale,
    progressMin,
    progressMax,
    nextGoal,
    tiersComplete,
    hasProgressScale,
  } = st;
  const ariaText = nextGoal
    ? `Solde ${points} ${unitWord}, prochain palier à ${nextGoal.threshold} (${nextGoal.label})`
    : tiersComplete
      ? `Solde ${points} ${unitWord}, tous les paliers atteints`
      : hasProgressScale
        ? `Solde ${points} ${unitWord}, échelle jusqu'à ${maxScale}`
        : `Solde ${points} ${unitWord}`;

  const labelBlock = `
            <p class="fidelity-hero-progress-label">
              <span class="fidelity-hero-progress-gradient-text">
                <span class="fidelity-hero-progress-amount">${esc(String(points))}</span>
                <span class="fidelity-hero-progress-unit"> ${esc(unitWord)}</span>
              </span>
            </p>`;

  if (!hasProgressScale) {
    return `
          <div class="fidelity-hero-progress fidelity-hero-progress--no-scale" role="region" aria-label="${esc(ariaText)}">
            ${labelBlock}
          </div>`;
  }

  const tickSpans = tickMarks
    .map(
      (m) =>
        `<span class="fidelity-hero-progress-tick" style="left:${m.leftPct}%">${esc(String(m.value))}</span>`,
    )
    .join("");

  const barNow = Math.min(Math.max(points, progressMin), progressMax);

  return `
          <div class="fidelity-hero-progress" role="region" aria-label="${esc(ariaText)}">
            ${labelBlock}
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
