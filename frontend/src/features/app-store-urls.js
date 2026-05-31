const IOS_APP_DEFAULT = "6759921605";

/** @returns {string} */
export function getIosAppStoreUrl() {
  const direct =
    typeof import.meta !== "undefined"
      ? String(import.meta.env?.VITE_APP_STORE_IOS_URL || "").trim()
      : "";
  if (direct) return direct;
  const id =
    typeof import.meta !== "undefined"
      ? String(import.meta.env?.VITE_IOS_APP_STORE_ID || "").trim() || IOS_APP_DEFAULT
      : IOS_APP_DEFAULT;
  return `https://apps.apple.com/fr/app/id${id}`;
}

/** @returns {string} */
export function getAndroidAppStoreUrl() {
  const direct =
    typeof import.meta !== "undefined"
      ? String(import.meta.env?.VITE_APP_STORE_ANDROID_URL || "").trim()
      : "";
  if (direct) return direct;
  return "https://play.google.com/store/search?q=Myfidpass&c=apps";
}
