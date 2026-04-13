import { buildStampTiers, parsePointTiers } from "../lib/tier-progress.js";

/** Icône cadenas (palier non atteint). */
function lockIconSvg() {
  return `<svg class="fid-reward-card__lock-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
}

/** Icône déverrouillé. */
function unlockedIconSvg() {
  return `<svg class="fid-reward-card__lock-icon fid-reward-card__lock-icon--open" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`;
}

function rewardPlaceholderSvg() {
  return `<svg class="fid-reward-card__placeholder-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12v10H4V12"/><path d="M22 7H2v5h20z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>`;
}

/**
 * @param {{ threshold: number; label: string; imageUrl?: string }} t
 * @param {boolean} unlocked
 * @param {string} costLine
 * @param {(s: string) => string} esc
 */
function renderRewardCard(t, unlocked, costLine, esc) {
  const aria = unlocked
    ? `${t.label}, ${costLine}, palier atteint, ouvrir pour utiliser`
    : `${t.label}, ${costLine}, à débloquer`;
  const labelEnc = encodeURIComponent(t.label);
  const costEnc = encodeURIComponent(costLine);
  const visual = t.imageUrl
    ? `<img class="fid-reward-card__img" src="${esc(t.imageUrl)}" alt="" decoding="async" loading="lazy" />`
    : `<div class="fid-reward-card__placeholder" aria-hidden="true">${rewardPlaceholderSvg()}</div>`;

  const mod = unlocked ? "fid-reward-card--unlocked" : "fid-reward-card--locked";

  return `          <li class="fid-reward-card ${mod}" role="listitem">
            <button type="button" class="fid-reward-card__surface" data-fid-reward-trigger
              data-reward-unlocked="${unlocked ? "1" : "0"}"
              data-reward-threshold="${String(t.threshold)}"
              data-reward-label="${labelEnc}"
              data-reward-costline="${costEnc}"
              aria-label="${esc(aria)}">
              <div class="fid-reward-card__visual-ring">
                ${visual}
              </div>
              <h3 class="fid-reward-card__title">${esc(t.label)}</h3>
              <p class="fid-reward-card__cost">
                <span class="fid-reward-card__cost-icon" aria-hidden="true">${unlocked ? unlockedIconSvg() : lockIconSvg()}</span>
                <span class="fid-reward-card__cost-text">${esc(costLine)}</span>
              </p>
            </button>
          </li>`;
}

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

  const emptyCard =
    tiers.length === 0
      ? `
    <div class="fid-rewards-empty">
      <div class="fid-rewards-empty__icon" aria-hidden="true">&#x1F381;</div>
      <p class="fid-rewards-empty__text">Les <strong>récompenses</strong> définies par le commerce s’affichent ici dès qu’elles sont configurées.</p>
    </div>`
      : "";

  const gridHtml =
    tiers.length === 0
      ? ""
      : `<ul class="fid-rewards-grid" role="list" aria-label="Récompenses du programme">
${tiers
  .map((t) => {
    const unlocked = balance >= t.threshold;
    const costNum = esc(String(t.threshold));
    const costLine = isStamps ? `${costNum} ${unitEsc}` : `${costNum} points`;
    return renderRewardCard(
      /** @type {{ threshold: number; label: string; imageUrl?: string }} */ (t),
      unlocked,
      costLine,
      esc,
    );
  })
  .join("\n")}
        </ul>`;

  return `
            <div class="fid-rewards-block">
              ${emptyCard}
              ${gridHtml}
            </div>`;
}
