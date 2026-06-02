import { buildRewardRedeemQrPayload } from "./reward-redeem-qr.js";

/** @type {Promise<import("qrcode").default> | null} */
let qrcodeModulePromise = null;

function loadQRCodeModule() {
  qrcodeModulePromise ??= import("qrcode").then((m) => m.default);
  return qrcodeModulePromise;
}

/** Précharge la lib QR (évite latence au premier « Obtenir ma récompense »). */
export function prefetchQRCodeModule() {
  void loadQRCodeModule();
}

/**
 * QR = même identifiant que le code-barres Wallet (member.id) pour scan en caisse.
 * @param {string} memberId
 * @returns {Promise<string>} data URL PNG
 */
export async function memberIdToQrDataUrl(memberId) {
  const QRCode = await loadQRCodeModule();
  return QRCode.toDataURL(String(memberId).trim(), {
    width: 232,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0f172a", light: "#ffffff" },
  });
}

/**
 * QR lié à une récompense : le scan commerçant débite le palier et affiche le libellé.
 * @param {{ memberId: string; programType?: string; tierIndex: number; points: number }} p
 * @returns {Promise<string>} data URL PNG
 */
export async function rewardRedeemQrDataUrl(p) {
  const payload = buildRewardRedeemQrPayload(p);
  const QRCode = await loadQRCodeModule();
  return QRCode.toDataURL(payload, {
    width: 232,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0f172a", light: "#ffffff" },
  });
}
