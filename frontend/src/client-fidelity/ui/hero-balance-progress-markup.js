import {
  parsePointTiers,
  stampProgressTiers,
  tierProgressState,
  buildHeroLinearTickMarks,
  heroFillPercentLinear,
  stampCycleDisplayBalance,
} from "../lib/tier-progress.js";
import { resolveStampCellVisual } from "../lib/stamp-visual.js";

/**
 * @param {{
 *   memberPoints: number;
 *   programType: string;
 *   business: Record<string, unknown> | null | undefined;
 * }} p
 */
export function buildHeroBalanceProgressState(p) {
  const isStamps = String(p.programType || "").toLowerCase() === "stamps";
  const pts = isStamps
    ? stampCycleDisplayBalance(p.memberPoints, p.business)
    : Math.max(0, Math.floor(Number(p.memberPoints) || 0));
  const tiers = isStamps ? stampProgressTiers(p.business) : parsePointTiers(p.business);
  const requiredStamps = isStamps
    ? Math.max(1, Math.floor(Number(p.business?.required_stamps) || 10))
    : 0;
  const stampEmoji = String(p.business?.stamp_emoji || "✅").trim() || "✅";

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

    const { next } = tierProgressState(tiers, pts);
    if (next) {
      nextGoal = { threshold: next.threshold, label: next.label };
    } else {
      tiersComplete = true;
    }
    pct = heroFillPercentLinear(tiers, pts);
    tickMarks = buildHeroLinearTickMarks(tiers);
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
    requiredStamps,
    stampEmoji,
  };
}

/**
 * @param {(s: string) => string} esc
 * @param {{ type: string; src?: string; text?: string }} visual
 */
function renderStampCellInner(esc, visual) {
  if (visual.type === "catalog" || visual.type === "custom") {
    return `<img class="fidelity-hero-stamp-icon" src="${esc(String(visual.src || ""))}" alt="" decoding="async" loading="lazy" />`;
  }
  return `<span class="fidelity-hero-stamp-emoji">${esc(String(visual.text || "✅"))}</span>`;
}

/**
 * Grille visuelle tampons (pastilles liquid glass, sans chiffre en texte).
 * @param {(s: string) => string} esc
 * @param {{
 *   filled: number;
 *   total: number;
 *   stampEmoji: string;
 *   businessSlug?: string;
 *   apiBase?: string;
 * }} p
 */
export function buildHeroStampGridMarkup(esc, p) {
  const total = Math.max(1, Math.floor(Number(p.total) || 10));
  const filled = Math.min(Math.max(0, Math.floor(Number(p.filled) || 0)), total);
  const visual = resolveStampCellVisual({
    stampEmoji: p.stampEmoji,
    businessSlug: p.businessSlug,
    apiBase: p.apiBase,
  });
  const cellInner = renderStampCellInner(esc, visual);
  const cols = 5;
  const rows = Math.max(1, Math.ceil(total / cols));
  const rowHtml = [];
  for (let row = 0; row < rows; row += 1) {
    const cells = [];
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col;
      if (index >= total) break;
      const filledClass = index < filled ? " fidelity-hero-stamp--filled" : "";
      cells.push(`<span class="fidelity-hero-stamp${filledClass}">${cellInner}</span>`);
    }
    rowHtml.push(`<div class="fidelity-hero-stamps-row">${cells.join("")}</div>`);
  }
  return `<div class="fidelity-hero-stamps-grid" aria-hidden="true">${rowHtml.join("")}</div>`;
}

/**
 * @param {(s: string) => string} esc
 * @param {ReturnType<typeof buildHeroBalanceProgressState>} st
 * @param {{ businessSlug?: string; apiBase?: string }} [opts]
 */
export function renderHeroBalanceProgressMarkup(esc, st, opts = {}) {
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
    isStamps,
    requiredStamps,
    stampEmoji,
  } = st;
  const ariaText = nextGoal
    ? `Solde ${points} ${unitWord}, prochain palier à ${nextGoal.threshold} (${nextGoal.label})`
    : tiersComplete
      ? `Solde ${points} ${unitWord}, tous les paliers atteints`
      : hasProgressScale
        ? `Solde ${points} ${unitWord}, échelle jusqu'à ${maxScale}`
        : `Solde ${points} ${unitWord}`;

  if (isStamps) {
    const grid = buildHeroStampGridMarkup(esc, {
      filled: points,
      total: requiredStamps,
      stampEmoji,
      businessSlug: opts.businessSlug,
      apiBase: opts.apiBase,
    });
    const nextHint =
      nextGoal && !tiersComplete
        ? `<p class="fidelity-hero-stamps-next">${esc(`Prochaine récompense : ${nextGoal.label} · ${nextGoal.threshold} tampons`)}</p>`
        : tiersComplete
          ? `<p class="fidelity-hero-stamps-next fidelity-hero-stamps-next--complete">${esc("Tous les paliers atteints")}</p>`
          : "";
    return `
          <div class="fidelity-hero-progress fidelity-hero-progress--stamps" role="region" aria-label="${esc(ariaText)}">
            ${grid}
            ${nextHint}
          </div>`;
  }

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
              ${tickSpans ? `<div class="fidelity-hero-progress-ticks">${tickSpans}</div>` : ""}
            </div>
          </div>`;
}
