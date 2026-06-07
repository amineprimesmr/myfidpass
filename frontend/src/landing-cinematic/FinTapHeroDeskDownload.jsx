import { useEffect } from "react";
import { getAndroidAppStoreUrl, getIosAppStoreUrl } from "../features/app-store-urls.js";
import { renderAppDownloadQr } from "../features/app-download-qr.js";
import "./fintap-hero-desk-download.css";

const QR_TARGET_ID = "fintap-hero-desk-qr-code";
const QR_CONTAINER_ID = "fintap-hero-desk-qr-container";

function redirectWithUtmParams(baseUrl) {
  const urlParams = new URLSearchParams(window.location.search);
  const utmParams = new URLSearchParams();
  for (const [key, value] of urlParams) {
    if (key.startsWith("utm_")) utmParams.append(key, value);
  }
  const utmString = utmParams.toString();
  return utmString ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${utmString}` : baseUrl;
}

/** Bloc desktop : QR + badges App Store / Google Play. */
export function FinTapHeroDeskDownload() {
  useEffect(() => {
    let cancelled = false;
    renderAppDownloadQr({
      targetId: QR_TARGET_ID,
      containerId: QR_CONTAINER_ID,
      size: 168,
      dataUrl: "https://myfidpass.fr/get?stay=1",
    }).catch((err) => {
      if (!cancelled) {
        console.warn("[hero-desk-download] QR indisponible :", err?.message || err);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="fintap-hero-desk-download">
      <p className="fintap-hero-desk-download__title">Téléchargez l&apos;app commerçant</p>

      <div
        id={QR_CONTAINER_ID}
        className="fintap-hero-desk-download__qr-wrap hidden"
        aria-hidden="false"
      >
        <div id={QR_TARGET_ID} className="fintap-hero-desk-download__qr" aria-hidden="true" />
      </div>

      <div className="fintap-hero-desk-download__stores">
        <button
          type="button"
          className="fintap-hero-desk-download__store-btn"
          aria-label="Télécharger sur l'App Store"
          onClick={() => {
            window.location.href = redirectWithUtmParams(getIosAppStoreUrl());
          }}
        >
          <img
            className="fintap-hero-desk-download__store-logo"
            src="/assets/get/app_store_white.svg"
            alt="App Store"
            width={120}
            height={40}
            decoding="async"
          />
        </button>
        <button
          type="button"
          className="fintap-hero-desk-download__store-btn"
          aria-label="Disponible sur Google Play"
          onClick={() => {
            window.location.href = redirectWithUtmParams(getAndroidAppStoreUrl());
          }}
        >
          <img
            className="fintap-hero-desk-download__store-logo"
            src="/assets/get/google_play.png"
            alt="Google Play"
            width={135}
            height={40}
            decoding="async"
          />
        </button>
      </div>

      <p className="fintap-hero-desk-download__caption">+130 commerces équipés</p>
    </div>
  );
}
