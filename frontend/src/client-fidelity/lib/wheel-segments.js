/**
 * La roue affiche toujours 8 parts. L’API ne renvoie qu’une entrée par lot logique
 * (souvent 4) : on duplique cycliquement pour le rendu sans changer le tirage serveur.
 */
export const WHEEL_SEGMENT_COUNT = 8;

/** Défaut page jeu si l’API ne renvoie aucun segment (hors tampons : lots points). */
export const DEFAULT_WHEEL_LABELS = [
  "PERDU",
  "+10 pts",
  "PERDU",
  "+25 pts",
  "PERDU",
  "+50 pts",
  "PERDU",
  "+10 pts",
];

/**
 * @param {{ label?: string }[]} segments
 * @returns {string[]}
 */
export function normalizeWheelLabelsFromSegments(segments) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return [...DEFAULT_WHEEL_LABELS];
  }
  const base = segments.map((s) => String(s?.label ?? "").trim() || "PERDU");
  if (base.length === WHEEL_SEGMENT_COUNT) return base;
  if (base.length > WHEEL_SEGMENT_COUNT) return base.slice(0, WHEEL_SEGMENT_COUNT);
  const out = [];
  for (let i = 0; i < WHEEL_SEGMENT_COUNT; i++) {
    out.push(base[i % base.length]);
  }
  return out;
}

/**
 * @param {string[]} wheelLabels
 * @param {string} rewardLabel
 * @returns {number}
 */
export function pickWheelIndexForReward(wheelLabels, rewardLabel) {
  const target = String(rewardLabel || "PERDU").trim().toLowerCase();
  const indices = [];
  for (let i = 0; i < wheelLabels.length; i++) {
    if (String(wheelLabels[i] || "").trim().toLowerCase() === target) indices.push(i);
  }
  if (indices.length === 0) {
    const perdu = [];
    for (let i = 0; i < wheelLabels.length; i++) {
      if (String(wheelLabels[i] || "").trim().toLowerCase() === "perdu") perdu.push(i);
    }
    if (perdu.length) return perdu[Math.floor(Math.random() * perdu.length)];
    return 0;
  }
  return indices[Math.floor(Math.random() * indices.length)];
}

/**
 * Libellé court sur la roue uniquement (le tirage serveur reste sur le label complet en base).
 */
export function formatWheelSegmentDisplayLabel(label) {
  const s = String(label ?? "").trim();
  if (!s) return "PeRDu";
  const compact = s.replace(/\s+/g, " ");
  const u = compact.toUpperCase();
  if (
    u === "PERDU" ||
    /^(PAS DE LOT|PAS DE PRIX|RIEN|NO PRIZE|LOSE|LOST)$/i.test(compact) ||
    /\bPAS DE LOT\b/i.test(compact)
  ) {
    return "PeRDu";
  }
  let m = compact.match(/\+?\s*(\d+)\s*(?:POINTS?\s*BONUS|PTS?\s*BONUS|POINTS?|PTS?)\b/i);
  if (m) return `+${m[1]} pts`;
  m = compact.match(/\b(\d+)\s*(?:POINTS?\s*BONUS|PTS?\s*BONUS|POINTS?|PTS?)\b/i);
  if (m) return `+${m[1]} pts`;
  m = compact.match(/\+?\s*(\d+)\s*(?:PASSAGES?|TAMPONS?)\b/i);
  if (m) return `+${m[1]} pass.`;
  m = compact.match(/\b(\d+)\s*(?:PASSAGES?|TAMPONS?)\b/i);
  if (m) return `+${m[1]} pass.`;
  if (compact.length > 11) return `${compact.slice(0, 10)}…`;
  return compact;
}
