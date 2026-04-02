/**
 * La roue affiche toujours 8 parts. L’API ne renvoie qu’une entrée par lot logique
 * (souvent 4) : on duplique cycliquement pour le rendu sans changer le tirage serveur.
 */
export const WHEEL_SEGMENT_COUNT = 8;

/** Défaut page jeu si l’API ne renvoie aucun segment (hors tampons : lots points). */
export const DEFAULT_WHEEL_LABELS = [
  "PERDU",
  "+10 PTS",
  "PERDU",
  "+25 PTS",
  "PERDU",
  "+50 PTS",
  "PERDU",
  "+10 PTS",
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
 * Texte sur la part d’index `i` : alternance fixe GAGNER / PERDU / GAGNER / …
 * (alignée sur les bandes noir/blanc de la roue, indépendante du libellé du lot en base).
 */
export function wheelSegmentAlternateDisplayLabel(segmentIndex) {
  const i = Math.floor(Number(segmentIndex)) || 0;
  return i % 2 === 0 ? "GAGNER" : "PERDU";
}

/** Image « cadeau » sur les parts GAGNER (fichier public). */
export const WHEEL_SEGMENT_GIFT_IMG_SRC = "/assets/gift.png";

/**
 * HTML d’une part de roue (texte PERDU / image cadeau pour GAGNER).
 * @param {object} p
 * @param {number} p.segmentIndex
 * @param {number} p.segmentCount
 * @param {(s: string) => string} p.escapeHtml
 */
export function buildWheelSegmentHtml(p) {
  const { segmentIndex, segmentCount, escapeHtml } = p;
  const angle = (segmentIndex + 0.5) * (360 / segmentCount);
  const isWhite = segmentIndex % 2 === 1;
  const segClass = isWhite
    ? "fidelity-roulette-wheel-segment fidelity-roulette-segment-white"
    : "fidelity-roulette-wheel-segment";
  const labelRotateDeg = angle > 180 ? 90 : -90;
  const showGift = segmentIndex % 2 === 0;
  const src = escapeHtml(WHEEL_SEGMENT_GIFT_IMG_SRC);
  const giftInner = `<span class="fidelity-roulette-segment-label fidelity-roulette-segment-label--gift-wrap" aria-hidden="true"><img class="fidelity-roulette-segment-gift-img" src="${src}" alt="" width="64" height="64" decoding="async" loading="lazy" /></span>`;
  const textLabel = wheelSegmentAlternateDisplayLabel(segmentIndex);
  const loseInner = `<span class="fidelity-roulette-segment-label fidelity-roulette-segment-label-text">${escapeHtml(textLabel)}</span>`;
  const anchorAttrs = showGift ? ` role="img" aria-label="Gagner"` : "";
  return `<div class="${segClass}" style="transform: rotate(${angle}deg); --label-rotate: ${labelRotateDeg}deg;"><span class="fidelity-roulette-segment-label-anchor"${anchorAttrs}>${showGift ? giftInner : loseInner}</span></div>`;
}
