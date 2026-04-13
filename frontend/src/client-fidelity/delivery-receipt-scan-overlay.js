/**
 * Plein écran « analyse ticket » — UX type app de scan (IA / chargement).
 */

export const DELIVERY_RECEIPT_SCAN_OVERLAY_ID = "fidelity-dr-scan-root";

const OPEN_CLASS = "fidelity-dr-scan-root--open";
const BODY_LOCK = "fidelity-dr-scan-locked";

let overlayEl = null;

function buildOverlayMarkup() {
  return `
    <div class="fidelity-dr-scan-bg" aria-hidden="true"></div>
    <div class="fidelity-dr-scan-stage">
      <div class="fidelity-dr-scan-card" aria-hidden="false">
        <div class="fidelity-dr-scan-card-glow" aria-hidden="true"></div>
        <div class="fidelity-dr-scan-card-shell">
          <div class="fidelity-dr-scan-card-inner">
            <img class="fidelity-dr-scan-preview" src="" alt="" decoding="async" />
            <div class="fidelity-dr-scan-tint" aria-hidden="true"></div>
            <div class="fidelity-dr-scan-dots" aria-hidden="true"></div>
            <div class="fidelity-dr-scan-beam" aria-hidden="true"></div>
            <div class="fidelity-dr-scan-pill">
              <span class="fidelity-dr-scan-pill-text">Scanning</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `.trim();
}

export function ensureDeliveryReceiptScanOverlay() {
  if (overlayEl?.isConnected) return overlayEl;
  const existing = document.getElementById(DELIVERY_RECEIPT_SCAN_OVERLAY_ID);
  if (existing) {
    overlayEl = existing;
    return overlayEl;
  }
  const root = document.createElement("div");
  root.id = DELIVERY_RECEIPT_SCAN_OVERLAY_ID;
  root.className = "fidelity-dr-scan-root";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Analyse du ticket en cours");
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = buildOverlayMarkup();
  document.body.appendChild(root);
  overlayEl = root;
  return root;
}

/**
 * @param {{ imageDataUrl: string }} p
 */
export function openDeliveryReceiptScanOverlay(p) {
  const root = ensureDeliveryReceiptScanOverlay();
  const img = root.querySelector(".fidelity-dr-scan-preview");
  const src = String(p?.imageDataUrl || "");
  if (img instanceof globalThis.HTMLImageElement) {
    img.src = src;
    img.alt = "";
  }
  document.body.classList.add(BODY_LOCK);
  root.setAttribute("aria-hidden", "false");
  root.classList.remove(OPEN_CLASS);
  void root.offsetHeight;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.classList.add(OPEN_CLASS);
    });
  });
}

export function closeDeliveryReceiptScanOverlay() {
  const root = document.getElementById(DELIVERY_RECEIPT_SCAN_OVERLAY_ID);
  if (!root) return;
  root.classList.remove(OPEN_CLASS);
  root.setAttribute("aria-hidden", "true");
  document.body.classList.remove(BODY_LOCK);
  const img = root.querySelector(".fidelity-dr-scan-preview");
  if (img instanceof globalThis.HTMLImageElement) {
    globalThis.setTimeout(() => {
      img.removeAttribute("src");
    }, 420);
  }
}
