import { getAndroidAppStoreUrl, getIosAppStoreUrl } from "./app-store-urls.js";

const QR_SCRIPT = "/js/qr_code_styling.js";
const DEFAULT_GET_URL = "https://myfidpass.fr/get?stay=1";

/** @returns {Promise<void>} */
export function loadQrScript() {
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

/**
 * @param {{ targetId: string, containerId: string, dataUrl?: string }} opts
 */
export async function renderAppDownloadQr(opts) {
  await loadQrScript();
  const QRCodeStyling = window.QRCodeStyling;
  const target = document.getElementById(opts.targetId);
  const container = document.getElementById(opts.containerId);
  if (!QRCodeStyling || !target || !container) return;

  const size = opts.size ?? 220;
  const qrCode = new QRCodeStyling({
    width: size,
    height: size,
    type: "svg",
    data: opts.dataUrl || DEFAULT_GET_URL,
    qrOptions: { typeNumber: 0, errorCorrectionLevel: "H" },
    image: "/assets/icone.png?v=20260416",
    dotsOptions: { color: "#F6F4EC", type: "dots" },
    cornersSquareOptions: { color: "#fafafa", type: "extra-rounded" },
    cornersDotOptions: { color: "#F6F4EC", type: "square" },
    backgroundOptions: { color: "#0F1920" },
    imageOptions: { crossOrigin: "anonymous", margin: 4, imageSize: 0.5 },
    margin: 0,
  });

  target.innerHTML = "";
  qrCode.append(target);
  container.classList.remove("hidden");
}

function redirectWithUtmParams(baseUrl) {
  const urlParams = new URLSearchParams(window.location.search);
  const utmParams = new URLSearchParams();
  for (const [key, value] of urlParams) {
    if (key.startsWith("utm_")) utmParams.append(key, value);
  }
  const utmString = utmParams.toString();
  return utmString ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${utmString}` : baseUrl;
}

/** @param {{ iosBtnId: string, androidBtnId: string }} opts */
export function wireAppStoreButtons(opts) {
  document.getElementById(opts.iosBtnId)?.addEventListener("click", () => {
    window.location.href = redirectWithUtmParams(getIosAppStoreUrl());
  });
  document.getElementById(opts.androidBtnId)?.addEventListener("click", () => {
    window.location.href = redirectWithUtmParams(getAndroidAppStoreUrl());
  });
}

export function isMobileDevice() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "");
}
