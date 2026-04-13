/**
 * La roue affiche toujours 8 parts. L’API renvoie souvent 4 segments : on les étend
 * en plaçant les lots sur les parts paires (visuel cadeau) et PERDU sur les impaires.
 */
export const WHEEL_SEGMENT_COUNT = 8;

/**
 * Assombrit légèrement une couleur hex #RRGGBB (factor < 1) pour créer un effet de gradient sur les parts.
 * @param {string} hex
 * @param {number} factor
 * @returns {string}
 */
function hexShade(hex, factor) {
  const h = String(hex || "").trim();
  if (!/^#[0-9A-Fa-f]{6}$/i.test(h)) return h;
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(parseInt(h.slice(1, 3), 16) * factor);
  const g = clamp(parseInt(h.slice(3, 5), 16) * factor);
  const b = clamp(parseInt(h.slice(5, 7), 16) * factor);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/**
 * Fond conique alterné pour la roue.
 * Parts paires (i%2===0) = cadeau, parts impaires (i%2===1) = PERDU.
 *
 * @param {number} n — nombre de parts (ex. 8)
 * @param {{ colorOdd?: string | null, colorEven?: string | null }} [opts]
 *   colorOdd  = couleur accent flyer (segments cadeau, pairs)
 *   colorEven = couleur secondaire flyer (segments PERDU, impairs)
 * @returns {string}
 */
export function buildWheelConicGradient(n, opts = {}) {
  const count = Math.max(2, Math.floor(Number(n)) || 8);
  const step = 360 / count;
  const stops = [];
  const isHex = (v) => typeof v === "string" && /^#[0-9A-Fa-f]{6}$/i.test(v.trim());
  const { colorOdd, colorEven } = opts;
  for (let i = 0; i < count; i++) {
    const a = i * step;
    const b = (i + 1) * step;
    const mid = a + step / 2;
    if (i % 2 === 0) {
      // Parts cadeau (paires) — couleur accent flyer ou noir par défaut
      if (isHex(colorOdd)) {
        const base = colorOdd.trim();
        const dark = hexShade(base, 0.72);
        stops.push(`${dark} ${a}deg`, `${base} ${mid}deg`, `${dark} ${b}deg`);
      } else {
        stops.push(`#080808 ${a}deg`, `#2a2a2a ${mid}deg`, `#111111 ${b}deg`);
      }
    } else {
      // Parts PERDU (impaires) — couleur secondaire flyer ou blanc par défaut
      if (isHex(colorEven)) {
        const base = colorEven.trim();
        const dark = hexShade(base, 0.88);
        stops.push(`${base} ${a}deg`, `${dark} ${mid}deg`, `${base} ${b}deg`);
      } else {
        stops.push(`#ffffff ${a}deg`, `#e6e6e6 ${mid}deg`, `#fafafa ${b}deg`);
      }
    }
  }
  return `conic-gradient(${stops.join(", ")})`;
}

/** Défaut : parts paires = lots (visuel cadeau), impaires = PERDU — alternance stricte. */
export const DEFAULT_WHEEL_LABELS = [
  "+10 PTS",
  "PERDU",
  "+25 PTS",
  "PERDU",
  "+50 PTS",
  "PERDU",
  "+10 PTS",
  "PERDU",
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
  let expanded;
  if (base.length >= WHEEL_SEGMENT_COUNT) {
    expanded = base.slice(0, WHEEL_SEGMENT_COUNT);
  } else {
    expanded = [];
    for (let i = 0; i < WHEEL_SEGMENT_COUNT; i++) {
      expanded.push(base[i % base.length]);
    }
  }
  const prizeSeq = expanded.filter((l) => String(l).trim().toLowerCase() !== "perdu");
  const pool = prizeSeq.length > 0 ? prizeSeq : ["PERDU"];
  const out = [];
  let pi = 0;
  for (let i = 0; i < WHEEL_SEGMENT_COUNT; i++) {
    if (i % 2 === 1) {
      out.push("PERDU");
    } else {
      out.push(String(pool[pi % pool.length]));
      pi += 1;
    }
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
  const isPerdu = target === "perdu";
  /** Parts paires = visuel cadeau, impaires = visuel PERDU — on n’arrête que sur la bonne parité. */
  const parityOk = (i) => (isPerdu ? i % 2 === 1 : i % 2 === 0);

  const indices = [];
  for (let i = 0; i < wheelLabels.length; i++) {
    if (String(wheelLabels[i] || "").trim().toLowerCase() === target && parityOk(i)) indices.push(i);
  }
  if (indices.length > 0) {
    return indices[Math.floor(Math.random() * indices.length)];
  }
  const fallback = [];
  for (let i = 0; i < wheelLabels.length; i++) {
    if (String(wheelLabels[i] || "").trim().toLowerCase() === target) fallback.push(i);
  }
  if (fallback.length > 0) {
    return fallback[Math.floor(Math.random() * fallback.length)];
  }
  const perdu = [];
  for (let i = 0; i < wheelLabels.length; i++) {
    if (String(wheelLabels[i] || "").trim().toLowerCase() === "perdu") perdu.push(i);
  }
  if (perdu.length) return perdu[Math.floor(Math.random() * perdu.length)];
  return 0;
}

/**
 * Texte sur les parts impaires (visuel PERDU). Les parts paires montrent l’image cadeau.
 */
export function wheelSegmentAlternateDisplayLabel(segmentIndex) {
  void segmentIndex;
  return "PERDU";
}

/** Image « cadeau » sur les parts GAGNER (fichier public). */
export const WHEEL_SEGMENT_GIFT_IMG_SRC = "/assets/gift.png";

/**
 * HTML d’une part : alternance fixe — paires = image cadeau, impaires = PERDU (aligné sur normalizeWheelLabelsFromSegments).
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
  const src = escapeHtml(`${WHEEL_SEGMENT_GIFT_IMG_SRC}?v=4`);
  const giftInner = `<span class="fidelity-roulette-segment-label fidelity-roulette-segment-label--gift-wrap" aria-hidden="true"><img class="fidelity-roulette-segment-gift-img" src="${src}" alt="" width="80" height="80" decoding="async" fetchpriority="high" /></span>`;
  const textLabel = wheelSegmentAlternateDisplayLabel(segmentIndex);
  const loseInner = `<span class="fidelity-roulette-segment-label fidelity-roulette-segment-label-text">${escapeHtml(textLabel)}</span>`;
  const anchorAttrs = showGift ? ` role="img" aria-label="Gagner"` : "";
  return `<div class="${segClass}" style="transform: rotate(${angle}deg); --label-rotate: ${labelRotateDeg}deg;"><span class="fidelity-roulette-segment-label-anchor"${anchorAttrs}>${showGift ? giftInner : loseInner}</span></div>`;
}
