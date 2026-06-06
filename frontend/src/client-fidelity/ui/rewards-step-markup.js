import {
  buildStampTiers,
  isStampTierUnlocked,
  parsePointTiers,
  stampCycleDisplayBalance,
  STAMP_START_GAME_THRESHOLD,
} from "../lib/tier-progress.js";

/** Images par défaut : `public/assets/gift/gift1.png` … `gift5.png` (rotation par palier). */
const DEFAULT_GIFT_COUNT = 5;
const DEFAULT_GIFT_BASE = "/assets/gift";

function defaultGiftImageUrl(tierIndex) {
  const n = (tierIndex % DEFAULT_GIFT_COUNT) + 1;
  return `${DEFAULT_GIFT_BASE}/gift${n}.png`;
}

/** Icône cadenas (palier non atteint). */
function lockIconSvg() {
  return `<svg class="fid-reward-card__lock-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
}

/** Icône déverrouillé. */
function unlockedIconSvg() {
  return `<svg class="fid-reward-card__lock-icon fid-reward-card__lock-icon--open" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`;
}

/**
 * @param {{ threshold: number; label: string; imageUrl?: string }} t
 * @param {boolean} unlocked
 * @param {string} costLine
 * @param {(s: string) => string} esc
 * @param {string} displayImageUrl URL finale (perso ou gift1…5)
 */
function renderRewardCard(t, unlocked, costLine, esc, displayImageUrl, tierIndex) {
  const aria = unlocked
    ? `${t.label}, ${costLine}, palier atteint, ouvrir pour utiliser`
    : `${t.label}, ${costLine}, à débloquer`;
  const labelEnc = encodeURIComponent(t.label);
  const costEnc = encodeURIComponent(costLine);
  const visual = `<img class="fid-reward-card__img" src="${esc(displayImageUrl)}" alt="" decoding="async" loading="lazy" />`;

  const mod = unlocked ? "fid-reward-card--unlocked" : "fid-reward-card--locked";

  return `          <li class="fid-reward-card ${mod}" role="listitem">
            <button type="button" class="fid-reward-card__surface" data-fid-reward-trigger
              data-reward-unlocked="${unlocked ? "1" : "0"}"
              data-reward-tier-index="${String(typeof t.dbTierIndex === "number" && t.dbTierIndex >= 0 ? t.dbTierIndex : tierIndex)}"
              data-reward-points="${String(t.threshold)}"
              data-reward-threshold="${String(t.threshold)}"
              data-reward-label="${labelEnc}"
              data-reward-costline="${costEnc}"
              aria-label="${esc(aria)}">
              <div class="fid-reward-card__visual">
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
  const balance = isStamps
    ? stampCycleDisplayBalance(member?.points, business)
    : Math.max(0, Math.floor(Number(member?.points) || 0));
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
  .map((t, tierIndex) => {
    const unlocked = isStamps
      ? isStampTierUnlocked(t.threshold, balance, business, tiers)
      : balance >= t.threshold;
    const costNum = esc(String(t.threshold));
    const costLine = isStamps
      ? t.threshold === STAMP_START_GAME_THRESHOLD || t.isStartGame
        ? "Début du jeu"
        : `${costNum} ${unitEsc}`
      : `${costNum} points`;
    const tier = /** @type {{ threshold: number; label: string; imageUrl?: string }} */ (t);
    const displayImageUrl = tier.imageUrl || defaultGiftImageUrl(tierIndex);
    return renderRewardCard(tier, unlocked, costLine, esc, displayImageUrl, tierIndex);
  })
  .join("\n")}
        </ul>`;

  return `
            <div class="fid-rewards-block">
              ${emptyCard}
              ${gridHtml}
            </div>`;
}
