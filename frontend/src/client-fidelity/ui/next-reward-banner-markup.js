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

  const { next, prevThreshold, pct } = tierProgressState(tiers, balance);
  if (next) {
    return {
      kind: "next",
      balance,
      need: next.threshold - balance,
      nextThreshold: next.threshold,
      prevThreshold,
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
          <p class="fidelity-v2-next-reward-visitor-lead">Fidélité <strong>${businessNameEsc}</strong></p>
          <p class="fidelity-v2-next-reward-visitor-sub">Inscris-toi pour voir ta <strong>prochaine récompense</strong>.</p>
        </div>`;
  }

  if (state.kind === "no_tiers") {
    return `
        <div class="fidelity-v2-next-reward fidelity-v2-next-reward--neutral" role="status" aria-label="Paliers du programme non affichés en ligne">
          <span class="fidelity-v2-next-reward-kicker">Prochaine récompense</span>
          <p class="fidelity-v2-next-reward-neutral-msg">Les paliers ne sont pas encore affichés ici — renseigne-toi <strong>en magasin</strong>.</p>
        </div>`;
  }

  if (state.kind === "complete") {
    const aria = `Palier max atteint : ${state.lastLabel}`;
    return `
        <div class="fidelity-v2-next-reward fidelity-v2-next-reward--complete" role="status" aria-label="${esc(aria)}">
          <span class="fidelity-v2-next-reward-kicker">Palier max atteint</span>
          <div class="fidelity-v2-next-reward-row">
            <span class="fidelity-v2-next-reward-arrow" aria-hidden="true">→</span>
            <strong class="fidelity-v2-next-reward-label">${esc(state.lastLabel)}</strong>
          </div>
          <p class="fidelity-v2-next-reward-meta fidelity-v2-next-reward-meta--success">Récompense débloquée — passe <strong>en magasin</strong> pour en profiter.</p>
          <div class="fidelity-v2-next-reward-bar" aria-hidden="true" style="--fid-next-pct: 100%;"><div class="fidelity-v2-next-reward-bar-fill"></div></div>
        </div>`;
  }

  const unitW = state.isStamps ? esc(state.unitShort) : "pts";
  const need = esc(String(state.need));
  const bal = esc(String(state.balance));
  const max = esc(String(state.nextThreshold));
  const aria = `Prochaine récompense : ${state.label}. Encore ${state.need} ${state.unitShort}. ${state.balance} sur ${state.nextThreshold}.`;

  return `
        <div class="fidelity-v2-next-reward" role="status" aria-label="${esc(aria)}">
          <span class="fidelity-v2-next-reward-kicker">Prochaine récompense</span>
          <div class="fidelity-v2-next-reward-row">
            <span class="fidelity-v2-next-reward-arrow" aria-hidden="true">→</span>
            <strong class="fidelity-v2-next-reward-label">${esc(state.label)}</strong>
          </div>
          <p class="fidelity-v2-next-reward-meta">Encore <strong>${need}</strong> ${unitW} · <span id="fidelity-v2-header-balance-num">${bal}</span> / ${max}</p>
          <div class="fidelity-v2-next-reward-bar" aria-hidden="true" style="--fid-next-pct: ${state.pct.toFixed(2)}%;"><div class="fidelity-v2-next-reward-bar-fill"></div></div>
        </div>`;
}
