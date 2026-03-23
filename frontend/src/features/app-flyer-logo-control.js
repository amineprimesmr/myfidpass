/**
 * Logo du flyer uniquement (localStorage) — ne modifie pas le logo commerce / autres pages.
 */
export const FLYER_CUSTOM_LOGO_STORAGE_KEY = "fidpass_flyer_custom_logo_v1";

const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_EXPORT_EDGE = 900;

/** @returns {string} data URL ou "" */
export function getStoredFlyerCustomLogoDataUrl() {
  try {
    const v = localStorage.getItem(FLYER_CUSTOM_LOGO_STORAGE_KEY);
    return typeof v === "string" && v.startsWith("data:image/") ? v : "";
  } catch (_) {
    return "";
  }
}

/** @param {string} dataUrl vide = supprimer */
export function setStoredFlyerCustomLogoDataUrl(dataUrl) {
  try {
    if (dataUrl && dataUrl.startsWith("data:image/")) {
      localStorage.setItem(FLYER_CUSTOM_LOGO_STORAGE_KEY, dataUrl);
    } else {
      localStorage.removeItem(FLYER_CUSTOM_LOGO_STORAGE_KEY);
    }
  } catch (_) {}
}

export function clearStoredFlyerCustomLogo() {
  try {
    localStorage.removeItem(FLYER_CUSTOM_LOGO_STORAGE_KEY);
  } catch (_) {}
}

/**
 * @param {File} file
 * @returns {Promise<string>} data URL PNG
 */
export async function compressFileToFlyerLogoDataUrl(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Format non pris en charge (PNG, JPG, WebP).");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Image trop lourde (max 3 Mo).");
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
    x.drawImage(bitmap, 0, 0, c.width, c.height);
    return c.toDataURL("image/png", 0.92);
  } finally {
    try {
      bitmap.close();
    } catch (_) {}
  }
}

/**
 * @param {{ onCustomLogoChange: () => void }} opts
 */
export function initFlyerLogoControl(opts) {
  const root = document.getElementById("app-flyer-logo-panel");
  const fileInput = document.getElementById("app-flyer-logo-file");
  const chooseBtn = document.getElementById("app-flyer-logo-choose");
  const defaultBtn = document.getElementById("app-flyer-logo-use-default");
  const preview = document.getElementById("app-flyer-logo-preview");
  const previewWrap = document.getElementById("app-flyer-logo-preview-wrap");
  const statusEl = document.getElementById("app-flyer-logo-status");

  if (!root || !fileInput || !chooseBtn || !defaultBtn) return undefined;

  function setStatus(msg) {
    if (statusEl) {
      statusEl.textContent = msg || "";
      statusEl.classList.toggle("hidden", !msg);
    }
  }

  function syncPreview() {
    const data = getStoredFlyerCustomLogoDataUrl();
    if (preview && previewWrap) {
      if (data) {
        preview.src = data;
        previewWrap.classList.remove("hidden");
      } else {
        preview.removeAttribute("src");
        previewWrap.classList.add("hidden");
      }
    }
  }

  chooseBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    fileInput.value = "";
    if (!f) return;
    void (async () => {
      try {
        const dataUrl = await compressFileToFlyerLogoDataUrl(f);
        setStoredFlyerCustomLogoDataUrl(dataUrl);
        setStatus("");
        syncPreview();
        opts.onCustomLogoChange();
      } catch (e) {
        const m = e instanceof Error ? e.message : "Import impossible.";
        setStatus(m);
      }
    })();
  });

  defaultBtn.addEventListener("click", () => {
    clearStoredFlyerCustomLogo();
    setStatus("");
    syncPreview();
    opts.onCustomLogoChange();
  });

  syncPreview();
  return { syncPreview };
}
