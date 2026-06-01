/** Feuille d’action iOS — ajouter le logo de notification avec aperçu visuel. */

let sheetEl = null;
/** @type {(() => void) | null} */
let onAddLogo = null;

function ensureSheet() {
  if (sheetEl) return sheetEl;
  const root = document.createElement("div");
  root.id = "app-notif-logo-sheet";
  root.className = "app-notif-logo-sheet hidden";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "app-notif-logo-sheet-title");
  root.innerHTML = `
    <div class="app-notif-logo-sheet__backdrop" data-notif-sheet-close></div>
    <div class="app-notif-logo-sheet__panel">
      <div class="app-notif-logo-sheet__preview" aria-hidden="true">
        <div class="app-notif-logo-sheet__bubble">
          <div class="app-notif-logo-sheet__icon-slot" id="app-notif-logo-sheet-icon">
            <img id="app-notif-logo-sheet-icon-img" class="hidden" alt="" />
            <span class="app-notif-logo-sheet__icon-plus" id="app-notif-logo-sheet-icon-plus">+</span>
          </div>
          <div class="app-notif-logo-sheet__text">
            <strong class="app-notif-logo-sheet__title" id="app-notif-logo-sheet-preview-title">Commerce</strong>
            <span class="app-notif-logo-sheet__body" id="app-notif-logo-sheet-preview-body">Votre message apparaît ici</span>
          </div>
        </div>
      </div>
      <p class="app-notif-logo-sheet__hint" id="app-notif-logo-sheet-title">
        Ajoutez votre logo pour qu’il s’affiche dans les notifications Wallet et campagnes.
      </p>
      <button type="button" class="app-notif-logo-sheet__cta" id="app-notif-logo-sheet-add">Mettre mon logo</button>
      <button type="button" class="app-notif-logo-sheet__cancel" data-notif-sheet-close>Fermer</button>
    </div>`;
  document.body.appendChild(root);

  root.querySelector("#app-notif-logo-sheet-add")?.addEventListener("click", () => {
    closeNotificationLogoSheet();
    onAddLogo?.();
  });
  root.querySelectorAll("[data-notif-sheet-close]").forEach((el) => {
    el.addEventListener("click", closeNotificationLogoSheet);
  });

  sheetEl = root;
  return root;
}

/**
 * @param {{ onAddLogo?: () => void }} opts
 */
export function initNotificationLogoSheet(opts = {}) {
  onAddLogo = opts.onAddLogo || null;
  ensureSheet();
}

/**
 * @param {{ commerceName?: string, message?: string, iconUrl?: string | null, hasCustomIcon?: boolean }} [opts]
 */
export function openNotificationLogoSheet(opts = {}) {
  const el = ensureSheet();
  const title = String(opts.commerceName || "Commerce").trim() || "Commerce";
  const body = String(opts.message || "Votre message apparaît ici").trim();
  const titleEl = el.querySelector("#app-notif-logo-sheet-preview-title");
  const bodyEl = el.querySelector("#app-notif-logo-sheet-preview-body");
  const img = el.querySelector("#app-notif-logo-sheet-icon-img");
  const plus = el.querySelector("#app-notif-logo-sheet-icon-plus");
  if (titleEl) titleEl.textContent = title.length > 28 ? `${title.slice(0, 26)}…` : title;
  if (bodyEl) {
    bodyEl.textContent = body.length > 72 ? `${body.slice(0, 70)}…` : body;
  }
  if (img instanceof HTMLImageElement) {
    const url = opts.iconUrl || "";
    if (url) {
      img.src = url;
      img.classList.remove("hidden");
      plus?.classList.add("hidden");
    } else {
      img.removeAttribute("src");
      img.classList.add("hidden");
      plus?.classList.remove("hidden");
    }
  }
  el.classList.remove("hidden");
  requestAnimationFrame(() => el.classList.add("is-open"));
  document.body.style.overflow = "hidden";
}

export function closeNotificationLogoSheet() {
  if (!sheetEl) return;
  sheetEl.classList.remove("is-open");
  document.body.style.overflow = "";
  window.setTimeout(() => {
    if (!sheetEl?.classList.contains("is-open")) sheetEl?.classList.add("hidden");
  }, 320);
}
