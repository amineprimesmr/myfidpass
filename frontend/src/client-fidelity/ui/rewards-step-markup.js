/**
 * Section « Récompenses » : paliers (points / tampons) + progression.
 */

const STAMP_MID_DEFAULT = 5;

/**
 * @param {unknown} business
 * @returns {{ threshold: number; label: string }[]}
 */
function parsePointTiers(business) {
  let raw = business?.points_reward_tiers;
  if (typeof raw === "string" && raw.trim()) {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = [];
    }
  }
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const t of raw) {
    if (t == null) continue;
    const threshold = parseInt(String(t.points ?? t.points_required), 10);
    const label = String(t.label ?? "").trim() || "Récompense";
    if (Number.isNaN(threshold) || threshold < 0) continue;
    out.push({ threshold, label });
  }
  out.sort((a, b) => a.threshold - b.threshold);
  return out;
}

/**
 * @param {unknown} business
 * @returns {{ threshold: number; label: string }[]}
 */
function buildStampTiers(business) {
  const required = Number(business?.required_stamps);
  if (!Number.isInteger(required) || required <= 0) return [];
  const midLabel = String(business?.stamp_mid_reward_label ?? "").trim();
  const finalLabel = String(business?.stamp_reward_label ?? "").trim() || "Récompense";
  const tiers = [];
  if (midLabel && required > STAMP_MID_DEFAULT) {
    tiers.push({ threshold: STAMP_MID_DEFAULT, label: midLabel });
  }
  tiers.push({ threshold: required, label: finalLabel });
  tiers.sort((a, b) => a.threshold - b.threshold);
  const seen = new Set();
  return tiers.filter((t) => {
    if (seen.has(t.threshold)) return false;
    seen.add(t.threshold);
    return true;
  });
}

/**
 * @param {{ threshold: number; label: string }[]} tiers
 * @param {number} balance
 */
function tierProgressState(tiers, balance) {
  const next = tiers.find((t) => balance < t.threshold);
  const prevThreshold = next ? tiers.filter((t) => t.threshold < next.threshold).pop()?.threshold ?? 0 : tiers.length ? tiers[tiers.length - 1].threshold : 0;
  let pct = 0;
  if (next) {
    const span = next.threshold - prevThreshold;
    pct = span > 0 ? ((balance - prevThreshold) / span) * 100 : 0;
  } else if (tiers.length) {
    pct = 100;
  }
  pct = Math.max(0, Math.min(100, pct));
  return { next, prevThreshold, pct };
}

/**
 * @param {(s: string) => string} esc
 * @param {{
 *   business: Record<string, unknown> | null | undefined;
 *   member: { points?: number } | null | undefined;
 *   programType: string;
 *   balanceUnit: string;
 *   stampEmoji: string;
 * }} ctx
 */
export function renderRewardsStepMarkup(esc, ctx) {
  const { business, member, programType, balanceUnit, stampEmoji } = ctx;
  const isStamps = programType === "stamps";
  const balance = Math.max(0, Math.floor(Number(member?.points) || 0));
  const tiers = isStamps ? buildStampTiers(business) : parsePointTiers(business);
  const unitEsc = esc(balanceUnit);
  const emojiHtml = stampEmoji ? `<span class="fid-tiers-emoji" aria-hidden="true">${stampEmoji}</span>` : "";

  const { next, prevThreshold, pct } = tierProgressState(tiers, balance);
  let nextMsg = "";
  if (tiers.length > 0) {
    if (next) {
      const need = next.threshold - balance;
      const unit = isStamps ? unitEsc : "pts";
      nextMsg = `Encore <strong>${esc(String(need))}</strong> ${unit} pour : <strong>${esc(next.label)}</strong>`;
    } else {
      nextMsg = "Tu as atteint <strong>tous les paliers</strong> affichés — demande ta récompense <strong>en magasin</strong>.";
    }
  }

  const rangeCaption =
    tiers.length && next
      ? `${esc(String(prevThreshold))} → ${esc(String(next.threshold))} ${isStamps ? unitEsc : "pts"}`
      : tiers.length && !next
        ? `Objectif max : ${esc(String(tiers[tiers.length - 1].threshold))} ${isStamps ? unitEsc : "pts"}`
        : "";

  const progressCard =
    tiers.length === 0
      ? `
    <div class="fid-tiers-empty-card">
      <div class="fid-tiers-empty-icon" aria-hidden="true">📋</div>
      <p class="fid-tiers-empty-text">Les <strong>paliers de récompenses</strong> définis par le commerce s’afficheront ici dès qu’ils sont configurés.</p>
    </div>`
      : `
    <div class="fid-tiers-progress-card">
      <div class="fid-tiers-progress-head">
        <span class="fid-tiers-progress-kicker">Ta progression</span>
        <div class="fid-tiers-balance-line">
          ${emojiHtml}
          <span class="fid-tiers-balance-num" id="fidelity-v2-rewards-balance">${esc(String(balance))}</span>
          <span class="fid-tiers-balance-unit">${unitEsc}</span>
        </div>
      </div>
      ${nextMsg ? `<p class="fid-tiers-next-msg">${nextMsg}</p>` : ""}
      <div
        class="fid-tiers-bar"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow="${Math.round(pct)}"
        aria-label="Progression vers le prochain palier"
        style="--fid-tier-pct: ${pct.toFixed(2)}%;"
      >
        <div class="fid-tiers-bar-fill"></div>
        <div class="fid-tiers-bar-glow" aria-hidden="true"></div>
      </div>
      ${rangeCaption ? `<p class="fid-tiers-range-caption">${rangeCaption}</p>` : ""}
    </div>`;

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
            <p class="fidelity-v2-card-desc fidelity-v2-step-desc">Suis ta progression vers les <strong>paliers</strong> définis par le commerce.</p>

            <div class="fid-tiers-block">
              <h3 class="fidelity-v2-step-subtitle fid-tiers-block-title">Paliers du programme</h3>
              ${progressCard}
              ${stepsHtml}
            </div>`;
}
