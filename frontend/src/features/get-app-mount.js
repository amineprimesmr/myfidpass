import { API_BASE, setAuthToken, setRefreshToken } from "../config.js";
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
  if (params.get("claim_token")) return true;
  return ["1", "true", "yes"].includes(String(params.get("stay") || "").toLowerCase());
}

function applyWelcomeCopy(commerceName) {
  const params = new URLSearchParams(window.location.search);
  const commerce =
    commerceName ||
    String(params.get("commerce") || "").trim() ||
    "";
  const isWelcome = params.get("welcome") === "1" || params.get("claim_token");
  if (!isWelcome && !commerce) return;

  const title = document.getElementById("get-app-title");
  const subtitle = document.getElementById("get-app-subtitle");
  if (title) {
    title.textContent = commerce ? `${commerce} est prêt.` : "Merci — votre compte est prêt.";
  }
  if (subtitle) {
    subtitle.textContent = "Téléchargez l’app Myfidpass pour gérer votre programme fidélité.";
  }
}

function stripClaimTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("claim_token")) return;
  params.delete("claim_token");
  params.set("welcome", "1");
  params.set("stay", "1");
  const qs = params.toString();
  const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
  window.history.replaceState(null, "", next);
}

async function confirmClaimTokenIfPresent() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("claim_token");
  if (!token) return null;

  const loadingEl = document.getElementById("get-app-subtitle");
  if (loadingEl) loadingEl.textContent = "Activation de votre compte…";

  try {
    const res = await fetch(
      `${API_BASE}/api/payment/claim/confirm?token=${encodeURIComponent(token)}`
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      if (loadingEl) {
        loadingEl.textContent = data.message || "Lien invalide ou expiré.";
      }
      return null;
    }
    if (data.token) setAuthToken(data.token);
    if (data.refreshToken) setRefreshToken(data.refreshToken);
    stripClaimTokenFromUrl();
    const commerce = data.business?.name || null;
    if (commerce) {
      const p = new URLSearchParams(window.location.search);
      p.set("commerce", commerce);
      window.history.replaceState(null, "", `${window.location.pathname}?${p.toString()}`);
    }
    applyWelcomeCopy(data.business?.name);
    return data;
  } catch {
    if (loadingEl) loadingEl.textContent = "Impossible d’activer le compte. Réessayez.";
    return null;
  }
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

function wireStoreButtons() {
  document.getElementById("get-app-store-ios")?.addEventListener("click", () => openStorePage("ios"));
  document.getElementById("get-app-store-android")?.addEventListener("click", () => openStorePage("android"));
}

/** Initialise la page /get (clone Tuyo). */
export async function mountGetAppPage() {
  await confirmClaimTokenIfPresent();
  applyWelcomeCopy(null);

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
