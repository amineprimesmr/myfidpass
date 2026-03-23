/**
 * Image de fond du flyer uniquement (localStorage) — indépendante du logo et de la fiche.
 */
export const FLYER_CUSTOM_BG_STORAGE_KEY = "fidpass_flyer_custom_bg_v1";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Réduit le poids pour tenir dans localStorage tout en restant net en 2400×3600 export. */
const MAX_LONG_EDGE = 2000;

/** @returns {string} data URL ou "" */
export function getStoredFlyerCustomBgDataUrl() {
  try {
    const v = localStorage.getItem(FLYER_CUSTOM_BG_STORAGE_KEY);
    return typeof v === "string" && v.startsWith("data:image/") ? v : "";
  } catch (_) {
    return "";
  }
}

/** @param {string} dataUrl vide = supprimer */
export function setStoredFlyerCustomBgDataUrl(dataUrl) {
  try {
    if (dataUrl && dataUrl.startsWith("data:image/")) {
      localStorage.setItem(FLYER_CUSTOM_BG_STORAGE_KEY, dataUrl);
    } else {
      localStorage.removeItem(FLYER_CUSTOM_BG_STORAGE_KEY);
    }
  } catch (_) {}
}

export function clearStoredFlyerCustomBg() {
  try {
    localStorage.removeItem(FLYER_CUSTOM_BG_STORAGE_KEY);
  } catch (_) {}
}

/**
 * @param {ImageBitmap} bitmap
 * @returns {string} data URL JPEG (léger) ou PNG si besoin
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
  x.drawImage(bitmap, 0, 0, c.width, c.height);
  try {
    return c.toDataURL("image/jpeg", 0.88);
  } catch (_) {
    return c.toDataURL("image/png", 0.92);
  }
}

/**
 * @param {File} file
 * @returns {Promise<string>} data URL JPEG (léger) ou PNG si besoin
 */
export async function compressFileToFlyerBgDataUrl(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Format non pris en charge (PNG, JPG, WebP).");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Image trop lourde (max 5 Mo).");
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
 * @param {string} url URL absolue ou même origine (ex. /assets/flyers/photo.jpg)
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
    throw new Error("Image trop lourde (max 5 Mo).");
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
 * @param {{ onBgChange: () => void }} opts
 */
export function initFlyerBgControl(opts) {
  const fileInput = document.getElementById("app-flyer-bg-file");
  const chooseBtn = document.getElementById("app-flyer-bg-choose");
  const removeBtn = document.getElementById("app-flyer-bg-remove");
  const preview = document.getElementById("app-flyer-bg-preview");
  const previewWrap = document.getElementById("app-flyer-bg-preview-wrap");
  const statusEl = document.getElementById("app-flyer-bg-status");

  if (!fileInput || !chooseBtn || !removeBtn) return undefined;

  function setStatus(msg) {
    if (statusEl) {
      statusEl.textContent = msg || "";
      statusEl.classList.toggle("hidden", !msg);
    }
  }

  function syncPreview() {
    const data = getStoredFlyerCustomBgDataUrl();
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
        const dataUrl = await compressFileToFlyerBgDataUrl(f);
        setStoredFlyerCustomBgDataUrl(dataUrl);
        setStatus("");
        syncPreview();
        opts.onBgChange();
      } catch (e) {
        const m = e instanceof Error ? e.message : "Import impossible.";
        setStatus(m);
      }
    })();
  });

  removeBtn.addEventListener("click", () => {
    clearStoredFlyerCustomBg();
    setStatus("");
    syncPreview();
    opts.onBgChange();
  });

  syncPreview();
  return { syncPreview };
}
