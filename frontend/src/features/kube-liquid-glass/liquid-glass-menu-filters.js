/* global ImageData */
import {
  SurfaceEquations,
  calculateDisplacementMap1D,
  calculateDisplacementMap2D,
  calculateSpecularHighlight,
  imageDataToDataURL,
} from "./displacement-math.js";

const SVG_ID = "fidpass-liquid-menu-filter-svg";
export const MQL = "(min-width: 768px)";

const DEFAULTS = {
  surfaceType: "convex_squircle",
  bezelWidth: 18,
  glassThickness: 100,
  refractiveIndex: 1.5,
  refractionScale: 0.88,
  specularOpacity: 0.28,
  blur: 0.9,
  specularAngle: Math.PI / 3,
};

const VARIANTS = [
  { filterId: "fidpassLgDesk", s: "D" },
  { filterId: "fidpassLgMbar", s: "B" },
  { filterId: "fidpassLgMpan", s: "P" },
];

function oneFilter(suf, filterId) {
  return `
<filter id="${filterId}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">
<feGaussianBlur id="fLg${suf}_blur" in="SourceGraphic" stdDeviation="0.9" result="blurred"/>
<feImage id="fLg${suf}_dimg" href="" x="0" y="0" width="100" height="40" result="dmap" preserveAspectRatio="none"/>
<feDisplacementMap id="fLg${suf}_dmap" in="blurred" in2="dmap" scale="40" xChannelSelector="R" yChannelSelector="G" result="displaced"/>
<feColorMatrix in="displaced" type="saturate" values="1.25" result="saturated"/>
<feImage id="fLg${suf}_simg" href="" x="0" y="0" width="100" height="40" result="splayer" preserveAspectRatio="none"/>
<feComponentTransfer in="splayer" result="sf">
<feFuncA id="fLg${suf}_slope" type="linear" slope="0.28"/>
</feComponentTransfer>
<feBlend in="sf" in2="saturated" mode="screen"/>
</filter>`;
}

export function ensureAllFiltersSvg() {
  if (document.getElementById(SVG_ID)) return;
  const body = ` <defs>
${VARIANTS.map((v) => oneFilter(v.s, v.filterId)).join("")}
</defs>`;
  const svg = document.createElement("div");
  svg.innerHTML = `<svg id="${SVG_ID}" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">${body}</svg>`;
  document.body.appendChild(svg.firstElementChild);
}

/**
 * @param {HTMLElement} glassEl
 * @param {"D"|"B"|"P"} which
 * @param {object} [opts]
 */
export function updateFilterForGlass(glassEl, which, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
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

export { DEFAULTS, VARIANTS, SVG_ID };

export function applyBackdropNative(el, filterId) {
  el.classList.add("lg-menu--native");
  el.classList.remove("lg-menu--fallback");
  el.style.backdropFilter = `url(#${filterId})`;
}

export function applyBackdropFallback(el) {
  el.classList.remove("lg-menu--native");
  el.classList.add("lg-menu--fallback");
  el.style.backdropFilter = "none";
}

export function clearBackdropToFallback(el) {
  el.classList.remove("lg-menu--native");
  el.classList.add("lg-menu--fallback");
  el.style.backdropFilter = "";
}
