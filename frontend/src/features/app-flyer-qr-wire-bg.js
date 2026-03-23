/**
 * Branche la galerie de fonds (manifest + vignettes) sur la page Flyer QR.
 */
import { initFlyerBgGallery } from "./app-flyer-bg-gallery.js";

/**
 * @param {ParentNode} root
 * @param {{ markBgDirtyAndPaint: () => void; getBgPanelApi: () => { syncPreview?: () => void } | undefined }} hooks
 */
export function wireFlyerQrBackgroundGallery(root, hooks) {
  function setFlyerBgStatus(msg) {
    const statusEl = root.querySelector("#app-flyer-bg-status");
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.classList.toggle("hidden", !msg);
  }

  void initFlyerBgGallery(root, {
    onBgChange: () => hooks.markBgDirtyAndPaint(),
    syncPreview: () => hooks.getBgPanelApi()?.syncPreview?.(),
    setStatus: setFlyerBgStatus,
  });
}
