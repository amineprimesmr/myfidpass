/**
 * Overlay « travail en cours » (barre + messages) — réutilise le panneau verify engagement / wallet.
 */

const DEFAULT_MESSAGES = [
  "Traitement en cours…",
  "Merci de patienter…",
  "Presque prêt…",
];

/**
 * @param {string} slug
 * @returns {boolean}
 */
export function isWalletReturnPending(slug) {
  const s = String(slug || "").trim();
  if (!s) return false;
  for (const key of ["fidelity_apple_wallet_pending", "fidelity_google_wallet_pending"]) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) continue;
      const data = JSON.parse(raw);
      if (data?.slug === s) return true;
    } catch {
      continue;
    }
  }
  return false;
}

/**
 * @param {HTMLElement} rootEl
 */
export function openFidelityBusyOverlay(rootEl) {
  const root = rootEl?.querySelector("#fidelity-engagement-verify-root");
  if (!(root instanceof HTMLElement)) return false;
  root.classList.remove("hidden");
  root.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  return true;
}

/**
 * @param {HTMLElement} rootEl
 */
export function closeFidelityBusyOverlay(rootEl) {
  const root = rootEl?.querySelector("#fidelity-engagement-verify-root");
  if (!(root instanceof HTMLElement)) return;
  root.classList.add("hidden");
  root.setAttribute("aria-hidden", "true");
  const qrOpen = document.querySelector("#fidelity-qr-modal-root:not(.hidden)");
  if (!qrOpen) document.body.style.overflow = "";
}

/**
 * @param {HTMLElement} rootEl
 * @param {{ title?: string, messages?: string[], durationMs?: number }} opts
 * @returns {() => void}
 */
export function startFidelityBusyOverlayUx(rootEl, opts = {}) {
  const durationMs = Math.max(800, Number(opts.durationMs) || 1400);
  const messages = Array.isArray(opts.messages) && opts.messages.length ? opts.messages : DEFAULT_MESSAGES;
  const title = opts.title?.trim() || "Chargement";

  const panel = rootEl?.querySelector("#fidelity-engagement-panel-verify");
  const titleEl = rootEl?.querySelector("#fidelity-engagement-verify-title");
  const msgEl = rootEl?.querySelector("#fidelity-engagement-verify-text");
  const bar = rootEl?.querySelector("#fidelity-engagement-verify-progress-bar");

  if (titleEl) titleEl.textContent = title;
  if (panel instanceof HTMLElement) panel.style.setProperty("--verify-duration", `${durationMs}ms`);
  if (bar instanceof HTMLElement) {
    bar.classList.remove("fidelity-qr-verify-progress-bar--animate");
    bar.style.width = "";
    bar.getBoundingClientRect();
    bar.classList.add("fidelity-qr-verify-progress-bar--animate");
  }
  let idx = 0;
  if (msgEl) msgEl.textContent = messages[0];
  const step = Math.max(260, Math.floor(durationMs / (messages.length + 1)));
  const id = globalThis.setInterval(() => {
    idx = (idx + 1) % messages.length;
    if (msgEl) msgEl.textContent = messages[idx];
  }, step);
  return () => globalThis.clearInterval(id);
}

/**
 * @param {HTMLElement} rootEl
 * @param {{ title?: string, messages?: string[], minMs?: number }} opts
 * @returns {Promise<boolean>}
 */
export async function runFidelityBusyOverlaySequence(rootEl, opts = {}) {
  if (!openFidelityBusyOverlay(rootEl)) return false;
  const minMs = Math.max(600, Number(opts.minMs) || 1100);
  const stopUx = startFidelityBusyOverlayUx(rootEl, {
    title: opts.title,
    messages: opts.messages,
    durationMs: minMs,
  });
  await new Promise((r) => globalThis.setTimeout(r, minMs));
  stopUx();
  return true;
}

/**
 * @param {HTMLButtonElement | null | undefined} btn
 * @param {boolean} busy
 * @param {{ busyLabel?: string, idleLabel?: string }} [labels]
 */
export function setFidelitySubmitButtonBusy(btn, busy, labels = {}) {
  if (!(btn instanceof HTMLButtonElement)) return;
  if (busy) {
    if (!btn.dataset.fidIdleLabel) {
      const label = btn.querySelector(".fidelity-cta-pill-label, .fidelity-shiny-cta__label span");
      btn.dataset.fidIdleLabel = label?.textContent?.trim() || btn.textContent?.trim() || "";
    }
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.classList.add("fidelity-cta-pill--busy", "fidelity-shiny-cta--busy");
    const busyText = labels.busyLabel || "Traitement en cours…";
    const label = btn.querySelector(".fidelity-cta-pill-label, .fidelity-shiny-cta__label span");
    if (label) label.textContent = busyText;
    else btn.textContent = busyText;
  } else {
    btn.disabled = false;
    btn.removeAttribute("aria-busy");
    btn.classList.remove("fidelity-cta-pill--busy", "fidelity-shiny-cta--busy");
    const idle = labels.idleLabel || btn.dataset.fidIdleLabel || "";
    if (idle) {
      const label = btn.querySelector(".fidelity-cta-pill-label, .fidelity-shiny-cta__label span");
      if (label) label.textContent = idle;
      else btn.textContent = idle;
    }
    delete btn.dataset.fidIdleLabel;
  }
}
