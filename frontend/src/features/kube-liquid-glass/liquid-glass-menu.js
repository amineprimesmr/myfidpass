/* global ResizeObserver */
/**
 * Menu « Liquid Glass » (kube.io) : filtre SVG + backdrop-filter: url(#…)
 * en Chrome / Chromium ; repli flou CSS ailleurs.
 */
import {
  SurfaceEquations,
  calculateDisplacementMap1D,
  calculateDisplacementMap2D,
  calculateSpecularHighlight,
  imageDataToDataURL,
} from "./displacement-math.js";
import "./liquid-glass-menu.css";

const FILTER_ID = "fidpassLiquidMenuFilter";
const SVG_ID = "fidpass-liquid-menu-filter-svg";

const DEFAULTS = {
  surfaceType: "convex_squircle",
  bezelWidth: 18,
  glassThickness: 100,
  refractiveIndex: 1.5,
  refractionScale: 0.88,
  specularOpacity: 0.28,
  blur: 0.9,
  saturate: 1.25,
  specularAngle: Math.PI / 3,
};

function supportsSvgBackdropUrl() {
  if (typeof window === "undefined" || !window.chrome) return false;
  const el = document.createElement("div");
  el.style.backdropFilter = "url(#x)";
  return el.style.backdropFilter.includes("url");
}

function ensureFilterSvg() {
  if (document.getElementById(SVG_ID)) return;
  const host = document.body;
  const wrap = document.createElement("div");
  wrap.innerHTML = `
<svg id="${SVG_ID}" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">
  <defs>
    <filter id="${FILTER_ID}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">
      <feGaussianBlur id="fidpassMenuFilterBlur" in="SourceGraphic" stdDeviation="0.9" result="blurred"/>
      <feImage id="fidpassMenuDispImg" href="" x="0" y="0" width="100" height="40" result="displacement_map" preserveAspectRatio="none"/>
      <feDisplacementMap id="fidpassMenuDispMap" in="blurred" in2="displacement_map" scale="40" xChannelSelector="R" yChannelSelector="G" result="displaced"/>
      <feColorMatrix in="displaced" type="saturate" values="1.25" result="displaced_saturated"/>
      <feImage id="fidpassMenuSpecImg" href="" x="0" y="0" width="100" height="40" result="specular_layer" preserveAspectRatio="none"/>
      <feComponentTransfer in="specular_layer" result="specular_faded">
        <feFuncA id="fidpassMenuSpecAlpha" type="linear" slope="0.28"/>
      </feComponentTransfer>
      <feBlend in="specular_faded" in2="displaced_saturated" mode="screen"/>
    </filter>
  </defs>
</svg>`;
  host.appendChild(wrap.firstElementChild);
}

/**
 * @param {HTMLElement} glassEl
 * @param {object} opts
 * @param {() => void} [opts.onUpdate]
 */
export function updateMenuLiquidFilter(glassEl, opts) {
  const o = { ...DEFAULTS, ...opts };
  const w = Math.max(2, Math.round(glassEl.offsetWidth));
  const h = Math.max(2, Math.round(glassEl.offsetHeight));
  const radius = Math.min(h / 2, w / 2);
  if (w < 8 || h < 8) return;

  const surfaceFn = SurfaceEquations[o.surfaceType] || SurfaceEquations.convex_squircle;
  const pre = calculateDisplacementMap1D(o.glassThickness, o.bezelWidth, surfaceFn, o.refractiveIndex);
  const maxD = Math.max(1, ...pre.map((x) => Math.abs(x)));
  const disp = calculateDisplacementMap2D(w, h, w, h, radius, o.bezelWidth, maxD, pre);
  const spec = calculateSpecularHighlight(w, h, radius, o.bezelWidth, o.specularAngle);
  const dispUrl = imageDataToDataURL(disp);
  const specUrl = imageDataToDataURL(spec);

  const dImg = document.getElementById("fidpassMenuDispImg");
  const sImg = document.getElementById("fidpassMenuSpecImg");
  const dMap = document.getElementById("fidpassMenuDispMap");
  if (!dImg || !sImg || !dMap) return;

  dImg.setAttribute("href", dispUrl);
  dImg.setAttribute("width", String(w));
  dImg.setAttribute("height", String(h));
  sImg.setAttribute("href", specUrl);
  sImg.setAttribute("width", String(w));
  sImg.setAttribute("height", String(h));
  dMap.setAttribute("scale", String(maxD * o.refractionScale));

  const blurEl = document.getElementById("fidpassMenuFilterBlur");
  if (blurEl) blurEl.setAttribute("stdDeviation", String(o.blur));
  const specA = document.getElementById("fidpassMenuSpecAlpha");
  if (specA) specA.setAttribute("slope", String(o.specularOpacity));
  if (o.onUpdate) o.onUpdate();
}

/**
 * @param {object} root
 * @param {string} [root.glassSelector] défaut: #fidpass-liquid-menu-glass
 * @param {() => void} [root.getContainer] parent pour le SVG (défaut: document.body)
 */
export function initLiquidGlassMenu({
  glassSelector = "#fidpass-liquid-menu-glass",
  getContainer = null,
} = {}) {
  ensureFilterSvg();
  if (getContainer) {
    const svg = document.getElementById(SVG_ID);
    if (svg && getContainer() && getContainer() !== document.body) {
      getContainer().appendChild(svg);
    }
  }
  const glass = document.querySelector(glassSelector);
  if (!glass) return () => {};

  const use = supportsSvgBackdropUrl();
  glass.classList.toggle("lg-menu--native", use);
  glass.classList.toggle("lg-menu--fallback", !use);
  if (use) {
    glass.style.backdropFilter = `url(#${FILTER_ID})`;
  } else {
    glass.style.backdropFilter = "none";
  }

  let t = 0;
  const run = () => {
    updateMenuLiquidFilter(glass, DEFAULTS);
  };
  const schedule = () => {
    if (t) cancelAnimationFrame(t);
    t = requestAnimationFrame(() => {
      t = 0;
      run();
    });
  };

  const ro = new ResizeObserver(() => {
    schedule();
  });
  ro.observe(glass);

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", schedule, { passive: true });
  }
  window.addEventListener("resize", schedule, { passive: true });

  requestAnimationFrame(run);

  return () => {
    ro.disconnect();
    window.removeEventListener("resize", schedule);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener("resize", schedule);
    }
  };
}
