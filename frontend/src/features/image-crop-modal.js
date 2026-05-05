/**
 * Modal de recadrage interactif (drag + zoom) pour aligner les uploads
 * sur les ratios attendus (comme dans l'app iOS).
 */

const STYLE_ID = "fidpass-image-cropper-style-v1";

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
  .fid-crop-overlay{
    position:fixed; inset:0; z-index:99999; background:rgba(9,14,24,.78);
    backdrop-filter: blur(4px); display:flex; align-items:center; justify-content:center; padding:16px;
  }
  .fid-crop-modal{
    width:min(980px, 96vw); max-height:94vh; overflow:hidden; border-radius:18px;
    background:#0f1724; border:1px solid rgba(255,255,255,.14); box-shadow:0 24px 70px rgba(0,0,0,.45);
    color:#e7edf8; display:flex; flex-direction:column;
  }
  .fid-crop-head{display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 16px; border-bottom:1px solid rgba(255,255,255,.1);}
  .fid-crop-title{margin:0; font-size:1rem; font-weight:700;}
  .fid-crop-close{border:0; background:transparent; color:#dce5f5; font-size:1.25rem; cursor:pointer; line-height:1;}
  .fid-crop-stage-wrap{padding:14px 16px 8px;}
  .fid-crop-stage{position:relative; width:100%; min-height:280px; max-height:68vh; border-radius:14px; background:#0a111d; border:1px solid rgba(255,255,255,.08); display:flex; align-items:center; justify-content:center; overflow:hidden;}
  .fid-crop-canvas{display:block; width:100%; height:100%; touch-action:none; cursor:grab;}
  .fid-crop-canvas.is-dragging{cursor:grabbing;}
  .fid-crop-controls{display:flex; align-items:center; gap:10px; padding:8px 16px 14px;}
  .fid-crop-controls label{font-size:.82rem; color:#b9c6de;}
  .fid-crop-range{flex:1;}
  .fid-crop-actions{display:flex; justify-content:flex-end; gap:10px; padding:0 16px 16px;}
  .fid-crop-btn{border:0; border-radius:10px; padding:10px 14px; font-weight:600; cursor:pointer;}
  .fid-crop-btn--ghost{background:#1b2637; color:#dce7fc;}
  .fid-crop-btn--primary{background:#f2f5fb; color:#111a2a;}
  `;
  document.head.appendChild(style);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image invalide."));
    };
    img.src = url;
  });
}

/**
 * @param {File} file
 * @param {{
 *   title?: string;
 *   aspectRatio?: number;
 *   exportWidth?: number;
 *   exportHeight?: number;
 *   outputType?: "image/png"|"image/jpeg"|"image/webp";
 *   quality?: number;
 * }} opts
 * @returns {Promise<string|null>}
 */
export async function openImageCropModalFromFile(file, opts = {}) {
  if (!file || !String(file.type || "").startsWith("image/")) return null;
  ensureStyles();

  const title = String(opts.title || "Recadrer l'image");
  const aspect = Number(opts.aspectRatio) > 0.05 ? Number(opts.aspectRatio) : 1;
  const outputType = opts.outputType || "image/png";
  const quality = Number.isFinite(opts.quality) ? opts.quality : 0.92;

  const img = await loadImageFromFile(file);

  return await new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "fid-crop-overlay";
    overlay.innerHTML = `
      <div class="fid-crop-modal" role="dialog" aria-modal="true" aria-label="${title}">
        <div class="fid-crop-head">
          <h3 class="fid-crop-title">${title}</h3>
          <button type="button" class="fid-crop-close" aria-label="Fermer">×</button>
        </div>
        <div class="fid-crop-stage-wrap">
          <div class="fid-crop-stage">
            <canvas class="fid-crop-canvas"></canvas>
          </div>
        </div>
        <div class="fid-crop-controls">
          <label>Zoom</label>
          <input class="fid-crop-range" type="range" min="1" max="4" step="0.01" value="1" />
        </div>
        <div class="fid-crop-actions">
          <button type="button" class="fid-crop-btn fid-crop-btn--ghost" data-act="cancel">Annuler</button>
          <button type="button" class="fid-crop-btn fid-crop-btn--primary" data-act="ok">Valider</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const canvas = /** @type {HTMLCanvasElement} */ (overlay.querySelector(".fid-crop-canvas"));
    const stage = /** @type {HTMLElement} */ (overlay.querySelector(".fid-crop-stage"));
    const range = /** @type {HTMLInputElement} */ (overlay.querySelector(".fid-crop-range"));
    const closeBtn = /** @type {HTMLButtonElement} */ (overlay.querySelector(".fid-crop-close"));
    const cancelBtn = /** @type {HTMLButtonElement} */ (overlay.querySelector('[data-act="cancel"]'));
    const okBtn = /** @type {HTMLButtonElement} */ (overlay.querySelector('[data-act="ok"]'));
    const ctx = canvas.getContext("2d");

    let zoom = 1;
    let offsetX = 0;
    let offsetY = 0;
    let drag = null;

    function cleanup(val) {
      try {
        overlay.remove();
      } catch (_) {}
      resolve(val);
    }

    function stageCropSize() {
      const w = Math.max(260, stage.clientWidth - 24);
      const hMax = Math.max(180, stage.clientHeight - 24);
      let cw = w;
      let ch = cw / aspect;
      if (ch > hMax) {
        ch = hMax;
        cw = ch * aspect;
      }
      return { cw, ch };
    }

    function clampOffsets(cw, ch) {
      const base = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
      const drawW = img.naturalWidth * base * zoom;
      const drawH = img.naturalHeight * base * zoom;
      const maxX = Math.max(0, (drawW - cw) / 2);
      const maxY = Math.max(0, (drawH - ch) / 2);
      offsetX = clamp(offsetX, -maxX, maxX);
      offsetY = clamp(offsetY, -maxY, maxY);
    }

    function draw() {
      if (!ctx) return;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const sw = Math.max(300, stage.clientWidth);
      const sh = Math.max(220, stage.clientHeight);
      canvas.width = Math.round(sw * dpr);
      canvas.height = Math.round(sh * dpr);
      canvas.style.width = `${sw}px`;
      canvas.style.height = `${sh}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const { cw, ch } = stageCropSize();
      const cx = (sw - cw) / 2;
      const cy = (sh - ch) / 2;
      const base = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
      const drawW = img.naturalWidth * base * zoom;
      const drawH = img.naturalHeight * base * zoom;
      clampOffsets(cw, ch);

      ctx.clearRect(0, 0, sw, sh);
      ctx.fillStyle = "rgba(7,12,20,0.94)";
      ctx.fillRect(0, 0, sw, sh);

      ctx.save();
      ctx.beginPath();
      ctx.rect(cx, cy, cw, ch);
      ctx.clip();
      const ix = cx + (cw - drawW) / 2 + offsetX;
      const iy = cy + (ch - drawH) / 2 + offsetY;
      ctx.drawImage(img, ix, iy, drawW, drawH);
      ctx.restore();

      ctx.strokeStyle = "rgba(255,255,255,0.92)";
      ctx.lineWidth = 1.2;
      ctx.strokeRect(cx + 0.5, cy + 0.5, cw - 1, ch - 1);
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(0, 0, sw, cy);
      ctx.fillRect(0, cy + ch, sw, sh - (cy + ch));
      ctx.fillRect(0, cy, cx, ch);
      ctx.fillRect(cx + cw, cy, sw - (cx + cw), ch);
    }

    function exportDataUrl() {
      const { cw, ch } = stageCropSize();
      const ew = Math.max(64, Math.round(opts.exportWidth || 2000));
      const eh = Math.max(64, Math.round(opts.exportHeight || ew / aspect));
      const out = document.createElement("canvas");
      out.width = ew;
      out.height = eh;
      const octx = out.getContext("2d");
      if (!octx) return null;

      const base = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
      const drawW = img.naturalWidth * base * zoom;
      const drawH = img.naturalHeight * base * zoom;
      const ix = (cw - drawW) / 2 + offsetX;
      const iy = (ch - drawH) / 2 + offsetY;

      // map crop viewport -> natural image coordinates
      const scaleToNatural = img.naturalWidth / drawW;
      const sx = clamp((-ix) * scaleToNatural, 0, img.naturalWidth);
      const sy = clamp((-iy) * scaleToNatural, 0, img.naturalHeight);
      const sWidth = clamp(cw * scaleToNatural, 1, img.naturalWidth - sx);
      const sHeight = clamp(ch * scaleToNatural, 1, img.naturalHeight - sy);
      octx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, ew, eh);
      return out.toDataURL(outputType, quality);
    }

    range.addEventListener("input", () => {
      zoom = Number(range.value) || 1;
      draw();
    });

    canvas.addEventListener("pointerdown", (e) => {
      drag = { x: e.clientX, y: e.clientY };
      canvas.classList.add("is-dragging");
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag = { x: e.clientX, y: e.clientY };
      offsetX += dx;
      offsetY += dy;
      draw();
    });
    canvas.addEventListener("pointerup", () => {
      drag = null;
      canvas.classList.remove("is-dragging");
    });
    canvas.addEventListener("pointercancel", () => {
      drag = null;
      canvas.classList.remove("is-dragging");
    });
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const next = zoom + (e.deltaY < 0 ? 0.07 : -0.07);
      zoom = clamp(next, 1, 4);
      range.value = String(zoom);
      draw();
    }, { passive: false });

    window.addEventListener("resize", draw);
    closeBtn.addEventListener("click", () => cleanup(null));
    cancelBtn.addEventListener("click", () => cleanup(null));
    okBtn.addEventListener("click", () => cleanup(exportDataUrl()));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) cleanup(null);
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") cleanup(null);
    }, { once: true });

    draw();
  });
}

