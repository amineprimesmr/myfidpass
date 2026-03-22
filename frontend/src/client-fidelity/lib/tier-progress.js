/** Logique paliers points / tampons (partagée bannière + section récompenses). */

export const STAMP_MID_DEFAULT = 5;

/**
 * @param {unknown} business
 * @returns {{ threshold: number; label: string }[]}
 */
export function parsePointTiers(business) {
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
export function buildStampTiers(business) {
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
export function tierProgressState(tiers, balance) {
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
