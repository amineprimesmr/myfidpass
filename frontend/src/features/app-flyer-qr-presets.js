/**
 * Gabarits et valeurs par défaut — Flyer QR (/app#flyer-qr).
 */
export const FLYER_STORAGE_KEY = "fidpass_flyer_prefs_v1";

export const FLYER_EXPORT = { w: 1200, h: 1800 };

/** @typedef {{ id: string; name: string; blurb: string; badge?: string }} FlyerTemplateMeta */

/** @type {FlyerTemplateMeta[]} */
export const FLYER_TEMPLATE_LIST = [
  { id: "noir-or-roue", name: "Énergie & roue", blurb: "Contraste fort, jaune/or sur fond sombre — idéal comptoir.", badge: "Pop" },
  { id: "foret-jeu", name: "Jeu vert", blurb: "Blocs façon autocollant, ambiance premium retail.", badge: "Pro" },
  { id: "sunset-roue", name: "Sunset", blurb: "Dégradé chaud, esprit food & lifestyle.", badge: "Trend" },
  { id: "studio-clean", name: "Studio épuré", blurb: "Minimal, très lisible, QR XXL.", badge: "Print" },
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
 * @property {boolean} showLegalMention
 */

/** @returns {FlyerState} */
export function defaultFlyerState() {
  return {
    templateId: "noir-or-roue",
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
    showLegalMention: true,
  };
}

/** @param {string} templateId @returns {Partial<FlyerState>} */
export function flyerDefaultsForTemplate(templateId) {
  switch (templateId) {
    case "foret-jeu":
      return {
        colorPrimary: "#16a34a",
        colorSecondary: "#eab308",
        colorAccent: "#ffffff",
        colorBgTop: "#14532d",
        colorBgBottom: "#052e16",
        headline: "TOURNEZ LA ROUE !",
        subline: "Une surprise vous attend",
        ctaBanner: "SCANNEZ POUR JOUER",
      };
    case "sunset-roue":
      return {
        colorPrimary: "#fda4af",
        colorSecondary: "#f472b6",
        colorAccent: "#fff7ed",
        colorBgTop: "#4c1d95",
        colorBgBottom: "#9d174d",
        headline: "FAITES TOURNER LA ROUE",
        subline: "Votre cadeau en quelques secondes",
        ctaBanner: "SCANNE POUR JOUER",
      };
    case "studio-clean":
      return {
        colorPrimary: "#2563eb",
        colorSecondary: "#1e293b",
        colorAccent: "#0f172a",
        colorBgTop: "#f8fafc",
        colorBgBottom: "#e2e8f0",
        headline: "CARTE FIDÉLITÉ DIGITALE",
        subline: "Apple Wallet & Google Wallet",
        ctaBanner: "SCANNER LE QR CODE",
      };
    default:
      return {
        colorPrimary: "#fbbf24",
        colorSecondary: "#f59e0b",
        colorAccent: "#fefce8",
        colorBgTop: "#0f172a",
        colorBgBottom: "#020617",
        headline: "FAITES TOURNER LA ROUE !",
        subline: "Gagnez des cadeaux à chaque passage",
        ctaBanner: "SCANNEZ POUR JOUER",
      };
  }
}

function safeHex(v, fallback) {
  if (typeof v === "string" && /^#[0-9A-Fa-f]{6}$/.test(v.trim())) return v.trim();
  return fallback;
}

/** @param {Partial<FlyerState> | null | undefined} raw */
export function mergeFlyerState(raw) {
  const base = defaultFlyerState();
  if (!raw || typeof raw !== "object") return base;
  const t = typeof raw.templateId === "string" ? raw.templateId : base.templateId;
  const tplDefaults = flyerDefaultsForTemplate(t);
  const merged = {
    ...base,
    ...tplDefaults,
    ...raw,
    templateId: FLYER_TEMPLATE_LIST.some((x) => x.id === t) ? t : base.templateId,
    showLegalMention: raw.showLegalMention !== false,
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
