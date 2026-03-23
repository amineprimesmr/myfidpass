/**
 * Gabarits et valeurs par défaut — Flyer QR (/app#flyer-qr).
 */
export const FLYER_STORAGE_KEY = "fidpass_flyer_prefs_v1";

export const FLYER_EXPORT = { w: 1200, h: 1800 };

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
 * @property {string} footerSocial
 * @property {string} colorPrimary
 * @property {string} colorSecondary
 * @property {string} colorAccent
 * @property {string} colorBgTop
 * @property {string} colorBgBottom
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
    footerSocial: "",
    colorPrimary: "#fbbf24",
    colorSecondary: "#f97316",
    colorAccent: "#ffffff",
    colorBgTop: "#0f172a",
    colorBgBottom: "#020617",
  };
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
  };
  return {
    ...merged,
    colorPrimary: safeHex(merged.colorPrimary, base.colorPrimary),
    colorSecondary: safeHex(merged.colorSecondary, base.colorSecondary),
    colorAccent: safeHex(merged.colorAccent, base.colorAccent),
    colorBgTop: safeHex(merged.colorBgTop, base.colorBgTop),
    colorBgBottom: safeHex(merged.colorBgBottom, base.colorBgBottom),
  };
}
