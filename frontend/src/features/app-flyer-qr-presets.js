/**
 * Gabarits et valeurs par défaut — Flyer QR (/app#flyer-qr).
 */
import { normalizeHeadlineFontId } from "./app-flyer-qr-headline-fonts.js";

export const FLYER_STORAGE_KEY = "fidpass_flyer_prefs_v1";

/** Dimensions export PNG (haute définition impression / zoom). */
export const FLYER_EXPORT = { w: 2400, h: 3600 };

/** Nombre de parts : 6 secteurs égaux (60°) — flyer + libellés canvas alignés sur la même géométrie. */
export const FLYER_WHEEL_SEGMENT_COUNT = 6;

/**
 * Mode PNG seulement : calage rainures quand pointeur au milieu d’une part (1re arête ~11h si 0° utilisateur).
 * Mode vectoriel : pas ce décalage (rotation utilisateur seule).
 */
export const FLYER_WHEEL_PNG_EXTRA_OFFSET_DEG = -30;

/**
 * Rayon des teintes PNG / clip = ce facteur × rayon affiché (bord 3D blanc plus étroit que le disque logique).
 */
/** @deprecated Marge extérieure des teintes gérée dans `app-flyer-wheel.js` (`WHEEL_COLOR_OUTER_R_FRAC`). */
export const FLYER_WHEEL_PNG_TINT_RADIUS_FACTOR = 0.9;

/** Zone logo (drawFlyerCommerceLogo) : bas du bloc = centerYFrac + maxHFrac/2. */
export const FLYER_LOGO_LAYOUT = Object.freeze({
  /** Marge sous le bord haut : le centre du logo ne doit pas gratter le haut du flyer. */
  centerYFrac: 0.092,
  maxHFrac: 0.15,
  maxWFrac: 0.62,
});

/** Rayon affiché de la roue / demi-largeur canvas (aperçu + export). */
export const FLYER_WHEEL_RADIUS_FRAC = 0.375;

export const FLYER_LOGO_BLOCK_BOTTOM_FRAC =
  FLYER_LOGO_LAYOUT.centerYFrac + FLYER_LOGO_LAYOUT.maxHFrac / 2;

/**
 * Mise en page logo (fractions 0–1) — pilotée par l’app / JSON `flyer_prefs.state`.
 * @param {Record<string, unknown> | null | undefined} s
 */
export function flyerLogoLayoutResolved(s) {
  const base = FLYER_LOGO_LAYOUT;
  const cy = Number(s?.flyerLogoCenterYFrac);
  const mw = Number(s?.flyerLogoMaxWFrac);
  const mh = Number(s?.flyerLogoMaxHFrac);
  return {
    centerYFrac: Number.isFinite(cy) ? Math.min(0.22, Math.max(0.06, cy)) : base.centerYFrac,
    maxWFrac: Number.isFinite(mw) ? Math.min(0.88, Math.max(0.28, mw)) : base.maxWFrac,
    maxHFrac: Number.isFinite(mh) ? Math.min(0.36, Math.max(0.06, mh)) : base.maxHFrac,
  };
}

/**
 * Bord bas du bloc logo (fraction hauteur canvas) pour caler l’accroche sous le logo.
 * @param {Record<string, unknown> | null | undefined} s
 * @param {boolean} hasLogo
 */
export function flyerLogoBlockBottomFracFromState(s, hasLogo) {
  if (!hasLogo) return 0.026;
  const L = flyerLogoLayoutResolved(s);
  return L.centerYFrac + L.maxHFrac / 2;
}

/**
 * Composition verticale du flyer (écarts volontairement marqués pour l’aperçu + impression).
 */
export const FLYER_LAYOUT = Object.freeze({
  /** Centre vertical de la roue (roue un peu plus petite → léger remonté visuel). */
  wheelCenterYFrac: 0.528,
  /** Bord supérieur du carré QR (fraction hauteur). */
  qrTopYFrac: 0.558,
  /** Hauteur de la zone « étapes », fond transparent. */
  footerStepsHeightFrac: 0.108,
  /** Hauteur max du PNG bandeau pied (fraction canvas). */
  footerBannerMaxHeightFrac: 0.132,
});

/**
 * Réserve de mise en page (non branchée) : zone au-dessus de la roue si un calque décoratif est ajouté plus tard.
 */
