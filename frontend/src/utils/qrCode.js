/**
 * Génération de QR codes côté client (sans tiers).
 *
 * Avant : `<img src="https://api.qrserver.com/...">` — fuite du slug commerçant vers un service externe,
 * dépendance d'un site tiers (downtime, rate-limit, IP qui change), bandwidth + latence inutiles.
 *
 * Maintenant : `qrcode` (lib déjà dans package.json) génère un PNG Data URL en local. Zéro requête réseau,
 * QR généré en < 5 ms, taille du payload ~1-3 KB pour 256×256.
 *
 * Cache mémoire : si la même URL est demandée plusieurs fois (resize, re-render), on réutilise le DataURL.
 */

const QR_CACHE = new Map(); // url -> dataUrl
const QR_CACHE_MAX = 50;

/**
 * @param {string} url - URL/texte à encoder
 * @param {object} [opts]
 * @param {number} [opts.size=256] - taille (px)
 * @param {number} [opts.margin=2] - marge (en modules)
 * @param {string} [opts.fgColor="#000000"]
 * @param {string} [opts.bgColor="#ffffff"]
 * @returns {Promise<string>} dataURL PNG
 */
export async function generateQrCodeDataUrl(url, opts = {}) {
  const value = String(url ?? "").trim();
  if (!value) throw new Error("URL vide");
  const { size = 256, margin = 2, fgColor = "#000000", bgColor = "#ffffff" } = opts;
  const cacheKey = `${value}|${size}|${margin}|${fgColor}|${bgColor}`;
  const cached = QR_CACHE.get(cacheKey);
  if (cached) return cached;

  // Import dynamique : lazy-load la lib uniquement quand un QR est demandé.
  const { default: QRCode } = await import("qrcode");
  const dataUrl = await QRCode.toDataURL(value, {
    width: size,
    margin,
    color: { dark: fgColor, light: bgColor },
    errorCorrectionLevel: "M",
  });

  if (QR_CACHE.size >= QR_CACHE_MAX) {
    // Drop le plus ancien (Map garde l'ordre d'insertion)
    const oldest = QR_CACHE.keys().next().value;
    if (oldest !== undefined) QR_CACHE.delete(oldest);
  }
  QR_CACHE.set(cacheKey, dataUrl);
  return dataUrl;
}

/**
 * Setter helper : génère le QR et met à jour `imgEl.src` (gestion erreur silencieuse).
 * @param {HTMLImageElement} imgEl
 * @param {string} url
 * @param {object} [opts]
 */
export async function setQrCodeImageSrc(imgEl, url, opts) {
  if (!imgEl || !url) return;
  try {
    const dataUrl = await generateQrCodeDataUrl(url, opts);
    imgEl.src = dataUrl;
  } catch (e) {
    // Fallback discret : on laisse l'image vide plutôt que de fuiter vers un tiers.
    // eslint-disable-next-line no-console
    console.warn("[qrCode] génération impossible :", e?.message || e);
    imgEl.removeAttribute("src");
  }
}
