/**
 * QR récompense caisse — associé à un palier (points ou tampons).
 * Format : MYFIDPASS_REDEEM:1:{memberId}:p:{tierIndex}:{points}
 *         MYFIDPASS_REDEEM:1:{memberId}:s — carte complète (cycle)
 *         MYFIDPASS_REDEEM:1:{memberId}:s:0 — début du jeu (Boisson offerte, coût 0)
 *         MYFIDPASS_REDEEM:1:{memberId}:s:{stampThreshold} — palier intermédiaire (ex. 5 tampons)
 */

export const REWARD_REDEEM_QR_VERSION = 1;
const PREFIX = "MYFIDPASS_REDEEM:";

/** Palier « Début du jeu » (récompense roue / 1er palier tampons). */
export const STAMP_START_GAME_QR_THRESHOLD = 0;

/** Taille du cycle tampons (colonne `required_stamps`). */
export function stampCycleSize(business) {
  const n = Number(business?.required_stamps);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10;
}

/**
 * @param {object} business
 * @param {{ mode: string; stampThreshold?: number | null }} rewardRedeem
 */
export function resolveStampRewardFromQr(business, rewardRedeem) {
  const cycleN = stampCycleSize(business);
  const midDefault = 5;
  const midLabel = String(business?.stamp_mid_reward_label ?? "").trim();
  const finalLabel = String(business?.stamp_reward_label ?? "").trim() || "Récompense tampons";
  const startLabel =
    String(business?.start_game_reward_label ?? "").trim() || "Boisson offerte";

  const rawTh = rewardRedeem?.stampThreshold;

  if (rawTh === STAMP_START_GAME_QR_THRESHOLD) {
    return {
      label: startLabel,
      pointsRequired: 0,
      stampThreshold: STAMP_START_GAME_QR_THRESHOLD,
      cycleN,
      isFullCard: false,
      isStartGame: true,
      tierIndex: 0,
    };
  }

  let threshold = Math.floor(Number(rawTh));
  if (rawTh == null || !Number.isFinite(threshold) || threshold <= 0) {
    threshold = cycleN;
  }
  threshold = Math.min(threshold, cycleN);
  const isFullCard = threshold >= cycleN;
  const label =
    !isFullCard && midLabel && threshold > 0 && threshold <= midDefault + 1 ? midLabel : finalLabel;
  const pointsRequired = isFullCard ? Math.max(1, cycleN - 1) : threshold;
  const tierIndex = isFullCard ? 2 : threshold <= midDefault ? 1 : 2;
  return {
    label,
    pointsRequired,
    stampThreshold: threshold,
    cycleN,
    isFullCard,
    isStartGame: false,
    tierIndex,
  };
}

/**
 * @param {{ memberId: string; programType?: string; tierIndex?: number; points?: number; stampThreshold?: number }} p
 */
export function buildRewardRedeemQrPayload(p) {
  const memberId = String(p.memberId || "").trim();
  if (!memberId) return "";
  const pt = String(p.programType || "points").toLowerCase();
  if (pt === "stamps") {
    if (p.stampThreshold === STAMP_START_GAME_QR_THRESHOLD) {
      return `${PREFIX}${REWARD_REDEEM_QR_VERSION}:${memberId}:s:0`;
    }
    const th = Math.floor(Number(p.stampThreshold ?? p.points));
    if (Number.isFinite(th) && th > 0) {
      return `${PREFIX}${REWARD_REDEEM_QR_VERSION}:${memberId}:s:${th}`;
    }
    return `${PREFIX}${REWARD_REDEEM_QR_VERSION}:${memberId}:s`;
  }
  const tierIndex = Math.max(0, Math.floor(Number(p.tierIndex) || 0));
  const points = Math.max(1, Math.floor(Number(p.points) || 0));
  return `${PREFIX}${REWARD_REDEEM_QR_VERSION}:${memberId}:p:${tierIndex}:${points}`;
}

/**
 * @param {string} raw
 * @returns {null | { memberId: string; mode: "points" | "stamps"; tierIndex?: number; points?: number; stampThreshold?: number | null }}
 */
