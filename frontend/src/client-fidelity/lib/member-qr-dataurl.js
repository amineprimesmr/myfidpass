/**
 * QR = même identifiant que le code-barres Wallet (member.id) pour scan en caisse.
 * @param {string} memberId
 * @returns {Promise<string>} data URL PNG
 */
export async function memberIdToQrDataUrl(memberId) {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(String(memberId).trim(), {
    width: 232,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0f172a", light: "#ffffff" },
  });
}
