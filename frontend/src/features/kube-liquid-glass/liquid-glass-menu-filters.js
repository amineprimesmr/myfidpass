/**
 * Filtres SVG « Liquid Glass » pour le menu d’accueil.
 *
 * Implémentation alignée sur le guide kube.io (parcours A → Z) :
 * - Champ de vecteurs de déplacement + normalisation (R/G, neutre 128)
 * - Carte PNG via feImage → feDisplacementMap (scale = déplacement max × ratio)
 * - Mise en forme légère post-réfraction (saturation)
 * - Spéculaire bord (feImage + feFuncA) combinée en screen sur le résultat
 * - Application navigateur : backdrop-filter: url(#id) (Chromium) ; sinon blur CSS (fallback)
 *
 * Référence : https://kube.io/blog/liquid-glass-css-svg/
 */
import {
  SurfaceEquations,
  calculateDisplacementMap1D,
  calculateDisplacementMap2D,
  calculateSpecularHighlight,
  imageDataToDataURL,
} from "./displacement-math.js";

const SVG_ID = "fidpass-liquid-menu-filter-svg";
export const MQL = "(min-width: 768px)";

/** Valeurs de base (surface convex_squircle, indice ~verre). */
export const DEFAULTS = {
  surfaceType: "convex_squircle",
  bezelWidth: 18,
  glassThickness: 100,
  refractiveIndex: 1.5,
  refractionScale: 0.88,
  specularOpacity: 0.45,
  blur: 0.95,
  specularAngle: Math.PI / 3,
};

/**
 * Affinage par morceau de verre (D = barre desktop, B = pilule mobile, P = panneau mobile).
 * Inspiré des presets « Searchbox » / « Music player » du playground Kube (spéculaire plus douce sur B).
 */
export const SURFACE_TUNING = {
  D: { bezelWidth: 20, glassThickness: 100, refractionScale: 0.86, specularOpacity: 0.42, blur: 0.82 },
  B: { bezelWidth: 13, glassThickness: 92, refractionScale: 0.7, specularOpacity: 0.24, blur: 1.05 },
  P: { bezelWidth: 22, glassThickness: 104, refractionScale: 0.8, specularOpacity: 0.34, blur: 1.08 },
};

const VARIANTS = [
  { filterId: "fidpassLgDesk", s: "D" },
  { filterId: "fidpassLgMbar", s: "B" },
  { filterId: "fidpassLgMpan", s: "P" },
];

/**
 * Chaîne équivalente au schéma final de l’article : déplacement + blend spéculaire.
 * SourceGraphic → léger flou (comme le curseur « Blur » des demos) → displacement → saturation → + highlight (screen).
 */
function oneFilter(suf, filterId) {
  return `
<filter id="${filterId}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">
  <feGaussianBlur id="fLg${suf}_blur" in="SourceGraphic" stdDeviation="0.95" result="preblur"/>
  <feImage id="fLg${suf}_dimg" href="" x="0" y="0" width="100" height="40" result="dmap" preserveAspectRatio="none"/>
  <feDisplacementMap id="fLg${suf}_dmap" in="preblur" in2="dmap" scale="40" xChannelSelector="R" yChannelSelector="G" edgeMode="duplicate" result="refracted"/>
  <feColorMatrix in="refracted" type="saturate" values="1.22" result="saturated"/>
  <feImage id="fLg${suf}_simg" href="" x="0" y="0" width="100" height="40" result="splayer" preserveAspectRatio="none"/>
  <feComponentTransfer in="splayer" result="specular">
    <feFuncA id="fLg${suf}_slope" type="linear" slope="0.45" intercept="0"/>
  </feComponentTransfer>
  <feBlend in="specular" in2="saturated" mode="screen"/>
</filter>`;
}

export function ensureAllFiltersSvg() {
  if (document.getElementById(SVG_ID)) return;
  const body = `<defs>${VARIANTS.map((v) => oneFilter(v.s, v.filterId)).join("")}</defs>`;
  const wrap = document.createElement("div");
  wrap.innerHTML = `<svg id="${SVG_ID}" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">${body}</svg>`;
  document.body.appendChild(wrap.firstElementChild);
}

/**
 * Recalcule les feImage (cartes) et le scale du displacement pour la taille réelle du bloc.
 * @param {HTMLElement} glassEl
 * @param {"D"|"B"|"P"} which
 * @param {Record<string, unknown>} [opts] Surcharges ponctuelles (mêmes clés que DEFAULTS).
 */
export function updateFilterForGlass(glassEl, which, opts = {}) {
  const tuning = SURFACE_TUNING[which] || SURFACE_TUNING.D;
  const o = { ...DEFAULTS, ...tuning, ...opts };
  const suf = which;
  const w = Math.max(2, Math.round(glassEl.offsetWidth));
  const h = Math.max(2, Math.round(glassEl.offsetHeight));
  if (w < 8 || h < 8) return;

  const radius = Math.min(h / 2, w / 2);
  const surfaceFn = SurfaceEquations[o.surfaceType] || SurfaceEquations.convex_squircle;
  const pre = calculateDisplacementMap1D(o.glassThickness, o.bezelWidth, surfaceFn, o.refractiveIndex);
  const maxD = Math.max(1, ...pre.map((x) => Math.abs(x)));
  const disp = calculateDisplacementMap2D(w, h, w, h, radius, o.bezelWidth, maxD, pre);
  const spec = calculateSpecularHighlight(w, h, radius, o.bezelWidth, o.specularAngle);
  const dUrl = imageDataToDataURL(disp);
  const sUrl = imageDataToDataURL(spec);

  const dimg = document.getElementById(`fLg${suf}_dimg`);
  const simg = document.getElementById(`fLg${suf}_simg`);
  const dmap = document.getElementById(`fLg${suf}_dmap`);
  if (!dimg || !simg || !dmap) return;

  dimg.setAttribute("href", dUrl);
  dimg.setAttribute("width", String(w));
  dimg.setAttribute("height", String(h));
  simg.setAttribute("href", sUrl);
  simg.setAttribute("width", String(w));
  simg.setAttribute("height", String(h));
  dmap.setAttribute("scale", String(maxD * o.refractionScale));

  const blur = document.getElementById(`fLg${suf}_blur`);
  if (blur) blur.setAttribute("stdDeviation", String(o.blur));
  const slope = document.getElementById(`fLg${suf}_slope`);
  if (slope) slope.setAttribute("slope", String(o.specularOpacity));
}

export function applyBackdropNative(el, filterId) {
  el.classList.add("lg-menu--native");
  el.classList.remove("lg-menu--fallback");
  el.style.backdropFilter = `url(#${filterId})`;
  el.style.webkitBackdropFilter = `url(#${filterId})`;
}

export function applyBackdropFallback(el) {
  el.classList.remove("lg-menu--native");
  el.classList.add("lg-menu--fallback");
  el.style.backdropFilter = "none";
  el.style.webkitBackdropFilter = "none";
}

export function clearBackdropToFallback(el) {
  el.classList.remove("lg-menu--native");
  el.classList.add("lg-menu--fallback");
  el.style.backdropFilter = "";
  el.style.webkitBackdropFilter = "";
}
