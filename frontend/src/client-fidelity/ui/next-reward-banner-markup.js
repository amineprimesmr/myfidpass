import { buildStampTiers, parsePointTiers, tierProgressState } from "../lib/tier-progress.js";

/**
 * @param {{
 *   hasMember: boolean;
 *   business: Record<string, unknown> | null | undefined;
 *   member: { points?: number } | null | undefined;
 *   programType: string;
 *   balanceUnit: string;
 * }} opts
 */
export function buildNextRewardBannerState(opts) {
  const { hasMember, business, member, programType, balanceUnit } = opts;
  if (!hasMember) return { kind: "visitor" };

  const balance = Math.max(0, Math.floor(Number(member?.points) || 0));
  const isStamps = programType === "stamps";
  const tiers = isStamps ? buildStampTiers(business) : parsePointTiers(business);
  const unitShort = String(balanceUnit || "").trim() || (isStamps ? "tampons" : "pts");

  if (!tiers.length) {
    return { kind: "no_tiers" };
  }

  const { next, pct } = tierProgressState(tiers, balance);
  if (next) {
    return {
      kind: "next",
      balance,
      need: next.threshold - balance,
      nextThreshold: next.threshold,
      label: next.label,
      pct,
      isStamps,
      unitShort,
    };
  }

  const last = tiers[tiers.length - 1];
  return {
    kind: "complete",
    lastLabel: last.label,
    pct: 100,
  };
}

/**
 * @param {(s: string) => string} esc
 * @param {ReturnType<typeof buildNextRewardBannerState>} state
 * @param {{ businessNameEsc: string }} ctx businessName déjà échappé
 */
export function renderNextRewardBannerMarkup(esc, state, ctx) {
  const { businessNameEsc } = ctx;

  if (state.kind === "visitor") {
    return `
        <div class="fidelity-v2-next-reward fidelity-v2-next-reward--card fidelity-v2-next-reward--visitor" role="region" aria-label="Programme fidélité">
          <p class="fidelity-v2-next-reward-eyebrow">Programme fidélité</p>
          <p class="fidelity-v2-next-reward-lead"><strong>${businessNameEsc}</strong></p>
          <p class="fidelity-v2-next-reward-hint">Inscris-toi pour suivre ta progression vers la prochaine récompense.</p>
        </div>`;
  }

  if (state.kind === "no_tiers") {
    return `
        <div class="fidelity-v2-next-reward fidelity-v2-next-reward--card fidelity-v2-next-reward--neutral" role="status" aria-label="Paliers non affichés en ligne">
          <p class="fidelity-v2-next-reward-eyebrow">Récompenses</p>
          <p class="fidelity-v2-next-reward-lead">Paliers en magasin</p>
          <p class="fidelity-v2-next-reward-hint">Les étapes s’affichent sur place chez le commerce.</p>
        </div>`;
  }

  if (state.kind === "complete") {
    const aria = `Palier max atteint : ${state.lastLabel}`;
    return `
        <div class="fidelity-v2-next-reward fidelity-v2-next-reward--card fidelity-v2-next-reward--complete" role="status" aria-label="${esc(aria)}">
          <p class="fidelity-v2-next-reward-eyebrow">Objectif atteint</p>
          <p class="fidelity-v2-next-reward-title">${esc(state.lastLabel)}</p>
          <p class="fidelity-v2-next-reward-hint">Tu as débloqué la meilleure récompense du programme.</p>
          <div class="fidelity-v2-next-reward-bar" aria-hidden="true" style="--fid-next-pct: 100%;"><div class="fidelity-v2-next-reward-bar-fill"></div></div>
        </div>`;
  }

  const unitW = state.isStamps ? esc(state.unitShort) : "pts";
  const need = esc(String(state.need));
  const bal = esc(String(state.balance));
  const max = esc(String(state.nextThreshold));
  const aria = `Prochaine récompense : ${state.label}. ${state.balance} sur ${state.nextThreshold}, encore ${state.need} ${state.unitShort}.`;

  return `
        <div class="fidelity-v2-next-reward fidelity-v2-next-reward--card fidelity-v2-next-reward--next" role="status" aria-label="${esc(aria)}">
          <p class="fidelity-v2-next-reward-eyebrow">Ta prochaine récompense</p>
          <p class="fidelity-v2-next-reward-title">${esc(state.label)}</p>
          <div class="fidelity-v2-next-reward-stats" aria-hidden="true">
            <span class="fidelity-v2-next-reward-stat-num"><span class="fidelity-v2-next-reward-current">${bal}</span><span class="fidelity-v2-next-reward-stat-sep">/</span><span class="fidelity-v2-next-reward-max">${max}</span></span>
            <span class="fidelity-v2-next-reward-stat-unit">${unitW}</span>
          </div>
          <div class="fidelity-v2-next-reward-bar-wrap">
            <div class="fidelity-v2-next-reward-bar" style="--fid-next-pct: ${state.pct.toFixed(2)}%;"><div class="fidelity-v2-next-reward-bar-fill"></div></div>
          </div>
          <p class="fidelity-v2-next-reward-hint">Encore <strong>${need}</strong> ${unitW} pour la débloquer.</p>
        </div>`;
}
