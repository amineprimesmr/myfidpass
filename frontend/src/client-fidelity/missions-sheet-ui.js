/**
 * Sheet missions : ouverture / fermeture, scroll body, Escape.
 */

const OPEN = "fidelity-missions-sheet--open";
const BODY_LOCK = "fidelity-missions-sheet-locked";

/**
 * @param {HTMLElement} rootEl
 */
export function closeMissionsSheet(rootEl) {
  const sheet = rootEl.querySelector("#fidelity-missions-sheet");
  const openBtn = rootEl.querySelector("#fidelity-missions-sheet-open");
  if (!sheet?.classList.contains(OPEN)) return;
  sheet.classList.remove(OPEN);
  sheet.setAttribute("aria-hidden", "true");
  if (openBtn) openBtn.setAttribute("aria-expanded", "false");
  document.body.classList.remove(BODY_LOCK);
}

/**
 * @param {HTMLElement} rootEl
 */
export function openMissionsSheet(rootEl) {
  const sheet = rootEl.querySelector("#fidelity-missions-sheet");
  const openBtn = rootEl.querySelector("#fidelity-missions-sheet-open");
  if (!sheet || sheet.classList.contains(OPEN)) return;
  sheet.classList.add(OPEN);
  sheet.setAttribute("aria-hidden", "false");
  if (openBtn) openBtn.setAttribute("aria-expanded", "true");
  document.body.classList.add(BODY_LOCK);
  globalThis.requestAnimationFrame(() => {
    rootEl.querySelector("[data-fidelity-missions-sheet-close]")?.focus();
  });
}

/**
 * @param {HTMLElement} rootEl
 * @param {{ signal: AbortSignal }} ctx
 */
export function bindMissionsSheet(rootEl, ctx) {
  const { signal } = ctx;
  const sheet = rootEl.querySelector("#fidelity-missions-sheet");
  const openBtn = rootEl.querySelector("#fidelity-missions-sheet-open");
  if (!sheet || !openBtn || !signal) return;

  const backdrop = sheet.querySelector("[data-fidelity-missions-sheet-backdrop]");
  const closeBtn = sheet.querySelector("[data-fidelity-missions-sheet-close]");

  openBtn.addEventListener("click", () => openMissionsSheet(rootEl), { signal });
  backdrop?.addEventListener("click", () => closeMissionsSheet(rootEl), { signal });
  closeBtn?.addEventListener("click", () => closeMissionsSheet(rootEl), { signal });
}
