import { useEffect } from "react";
import { renderAppDownloadQr } from "../features/app-download-qr.js";
import "./fintap-hero-desk-download.css";

const QR_TARGET_ID = "fintap-hero-desk-qr-code";
const QR_CONTAINER_ID = "fintap-hero-desk-qr-container";

/** Bloc desktop : titre centré, QR, bouton téléchargement (style mobile). */
export function FinTapHeroDeskDownload() {
  useEffect(() => {
    let cancelled = false;
    renderAppDownloadQr({
      targetId: QR_TARGET_ID,
      containerId: QR_CONTAINER_ID,
      size: 156,
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
      >
        <div id={QR_TARGET_ID} className="fintap-hero-desk-download__qr" aria-hidden="true" />
      </div>

      <a href="/get" className="fintap-hero-desk-download__cta">
        <span className="fintap-hero-desk-download__cta-label">Télécharger l&apos;app commerçant</span>
        <span className="fintap-hero-desk-download__cta-arrow" aria-hidden="true">
          <svg viewBox="0 0 20 20" focusable="false">
            <path
              d="M4.5 10h9m0 0-3.5-3.5M13.5 10l-3.5 3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </a>

      <p className="fintap-hero-desk-download__caption">+130 commerces équipés</p>
    </div>
  );
}
