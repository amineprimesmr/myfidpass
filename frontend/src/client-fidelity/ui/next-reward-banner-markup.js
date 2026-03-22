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
        <div class="fidelity-v2-next-reward fidelity-v2-next-reward--card fidelity-v2-next-reward--visitor fidelity-v2-next-reward--single-line" role="region" aria-label="Programme fidélité">
          <p class="fidelity-v2-next-reward-one-line">
            <strong class="fidelity-v2-next-reward-name-bit">${businessNameEsc}</strong>
            <span class="fidelity-v2-next-reward-sep" aria-hidden="true">·</span>
            <span class="fidelity-v2-next-reward-muted fidelity-v2-next-reward-truncate">Fidélité — inscris-toi pour suivre ta progression</span>
          </p>
        </div>`;
  }

  if (state.kind === "no_tiers") {
    return `
        <div class="fidelity-v2-next-reward fidelity-v2-next-reward--card fidelity-v2-next-reward--neutral fidelity-v2-next-reward--single-line" role="status" aria-label="Paliers non affichés en ligne">
          <p class="fidelity-v2-next-reward-one-line">
            <span class="fidelity-v2-next-reward-muted">Récompenses</span>
            <span class="fidelity-v2-next-reward-sep" aria-hidden="true">·</span>
            <span>Paliers en magasin</span>
          </p>
        </div>`;
  }

  if (state.kind === "complete") {
    const aria = `Palier max atteint : ${state.lastLabel}`;
    return `
        <div class="fidelity-v2-next-reward fidelity-v2-next-reward--card fidelity-v2-next-reward--complete fidelity-v2-next-reward--single-line" role="status" aria-label="${esc(aria)}">
          <p class="fidelity-v2-next-reward-one-line">
            <span class="fidelity-v2-next-reward-complete-mark" aria-hidden="true">✓</span>
            <span class="fidelity-v2-next-reward-complete-text">Palier max <span class="fidelity-v2-next-reward-sep" aria-hidden="true">·</span> <strong class="fidelity-v2-next-reward-name-bit">${esc(state.lastLabel)}</strong></span>
          </p>
        </div>`;
  }

  const unitW = state.isStamps ? esc(state.unitShort) : "pts";
  const need = esc(String(state.need));
  const needSuffix = state.isStamps ? ` ${unitW}` : "";
  const bal = esc(String(state.balance));
  const max = esc(String(state.nextThreshold));
  const aria = `Prochaine récompense : ${state.label}. ${state.balance} sur ${state.nextThreshold}, encore ${state.need} ${state.unitShort}.`;

  return `
        <div class="fidelity-v2-next-reward fidelity-v2-next-reward--card fidelity-v2-next-reward--next fidelity-v2-next-reward--single-line" role="status" aria-label="${esc(aria)}">
          <p class="fidelity-v2-next-reward-one-line">
            <span class="fidelity-v2-next-reward-title-bit">${esc(state.label)}</span>
            <span class="fidelity-v2-next-reward-sep" aria-hidden="true">·</span>
            <span class="fidelity-v2-next-reward-pts-bit"><span class="fidelity-v2-next-reward-current">${bal}</span><span class="fidelity-v2-next-reward-stat-sep">/</span><span class="fidelity-v2-next-reward-max">${max}</span> <span class="fidelity-v2-next-reward-stat-unit">${unitW}</span></span>
            <span class="fidelity-v2-next-reward-sep" aria-hidden="true">·</span>
            <span class="fidelity-v2-next-reward-need-bit">+<strong>${need}</strong>${needSuffix}</span>
          </p>
        </div>`;
}
