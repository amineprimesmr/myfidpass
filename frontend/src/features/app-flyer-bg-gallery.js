/**
 * Galerie de fonds depuis public/assets/flyers/ (manifest.json + fichiers images).
 */
import {
  compressFetchedImageToFlyerBgDataUrl,
  clearStoredFlyerCustomBg,
  setStoredFlyerCustomBgDataUrl,
} from "./app-flyer-bg-control.js";

export const FLYER_BG_MANIFEST_URL = "/assets/flyers/manifest.json";
export const FLYER_BG_ASSETS_BASE = "/assets/flyers";

/** @typedef {{ file: string; label?: string }} FlyerBgManifestEntry */

/**
 * @param {unknown} data
 * @returns {FlyerBgManifestEntry[]}
 */
export function parseFlyerBgManifest(data) {
  if (!Array.isArray(data)) return [];
  /** @type {FlyerBgManifestEntry[]} */
  const out = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const file = String(/** @type {Record<string, unknown>} */ (row).file ?? "").trim();
    if (!file || file.includes("..") || file.includes("/") || file.includes("\\")) continue;
    if (!/\.(jpe?g|png|webp)$/i.test(file)) continue;
    const label = String(/** @type {Record<string, unknown>} */ (row).label ?? "").trim();
    out.push({ file, label: label || file.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ") });
  }
  return out;
}

/**
 * @param {string} jsonText
 * @returns {FlyerBgManifestEntry[]}
 */
export function parseFlyerBgManifestJson(jsonText) {
  try {
    return parseFlyerBgManifest(JSON.parse(jsonText));
  } catch {
    return [];
  }
}

/**
 * @typedef {{
 *   onBgChange: () => void;
 *   syncPreview: () => void;
 *   setStatus: (msg: string) => void;
 *   storageKey?: string;
 * }} FlyerBgGalleryOpts
 */

/**
 * @param {ParentNode | null} root
 * @param {FlyerBgGalleryOpts} opts
 */
export async function initFlyerBgGallery(root, opts) {
  const storageKey = opts.storageKey;
  const wrap = root?.querySelector("#app-flyer-bg-gallery-wrap");
  const grid = root?.querySelector("#app-flyer-bg-gallery");
  const nextBtn = root?.querySelector("#app-flyer-bg-next");
  const bgFileInput = root?.querySelector("#app-flyer-bg-file");
  if (!wrap || !grid) return;

  let entries;
  try {
    const res = await fetch(FLYER_BG_MANIFEST_URL, { cache: "no-store", credentials: "omit" });
    if (!res.ok) {
      wrap.classList.add("hidden");
      return;
    }
    entries = parseFlyerBgManifestJson(await res.text());
  } catch {
    wrap.classList.add("hidden");
    return;
  }

  if (!entries.length) {
    wrap.classList.add("hidden");
    return;
  }

  wrap.classList.remove("hidden");
  grid.replaceChildren();
  /** @type {HTMLButtonElement | null} */
  let selectedItem = null;

  function setSelectedItem(next) {
    if (selectedItem && selectedItem !== next) selectedItem.classList.remove("is-selected");
    selectedItem = next;
    if (selectedItem) selectedItem.classList.add("is-selected");
  }

  const uploadBtn = document.createElement("button");
  uploadBtn.type = "button";
  uploadBtn.className = "app-flyer-bg-gallery-item app-flyer-bg-gallery-item--upload";
  uploadBtn.setAttribute("role", "listitem");
  uploadBtn.setAttribute("aria-label", "Importer une image de fond");
  uploadBtn.innerHTML = '<span class="app-flyer-bg-gallery-upload-plus">+</span><span class="app-flyer-bg-gallery-upload-label">Importer</span>';
  uploadBtn.addEventListener("click", () => bgFileInput?.click());
  grid.appendChild(uploadBtn);

  for (const ent of entries) {
    const src = `${FLYER_BG_ASSETS_BASE}/${encodeURIComponent(ent.file)}`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "app-flyer-bg-gallery-item";
    btn.setAttribute("role", "listitem");
    btn.setAttribute("aria-label", `Utiliser le fond ${ent.label}`);
    btn.style.backgroundImage = `url("${src}")`;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "app-flyer-bg-gallery-remove";
    removeBtn.setAttribute("aria-label", "Retirer ce template");
    removeBtn.title = "Retirer le template";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearStoredFlyerCustomBg(storageKey);
      opts.setStatus("");
      opts.syncPreview();
      opts.onBgChange();
      setSelectedItem(null);
    });
    btn.appendChild(removeBtn);
    btn.addEventListener("click", () => {
      void (async () => {
        try {
          const dataUrl = await compressFetchedImageToFlyerBgDataUrl(src);
          setStoredFlyerCustomBgDataUrl(dataUrl, storageKey);
          opts.setStatus("");
          opts.syncPreview();
          opts.onBgChange();
          setSelectedItem(btn);
        } catch (e) {
          const m = e instanceof Error ? e.message : "Fond indisponible.";
          opts.setStatus(m);
        }
      })();
    });
    grid.appendChild(btn);
  }

  const scrollByCard = (dir) => {
    const first = grid.querySelector(".app-flyer-bg-gallery-item");
    const cardW = first instanceof HTMLElement ? first.offsetWidth : 84;
    const gap = 8;
    grid.scrollBy({ left: dir * (cardW + gap) * 2, behavior: "smooth" });
  };
  nextBtn?.addEventListener("click", () => scrollByCard(1));
}
