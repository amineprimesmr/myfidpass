import { buildStampTiers, parsePointTiers, tierProgressState } from "../lib/tier-progress.js";

/** Section « Récompenses » : paliers (points / tampons). */

/**
 * @param {(s: string) => string} esc
 * @param {{
 *   business: Record<string, unknown> | null | undefined;
 *   member: { points?: number } | null | undefined;
 *   programType: string;
 *   balanceUnit: string;
 * }} ctx
 */
export function renderRewardsStepMarkup(esc, ctx) {
  const { business, member, programType, balanceUnit } = ctx;
  const isStamps = programType === "stamps";
  const balance = Math.max(0, Math.floor(Number(member?.points) || 0));
  const tiers = isStamps ? buildStampTiers(business) : parsePointTiers(business);
  const unitEsc = esc(balanceUnit);

  const { next } = tierProgressState(tiers, balance);

  const emptyCard =
    tiers.length === 0
      ? `
    <div class="fid-tiers-empty-card">
      <div class="fid-tiers-empty-icon" aria-hidden="true">📋</div>
      <p class="fid-tiers-empty-text">Les <strong>paliers de récompenses</strong> définis par le commerce s’afficheront ici dès qu’ils sont configurés.</p>
    </div>`
      : "";

  const stepsHtml =
    tiers.length === 0
      ? ""
      : `<ol class="fid-tiers-track" aria-label="Paliers du programme">
${tiers
  .map((t, i) => {
    const done = balance >= t.threshold;
    const isCurrent = !!(next && t.threshold === next.threshold);
    const stateClass = done ? "fid-tiers-step--done" : isCurrent ? "fid-tiers-step--current" : "fid-tiers-step--locked";
    const marker = done ? "✓" : isCurrent ? String(i + 1) : "·";
    const req = `${esc(String(t.threshold))} ${isStamps ? unitEsc : "pts"}`;
    return `          <li class="fid-tiers-step ${stateClass}">
            <span class="fid-tiers-step-marker" aria-hidden="true">${marker}</span>
            <div class="fid-tiers-step-body">
              <span class="fid-tiers-step-threshold">${req}</span>
              <span class="fid-tiers-step-label">${esc(t.label)}</span>
            </div>
          </li>`;
  })
  .join("\n")}
        </ol>`;

  return `
            <div class="fid-tiers-block">
              ${emptyCard}
              ${stepsHtml}
            </div>`;
}
