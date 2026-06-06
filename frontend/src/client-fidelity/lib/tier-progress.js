/** Logique paliers points / tampons (partagée bannière + section récompenses). */

export const STAMP_MID_DEFAULT = 5;

/** Solde tampon affiché (cycle 0 … N-1), aligné backend `normalizeStampBalance`. */
export function stampCycleDisplayBalance(memberPoints, business) {
  const n = Math.max(1, Math.floor(Number(business?.required_stamps) || 10));
  const p = Math.max(0, Math.floor(Number(memberPoints) || 0));
  return p % n;
}

/** Palier atteint pour l’UI (carte complète = N-1 tampons visibles sur N). */
export function isStampTierUnlocked(threshold, balance, business, tiers) {
  if (threshold === STAMP_START_GAME_THRESHOLD) return true;
  const cycleN = Math.max(1, Math.floor(Number(business?.required_stamps) || 10));
  const last = tiers.length ? tiers[tiers.length - 1].threshold : cycleN;
  if (threshold >= last && threshold >= cycleN - 1) {
    return balance >= cycleN - 1;
  }
  return balance >= threshold;
}
/** Palier inscription / début du jeu (aligné SaaS commerçant). */
export const SIGNUP_REWARD_POINTS = 10;
/** Palier « Début du jeu » sur la page client tampons (récompense 1er tour / roue). */
export const STAMP_START_GAME_THRESHOLD = 0;

/**
 * @param {unknown} raw
 * @returns {{ threshold: number; label: string; imageUrl?: string }[]}
 */
function parsePointTiersRaw(raw) {
  let tiers = raw;
  if (typeof tiers === "string" && tiers.trim()) {
    try {
      tiers = JSON.parse(tiers);
    } catch {
      tiers = [];
    }
  }
  if (!Array.isArray(tiers)) return [];
  const out = [];
  for (let dbTierIndex = 0; dbTierIndex < tiers.length; dbTierIndex += 1) {
    const t = tiers[dbTierIndex];
    if (t == null) continue;
    const threshold = parseInt(String(t.points ?? t.points_required), 10);
    const label = String(t.label ?? "").trim() || "Récompense";
    if (Number.isNaN(threshold) || threshold < 0) continue;
    const imgRaw = t.image_url ?? t.imageUrl ?? t.image;
    const imageUrl =
      typeof imgRaw === "string" && imgRaw.trim() ? String(imgRaw).trim() : "";
    out.push({
      threshold,
      label,
      dbTierIndex,
      ...(imageUrl ? { imageUrl } : {}),
    });
  }
  out.sort((a, b) => a.threshold - b.threshold);
  return out;
}

/**
 * Garantit le palier 10 pts (récompense à la création du compte) pour l’affichage client.
 * @param {unknown} business
 */
export function parsePointTiers(business) {
  const parsed = parsePointTiersRaw(business?.points_reward_tiers ?? business?.pointsRewardTiers);
  if (!parsed.length) return [];
  const signupLabel = String(
    business?.signup_reward_label ?? business?.signupRewardLabel ?? "",
  ).trim();
  const hasSignup = parsed.some((t) => t.threshold === SIGNUP_REWARD_POINTS);
  if (hasSignup) return parsed;
  const label = signupLabel || "Récompense de bienvenue";
  return [
    { threshold: SIGNUP_REWARD_POINTS, label, dbTierIndex: -1 },
    ...parsed,
  ].sort((a, b) => a.threshold - b.threshold);
}

/**
 * @param {unknown} business
 * @returns {{ threshold: number; label: string }[]}
 */
export function buildStampTiers(business) {
  const required = Number(business?.required_stamps);
  if (!Number.isInteger(required) || required <= 0) return [];
  const startLabel = String(
    business?.start_game_reward_label ??
      business?.startGameRewardLabel ??
      business?.signup_reward_label ??
      business?.signupRewardLabel ??
      "",
  ).trim();
  const midLabel = String(business?.stamp_mid_reward_label ?? "").trim();
  const finalLabel = String(business?.stamp_reward_label ?? "").trim() || "Récompense";
  /** @type {{ threshold: number; label: string; isStartGame?: boolean }[]} */
  const tiers = [];
  tiers.push({
    threshold: STAMP_START_GAME_THRESHOLD,
    label: startLabel || "Boisson offerte",
    isStartGame: true,
  });
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

/** Paliers pour jauge / bannière (sans « Début du jeu » à 0). */
export function stampProgressTiers(business) {
  return buildStampTiers(business).filter((t) => t.threshold > 0);
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
 * Jauge hero : échelle linéaire 0 → dernier palier (position = points / max).
 * @param {{ threshold: number }[]} tiers triés, longueur ≥ 1
 * @param {number} pts
 */
export function heroFillPercentLinear(tiers, pts) {
  const n = tiers.length;
  if (n === 0) return 0;
  const max = tiers[n - 1].threshold;
  if (!Number.isFinite(max) || max <= 0) return 0;
  const p = Math.max(0, pts);
  return Math.min(100, (p / max) * 100);
}

/**
 * Graduations 0 + chaque palier, positionnées au prorata des points.
 * @param {{ threshold: number }[]} tiers triés
 */
export function buildHeroLinearTickMarks(tiers) {
  if (!tiers.length) return [];
  const max = tiers[tiers.length - 1].threshold;
  if (!Number.isFinite(max) || max <= 0) return [];

  /** @type {{ value: number; leftPct: number }[]} */
  const marks = [{ value: 0, leftPct: 0 }];
  const seen = new Set([0]);
  for (const t of tiers) {
    if (seen.has(t.threshold)) continue;
    seen.add(t.threshold);
    marks.push({
      value: t.threshold,
      leftPct: Math.min(100, (t.threshold / max) * 100),
    });
  }
  return marks;
}

/**
 * @deprecated Conservé pour tests — préférer heroFillPercentLinear en prod.
 * @param {{ threshold: number }[]} tiers triés, longueur ≥ 1
 * @param {number} pts
 */
export function heroFillPercentEqualSegments(tiers, pts) {
  const n = tiers.length;
  const p = Math.max(0, pts);
  const T = tiers.map((t) => t.threshold);
  if (n === 0) return 0;

  const first = T[0];
  const last = T[n - 1];
  if (!Number.isFinite(last) || last <= 0) return 0;
  if (first <= 0) return Math.min(100, (p / last) * 100);

  if (p >= last) return 100;
  if (p <= 0) return 0;

  /** Fin du segment k (0-based) sur la jauge : V(k) = (k+1)/n × 100 */
  const V = (k) => ((k + 1) / n) * 100;

  if (p < first) return (p / first) * V(0);

  for (let k = 1; k < n; k += 1) {
    if (p < T[k]) {
      const tPrev = T[k - 1];
      const tCur = T[k];
      const span = tCur - tPrev;
      if (span <= 0) continue;
      return V(k - 1) + ((p - tPrev) / span) * (V(k) - V(k - 1));
    }
  }
  return 100;
}

/**
 * Graduations jauge hero : **espacement égal** entre chaque palier affiché (pas au prorata des points).
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

  const m = display.length;
  if (m === 0) return [];
  return display.map((value, i) => ({
    value,
    leftPct: m === 1 ? 100 : (i / (m - 1)) * 100,
  }));
}
