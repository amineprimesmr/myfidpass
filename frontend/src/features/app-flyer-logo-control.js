/**
 * Logo du flyer uniquement (localStorage) — ne modifie pas le logo commerce / autres pages.
 */
import { openImageCropModalFromFile } from "./image-crop-modal.js";
import { FLYER_EXPORT, flyerLogoCropExportSize } from "./app-flyer-qr-presets.js";

export const FLYER_CUSTOM_LOGO_STORAGE_KEY = "fidpass_flyer_custom_logo_v1";

/**
 * @param {string} scope
 */
export function scopedFlyerCustomLogoStorageKey(scope) {
  const id = String(scope || "").trim();
  return id ? `${FLYER_CUSTOM_LOGO_STORAGE_KEY}:${id}` : FLYER_CUSTOM_LOGO_STORAGE_KEY;
}

const MAX_FILE_BYTES = 8 * 1024 * 1024;
/** Zone logo canvas ≈ 62 % × 15 % du flyer — conserver assez de pixels pour l’export ultra. */
const MAX_EXPORT_EDGE = Math.round(FLYER_EXPORT.w * 0.62);

/** @returns {string} data URL ou "" */
export function getStoredFlyerCustomLogoDataUrl(storageKey = FLYER_CUSTOM_LOGO_STORAGE_KEY) {
  try {
    const v = localStorage.getItem(storageKey);
    return typeof v === "string" && v.startsWith("data:image/") ? v : "";
  } catch (_) {
    return "";
  }
}

/** @param {string} dataUrl vide = supprimer */
export function setStoredFlyerCustomLogoDataUrl(dataUrl, storageKey = FLYER_CUSTOM_LOGO_STORAGE_KEY) {
  try {
    if (dataUrl && dataUrl.startsWith("data:image/")) {
      localStorage.setItem(storageKey, dataUrl);
    } else {
      localStorage.removeItem(storageKey);
    }
  } catch (_) {}
}

export function clearStoredFlyerCustomLogo(storageKey = FLYER_CUSTOM_LOGO_STORAGE_KEY) {
  try {
    localStorage.removeItem(storageKey);
  } catch (_) {}
}

/**
 * @param {File} file
 * @returns {Promise<string>} data URL PNG lossless
 */
export async function compressFileToFlyerLogoDataUrl(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Format non pris en charge (PNG, JPG, WebP).");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Image trop lourde (max 8 Mo).");
  }
  const bitmap = await createImageBitmap(file);
  try {
    let { width, height } = bitmap;
    const long = Math.max(width, height);
    if (long > MAX_EXPORT_EDGE) {
      const sc = MAX_EXPORT_EDGE / long;
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
    return c.toDataURL("image/png");
  } finally {
    try {
      bitmap.close();
    } catch (_) {}
  }
}

/**
 * @param {{ onCustomLogoChange: () => void; removeBgApi?: (dataUrl: string) => Promise<string | null>; storageKey?: string }} opts
 */
export function initFlyerLogoControl(opts) {
  const fileInput = document.getElementById("app-flyer-logo-file");
  const chooseBtn = document.getElementById("app-flyer-logo-choose");
  const clearBtn = document.getElementById("app-flyer-logo-clear");
  const preview = document.getElementById("app-flyer-logo-preview");
  const previewWrap = document.getElementById("app-flyer-logo-preview-wrap");
  const placeholder = document.getElementById("app-flyer-logo-placeholder");
  const statusEl = document.getElementById("app-flyer-logo-status");

  if (!fileInput) return undefined;

  const logoCrop = flyerLogoCropExportSize();

  function setStatus(msg) {
    if (statusEl) {
      statusEl.textContent = msg || "";
      statusEl.classList.toggle("hidden", !msg);
    }
  }

  function syncPreview() {
    const data = getStoredFlyerCustomLogoDataUrl(opts.storageKey);
    if (preview && previewWrap) {
      if (data) {
        preview.src = data;
        preview.classList.remove("hidden");
        if (placeholder) placeholder.classList.add("hidden");
        if (clearBtn) clearBtn.classList.remove("hidden");
      } else {
        preview.removeAttribute("src");
        preview.classList.add("hidden");
        if (placeholder) placeholder.classList.remove("hidden");
        if (clearBtn) clearBtn.classList.add("hidden");
      }
    }
    previewWrap?.classList.remove("hidden");
  }

  chooseBtn?.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    fileInput.value = "";
    if (!f) return;
    void (async () => {
      try {
        const cropped = await openImageCropModalFromFile(f, {
          title: "Recadrer le logo du flyer",
          aspectRatio: logoCrop.aspectRatio,
          exportWidth: logoCrop.exportWidth,
          exportHeight: logoCrop.exportHeight,
          outputType: "image/png",
        });
        if (!cropped) return;
        const dataUrl = cropped;
        setStoredFlyerCustomLogoDataUrl(dataUrl, opts.storageKey);
        syncPreview();
        opts.onCustomLogoChange();

        if (opts.removeBgApi) {
          setStatus("✨ Suppression du fond en cours…");
          try {
            const stripped = await opts.removeBgApi(dataUrl);
            if (stripped && stripped.startsWith("data:image/")) {
              setStoredFlyerCustomLogoDataUrl(stripped, opts.storageKey);
              syncPreview();
              opts.onCustomLogoChange();
              setStatus("✅ Fond supprimé automatiquement");
              setTimeout(() => setStatus(""), 2800);
            } else {
              setStatus("");
            }
          } catch (_) {
            setStatus("");
          }
        } else {
          setStatus("");
        }
      } catch (e) {
        const m = e instanceof Error ? e.message : "Import impossible.";
        setStatus(m);
      }
    })();
  });

  clearBtn?.addEventListener("click", () => {
    setStoredFlyerCustomLogoDataUrl("", opts.storageKey);
    setStatus("");
    syncPreview();
    opts.onCustomLogoChange();
  });

  syncPreview();
  return { syncPreview };
}
