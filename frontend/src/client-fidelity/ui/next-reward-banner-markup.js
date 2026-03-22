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
        <div class="fidelity-v2-next-reward fidelity-v2-next-reward--visitor" role="region" aria-label="Programme fidélité">
          <p class="fidelity-v2-next-reward-one">Fidélité <strong>${businessNameEsc}</strong> <span class="fidelity-v2-next-reward-dotsep" aria-hidden="true">·</span> inscris-toi pour ta <strong>prochaine récompense</strong></p>
        </div>`;
  }

  if (state.kind === "no_tiers") {
    return `
        <div class="fidelity-v2-next-reward fidelity-v2-next-reward--neutral" role="status" aria-label="Paliers non affichés en ligne">
          <p class="fidelity-v2-next-reward-one">Prochaine récompense <span class="fidelity-v2-next-reward-dotsep" aria-hidden="true">·</span> <span class="fidelity-v2-next-reward-muted">paliers en magasin</span></p>
        </div>`;
  }

  if (state.kind === "complete") {
    const aria = `Palier max atteint : ${state.lastLabel}`;
    return `
        <div class="fidelity-v2-next-reward fidelity-v2-next-reward--complete" role="status" aria-label="${esc(aria)}">
          <p class="fidelity-v2-next-reward-one">
            <span class="fidelity-v2-next-reward-tag">Max</span>
            <strong class="fidelity-v2-next-reward-name">${esc(state.lastLabel)}</strong>
            <span class="fidelity-v2-next-reward-dotsep" aria-hidden="true">·</span>
            <span class="fidelity-v2-next-reward-muted">en magasin</span>
          </p>
          <div class="fidelity-v2-next-reward-bar" aria-hidden="true" style="--fid-next-pct: 100%;"><div class="fidelity-v2-next-reward-bar-fill"></div></div>
        </div>`;
  }

  const unitW = state.isStamps ? esc(state.unitShort) : "pts";
  const need = esc(String(state.need));
  const bal = esc(String(state.balance));
  const max = esc(String(state.nextThreshold));
  const aria = `Prochaine récompense : ${state.label}. ${state.balance} sur ${state.nextThreshold}, encore ${state.need} ${state.unitShort}.`;

  return `
        <div class="fidelity-v2-next-reward fidelity-v2-next-reward--inline" role="status" aria-label="${esc(aria)}">
          <p class="fidelity-v2-next-reward-one">
            <span class="fidelity-v2-next-reward-tag">Prochaine</span>
            <strong class="fidelity-v2-next-reward-name">${esc(state.label)}</strong>
            <span class="fidelity-v2-next-reward-dotsep" aria-hidden="true">·</span>
            <span class="fidelity-v2-next-reward-nums"><span id="fidelity-v2-header-balance-num">${bal}</span>/${max}</span>
            <span class="fidelity-v2-next-reward-dotsep" aria-hidden="true">·</span>
            <span class="fidelity-v2-next-reward-need">encore ${need} ${unitW}</span>
          </p>
          <div class="fidelity-v2-next-reward-bar" aria-hidden="true" style="--fid-next-pct: ${state.pct.toFixed(2)}%;"><div class="fidelity-v2-next-reward-bar-fill"></div></div>
        </div>`;
}
