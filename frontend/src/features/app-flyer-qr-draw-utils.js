/**
 * Utilitaires de rendu Flyer QR (images, QR, primitives canvas).
 */

/** @type {HTMLImageElement | null} */
let qrImageCache = null;
let qrImageCacheKey = "";
let qrImageCacheTs = 0;

/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} w @param {number} h @param {number} r */
export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** @param {string} url @param {boolean} cors */
export function loadImage(url, cors = true) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    if (cors) im.crossOrigin = "anonymous";
    im.onload = () => {
      try {
        im.__fidelitySourceTag = String(url || "");
      } catch (_) {}
      const done = () => resolve(im);
      if (typeof im.decode === "function") im.decode().then(done).catch(done);
      else done();
    };
    im.onerror = () => reject(new Error("image"));
    im.src = url;
  });
}

export function flyerQrImageUrl(targetUrl, sizePx) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${sizePx}x${sizePx}&margin=10&data=${encodeURIComponent(targetUrl)}`;
}

/** QR en blob pour éviter canvas « tainted » à l’export PNG. */
export async function loadQrAsImage(targetUrl, sizePx) {
  const cacheKey = `${targetUrl}::${sizePx}`;
  const now = Date.now();
  if (qrImageCache && qrImageCacheKey === cacheKey && now - qrImageCacheTs < 60_000) {
    return qrImageCache;
  }
  const u = flyerQrImageUrl(targetUrl, sizePx);
  try {
    const res = await fetch(u, { mode: "cors", credentials: "omit" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    try {
      const loaded = await loadImage(objUrl, false);
      qrImageCache = loaded;
      qrImageCacheKey = cacheKey;
      qrImageCacheTs = now;
      return loaded;
    } finally {
      try {
        URL.revokeObjectURL(objUrl);
      } catch (_) {}
    }
  } catch (_) {
    try {
      const loaded = await loadImage(u, true);
      qrImageCache = loaded;
      qrImageCacheKey = cacheKey;
      qrImageCacheTs = now;
      return loaded;
    } catch (_) {
      return null;
    }
  }
}

/**
 * Remplit le rectangle comme object-fit: cover (échelle uniforme, centré).
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} img
 * @param {number} dx
 * @param {number} dy
 * @param {number} dstW
 * @param {number} dstH
 */
export function drawImageCover(ctx, img, dx, dy, dstW, dstH) {
  const prevSmooth = ctx.imageSmoothingEnabled;
  const prevQ = "imageSmoothingQuality" in ctx ? ctx.imageSmoothingQuality : "low";
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
  try {
    let sw = 0;
    let sh = 0;
    if (typeof ImageBitmap !== "undefined" && img instanceof ImageBitmap) {
      sw = img.width;
      sh = img.height;
    } else if (img && typeof img === "object") {
      const o = /** @type {{ naturalWidth?: number; naturalHeight?: number; width?: number; height?: number }} */ (img);
      sw = o.naturalWidth || o.width || 0;
      sh = o.naturalHeight || o.height || 0;
    }
    const drawStretch = () => {
      ctx.drawImage(img, dx, dy, dstW, dstH);
    };
    if (!sw || !sh) {
      try {
        drawStretch();
      } catch (_) {}
      return;
    }
    const scale = Math.max(dstW / sw, dstH / sh);
    const bw = sw * scale;
    const bh = sh * scale;
    const ox = dx + (dstW - bw) / 2;
    const oy = dy + (dstH - bh) / 2;
    try {
      ctx.drawImage(img, ox, oy, bw, bh);
    } catch (_) {
      try {
        drawStretch();
      } catch (_e) {}
    }
  } finally {
    ctx.imageSmoothingEnabled = prevSmooth;
    if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = prevQ;
  }
}

/**
 * Comme object-fit: contain — tient entièrement dans le rectangle, centré.
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} img
 * @param {number} dx
 * @param {number} dy
 * @param {number} dstW
 * @param {number} dstH
 */
export function drawImageContain(ctx, img, dx, dy, dstW, dstH) {
  const prevSmooth = ctx.imageSmoothingEnabled;
  const prevQ = "imageSmoothingQuality" in ctx ? ctx.imageSmoothingQuality : "low";
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
  try {
    let sw = 0;
    let sh = 0;
    if (typeof ImageBitmap !== "undefined" && img instanceof ImageBitmap) {
      sw = img.width;
      sh = img.height;
    } else if (img && typeof img === "object") {
      const o = /** @type {{ naturalWidth?: number; naturalHeight?: number; width?: number; height?: number }} */ (img);
      sw = o.naturalWidth || o.width || 0;
      sh = o.naturalHeight || o.height || 0;
    }
    if (!sw || !sh) {
      try {
        ctx.drawImage(img, dx, dy, dstW, dstH);
      } catch (_) {}
      return;
    }
    const sc = Math.min(dstW / sw, dstH / sh);
    const bw = sw * sc;
    const bh = sh * sc;
    const ox = dx + (dstW - bw) / 2;
    const oy = dy + (dstH - bh) / 2;
    try {
      ctx.drawImage(img, ox, oy, bw, bh);
    } catch (_) {
      try {
        ctx.drawImage(img, dx, dy, dstW, dstH);
      } catch (_e) {}
    }
  } finally {
    ctx.imageSmoothingEnabled = prevSmooth;
    if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = prevQ;
  }
}

/**
 * @param {CanvasImageSource | string | null | undefined} src
 */
function isFlyergameTextureSource(src) {
  if (!src) return false;
  if (typeof src === "string") return src.toLowerCase().includes("flyergame");
  if (typeof src !== "object") return false;
  const o = /** @type {{ currentSrc?: string; src?: string; __fidelitySourceTag?: string }} */ (src);
  const candidates = [o.__fidelitySourceTag, o.currentSrc, o.src].filter(Boolean);
  return candidates.some((v) => String(v).toLowerCase().includes("flyergame"));
}

/**
 * Fit explicite: toute source flyergame passe en contain.
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} img
 * @param {number} dx
 * @param {number} dy
 * @param {number} dstW
 * @param {number} dstH
 * @param {"cover" | "contain"} [defaultFit]
 */
export function drawImageWithFlyergameFit(ctx, img, dx, dy, dstW, dstH, defaultFit = "cover") {
  if (defaultFit === "contain" || isFlyergameTextureSource(img)) {
    drawImageContain(ctx, img, dx, dy, dstW, dstH);
    return;
  }
  drawImageCover(ctx, img, dx, dy, dstW, dstH);
}

/**
 * @param {ImageBitmap | HTMLImageElement | string | null | undefined} input
 * @returns {Promise<CanvasImageSource | null>}
 */
export async function resolveCanvasImageInput(input) {
  if (input && typeof ImageBitmap !== "undefined" && input instanceof ImageBitmap) {
    return input;
  }
  if (
    input &&
    typeof HTMLImageElement !== "undefined" &&
    input instanceof HTMLImageElement &&
    (input.complete ? input.naturalWidth > 0 : true)
  ) {
    return input;
  }
  if (typeof input === "string" && input) {
    const isBlob = input.startsWith("blob:");
    try {
      return await loadImage(input, !isBlob);
    } catch (_) {
      if (!isBlob) {
        try {
          return await loadImage(input, false);
        } catch (_e) {}
      }
    }
  }
  return null;
}
