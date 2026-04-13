/** Logique paliers points / tampons (partagée bannière + section récompenses). */

export const STAMP_MID_DEFAULT = 5;

/**
 * @param {unknown} business
 * @returns {{ threshold: number; label: string }[]}
 */
export function parsePointTiers(business) {
  let raw = business?.points_reward_tiers ?? business?.pointsRewardTiers;
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
    const imgRaw = t.image_url ?? t.imageUrl ?? t.image;
    const imageUrl =
      typeof imgRaw === "string" && imgRaw.trim() ? String(imgRaw).trim() : "";
    out.push({ threshold, label, ...(imageUrl ? { imageUrl } : {}) });
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

const MAX_HERO_FULLSCALE_TICKS = 12;

/**
 * Remplissage jauge hero : **échelle linéaire** 0 → dernier palier (alignée sur les graduations).
 * @param {{ threshold: number }[]} tiers triés, longueur ≥ 1
 * @param {number} pts
 */
export function heroFillPercentLinear(tiers, pts) {
  const last = tiers[tiers.length - 1]?.threshold;
  if (!Number.isFinite(last) || last <= 0) return 0;
  const p = Math.max(0, pts);
  return Math.min(100, (p / last) * 100);
}

/**
 * Graduations jauge hero : position proportionnelle au seuil (valeur / dernier palier × 100 %).
 * @param {{ threshold: number }[]} tiers triés par seuil croissant
 * @returns {{ value: number; leftPct: number }[]}
 */
export function buildHeroFullScaleTickMarks(tiers) {
  if (!tiers.length) return [];
  const lastTh = tiers[tiers.length - 1].threshold;
  if (!Number.isFinite(lastTh) || lastTh <= 0) return [];

  const seenVal = new Set();
  /** @type {number[]} */
  const values = [];
  for (const t of tiers) {
    if (seenVal.has(t.threshold)) continue;
    seenVal.add(t.threshold);
    values.push(t.threshold);
  }

  let display = values;
  if (display.length > MAX_HERO_FULLSCALE_TICKS) {
    /** @type {number[]} */
    const thinned = [];
    const nMax = MAX_HERO_FULLSCALE_TICKS;
    for (let i = 0; i < nMax; i += 1) {
      const idx = Math.round((i / (nMax - 1)) * (values.length - 1));
      thinned.push(values[idx]);
    }
    const seenFinal = new Set();
    display = thinned.filter((v) => {
      if (seenFinal.has(v)) return false;
      seenFinal.add(v);
      return true;
    });
  }

  if (display.length === 0) return [];
  return display.map((value) => ({
    value,
    leftPct: Math.min(100, (value / lastTh) * 100),
  }));
}
