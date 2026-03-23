/**
 * Strip (bandeau), cercles tampons vides/pleins, localisations pass.
 * Référence : REFONTE-REGLES.md — pass.js découpé.
 */
import { PNG } from "pngjs";
import {
  PASS_TEMPLATES,
  STRIP_W,
  STRIP_H,
  STAMP_R,
  STAMP_SIZE,
  STAMP_GAP,
  STAMP_TOP,
  EARTH_RADIUS_M,
  METERS_PER_DEG_LAT,
} from "./constants.js";

export function hexToRgb(hex) {
  const n = parseInt(hex.replace(/^#/, ""), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/**
 * Jusqu'à 10 points de localisation pour le pass (centre + cercle).
 */
export function buildPassLocations(lat, lng, radiusMeters = 100, relevantText) {
  const latRad = (lat * Math.PI) / 180;
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos(latRad);
  const dLat = radiusMeters / METERS_PER_DEG_LAT;
  const dLng = radiusMeters / metersPerDegLng;
  const points = [];
  points.push({ latitude: lat, longitude: lng, ...(relevantText ? { relevantText } : {}) });
  for (let i = 0; i < 9; i++) {
    const angle = (i * 360) / 9;
    const rad = (angle * Math.PI) / 180;
    const latOffset = dLat * Math.cos(rad);
    const lngOffset = dLng * Math.sin(rad);
    points.push({
      latitude: lat + latOffset,
      longitude: lng + lngOffset,
      ...(relevantText ? { relevantText } : {}),
    });
  }
  return points;
}

/** Strip PNG 750×246 couleur unie. */
export function createStripBuffer(templateKey, backgroundColorOverride) {
  const colors = PASS_TEMPLATES[templateKey] || PASS_TEMPLATES.classic;
  const hex = backgroundColorOverride && /^#?[0-9A-Fa-f]{6}$/.test(backgroundColorOverride.replace(/^#/, ""))
    ? (backgroundColorOverride.startsWith("#") ? backgroundColorOverride : `#${backgroundColorOverride}`)
    : colors.backgroundColor;
  const base = hexToRgb(hex);
  const w = STRIP_W;
  const h = STRIP_H;
  const png = new PNG({ width: w, height: h });
  png.data = Buffer.alloc(w * h * 4);
  const r = Math.round(base.r);
  const g = Math.round(base.g);
  const b = Math.round(base.b);
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

export function drawCircle(png, cx, cy, r, fillRgb, strokeRgb) {
  const w = png.width;
  const h = png.height;
  for (let y = Math.max(0, cy - r - 2); y <= Math.min(h - 1, cy + r + 2); y++) {
    for (let x = Math.max(0, cx - r - 2); x <= Math.min(w - 1, cx + r + 2); x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const i = (y * w + x) * 4;
      if (d <= r + 1) {
        if (d <= r - 1) {
          png.data[i] = fillRgb.r;
          png.data[i + 1] = fillRgb.g;
          png.data[i + 2] = fillRgb.b;
          png.data[i + 3] = 255;
        } else if (strokeRgb) {
          png.data[i] = strokeRgb.r;
          png.data[i + 1] = strokeRgb.g;
          png.data[i + 2] = strokeRgb.b;
          png.data[i + 3] = 255;
        }
      }
    }
  }
}

export function drawCircleOutline(png, cx, cy, r, strokeRgb, strokeWidth = 2) {
  const w = png.width;
  const h = png.height;
  const rOut = r + strokeWidth;
  const rIn = Math.max(0, r - strokeWidth);
  for (let y = Math.max(0, cy - rOut - 1); y <= Math.min(h - 1, cy + rOut + 1); y++) {
    for (let x = Math.max(0, cx - rOut - 1); x <= Math.min(w - 1, cx + rOut + 1); x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (d > rIn && d <= rOut && strokeRgb) {
        const i = (y * w + x) * 4;
        png.data[i] = strokeRgb.r;
        png.data[i + 1] = strokeRgb.g;
        png.data[i + 2] = strokeRgb.b;
        png.data[i + 3] = 255;
      }
    }
  }
}

/** Cercle vide (blanc + bordure). */
export function createEmptyStampPng(strokeRgb) {
  const size = STAMP_SIZE;
  const png = new PNG({ width: size, height: size });
  png.data = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size * 4; i += 4) png.data[i + 3] = 0;
  drawCircle(png, size / 2, size / 2, STAMP_R - 2, { r: 255, g: 255, b: 255 }, strokeRgb);
  return PNG.sync.write(png);
}

/** Cercle vide : contour uniquement (fond transparent). */
export function createEmptyStampOutlinePng(strokeRgb) {
  const size = STAMP_SIZE;
  const png = new PNG({ width: size, height: size });
  png.data = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size * 4; i += 4) png.data[i + 3] = 0;
  drawCircleOutline(png, size / 2, size / 2, STAMP_R - 2, strokeRgb, 2);
  return PNG.sync.write(png);
}

/** Cercle rempli sans emoji (fallback). */
export function createFilledStampCirclePng(fillRgb) {
  const size = STAMP_SIZE;
  const png = new PNG({ width: size, height: size });
  png.data = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size * 4; i += 4) png.data[i + 3] = 0;
  drawCircle(png, size / 2, size / 2, STAMP_R - 2, fillRgb, null);
  return PNG.sync.write(png);
}

/** Icône PNG 29×29 par défaut (couleur template ou gris). */
export function createDefaultIconBuffer(templateKey) {
  const size = 29;
  const colors = templateKey && PASS_TEMPLATES[templateKey] ? hexToRgb(PASS_TEMPLATES[templateKey].labelColor) : { r: 0x6b, g: 0x6b, b: 0x6b };
  const png = new PNG({ width: size, height: size });
  png.data = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const i = (y * size + x) * 4;
      if (d <= r) {
        png.data[i] = colors.r;
        png.data[i + 1] = colors.g;
        png.data[i + 2] = colors.b;
        png.data[i + 3] = 255;
      } else {
        png.data[i + 3] = 0;
      }
    }
  }
  return PNG.sync.write(png);
}
