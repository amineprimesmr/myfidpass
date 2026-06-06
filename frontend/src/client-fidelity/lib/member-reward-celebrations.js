import { buildStampTiers, STAMP_START_GAME_THRESHOLD, parsePointTiers } from "./tier-progress.js";

const DEFAULT_GIFT_BASE = "/assets/gift";

/**
 * @param {unknown} business
 * @param {string} programType
 */
export function getProgramTiers(business, programType) {
  const pt = String(programType || "points").toLowerCase();
  return pt === "stamps" ? buildStampTiers(business) : parsePointTiers(business);
}

/**
 * @param {{ points?: number } | null | undefined} member
 * @param {string} programType
 */
export function memberProgramBalance(member, programType) {
  return Math.max(0, Math.floor(Number(member?.points) || 0));
}

/**
 * @param {number} tierIndex
 */
export function defaultTierImageUrl(tierIndex) {
  const n = (Math.max(0, tierIndex) % 5) + 1;
  return `${DEFAULT_GIFT_BASE}/gift${n}.png`;
}

/**
 * Récompense « début » = 1er palier configuré (aligné jeu QR / règles carte).
 * @param {unknown} business
 * @param {string} programType
 */
export function getStartingRewardOffer(business, programType) {
  const pt = String(programType || "points").toLowerCase();
  const isStamps = pt === "stamps";
  if (isStamps) {
    const start = buildStampTiers(business).find(
      (t) => t.isStartGame || t.threshold === STAMP_START_GAME_THRESHOLD,
    );
    if (start) {
      return {
        threshold: start.threshold,
        label: start.label,
        imageUrl: start.imageUrl || defaultTierImageUrl(0),
        costLine: "Début du jeu",
        isStamps: true,
      };
    }
  }
  const tiers = getProgramTiers(business, programType);
  const first = tiers[0];
  if (!first) {
    return {
      threshold: 0,
      label: "Récompense fidélité",
      imageUrl: defaultTierImageUrl(0),
      costLine: "",
      isStamps,
    };
  }
  const unit = isStamps ? (first.threshold === 1 ? "tampon" : "tampons") : first.threshold === 1 ? "point" : "points";
  const costLine = isStamps ? `${first.threshold} ${unit}` : `${first.threshold} points`;
  return {
    threshold: first.threshold,
    label: first.label,
    imageUrl: first.imageUrl || defaultTierImageUrl(0),
    costLine,
    isStamps,
  };
}

/**
 * @param {unknown} business
 * @param {string} programType
 * @param {{ type?: string; amount?: number } | null | undefined} granted
 */
export function buildWelcomeBonusChipText(business, programType, granted) {
  const enabled = Number(business?.welcome_bonus_enabled ?? business?.welcomeBonusEnabled ?? 0) === 1;
  if (!enabled && !granted) return "";
  const pt = String(programType || "points").toLowerCase();
  const raw = Number(
    granted?.amount ?? business?.welcome_bonus_amount ?? business?.welcomeBonusAmount ?? 10,
  );
  const amount = Number.isInteger(raw) && raw > 0 ? raw : 10;
  if (pt === "stamps") {
    return `+${amount} tampon${amount > 1 ? "s" : ""} offert${amount > 1 ? "s" : ""} à l'inscription`;
  }
  return `+${amount} point${amount > 1 ? "s" : ""} offert${amount > 1 ? "s" : ""} à l'inscription`;
}

/**
 * Paliers franchis entre deux soldes (exclusif ancien, inclusif nouveau).
 * @param {{ threshold: number; label: string; imageUrl?: string }[]} tiers
 * @param {number | null} previousBalance
 * @param {number} newBalance
 */
export function findNewlyUnlockedTiers(tiers, previousBalance, newBalance) {
  if (!tiers.length) return [];
  const prev = previousBalance == null ? -1 : Math.max(0, Math.floor(previousBalance));
  const next = Math.max(0, Math.floor(newBalance));
  if (next <= prev) return [];
  return tiers.filter((t) => t.threshold > prev && t.threshold <= next);
}

