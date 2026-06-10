/** Paliers points publics : le palier à 10 pts (récompense inscription) est toujours présent côté client. */

export const SIGNUP_REWARD_POINTS = 10;
export const MAX_POINTS_REWARD_TIERS = 8;

/** Montant minimum d'achat (€) pour utiliser un palier — null si non configuré. */
export function parseMinPurchaseEur(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

/**
 * @param {unknown} raw
 * @returns {{ points: number; label: string; image_url?: string; imageUrl?: string }[]}
 */
export function parsePointsRewardTiersRaw(raw) {
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
  for (const t of tiers) {
    if (t == null) continue;
    const points = parseInt(String(t.points ?? t.points_required), 10);
    const label = String(t.label ?? "").trim();
    if (Number.isNaN(points) || points < 0 || !label) continue;
    const img = t.image_url ?? t.imageUrl ?? t.image;
    const minRaw = t.min_purchase_eur ?? t.minPurchaseEur ?? t.min_purchase;
    const minPurchase = parseMinPurchaseEur(minRaw);
    const row = { points, label };
    if (typeof img === "string" && img.trim()) row.image_url = img.trim();
    if (minPurchase != null) row.min_purchase_eur = minPurchase;
    out.push(row);
  }
  out.sort((a, b) => a.points - b.points);
  return out;
}

/**
 * Réinjecte le palier inscription (10 pts) si une ancienne migration l’a retiré du JSON.
 * @param {unknown} rawTiers
 * @param {string} [signupLabel]
 */
export function normalizePointsRewardTiersForClient(rawTiers, signupLabel = "") {
  const parsed = parsePointsRewardTiersRaw(rawTiers);
  if (!parsed.length) return [];
  const hasSignup = parsed.some((t) => t.points === SIGNUP_REWARD_POINTS);
  if (hasSignup) return parsed;
  const label = String(signupLabel || "").trim() || "Récompense de bienvenue";
  return [{ points: SIGNUP_REWARD_POINTS, label }, ...parsed].sort((a, b) => a.points - b.points);
}

/**
 * Libellé du palier le plus élevé déjà atteint (affichage / notif Wallet).
 * @param {{ points: number; label: string }[]} tiers — triés par points croissant
 * @param {number} balance
 * @returns {string|null}
 */
export function highestPointsTierReachedLabel(tiers, balance) {
  if (!tiers?.length) return null;
  const bal = Math.max(0, Math.floor(Number(balance) || 0));
  let best = null;
  for (const t of tiers) {
    if (t.points <= bal) best = t;
  }
  const lab = best?.label != null ? String(best.label).trim() : "";
  return lab || null;
}

/**
 * Paliers franchis entre deux soldes (exclusif ancien, inclusif nouveau).
 * @param {{ points: number; label: string }[]} tiers
 * @param {number} previousBalance
 * @param {number} newBalance
 * @returns {{ points: number; label: string }[]}
 */
export function findNewlyUnlockedPointsTiers(tiers, previousBalance, newBalance) {
  if (!tiers?.length) return [];
  const prev = Math.max(0, Math.floor(Number(previousBalance) || 0));
  const next = Math.max(0, Math.floor(Number(newBalance) || 0));
  if (next <= prev) return [];
  return tiers.filter((t) => t.points > prev && t.points <= next);
}

/**
 * Fusionne palier inscription (10 pts) + paliers éditables sans doublon 10 pts.
 * @param {unknown} rawTiers
 * @param {string} [signupLabel]
 */
export function mergePointsRewardTiersForStorage(rawTiers, signupLabel = "") {
  const parsed = parsePointsRewardTiersRaw(rawTiers);
  const signupFromTiers = parsed.find((t) => t.points === SIGNUP_REWARD_POINTS);
  const label =
    String(signupLabel || "").trim() ||
    signupFromTiers?.label ||
    "Boisson offerte";
  const editable = parsed.filter((t) => t.points !== SIGNUP_REWARD_POINTS);
  const capped = editable.slice(0, MAX_POINTS_REWARD_TIERS - 1);
  return [{ points: SIGNUP_REWARD_POINTS, label }, ...capped].sort((a, b) => a.points - b.points);
}

/** Message écran verrouillé Wallet quand un palier points est franchi (%@ = libellé récompense). */
export const WALLET_TIER_UNLOCK_CHANGE_MESSAGE = "Nouvelle récompense : %@";
