/**
 * Gabarits et valeurs par défaut — Flyer QR (/app#flyer-qr).
 */
export const FLYER_STORAGE_KEY = "fidpass_flyer_prefs_v1";

export const FLYER_EXPORT = { w: 1200, h: 1800 };

/** Nombre de parts sur la roue vectorielle du flyer. */
export const FLYER_WHEEL_SEGMENT_COUNT = 6;

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
 * @property {string} wheelSeg1
 * @property {string} wheelSeg2
 * @property {string} wheelSeg3
 * @property {string} wheelSeg4
 * @property {string} wheelSeg5
 * @property {string} wheelSeg6
 * @property {boolean} wheelImageTintPrimary teinte PNG « roue » avec la couleur primaire
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
    wheelSeg1: "#fbbf24",
    wheelSeg2: "#f97316",
    wheelSeg3: "#fbbf24",
    wheelSeg4: "#f97316",
    wheelSeg5: "#fbbf24",
    wheelSeg6: "#f97316",
    wheelImageTintPrimary: true,
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
  /** @type {Record<string, unknown>} */
  const def = /** @type {Record<string, unknown>} */ (b);
  /** @type {string[]} */
  const out = [];
  for (let i = 1; i <= FLYER_WHEEL_SEGMENT_COUNT; i++) {
    const key = `wheelSeg${i}`;
    const raw = src[key];
    const fb = def[key];
    out.push(
      safeHex(typeof raw === "string" ? raw : "", typeof fb === "string" ? fb : b.colorPrimary),
    );
  }
  return out;
}

function safeHex(v, fallback) {
  if (typeof v === "string" && /^#[0-9A-Fa-f]{6}$/.test(v.trim())) return v.trim();
  return fallback;
}

/** @param {Partial<FlyerState> | null | undefined} raw */
export function mergeFlyerState(raw) {
  const base = defaultFlyerState();
  if (!raw || typeof raw !== "object") return base;
  const merged = {
    ...base,
    ...raw,
    templateId: FLYER_TEMPLATE_ID,
    wheelRenderMode: raw.wheelRenderMode === "png" ? "png" : "segments",
    wheelImageTintPrimary: raw.wheelImageTintPrimary !== false,
  };
  const seg = (k) => safeHex(merged[k], base[k]);
  return {
    ...merged,
    colorPrimary: safeHex(merged.colorPrimary, base.colorPrimary),
    colorSecondary: safeHex(merged.colorSecondary, base.colorSecondary),
    colorAccent: safeHex(merged.colorAccent, base.colorAccent),
    colorBgTop: safeHex(merged.colorBgTop, base.colorBgTop),
    colorBgBottom: safeHex(merged.colorBgBottom, base.colorBgBottom),
    wheelSeg1: seg("wheelSeg1"),
    wheelSeg2: seg("wheelSeg2"),
    wheelSeg3: seg("wheelSeg3"),
    wheelSeg4: seg("wheelSeg4"),
    wheelSeg5: seg("wheelSeg5"),
    wheelSeg6: seg("wheelSeg6"),
  };
}
