/**
 * Gabarits et valeurs par défaut — Flyer QR (/app#flyer-qr).
 */
import { normalizeHeadlineFontId } from "./app-flyer-qr-headline-fonts.js";

export const FLYER_STORAGE_KEY = "fidpass_flyer_prefs_v1";

/** Dimensions export PNG (haute définition impression / zoom). */
export const FLYER_EXPORT = { w: 2400, h: 3600 };

/** Nombre de parts : 6 secteurs égaux (60°), alignés sur roue.png actuelle. */
export const FLYER_WHEEL_SEGMENT_COUNT = 6;

/**
 * Mode PNG seulement : calage rainures quand pointeur au milieu d’une part (1re arête ~11h si 0° utilisateur).
 * Mode vectoriel : pas ce décalage (rotation utilisateur seule).
 */
export const FLYER_WHEEL_PNG_EXTRA_OFFSET_DEG = -30;

/**
 * Rayon des teintes PNG / clip = ce facteur × rayon affiché (bord 3D blanc plus étroit que le disque logique).
 */
export const FLYER_WHEEL_PNG_TINT_RADIUS_FACTOR = 0.94;

/** Zone logo (drawFlyerCommerceLogo) : bas du bloc = centerYFrac + maxHFrac/2. */
export const FLYER_LOGO_LAYOUT = Object.freeze({
  centerYFrac: 0.1,
  maxHFrac: 0.15,
  maxWFrac: 0.62,
});

export const FLYER_LOGO_BLOCK_BOTTOM_FRAC =
  FLYER_LOGO_LAYOUT.centerYFrac + FLYER_LOGO_LAYOUT.maxHFrac / 2;

/**
 * Composition verticale du flyer (écarts volontairement marqués pour l’aperçu + impression).
 */
export const FLYER_LAYOUT = Object.freeze({
  /** Centre vertical de la roue (fraction hauteur canvas). */
  wheelCenterYFrac: 0.492,
  /** Bord supérieur du carré QR (fraction hauteur). */
  qrTopYFrac: 0.528,
  /** Hauteur du bandeau noir « étapes » (sans la bande sociale). */
  footerStepsHeightFrac: 0.108,
  /** Hauteur max du PNG bandeau pied (fraction canvas). */
  footerBannerMaxHeightFrac: 0.132,
  /** Bande « Suivez-nous » quand au moins un réseau (fraction hauteur). */
  socialStripHeightFrac: 0.124,
  /** Bande réservée en bas si aucun réseau (aperçu de la zone + texte). */
  socialStripPlaceholderFrac: 0.058,
});

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
 * @property {string} headlineFontId police titre (voir FLYER_HEADLINE_FONTS)
 * @property {string} headlineTextColor couleur remplissage titre
 * @property {string} headlineStrokeColor couleur contour titre
 * @property {number} headlineStrokeWidth épaisseur contour (0 = aucun), 1–14
 * @property {number} headlineLogoGapPct espace logo → titre (% hauteur flyer, 0–14)
 * @property {number} headlineLetterSpacing espacement lettres (0–8, px réf. export)
 * @property {number} flyerBgOverlayPct voile sur image de fond (0–90), 0 = photo seule
 */

/** @returns {FlyerState} */
export function defaultFlyerState() {
  return {
    templateId: FLYER_TEMPLATE_ID,
    headline: "Fais tourner la roue",
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
    headlineFontId: "fraunces",
    headlineTextColor: "#ffffff",
    headlineStrokeColor: "#020617",
    headlineStrokeWidth: 3,
    headlineLogoGapPct: 4,
    headlineLetterSpacing: 0,
    flyerBgOverlayPct: 52,
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

function clampHeadlineStrokeW(v) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 3;
  return Math.max(0, Math.min(14, Math.round(n)));
}

function clampHeadlineGapPct(v) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 4;
  return Math.max(0, Math.min(14, Math.round(n * 10) / 10));
}

function clampHeadlineLetterSpacing(v) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(8, Math.round(n * 2) / 2));
}

function clampFlyerBgOverlayPct(v) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 52;
  return Math.max(0, Math.min(90, Math.round(n)));
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
  delete merged.subline;
  return {
    ...merged,
    colorPrimary: safeHex(String(merged.colorPrimary ?? ""), base.colorPrimary),
    colorSecondary: safeHex(String(merged.colorSecondary ?? ""), base.colorSecondary),
    colorAccent: safeHex(String(merged.colorAccent ?? ""), base.colorAccent),
    colorBgTop: safeHex(String(merged.colorBgTop ?? ""), base.colorBgTop),
    colorBgBottom: safeHex(String(merged.colorBgBottom ?? ""), base.colorBgBottom),
    wheelColorOdd,
    wheelColorEven,
    headlineFontId: normalizeHeadlineFontId(merged.headlineFontId),
    headlineTextColor: safeHex(
      String(merged.headlineTextColor ?? ""),
      base.headlineTextColor,
    ),
    headlineStrokeColor: safeHex(
      String(merged.headlineStrokeColor ?? ""),
      base.headlineStrokeColor,
    ),
    headlineStrokeWidth: clampHeadlineStrokeW(merged.headlineStrokeWidth),
    headlineLogoGapPct: clampHeadlineGapPct(merged.headlineLogoGapPct),
    headlineLetterSpacing: clampHeadlineLetterSpacing(merged.headlineLetterSpacing),
    flyerBgOverlayPct: clampFlyerBgOverlayPct(merged.flyerBgOverlayPct),
  };
}
