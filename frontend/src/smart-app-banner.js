/**
 * Bannière native Safari (Smart App Banner) : meta apple-itunes-app.
 * Visible sur iPhone / iPad sous Safari lorsque méta présente après chargement.
 * @see https://developer.apple.com/documentation/webkit/promoting_apps_with_smart_app_banners
 */
import { getAuthToken } from "./config.js";

const META_ID = "fidpass-smart-banner-meta";

/** @returns {boolean} True si méta créée ou mise à jour. */
export function syncSmartAppBanner() {
  if (typeof document === "undefined") return false;
  const rawId =
    typeof import.meta.env?.VITE_IOS_APP_STORE_ID === "string"
      ? String(import.meta.env.VITE_IOS_APP_STORE_ID).trim()
      : "";
  const appStoreId = rawId || "6759921605";

  try {
    const path = window.location.pathname.replace(/\/$/, "") || "/";
    const merchantShell = path === "/app";
    const shouldShow = merchantShell && !!getAuthToken();

    const existing = document.getElementById(META_ID);
    if (!shouldShow) {
      existing?.remove();
      return false;
    }

    const arg = encodeURIComponent(String(window.location.href.split("#")[0]));
    const content = `app-id=${appStoreId}, app-argument=${arg}`;
    let meta = existing;
    if (!meta) {
      meta = document.createElement("meta");
      meta.id = META_ID;
      meta.setAttribute("name", "apple-itunes-app");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", content);
    return true;
  } catch (_) {
    return false;
  }
}
