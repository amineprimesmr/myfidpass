/**
 * Gradient Slider inspired by clementgrellier/gradientslider.
 * Adaptation scoped to landing hero carousel root.
 */

const IMAGES = [
  "/assets/caroussel/miecaline.png",
  "/assets/caroussel/nike.png",
  "/assets/caroussel/tastycrousty.png",
  "/assets/caroussel/sephora.png",
  "/assets/caroussel/gladalle.png",
  "/assets/caroussel/kazdal.png",
];

const FRICTION = 0.9;
const WHEEL_SENS = 0.65;
const DRAG_SENS = 1.0;
const MAX_ROTATION = 26;
const MAX_DEPTH = 120;
const MIN_SCALE = 0.92;
const SCALE_RANGE = 0.1;
const GAP = 24;

let mounted = false;

function mod(n, m) {
  return ((n % m) + m) % m;
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h * 360, s, l];
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  h /= 360;
  let r;
  let g;
  let b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function fallbackFromIndex(idx) {
  const h = (idx * 41) % 360;
  const c1 = hslToRgb(h, 0.65, 0.52);
  const c2 = hslToRgb(h, 0.65, 0.72);
  return { c1, c2 };
}

function extractColors(img, idx) {
  try {
    const max = 42;
    const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1;
    const tw = ratio >= 1 ? max : Math.max(16, Math.round(max * ratio));
    const th = ratio >= 1 ? Math.max(16, Math.round(max / ratio)) : max;
    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, tw, th);
    const data = ctx.getImageData(0, 0, tw, th).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha < 20) continue;
      const rr = data[i];
      const gg = data[i + 1];
      const bb = data[i + 2];
      const [, s, l] = rgbToHsl(rr, gg, bb);
      if (s < 0.08 || l < 0.08 || l > 0.93) continue;
      r += rr;
      g += gg;
      b += bb;
      count += 1;
    }
    if (!count) return fallbackFromIndex(idx);
    const avg = [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
    const [h, s] = rgbToHsl(avg[0], avg[1], avg[2]);
    const c1 = hslToRgb(h, Math.max(0.45, s), 0.52);
    const c2 = hslToRgb(h, Math.max(0.45, s), 0.72);
    return { c1, c2 };
  } catch (_) {
    return fallbackFromIndex(idx);
  }
}

