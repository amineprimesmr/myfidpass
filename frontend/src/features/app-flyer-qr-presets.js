/**
 * Gabarits et valeurs par défaut — Flyer QR (/app#flyer-qr).
 */
export const FLYER_STORAGE_KEY = "fidpass_flyer_prefs_v1";

/** Dimensions export PNG (haute définition impression / zoom). */
export const FLYER_EXPORT = { w: 2400, h: 3600 };

/** Nombre de parts (aligné sur le visuel actuel de public/assets/roue.png : 5 zones). */
export const FLYER_WHEEL_SEGMENT_COUNT = 5;

/**
 * Fractions de tour (sens horaire) pour chaque part du PNG — rainures ~11h, 1h, 3h, 6h, 9h.
 * Somme = 1 (60° + 60° + 90° + 90° + 60°).
 */
export const FLYER_WHEEL_PNG_ARC_FRACTIONS = Object.freeze([1 / 6, 1 / 6, 1 / 4, 1 / 4, 1 / 6]);

/**
 * Décalage interne mode PNG seulement : première rainure ≈ 11h quand la rotation utilisateur vaut 0°.
 * (Le mode « parts vectorielles » reste centré sur 12h avec parts égales.)
 */
export const FLYER_WHEEL_PNG_EXTRA_OFFSET_DEG = -30;

/** Identifiant unique du gabarit flyer (ancien localStorage avec d’autres ids → normalisé au merge). */
export const FLYER_TEMPLATE_ID = "noir-or-roue";

/** @typedef {{ id: string; name: string; blurb: string; badge?: string }} FlyerTemplateMeta */

/** @type {FlyerTemplateMeta[]} */
export const FLYER_TEMPLATE_LIST = [
  {
    id: FLYER_TEMPLATE_ID,
    name: "Flyer QR",
    blurb: "Contraste fort, jaune/or sur fond sombre — idéal comptoir.",
    badge: "Pop",
  },
];

/** @param {string} id */
export function flyerTemplateMeta(id) {
  return FLYER_TEMPLATE_LIST.find((t) => t.id === id) || FLYER_TEMPLATE_LIST[0];
}

/**
 * @typedef {object} FlyerState
 * @property {string} templateId
 * @property {string} headline
 * @property {string} subline
 * @property {string} ctaBanner
 * @property {string} step1
 * @property {string} step2
 * @property {string} step3
 * @property {string} social1
 * @property {string} socialUrl1
 * @property {string} social2
 * @property {string} socialUrl2
 * @property {string} social3
 * @property {string} socialUrl3
 * @property {string} colorPrimary
 * @property {string} colorSecondary
 * @property {string} colorAccent
 * @property {string} colorBgTop
 * @property {string} colorBgBottom
 * @property {"segments"|"png"} wheelRenderMode
 * @property {string} wheelColorOdd parts impaires (1, 3, 5…)
 * @property {string} wheelColorEven parts paires (2, 4…)
 * @property {number} wheelSegmentOffsetDeg rotation découpe PNG / parts (°)
 */

/** @returns {FlyerState} */
export function defaultFlyerState() {
  return {
    templateId: FLYER_TEMPLATE_ID,
    headline: "SCANNEZ · GAGNEZ · FIDÉLISEZ",
    subline: "Ajoutez la carte fidélité en un scan",
    ctaBanner: "SCANNEZ POUR JOUER",
    step1: "Scannez le QR code",
    step2: "Ajoutez la carte au Wallet",
    step3: "Cumulez points & avantages",
    social1: "",
    socialUrl1: "",
    social2: "",
    socialUrl2: "",
    social3: "",
    socialUrl3: "",
    colorPrimary: "#fbbf24",
    colorSecondary: "#f97316",
    colorAccent: "#ffffff",
    colorBgTop: "#0f172a",
    colorBgBottom: "#020617",
    wheelRenderMode: "segments",
    wheelColorOdd: "#fbbf24",
    wheelColorEven: "#f97316",
    wheelSegmentOffsetDeg: 0,
  };
}

/**
 * Couleurs des parts (après merge / formulaire).
 * @param {FlyerState} s
 * @returns {string[]}
 */
export function wheelSegmentColorsResolved(s) {
  const b = defaultFlyerState();
  /** @type {Record<string, unknown>} */
  const src = /** @type {Record<string, unknown>} */ (s);
  const odd = safeHex(String(src.wheelColorOdd ?? ""), b.wheelColorOdd);
  const even = safeHex(String(src.wheelColorEven ?? ""), b.wheelColorEven);
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < FLYER_WHEEL_SEGMENT_COUNT; i++) {
    out.push(i % 2 === 0 ? odd : even);
  }
  return out;
}

function safeHex(v, fallback) {
  if (typeof v === "string" && /^#[0-9A-Fa-f]{6}$/.test(v.trim())) return v.trim();
  return fallback;
}

function clampWheelOffsetDeg(v) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-180, Math.min(180, Math.round(n * 20) / 20));
}

/** @param {Partial<FlyerState> | null | undefined} raw */
export function mergeFlyerState(raw) {
  const base = defaultFlyerState();
  if (!raw || typeof raw !== "object") return base;
  /** @type {Record<string, unknown>} */
  const merged = {
    ...base,
    ...raw,
    templateId: FLYER_TEMPLATE_ID,
    wheelRenderMode: raw.wheelRenderMode === "png" ? "png" : "segments",
  };
  merged.wheelSegmentOffsetDeg = clampWheelOffsetDeg(merged.wheelSegmentOffsetDeg);
  const hasOddKey = Object.prototype.hasOwnProperty.call(raw, "wheelColorOdd");
  const hasEvenKey = Object.prototype.hasOwnProperty.call(raw, "wheelColorEven");
  const wheelColorOdd = safeHex(
    String(hasOddKey ? raw.wheelColorOdd ?? "" : raw.wheelSeg1 ?? ""),
    base.wheelColorOdd,
  );
  const wheelColorEven = safeHex(
    String(hasEvenKey ? raw.wheelColorEven ?? "" : raw.wheelSeg2 ?? ""),
    base.wheelColorEven,
  );
  return {
    ...merged,
    colorPrimary: safeHex(String(merged.colorPrimary ?? ""), base.colorPrimary),
    colorSecondary: safeHex(String(merged.colorSecondary ?? ""), base.colorSecondary),
    colorAccent: safeHex(String(merged.colorAccent ?? ""), base.colorAccent),
    colorBgTop: safeHex(String(merged.colorBgTop ?? ""), base.colorBgTop),
    colorBgBottom: safeHex(String(merged.colorBgBottom ?? ""), base.colorBgBottom),
    wheelColorOdd,
    wheelColorEven,
  };
}
