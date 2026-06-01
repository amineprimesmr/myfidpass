/**
 * Image de fond du flyer uniquement (localStorage) — indépendante du logo et de la fiche.
 */
import { openImageCropModalFromFile } from "./image-crop-modal.js";
import { FLYER_EXPORT } from "./app-flyer-qr-presets.js";

export const FLYER_CUSTOM_BG_STORAGE_KEY = "fidpass_flyer_custom_bg_v1";

/**
 * @param {string} scope
 */
export function scopedFlyerCustomBgStorageKey(scope) {
  const id = String(scope || "").trim();
  return id ? `${FLYER_CUSTOM_BG_STORAGE_KEY}:${id}` : FLYER_CUSTOM_BG_STORAGE_KEY;
}

const MAX_FILE_BYTES = 15 * 1024 * 1024;
/** Aligné sur l’export ultra — pas de downscale avant composition. */
const MAX_LONG_EDGE = FLYER_EXPORT.w;
const MAX_DATA_URL_CHARS = 18 * 1024 * 1024;

/** @returns {string} data URL ou "" */
export function getStoredFlyerCustomBgDataUrl(storageKey = FLYER_CUSTOM_BG_STORAGE_KEY) {
  try {
    const v = localStorage.getItem(storageKey);
    return typeof v === "string" && v.startsWith("data:image/") ? v : "";
  } catch (_) {
    return "";
  }
}

/** @param {string} dataUrl vide = supprimer */
export function setStoredFlyerCustomBgDataUrl(dataUrl, storageKey = FLYER_CUSTOM_BG_STORAGE_KEY) {
  try {
    if (dataUrl && dataUrl.startsWith("data:image/")) {
      localStorage.setItem(storageKey, dataUrl);
    } else {
      localStorage.removeItem(storageKey);
    }
  } catch (_) {}
}

export function clearStoredFlyerCustomBg(storageKey = FLYER_CUSTOM_BG_STORAGE_KEY) {
  try {
    localStorage.removeItem(storageKey);
  } catch (_) {}
}

/**
 * @param {HTMLCanvasElement} c
 * @param {string} mime
 * @param {number} [quality]
 */
function canvasToDataUrl(c, mime, quality) {
  if (mime === "image/jpeg" && quality != null) return c.toDataURL(mime, quality);
  return c.toDataURL(mime);
}

/**
 * @param {ImageBitmap} bitmap
 * @returns {string} data URL PNG ou JPEG haute qualité
 */
export function compressImageBitmapToFlyerBgDataUrl(bitmap) {
  let { width, height } = bitmap;
  const long = Math.max(width, height);
  if (long > MAX_LONG_EDGE) {
    const sc = MAX_LONG_EDGE / long;
    width = Math.round(width * sc);
    height = Math.round(height * sc);
  }
  const c = document.createElement("canvas");
  c.width = Math.max(1, width);
  c.height = Math.max(1, height);
  const x = c.getContext("2d");
  if (!x) throw new Error("Canvas indisponible.");
  x.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in x) x.imageSmoothingQuality = "high";
  x.drawImage(bitmap, 0, 0, c.width, c.height);

  const png = canvasToDataUrl(c, "image/png");
  if (png.length <= MAX_DATA_URL_CHARS) return png;

  for (const q of [0.97, 0.94, 0.9]) {
    const jpeg = canvasToDataUrl(c, "image/jpeg", q);
    if (jpeg.length <= MAX_DATA_URL_CHARS) return jpeg;
  }

  const sc2 = 0.85;
  c.width = Math.max(1, Math.round(c.width * sc2));
  c.height = Math.max(1, Math.round(c.height * sc2));
  x.drawImage(bitmap, 0, 0, c.width, c.height);
  return canvasToDataUrl(c, "image/jpeg", 0.92);
}

/**
 * @param {File} file
 * @returns {Promise<string>} data URL PNG ou JPEG haute qualité
 */
export async function compressFileToFlyerBgDataUrl(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Format non pris en charge (PNG, JPG, WebP).");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Image trop lourde (max 15 Mo).");
  }
  const bitmap = await createImageBitmap(file);
  try {
    return compressImageBitmapToFlyerBgDataUrl(bitmap);
  } finally {
    try {
      bitmap.close();
    } catch (_) {}
  }
}

/**
 * @param {string} url
 * @returns {Promise<string>} data URL (même compression que l’import fichier)
 */
export async function compressFetchedImageToFlyerBgDataUrl(url) {
  const res = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!res.ok) throw new Error("Image introuvable.");
  const blob = await res.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error("Format non pris en charge (PNG, JPG, WebP).");
  }
  if (blob.size > MAX_FILE_BYTES) {
    throw new Error("Image trop lourde (max 15 Mo).");
  }
  const bitmap = await createImageBitmap(blob);
  try {
    return compressImageBitmapToFlyerBgDataUrl(bitmap);
  } finally {
    try {
      bitmap.close();
    } catch (_) {}
  }
}

/**
 * @param {{ onBgChange: () => void; storageKey?: string }} opts
 */
export function initFlyerBgControl(opts) {
  const fileInput = document.getElementById("app-flyer-bg-file");
  const chooseBtn = document.getElementById("app-flyer-bg-choose");
  const removeBtn = document.getElementById("app-flyer-bg-remove");
  const preview = document.getElementById("app-flyer-bg-preview");
  const previewWrap = document.getElementById("app-flyer-bg-preview-wrap");
  const statusEl = document.getElementById("app-flyer-bg-status");

  if (!fileInput) return undefined;

  function setStatus(msg) {
    if (statusEl) {
      statusEl.textContent = msg || "";
      statusEl.classList.toggle("hidden", !msg);
    }
  }

  function syncPreview() {
    const data = getStoredFlyerCustomBgDataUrl(opts.storageKey);
    if (preview && previewWrap) {
      if (data) {
        preview.src = data;
        previewWrap.classList.remove("hidden");
      } else {
        preview.removeAttribute("src");
        previewWrap.classList.add("hidden");
      }
    } else if (preview) {
      if (data) {
        preview.src = data;
        preview.classList.remove("hidden");
      } else {
        preview.removeAttribute("src");
        preview.classList.add("hidden");
      }
    }
  }

  chooseBtn?.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    fileInput.value = "";
    if (!f) return;
    void (async () => {
      try {
        const cropped = await openImageCropModalFromFile(f, {
          title: "Recadrer l'image de fond flyer",
          aspectRatio: FLYER_EXPORT.w / FLYER_EXPORT.h,
          exportWidth: FLYER_EXPORT.w,
          exportHeight: FLYER_EXPORT.h,
          outputType: "image/png",
          quality: 1,
        });
        if (!cropped) return;
        const dataUrl = cropped;
        setStoredFlyerCustomBgDataUrl(dataUrl, opts.storageKey);
        setStatus("");
        syncPreview();
        opts.onBgChange();
      } catch (e) {
        const m = e instanceof Error ? e.message : "Import impossible.";
        setStatus(m);
      }
    })();
  });

  removeBtn?.addEventListener("click", () => {
    clearStoredFlyerCustomBg(opts.storageKey);
    setStatus("");
    syncPreview();
    opts.onBgChange();
  });

  syncPreview();
  return { syncPreview };
}
