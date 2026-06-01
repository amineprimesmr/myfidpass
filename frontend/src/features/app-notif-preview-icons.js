/**
 * Aperçus notification style iOS (icône + texte) — bannière principale et carrousel auto.
 */
import {
  initNotificationLogoSheet,
  openNotificationLogoSheet,
} from "./app-notif-logo-sheet.js";

/** @type {string | null} */
let sharedIconUrl = null;
/** @type {boolean} */
let hasCustomNotificationIcon = false;
/** @type {((path: string) => Promise<Response>) | null} */
let apiFn = null;

function revokeSharedUrl() {
  if (sharedIconUrl && sharedIconUrl.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(sharedIconUrl);
    } catch (_) {}
  }
  sharedIconUrl = null;
}

function applyIconToTargets() {
  const imgs = document.querySelectorAll(
    "#app-notification-banner-icon-img, .app-notif-auto-liquid-icon-img, #app-notif-logo-sheet-icon-img",
  );
  const fallbacks = document.querySelectorAll(
    "#app-notification-banner-icon-fallback, .app-notif-auto-liquid-icon-fallback",
  );
  imgs.forEach((img) => {
    if (!(img instanceof HTMLImageElement)) return;
    if (sharedIconUrl) {
      img.src = sharedIconUrl;
      img.classList.remove("hidden");
    } else {
      img.removeAttribute("src");
      img.classList.add("hidden");
    }
  });
  fallbacks.forEach((fb) => {
    fb.classList.toggle("hidden", !!sharedIconUrl);
  });
}

/**
 * @param {(path: string, init?: RequestInit) => Promise<Response>} api
 */
export async function refreshAllNotificationPreviewIcons(api) {
  apiFn = api;
  revokeSharedUrl();
  hasCustomNotificationIcon = false;

  for (const path of ["/notification-icon", "/logo-icon", "/logo"]) {
    try {
      const r = await api(`${path}?v=${Date.now()}`);
      if (!r.ok) continue;
      const blob = await r.blob();
      if (!blob || blob.size === 0) continue;
      sharedIconUrl = URL.createObjectURL(blob);
      hasCustomNotificationIcon = path === "/notification-icon";
      break;
    } catch (_) {
      /* next */
    }
  }
  applyIconToTargets();
  return { hasCustomNotificationIcon, iconUrl: sharedIconUrl };
}

export function notificationIconIsConfigured() {
  return hasCustomNotificationIcon;
}

function enhanceCarouselLiquidPreviews() {
  document.querySelectorAll("#notifications .app-notif-auto-liquid").forEach((liquid) => {
    if (liquid.dataset.liquidIconEnhanced === "1") return;
    liquid.dataset.liquidIconEnhanced = "1";
    const body = document.createElement("div");
    body.className = "app-notif-auto-liquid-body";
    while (liquid.firstChild) {
      body.appendChild(liquid.firstChild);
    }
    const row = document.createElement("div");
    row.className = "app-notif-auto-liquid-row";
    const icon = document.createElement("div");
    icon.className = "app-notif-auto-liquid-icon app-notif-preview-icon-target";
    icon.setAttribute("role", "button");
    icon.setAttribute("tabindex", "0");
    icon.setAttribute("aria-label", "Logo de la notification");
    icon.innerHTML =
      '<img class="app-notif-auto-liquid-icon-img hidden" alt="" />' +
      '<span class="app-notif-auto-liquid-icon-fallback">Logo</span>';
    row.appendChild(icon);
    row.appendChild(body);
    liquid.appendChild(row);
  });
}

function readPreviewCopy() {
  const title =
    document.getElementById("app-notification-banner-title")?.value?.trim() ||
    document.getElementById("app-business-name")?.textContent?.trim() ||
    "Commerce";
  const message =
    document.getElementById("app-notification-banner-message")?.value?.trim() ||
    document.getElementById("app-notif-carousel-perimeter-msg")?.value?.trim() ||
    "Votre message apparaît ici";
  return { title, message };
}

function wireIconTapTargets() {
  document.querySelectorAll(".app-notif-preview-icon-target").forEach((el) => {
    if (el.dataset.notifIconTapBound === "1") return;
    el.dataset.notifIconTapBound = "1";
    const open = () => {
      if (hasCustomNotificationIcon) {
        document.getElementById("app-notification-banner-logo-input")?.click();
        return;
      }
      const { title, message } = readPreviewCopy();
      openNotificationLogoSheet({
        commerceName: title,
        message,
        iconUrl: sharedIconUrl,
        hasCustomIcon: hasCustomNotificationIcon,
      });
    };
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
}

/**
 * @param {{ api: (path: string, init?: RequestInit) => Promise<Response>, triggerLogoPicker?: () => void }} opts
 */
export function initNotificationPreviewSystem(opts) {
  apiFn = opts.api;
  initNotificationLogoSheet({ onAddLogo: opts.triggerLogoPicker || null });
  enhanceCarouselLiquidPreviews();
  wireIconTapTargets();
}

export { openNotificationLogoSheet };