export const FLYER_DECOR_OVERLAY_LAYOUT = Object.freeze({
  centerYFrac: (FLYER_LAYOUT.wheelCenterYFrac + FLYER_LAYOUT.qrTopYFrac) / 2,
  maxWFrac: 0.78,
  maxHFrac: 0.2,
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
 * @property {string} ctaBanner texte pastille à gauche du QR (ex. Scanne pour jouer), vide = masqué
 * @property {string} ctaBannerBgColor fond de la pastille (ex. rose #ec4899)
 * @property {string} ctaTextColor couleur du texte dans la pastille CTA
 * @property {string} step1
 * @property {string} step2
 * @property {string} step3
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
 * @property {string} headlineGiftStrokeColor couleur contour du mot CADEAU! (penché)
 * @property {number} headlineStrokeWidth épaisseur contour (0 = aucun), 0–48
 * @property {number} headlineLogoGapPct espace logo → titre (% hauteur flyer, 0–28)
 * @property {number} headlineLetterSpacing espacement lettres (0–8, px réf. export)
 * @property {number} headlineSizePct taille police titre (% largeur flyer), 5–16
 * @property {string} footerStepsForegroundColor couleur chiffres + libellés des étapes (bas de flyer)
 * @property {number} flyerFooterTextScalePct échelle texte étapes, 70–130
 * @property {number} flyerWheelLabelScalePct échelle GAGNÉ/PERDU sur la roue, 70–130
 * @property {number} flyerBgOverlayPct voile sur image de fond (0–90), 0 = photo brute sans assombrissement
 * @property {number} flyerQrOutlineWidth cadre autour du QR (0 = off), 0–12
 * @property {number} flyerLogoCenterYFrac centre vertical du logo (fraction hauteur), ~0.04–0.22
 * @property {number} flyerLogoMaxWFrac largeur max logo / largeur canvas, ~0.28–0.88
 * @property {number} flyerLogoMaxHFrac hauteur max logo / hauteur canvas, ~0.06–0.36
 * @property {boolean} [flyerLogoKeepSourceBackground] conserver le fond du fichier logo (app iOS / export)
 */

/** @returns {FlyerState} */
export function defaultFlyerState() {
  return {
    templateId: FLYER_TEMPLATE_ID,
    headline: "SCANNEZ & GAGNEZ VOTRE CADEAU !",
    ctaBanner: "SCANNER POUR JOUER",
    ctaBannerBgColor: "#ec4899",
    ctaTextColor: "#ffffff",
    step1: "Scan le QR code",
    step2: "Fais tourner la roue",
    step3: "Découvre ta récompense",
    colorPrimary: "#fbbf24",
    colorSecondary: "#f97316",
    colorAccent: "#ffffff",
    colorBgTop: "#0f172a",
    colorBgBottom: "#020617",
    /** `png` = texture `spinflyer` (teintes) ; `segments` = aplats 2D sans image. */
    wheelRenderMode: "png",
    wheelColorOdd: "#fbbf24",
    wheelColorEven: "#f97316",
    wheelSegmentOffsetDeg: 0,
    headlineFontId: "fraunces",
    headlineTextColor: "#ffffff",
    headlineStrokeColor: "#020617",
    headlineGiftStrokeColor: "#020617",
    headlineStrokeWidth: 18,
    headlineLogoGapPct: 4,
    headlineLetterSpacing: 0,
    headlineSizePct: 7,
    footerStepsForegroundColor: "#ffffff",
    flyerFooterTextScalePct: 100,
    flyerWheelLabelScalePct: 100,
    flyerBgOverlayPct: 0,
    flyerQrOutlineWidth: 0,
    flyerLogoCenterYFrac: FLYER_LOGO_LAYOUT.centerYFrac,
    flyerLogoMaxWFrac: FLYER_LOGO_LAYOUT.maxWFrac,
    flyerLogoMaxHFrac: FLYER_LOGO_LAYOUT.maxHFrac,
    flyerLogoKeepSourceBackground: false,
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

/** Couleur texte / chiffres du bandeau étapes (après merge). */
export function footerStepsForegroundResolved(s) {
  const b = defaultFlyerState();
  return safeHex(String(s.footerStepsForegroundColor ?? ""), b.footerStepsForegroundColor);
}

function clampWheelOffsetDeg(v) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-180, Math.min(180, Math.round(n * 20) / 20));
}

function clampHeadlineStrokeW(v) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 10;
  return Math.max(0, Math.min(48, Math.round(n)));
}

function clampHeadlineGapPct(v) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 7;
  return Math.max(0, Math.min(28, Math.round(n * 10) / 10));
}

function clampHeadlineLetterSpacing(v) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(8, Math.round(n * 2) / 2));
}

function clampHeadlineSizePct(v) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 7;
  return Math.max(5, Math.min(16, Math.round(n * 10) / 10));
}

function clampFlyerTextScalePct(v) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 100;
  return Math.max(70, Math.min(130, Math.round(n / 5) * 5));
}

function clampFlyerLogoCenterYFrac(v) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return FLYER_LOGO_LAYOUT.centerYFrac;
  return Math.min(0.22, Math.max(0.06, Math.round(n * 1000) / 1000));
}

function clampFlyerLogoMaxWFrac(v) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return FLYER_LOGO_LAYOUT.maxWFrac;
  return Math.min(0.88, Math.max(0.28, Math.round(n * 1000) / 1000));
}

