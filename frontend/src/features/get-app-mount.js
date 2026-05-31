import { getAndroidAppStoreUrl, getIosAppStoreUrl } from "./app-store-urls.js";

const QR_SCRIPT = "/js/qr_code_styling.js";

/** @returns {Promise<void>} */
function loadQrScript() {
  if (typeof window !== "undefined" && window.QRCodeStyling) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${QR_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("qr_script_failed")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = QR_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("qr_script_failed"));
    document.head.appendChild(script);
  });
}

function isMobileDevice() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "");
}

/** @returns {"ios" | "android" | "unknown"} */
function detectDevicePlatform() {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "unknown";
}

function redirectWithUtmParams(baseUrl) {
  const urlParams = new URLSearchParams(window.location.search);
  const utmParams = new URLSearchParams();
  for (const [key, value] of urlParams) {
    if (key.startsWith("utm_")) utmParams.append(key, value);
  }
  const utmString = utmParams.toString();
  const url = utmString ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${utmString}` : baseUrl;
  window.location.href = url;
}

/** @param {"ios" | "android"} platform */
function openStorePage(platform) {
  if (platform === "ios") {
    redirectWithUtmParams(getIosAppStoreUrl());
    return;
  }
  if (platform === "android") {
    redirectWithUtmParams(getAndroidAppStoreUrl());
  }
}

function shouldStayOnPage() {
  const params = new URLSearchParams(window.location.search);
  return ["1", "true", "yes"].includes(String(params.get("stay") || "").toLowerCase());
}

async function renderQR() {
  await loadQrScript();
  const QRCodeStyling = window.QRCodeStyling;
  const target = document.getElementById("get-app-qr");
  const container = document.getElementById("get-app-qr-container");
  if (!QRCodeStyling || !target || !container) return;

  const qrCode = new QRCodeStyling({
    width: 250,
    height: 250,
    type: "svg",
    data: window.location.href,
    qrOptions: { typeNumber: 0, errorCorrectionLevel: "H" },
    image: "/assets/icone.png?v=20260416",
    dotsOptions: { color: "#F6F4EC", type: "dots" },
    cornersSquareOptions: { color: "#27f3a9", type: "extra-rounded" },
    cornersDotOptions: { color: "#F6F4EC", type: "square" },
    backgroundOptions: { color: "#0F1920" },
    imageOptions: { crossOrigin: "anonymous", margin: 4, imageSize: 0.5 },
    margin: 0,
  });

  target.innerHTML = "";
  qrCode.append(target);
  container.classList.remove("hidden");
}

function wireStoreButtons() {
  document.getElementById("get-app-store-ios")?.addEventListener("click", () => openStorePage("ios"));
  document.getElementById("get-app-store-android")?.addEventListener("click", () => openStorePage("android"));
}

/** Initialise la page /get (clone Tuyo). */
export async function mountGetAppPage() {
  if (isMobileDevice() && !shouldStayOnPage()) {
    const platform = detectDevicePlatform();
    if (platform === "ios" || platform === "android") {
      openStorePage(platform);
      return;
    }
  }

  wireStoreButtons();

  if (!isMobileDevice()) {
    try {
      await renderQR();
    } catch (err) {
      console.warn("[get-app] QR indisponible :", err?.message || err);
    }
  }
}