export function parseRewardRedeemQrPayload(raw) {
  const s = String(raw || "").trim();
  if (!s.toUpperCase().startsWith(PREFIX)) return null;
  const rest = s.slice(PREFIX.length);
  const parts = rest.split(":");
  if (parts.length < 3) return null;
  const ver = Number(parts[0]);
  if (ver !== REWARD_REDEEM_QR_VERSION) return null;
  const memberId = String(parts[1] || "").trim();
  if (!memberId) return null;
  const mode = String(parts[2] || "").toLowerCase();
  if (mode === "s") {
    let stampThreshold = null;
    if (parts.length >= 4) {
      if (parts[3] === "0") {
        stampThreshold = STAMP_START_GAME_QR_THRESHOLD;
      } else {
        const t = Math.floor(Number(parts[3]));
        if (Number.isFinite(t) && t > 0) stampThreshold = t;
      }
    }
    return { memberId, mode: "stamps", stampThreshold };
  }
  if (mode === "p" && parts.length >= 5) {
    const tierIndex = Math.floor(Number(parts[3]));
    const points = Math.floor(Number(parts[4]));
    if (!Number.isFinite(tierIndex) || tierIndex < 0) return null;
    if (!Number.isFinite(points) || points <= 0) return null;
    return { memberId, mode: "points", tierIndex, points };
  }
  return null;
}

/**
 * @param {string} raw
 * @returns {{ memberId: string; rewardRedeem: ReturnType<typeof parseRewardRedeemQrPayload> | null }}
 */
export function parseMerchantScanCode(raw) {
  const reward = parseRewardRedeemQrPayload(raw);
  if (reward) {
    return { memberId: reward.memberId, rewardRedeem: reward };
  }
  const uuidMatch = String(raw || "").trim().match(
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
  );
  const memberId = uuidMatch ? uuidMatch[0] : String(raw || "").trim();
  return { memberId, rewardRedeem: null };
}

/** @param {unknown} raw */
export function parseBusinessPointTiers(raw) {
  let tiers = raw;
  if (typeof tiers === "string" && tiers.trim()) {
    try {
      tiers = JSON.parse(tiers);
    } catch {
      tiers = [];
    }
  }
  return Array.isArray(tiers) ? tiers : [];
}

/** @param {unknown} t */
function tierImageUrlFromRow(t) {
  const img = t?.image_url ?? t?.imageUrl ?? t?.image;
  return typeof img === "string" && img.trim() ? String(img).trim() : null;
}

/**
 * Coût + libellé depuis le QR (points = source de vérité) — l’index palier DB peut être décalé vs l’UI client triée.
 * @param {object} business
 * @param {{ mode: string; tierIndex?: number; points?: number }} rewardRedeem
 */
export function resolvePointsRewardFromQr(business, rewardRedeem) {
  const qrPoints = Math.max(0, Math.floor(Number(rewardRedeem?.points) || 0));
  const tiers = parseBusinessPointTiers(business?.points_reward_tiers);
  const tierIndex =
    Number.isInteger(rewardRedeem?.tierIndex) && rewardRedeem.tierIndex >= 0
      ? rewardRedeem.tierIndex
      : null;

  let pointsRequired = qrPoints;
  let label = "";
  let imageUrl = null;
  let resolvedTierIndex = tierIndex;

  if (qrPoints > 0) {
    const match = tiers.find(
      (t) => Math.max(0, Math.floor(Number(t?.points) || 0)) === qrPoints,
    );
    if (match) {
      label = String(match.label || "").trim();
      imageUrl = tierImageUrlFromRow(match);
      if (resolvedTierIndex == null) {
        resolvedTierIndex = tiers.indexOf(match);
      }
    }
  }

  if (!label && tierIndex != null && tierIndex < tiers.length) {
    const tier = tiers[tierIndex];
    label = String(tier?.label || "").trim();
    if (!imageUrl) imageUrl = tierImageUrlFromRow(tier);
    if (!pointsRequired) {
      pointsRequired = Math.max(0, Math.floor(Number(tier?.points) || 0));
    }
  }

  if (!pointsRequired && tierIndex != null && tierIndex < tiers.length) {
    pointsRequired = Math.max(0, Math.floor(Number(tiers[tierIndex]?.points) || 0));
  }

  if (!label) {
    label = pointsRequired > 0 ? `Récompense ${pointsRequired} pts` : "Récompense";
  }

  if (resolvedTierIndex == null || resolvedTierIndex < 0) {
    resolvedTierIndex = 0;
  }

  return { pointsRequired, label, tierIndex: resolvedTierIndex, qrPoints, imageUrl };
}