function clampFlyerLogoMaxHFrac(v) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return FLYER_LOGO_LAYOUT.maxHFrac;
  return Math.min(0.36, Math.max(0.06, Math.round(n * 1000) / 1000));
}

/**
 * @param {Record<string, unknown>} raw
 * @returns {"segments"|"png"}
 */
function wheelRenderModeFromRaw(raw) {
  const v = raw.wheelRenderMode ?? raw.wheel_render_mode;
  if (v === undefined || v === null) return "png";
  return String(v).trim().toLowerCase() === "segments" ? "segments" : "png";
}

/** @param {Partial<FlyerState> | null | undefined} raw */
export function mergeFlyerState(raw) {
  const base = defaultFlyerState();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  /** @type {Record<string, unknown>} */
  const rawClean = Object.fromEntries(
    Object.entries(/** @type {Record<string, unknown>} */ (raw)).filter(([, v]) => v !== undefined),
  );
  /** @type {Record<string, unknown>} */
  const merged = {
    ...base,
    ...rawClean,
    templateId: FLYER_TEMPLATE_ID,
    wheelRenderMode: wheelRenderModeFromRaw(rawClean),
  };
  merged.wheelSegmentOffsetDeg = clampWheelOffsetDeg(merged.wheelSegmentOffsetDeg);
  /** Charte flyer : couleurs roue = primaire / secondaire si non fixées dans le JSON. */
  const colorPrimary = safeHex(String(merged.colorPrimary ?? ""), base.colorPrimary);
  const colorSecondary = safeHex(String(merged.colorSecondary ?? ""), base.colorSecondary);
  const hasOddKey = Object.prototype.hasOwnProperty.call(rawClean, "wheelColorOdd");
  const hasEvenKey = Object.prototype.hasOwnProperty.call(rawClean, "wheelColorEven");
  const wheelColorOdd = safeHex(
    String(hasOddKey ? rawClean.wheelColorOdd ?? "" : rawClean.wheelSeg1 ?? ""),
    colorPrimary,
  );
  const wheelColorEven = safeHex(
    String(hasEvenKey ? rawClean.wheelColorEven ?? "" : rawClean.wheelSeg2 ?? ""),
    colorSecondary,
  );
  delete merged.subline;
  delete merged.flyerWheelOutlineWidth;
  delete merged.social1;
  delete merged.socialUrl1;
  delete merged.social2;
  delete merged.socialUrl2;
  delete merged.social3;
  delete merged.socialUrl3;
  const headlineRaw = String(merged.headline ?? "").trim();
  if (!headlineRaw || /^fais\s+tourner\s+la\s+roue$/i.test(headlineRaw)) {
    merged.headline = base.headline;
  }
  const ctaRaw = String(merged.ctaBanner ?? "").trim();
  if (!ctaRaw || /^scanne\s+pour\s+jouer$/i.test(ctaRaw)) {
    merged.ctaBanner = base.ctaBanner;
  }
  return {
    ...merged,
    colorPrimary,
    colorSecondary,
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
    headlineGiftStrokeColor: safeHex(
      String(merged.headlineGiftStrokeColor ?? ""),
      base.headlineGiftStrokeColor,
    ),
    headlineStrokeWidth: clampHeadlineStrokeW(merged.headlineStrokeWidth),
    headlineLogoGapPct: clampHeadlineGapPct(merged.headlineLogoGapPct),
    headlineLetterSpacing: clampHeadlineLetterSpacing(merged.headlineLetterSpacing),
    headlineSizePct: clampHeadlineSizePct(merged.headlineSizePct),
    footerStepsForegroundColor: safeHex(
      String(merged.footerStepsForegroundColor ?? ""),
      base.footerStepsForegroundColor,
    ),
    flyerFooterTextScalePct: clampFlyerTextScalePct(merged.flyerFooterTextScalePct),
    flyerWheelLabelScalePct: clampFlyerTextScalePct(merged.flyerWheelLabelScalePct),
    flyerBgOverlayPct: Number.isFinite(Number(merged.flyerBgOverlayPct))
      ? Math.max(0, Math.min(90, Math.round(Number(merged.flyerBgOverlayPct))))
      : 0,
    flyerQrOutlineWidth: 0,
    ctaBannerBgColor: safeHex(String(merged.ctaBannerBgColor ?? ""), base.ctaBannerBgColor),
    ctaTextColor: safeHex(String(merged.ctaTextColor ?? ""), base.ctaTextColor),
    flyerLogoCenterYFrac: clampFlyerLogoCenterYFrac(merged.flyerLogoCenterYFrac),
    flyerLogoMaxWFrac: clampFlyerLogoMaxWFrac(merged.flyerLogoMaxWFrac),
    flyerLogoMaxHFrac: clampFlyerLogoMaxHFrac(merged.flyerLogoMaxHFrac),
    flyerLogoKeepSourceBackground: merged.flyerLogoKeepSourceBackground === true,
  };
}
