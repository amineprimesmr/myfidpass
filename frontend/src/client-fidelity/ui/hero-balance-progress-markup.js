import { parsePointTiers, buildStampTiers } from "../lib/tier-progress.js";

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

  let maxScale;
  if (tiers.length > 0) {
    maxScale = tiers[tiers.length - 1].threshold;
  } else {
    maxScale = Math.max(125, Math.ceil(Math.max(pts, 1) / 25) * 25);
  }
  if (!Number.isFinite(maxScale) || maxScale < 1) maxScale = 1;

  const pct = Math.min(100, Math.max(0, (pts / maxScale) * 100));

  const ticks = Array.from({ length: TICK_COUNT }, (_, i) =>
    Math.round((maxScale * (i + 1)) / TICK_COUNT),
  );

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
    isStamps,
  };
}

/**
 * @param {(s: string) => string} esc
 * @param {ReturnType<typeof buildHeroBalanceProgressState>} st
 */
export function renderHeroBalanceProgressMarkup(esc, st) {
  const { points, unitWord, pct, ticks, tickCount, maxScale } = st;
  const aria = `Solde ${points} ${unitWord}, progression sur ${maxScale}`;
  const tickSpans = ticks
    .map(
      (v, i) =>
        `<span class="fidelity-hero-progress-tick" style="left:${((i + 1) / tickCount) * 100}%">${esc(String(v))}</span>`,
    )
    .join("");

  return `
          <div class="fidelity-hero-progress" role="region" aria-label="${esc(aria)}">
            <p class="fidelity-hero-progress-label">
              <span class="fidelity-hero-progress-gradient-text">
                <span class="fidelity-hero-progress-amount">${esc(String(points))}</span>
                <span class="fidelity-hero-progress-unit"> ${esc(unitWord)}</span>
              </span>
            </p>
            <div
              class="fidelity-hero-progress-track-outer"
              role="progressbar"
              aria-valuemin="0"
              aria-valuemax="${maxScale}"
              aria-valuenow="${points}"
              aria-label="${esc(aria)}"
            >
              <div class="fidelity-hero-progress-track">
                <div class="fidelity-hero-progress-fill" style="width:${pct}%"></div>
                <span class="fidelity-hero-progress-thumb" style="left:${pct}%"></span>
              </div>
              <div class="fidelity-hero-progress-ticks">${tickSpans}</div>
            </div>
          </div>`;
}