/**
 * Paliers déjà atteints mais jamais célébrés (retour après gain hors ligne).
 * @param {{ threshold: number }[]} tiers
 * @param {number} balance
 * @param {Set<number>} acknowledgedThresholds
 */
export function findUnacknowledgedUnlockedTiers(tiers, balance, acknowledgedThresholds) {
  const bal = Math.max(0, Math.floor(balance));
  return tiers.filter((t) => bal >= t.threshold && !acknowledgedThresholds.has(t.threshold));
}

/**
 * @param {{
 *   slug: string;
 *   memberId: string;
 *   business: Record<string, unknown> | null | undefined;
 *   member: { id?: string; points?: number } | null | undefined;
 *   programType: string;
 *   previousBalance: number | null;
 *   storage: { welcomeShown: boolean; tiers: number[] };
 *   welcomeBonusJustGranted?: { type?: string; amount?: number } | null;
 * }} ctx
 */
export function buildCelebrationQueue(ctx) {
  const {
    business,
    member,
    programType,
    previousBalance,
    storage,
    welcomeBonusJustGranted,
  } = ctx;
  if (!member?.id || !business) return [];

  const tiers = getProgramTiers(business, programType);
  const balance = memberProgramBalance(member, programType);
  const ack = new Set(Array.isArray(storage.tiers) ? storage.tiers : []);
  const queue = [];
  const start = getStartingRewardOffer(business, programType);
  let suppressStartTierCelebration = false;

  if (!storage.welcomeShown) {
    const bonusChip = buildWelcomeBonusChipText(business, programType, welcomeBonusJustGranted);
    const welcomeTierIndex = Math.max(
      0,
      tiers.findIndex((x) => x.threshold === start.threshold),
    );
    queue.push({
      kind: "welcome",
      threshold: start.threshold,
      tierIndex: welcomeTierIndex >= 0 ? welcomeTierIndex : 0,
      points: start.threshold,
      label: start.label,
      imageUrl: start.imageUrl,
      costLine: start.costLine,
      bonusChip,
      unlocked: start.threshold <= balance,
    });
    /* Évite 2 pop-ups identiques si le bonus d’inscription débloque déjà le 1er palier. */
    if (start.threshold > 0 && balance >= start.threshold) {
      suppressStartTierCelebration = true;
    }
  }

  const fromTransition =
    previousBalance != null ? findNewlyUnlockedTiers(tiers, previousBalance, balance) : [];
  const fromCatchUp = findUnacknowledgedUnlockedTiers(tiers, balance, ack);

  /** @type {Map<number, { threshold: number; label: string; imageUrl?: string }>} */
  const tierMap = new Map();
  for (const t of [...fromTransition, ...fromCatchUp]) {
    if (suppressStartTierCelebration && t.threshold === start.threshold) continue;
    if (!tierMap.has(t.threshold)) tierMap.set(t.threshold, t);
  }

  const tierCelebrations = [...tierMap.values()].sort((a, b) => a.threshold - b.threshold);
  for (let i = 0; i < tierCelebrations.length; i += 1) {
    const t = tierCelebrations[i];
    const isStamps = String(programType || "").toLowerCase() === "stamps";
    const unit = isStamps ? (t.threshold === 1 ? "tampon" : "tampons") : t.threshold === 1 ? "point" : "points";
    const costLine = isStamps ? `${t.threshold} ${unit}` : `${t.threshold} points`;
    const tierIndex = Math.max(0, tiers.findIndex((x) => x.threshold === t.threshold));
    queue.push({
      kind: "tier_unlocked",
      threshold: t.threshold,
      tierIndex: tierIndex >= 0 ? tierIndex : i,
      points: t.threshold,
      label: t.label,
      imageUrl: t.imageUrl || defaultTierImageUrl(i),
      costLine,
      unlocked: true,
    });
  }

  return queue;
}