export async function mountLandingGradientCarousel() {
  const root = document.getElementById("landing-gradient-carousel");
  const cardsRoot = document.getElementById("landing-gradient-carousel-track");
  const bgCanvas = document.getElementById("landing-gradient-carousel-bg");
  if (!root || !cardsRoot || !bgCanvas || mounted) return;
  mounted = true;

  const bgCtx = bgCanvas.getContext("2d", { alpha: false });
  let vwHalf = root.clientWidth * 0.5;
  let cardW = 220;
  let step = cardW + GAP;
  let track = 0;
  let scrollX = 0;
  let velocity = 0;
  let rafId = null;
  let lastTime = 0;
  let bgRAF = null;
  let lastBgDraw = 0;
  let activeIndex = -1;
  let positions = [];
  const gradCurrent = { r1: 230, g1: 230, b1: 230, r2: 220, g2: 220, b2: 220 };
  const items = [];
  let palette = [];

  const fragment = document.createDocumentFragment();
  IMAGES.forEach((src, i) => {
    const card = document.createElement("article");
    card.className = "landing-gradient-card";
    const img = new Image();
    img.src = src;
    img.loading = "eager";
    img.decoding = "async";
    img.draggable = false;
    card.appendChild(img);
    fragment.appendChild(card);
    items.push({ el: card, x: i * step });
  });
  cardsRoot.appendChild(fragment);

  await Promise.all(
    items.map((it) => {
      const img = it.el.querySelector("img");
      if (!img || img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      });
    })
  );

  function measure() {
    const sample = items[0]?.el;
    if (!sample) return;
    const rect = sample.getBoundingClientRect();
    cardW = rect.width || cardW;
    step = cardW + GAP;
    track = step * items.length;
    positions = new Array(items.length).fill(0);
    vwHalf = root.clientWidth * 0.5;
    items.forEach((it, i) => {
      it.x = i * step;
    });
  }

  function resizeBg() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const w = root.clientWidth;
    const h = root.clientHeight;
    const tw = Math.floor(w * dpr);
    const th = Math.floor(h * dpr);
    if (bgCanvas.width !== tw || bgCanvas.height !== th) {
      bgCanvas.width = tw;
      bgCanvas.height = th;
      bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  function setActiveGradient(idx) {
    if (idx === activeIndex || idx < 0) return;
    activeIndex = idx;
    const pal = palette[idx] || fallbackFromIndex(idx);
    gradCurrent.r1 = pal.c1[0];
    gradCurrent.g1 = pal.c1[1];
    gradCurrent.b1 = pal.c1[2];
    gradCurrent.r2 = pal.c2[0];
    gradCurrent.g2 = pal.c2[1];
    gradCurrent.b2 = pal.c2[2];
  }

  function drawBackground() {
    const now = performance.now();
    if (now - lastBgDraw < 33) {
      bgRAF = requestAnimationFrame(drawBackground);
      return;
    }
    lastBgDraw = now;
    resizeBg();
    const w = root.clientWidth;
    const h = root.clientHeight;
    bgCtx.fillStyle = "#f6f7f9";
    bgCtx.fillRect(0, 0, w, h);
    const t = now * 0.00022;
    const x1 = w * 0.5 + Math.cos(t) * Math.min(w, h) * 0.35;
    const y1 = h * 0.5 + Math.sin(t * 0.8) * Math.min(w, h) * 0.2;
    const x2 = w * 0.5 + Math.cos(-t * 0.9 + 1.2) * Math.min(w, h) * 0.3;
    const y2 = h * 0.5 + Math.sin(-t * 0.7 + 0.7) * Math.min(w, h) * 0.2;
    const g1 = bgCtx.createRadialGradient(x1, y1, 0, x1, y1, Math.max(w, h) * 0.72);
    g1.addColorStop(0, `rgba(${gradCurrent.r1},${gradCurrent.g1},${gradCurrent.b1},0.8)`);
    g1.addColorStop(1, "rgba(255,255,255,0)");
    bgCtx.fillStyle = g1;
    bgCtx.fillRect(0, 0, w, h);
    const g2 = bgCtx.createRadialGradient(x2, y2, 0, x2, y2, Math.max(w, h) * 0.62);
    g2.addColorStop(0, `rgba(${gradCurrent.r2},${gradCurrent.g2},${gradCurrent.b2},0.65)`);
    g2.addColorStop(1, "rgba(255,255,255,0)");
    bgCtx.fillStyle = g2;
    bgCtx.fillRect(0, 0, w, h);
    bgRAF = requestAnimationFrame(drawBackground);
  }

  function updateTransforms() {
    const half = track / 2;
    let closest = -1;
    let closestDist = Infinity;
    for (let i = 0; i < items.length; i++) {
      let pos = items[i].x - scrollX;
      if (pos < -half) pos += track;
      if (pos > half) pos -= track;
      positions[i] = pos;
      const dist = Math.abs(pos);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    }
    for (let i = 0; i < items.length; i++) {
      const pos = positions[i];
      const norm = Math.max(-1, Math.min(1, pos / vwHalf));
      const inv = 1 - Math.abs(norm);
      const ry = -norm * MAX_ROTATION;
      const tz = inv * MAX_DEPTH;
      const scale = MIN_SCALE + inv * SCALE_RANGE;
      items[i].el.style.transform = `translate3d(${pos}px,-50%,${tz}px) rotateY(${ry}deg) scale(${scale})`;
      items[i].el.style.zIndex = String(1000 + Math.round(tz));
    }
    setActiveGradient(closest);
  }

  function tick(ts) {
    const dt = lastTime ? (ts - lastTime) / 1000 : 0;
    lastTime = ts;
    scrollX = mod(scrollX + velocity * dt, track);
    velocity *= Math.pow(FRICTION, dt * 60);
    if (Math.abs(velocity) < 0.02) velocity = 0;
    updateTransforms();
    rafId = requestAnimationFrame(tick);
  }

  let dragging = false;
  let lastX = 0;
  let lastT = 0;
  let lastDelta = 0;
  root.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    velocity += delta * WHEEL_SENS * 20;
  }, { passive: false });
  root.addEventListener("pointerdown", (e) => {
    dragging = true;
    lastX = e.clientX;
    lastT = performance.now();
    root.classList.add("is-grabbing");
    root.setPointerCapture(e.pointerId);
  });
  root.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const now = performance.now();
    const dx = e.clientX - lastX;
    const dt = Math.max(1, now - lastT) / 1000;
    scrollX = mod(scrollX - dx * DRAG_SENS, track);
    lastDelta = dx / dt;
    lastX = e.clientX;
    lastT = now;
  });
  root.addEventListener("pointerup", (e) => {
    if (!dragging) return;
    dragging = false;
    velocity = -lastDelta * DRAG_SENS;
    root.classList.remove("is-grabbing");
    root.releasePointerCapture(e.pointerId);
  });

  window.addEventListener("resize", () => {
    measure();
    updateTransforms();
    resizeBg();
  });

  measure();
  palette = items.map((it, i) => extractColors(it.el.querySelector("img"), i));
  updateTransforms();
  resizeBg();
  drawBackground();
  rafId = requestAnimationFrame(tick);
}
